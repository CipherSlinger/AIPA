// Store barrel — re-exports all stores from sub-modules (Iteration 440: decomposition)
// ChatStore and UiStore extracted to separate files to keep each under 500 lines.
// SessionStore and PrefsStore remain here (both are tiny).

import { create } from 'zustand'
import { ClaudePrefs, PermissionMode, SessionListItem } from '../types/app.types'

// ── Re-exports from sub-modules ──────────────────
export { useChatStore } from './chatStore'
export type { TaskQueueItem, TabInfo, TabSnapshot } from './chatStore'
export { getTabScrollTop } from './chatStore'

export { useUiStore } from './uiStore'
export type { SidebarTab, NavItem } from './uiStore'

export { useDepartmentStore } from './departmentStore'
export type { Department } from './departmentStore'

// ── Session store ───────────────────────────────
interface SessionState {
  sessions: SessionListItem[]
  loading: boolean
  searchQuery: string
  homeDir: string
  setSessions: (sessions: SessionListItem[]) => void
  setLoading: (v: boolean) => void
  setSearchQuery: (query: string) => void
  setHomeDir: (dir: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  loading: false,
  searchQuery: '',
  homeDir: '',
  setSessions: (sessions) => set({ sessions }),
  setLoading: (v) => set({ loading: v }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setHomeDir: (dir) => set({ homeDir: dir }),
}))

// ── Prefs store ─────────────────────────────────
interface PrefsState {
  prefs: ClaudePrefs
  loaded: boolean
  setPrefs: (p: Partial<ClaudePrefs>) => void
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

const DEFAULT_PREFS: ClaudePrefs = {
  apiKey: '',
  model: 'claude-sonnet-4-6',
  workingDir: '',
  sidebarWidth: 240,
  terminalWidth: 400,
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
  skipPermissions: false,
  permissionMode: 'default',
  verbose: false,
  theme: 'vscode',
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
  clawdEnabled: false,
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
