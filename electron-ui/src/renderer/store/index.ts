// Store barrel — re-exports all stores from sub-modules (Iteration 440: decomposition)
// ChatStore and UiStore extracted to separate files to keep each under 500 lines.
// SessionStore and PrefsStore remain here (both are tiny).

import { create } from 'zustand'
import { AppPrefs, PermissionMode, SessionListItem } from '../types/app.types'
import {
  applyThreadLifecycle,
  restoreThreadRow,
  type ThreadLifecycleEvent,
} from '../utils/threadLifecycle'

// ── Re-exports from sub-modules ──────────────────
export { useChatStore } from './chatStore'
export type { TaskQueueItem, TabInfo, TabSnapshot, TurnDiffUpdate, ThreadSettingsSummary } from './chatStore'
export { getTabScrollTop } from './chatStore'

export { useUiStore } from './uiStore'
export type { SidebarTab, NavItem } from './uiStore'

export { useDepartmentStore, descendantIds } from './departmentStore'
export type { Department, OrgNodeKind, Position } from './departmentStore'

export { usePluginStore } from './pluginStore'

export { useTerminalStore } from './terminalStore'
export type { TerminalStatus, TerminalTab } from './terminalStore'

export { useTaskStore } from './taskStore'

// ── Session store ───────────────────────────────
interface SessionState {
  sessions: SessionListItem[]
  loading: boolean
  searchQuery: string
  homeDir: string
  setSessions: (sessions: SessionListItem[]) => void
  /**
   * Apply a Codex thread life-cycle event (`thread/name/updated`,
   * `thread/archived`, `thread/deleted`) in place — no `session:list` reload.
   * `thread/unarchived` arrives here only for its delete bookkeeping; the row
   * itself is restored through `restoreThreadRow` once its metadata is read.
   * A no-op event leaves the array (and therefore every subscriber) untouched;
   * see `utils/threadLifecycle.ts` for the id mapping and idempotency rules.
   */
  applyThreadLifecycle: (event: ThreadLifecycleEvent) => void
  /**
   * Ids the engine reported deleted during this window. `thread/unarchived`
   * may arrive after a delete (another client, a replayed notification); the
   * user's delete is final, so these rows must never be restored. Ids are
   * conversation UUIDs and are not reused, so the set only grows.
   */
  deletedThreadIds: ReadonlySet<string>
  /**
   * Put one row back after `thread/unarchived`. The caller fetches the row's
   * metadata (the notification carries only the id) and passes it here; the
   * action is idempotent — an already-listed or deleted id is a no-op.
   */
  restoreThreadRow: (row: SessionListItem | null | undefined) => void
  setLoading: (v: boolean) => void
  setSearchQuery: (query: string) => void
  setHomeDir: (dir: string) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  loading: false,
  searchQuery: '',
  homeDir: '',
  setSessions: (sessions) => set({ sessions }),
  applyThreadLifecycle: (event) => {
    const next = applyThreadLifecycle(get().sessions, event)
    // Record a delete even when the row was not listed: the thread may have
    // been removed by another client before this window ever saw it, and a
    // later unarchive must still not bring it back.
    if (event.kind === 'delete' && !get().deletedThreadIds.has(event.threadId)) {
      const deletedThreadIds = new Set(get().deletedThreadIds)
      deletedThreadIds.add(event.threadId)
      set({ ...(next ? { sessions: next } : {}), deletedThreadIds })
      return
    }
    // `set` with an empty patch still notifies subscribers; only write when the
    // list really changed, so an event for another window/project costs nothing.
    if (next) set({ sessions: next })
  },
  deletedThreadIds: new Set<string>(),
  restoreThreadRow: (row) => {
    if (!row) return
    const state = get()
    const next = restoreThreadRow(state.sessions, row, state.deletedThreadIds)
    if (next) set({ sessions: next })
  },
  setLoading: (v) => set({ loading: v }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setHomeDir: (dir) => set({ homeDir: dir }),
}))

// ── Prefs store ─────────────────────────────────
interface PrefsState {
  prefs: AppPrefs
  loaded: boolean
  setPrefs: (p: Partial<AppPrefs>) => void
  setLoaded: (v: boolean) => void
  setPermissionMode: (mode: PermissionMode) => void
  // Runtime state from CLI system.init event
  activeModel: string
  setActiveModel: (model: string) => void
  activeMcpServers: Record<string, unknown>[]
  setActiveMcpServers: (servers: Record<string, unknown>[]) => void
  // MCP server tools: serverName -> list of tool names (populated from system.init)
  mcpServerTools: Record<string, string[]>
  setMcpServerTools: (tools: Record<string, string[]>) => void
}

const DEFAULT_PREFS: AppPrefs = {
  apiKey: '',
  model: 'o4-mini',
  workingDir: '',
  sidebarWidth: 240,
  terminalWidth: 400,
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
  skipPermissions: false,
  permissionMode: 'default',
  verbose: false,
  theme: 'light',
  thinkingLevel: 'off',
  systemPrompt: '',
  maxTurns: undefined,
  maxBudgetUsd: undefined,
  notifySound: true,
  compactMode: false,
  desktopNotifications: true,
  resumeLastSession: false,
  quickReplies: [
    { label: 'Summarize', prompt: 'Please summarize the above concisely:' },
    { label: 'Translate', prompt: 'Please translate the following text. If it is in Chinese, translate to English; if it is in English, translate to Chinese:' },
    { label: 'Draft email', prompt: 'Please draft a professional email based on the following points:' },
    { label: 'Brainstorm ideas', prompt: 'Please brainstorm creative ideas about:' },
  ],
  effortLevel: 'auto',
  preventSleep: true,
  appendSystemPrompt: '',
  disallowedTools: [],
  clawdEnabled: true,
  petAttentionAlerts: true,
  petBubbleTheme: 'sao' as const,
  petBootGreeting: true,
  petTurnNotices: true,
  petActivityStrip: true,
}

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
  setLoaded: (v) => set({ loaded: v }),
  setPermissionMode: (mode) => set((s) => ({
    prefs: {
      ...s.prefs,
      permissionMode: mode,
      skipPermissions: mode === 'bypassPermissions',
    },
  })),
  activeModel: '',
  setActiveModel: (model) => set({ activeModel: model }),
  activeMcpServers: [],
  setActiveMcpServers: (servers) => set({ activeMcpServers: servers }),
  mcpServerTools: {},
  setMcpServerTools: (tools) => set({ mcpServerTools: tools }),
}))
