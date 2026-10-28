import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'
import fs from 'fs'

function getGitCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '..') }).toString().trim() } catch { return 'unknown' }
}

function getCLIVersion() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../package/package.json'), 'utf-8')
    return JSON.parse(raw).version ?? 'unknown'
  } catch { return 'unknown' }
}

// Vendor boundaries. Each package group is a separate chunk so a change in one
// (say an icon bump) does not invalidate the rest of the vendor cache, and the
// renderer can fetch them in parallel instead of parsing one monolith.
// React is listed before the utility group on purpose: zustand depends on
// React, and without an explicit home Rollup folds React into zustand's chunk.
const VENDOR_GROUPS: Array<[string, string[]]> = [
  ['vendor-react', ['react', 'react-dom', 'scheduler']],
  ['vendor-icons', ['lucide-react']],
  ['vendor-markdown', ['react-markdown', 'remark-gfm', 'rehype-highlight', 'highlight.js']],
  ['vendor-terminal', ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-web-links']],
  ['vendor-utils', ['zustand', 'date-fns', '@tanstack/react-virtual']],
]

function vendorChunk(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined
  for (const [chunk, packages] of VENDOR_GROUPS) {
    if (packages.some(pkg => id.includes(`/node_modules/${pkg}/`))) return chunk
  }
  return undefined
}

// The chat surface is most of the eager app code (the chat panel is the
// default view). Split it into two real layers instead of one 760 kB file:
//  - app-chat-tools: tool-call rendering plus the large leaf dialogs. Nothing
//    in this layer imports the chat shell, so the edge is one-way.
//  - app-chat: the shell, message list, composer and everything they mount.
const CHAT_SINK_FILES = new Set([
  'ExportDialog', 'WorktreeDialog', 'RewindDialog', 'ForkDialog', 'CompareView',
  'StatsPanel', 'ChangesPanel', 'IdleReturnDialog', 'SpeculationCard',
  'DreamTaskCard', 'TokenUsageBar', 'PinnedNoteStrip', 'RegenerateButton',
  'TaskDashboardCard',
])

// Tool call rendering: the entry point plus every card it switches on.
const CHAT_TOOLS =
  /(?:^|\/)(?:tool-cards\/|[A-Za-z0-9]*(?:ToolUseBlock|ToolBatchBlock|ToolCard|DiffView|LSPResultCard|TodoListView|AgentToolCard|PermissionCard|PlanCard|HookCallbackCard|ElicitationCard|ToolApprovalDialog|PlanApprovalCard)\.tsx?$)/

// Stores, hooks and helpers are imported from every layer. Left to Rollup they
// get folded into whichever chat chunk imports them first, which makes that
// chunk depend on the other ones and produces chunk cycles. A single shared
// foundation chunk keeps the dependency graph one-way: shell/tools/ui → shared.
const SHARED_DIRS = [
  '/src/renderer/store/',
  '/src/renderer/hooks/',
  '/src/renderer/utils/',
  '/src/renderer/lib/',
  '/src/renderer/i18n/',
]

// Modules in those directories that only a lazy route uses. Keeping them out
// of the eager foundation chunk preserves their route's code split.
const LAZY_ONLY = new Set([
  '/src/renderer/hooks/useFocusTrap.ts',
  '/src/renderer/utils/skillMarketplace.ts',
])

// Helpers that live among route components but are imported by the shared
// layer. They are listed by path so the lazy routes around them keep their own
// chunks (a directory rule would drag the whole route into the eager bundle).
// This is the set that is on the eager startup path today.
const SHARED_COMPONENTS = new Set([
  '/components/ui/Toast.tsx',
  '/components/ui/FloatingPortal.tsx',
  '/components/ui/escapeStack.ts',
  '/components/shared/ErrorBoundary.tsx',
  '/components/shared/ImageLightbox.tsx',
  '/components/plugins/pluginIcons.tsx',
  '/components/sessions/sessionUtils.ts',
  '/components/settings/settingsConstants.ts',
  '/components/settings/personaConstants.ts',
  '/components/workflows/workflowConstants.ts',
  '/components/workflows/runWorkflow.ts',
  '/components/departments/openSessionCore.ts',
  '/components/departments/deptUtils.ts',
  '/components/memory/memoryConstants.ts',
])

function appChunk(id: string): string | undefined {
  const normalized = id.split('\\').join('/')
  if ([...LAZY_ONLY].some(file => normalized.endsWith(file))) return undefined
  if (SHARED_DIRS.some(dir => normalized.includes(dir))) return 'app-shared'
  if ([...SHARED_COMPONENTS].some(file => normalized.endsWith(`/src/renderer${file}`))) return 'app-shared'
  if (!normalized.includes('/src/renderer/components/chat/')) return undefined
  if (CHAT_TOOLS.test(normalized) || CHAT_SINK_FILES.has(fileOf(normalized))) return 'app-chat-tools'
  return 'app-chat'
}

function fileOf(normalized: string): string {
  return normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.tsx?$/, '')
}

export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __COMMIT_HASH__: JSON.stringify(getGitCommit()),
    __CLI_VERSION__: JSON.stringify(getCLIVersion()),
  },
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Without explicit boundaries Rollup folds vendors and the whole chat
        // surface into the entry chunk — one file that has to be downloaded and
        // parsed before the shell paints. These chunks are named by what they
        // contain, not by size, so adding a chat component does not reshuffle
        // the vendor cache.
        manualChunks: (id: string) => vendorChunk(id) ?? appChunk(id),
      },
    },
  },
  server: {
    port: 5173,
  },
})
