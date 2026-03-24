import { create } from 'zustand'
import { ChatMessage, ClaudePrefs, SessionListItem } from '../types/app.types'

// ── Chat store ──────────────────────────────────
interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentSessionId: string | null
  workingDir: string
  pendingToolUses: Map<string, { name: string; input: Record<string, unknown> }>

  addMessage: (msg: ChatMessage) => void
  appendTextDelta: (sessionId: string, text: string) => void
  setStreaming: (v: boolean) => void
  setSessionId: (id: string | null) => void
  setWorkingDir: (dir: string) => void
  addToolUse: (msgId: string, toolId: string, name: string, input: Record<string, unknown>) => void
  resolveToolUse: (toolId: string, result: unknown, isError: boolean) => void
  clearMessages: () => void
  loadHistory: (messages: ChatMessage[]) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentSessionId: null,
  workingDir: '',
  pendingToolUses: new Map(),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendTextDelta: (sessionId, text) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + text }
      } else {
        msgs.push({
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
          isStreaming: true,
        })
      }
      return { messages: msgs, currentSessionId: sessionId || s.currentSessionId }
    })
  },

  setStreaming: (v) => {
    set((s) => {
      const msgs = s.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      )
      return { isStreaming: v, messages: msgs }
    })
  },

  setSessionId: (id) => set({ currentSessionId: id }),
  setWorkingDir: (dir) => set({ workingDir: dir }),

  addToolUse: (msgId, toolId, name, input) => {
    const pending = new Map(get().pendingToolUses)
    pending.set(toolId, { name, input })
    set((s) => {
      const msgs = s.messages.map((m) => {
        if (m.id === msgId) {
          const toolUses = [...(m.toolUses || []), { id: toolId, name, input, status: 'running' as const }]
          return { ...m, toolUses }
        }
        return m
      })
      return { messages: msgs, pendingToolUses: pending }
    })
  },

  resolveToolUse: (toolId, result, isError) => {
    set((s) => {
      const msgs = s.messages.map((m) => {
        if (!m.toolUses) return m
        const toolUses = m.toolUses.map((t) =>
          t.id === toolId
            ? { ...t, result, status: (isError ? 'error' : 'done') as 'done' | 'error' }
            : t
        )
        return { ...m, toolUses }
      })
      const pending = new Map(s.pendingToolUses)
      pending.delete(toolId)
      return { messages: msgs, pendingToolUses: pending }
    })
  },

  clearMessages: () => set({ messages: [], currentSessionId: null, isStreaming: false }),
  loadHistory: (messages) => set({ messages, isStreaming: false }),
}))

// ── Session store ───────────────────────────────
interface SessionState {
  sessions: SessionListItem[]
  loading: boolean
  setSessions: (sessions: SessionListItem[]) => void
  setLoading: (v: boolean) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  loading: false,
  setSessions: (sessions) => set({ sessions }),
  setLoading: (v) => set({ loading: v }),
}))

// ── Prefs store ─────────────────────────────────
interface PrefsState {
  prefs: ClaudePrefs
  loaded: boolean
  setPrefs: (p: Partial<ClaudePrefs>) => void
  setLoaded: (v: boolean) => void
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
  verbose: false,
  theme: 'vscode',
}

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
  setLoaded: (v) => set({ loaded: v }),
}))

// ── UI store ────────────────────────────────────
interface UiState {
  sidebarTab: 'files' | 'history' | 'settings'
  sidebarOpen: boolean
  terminalOpen: boolean
  setSidebarTab: (tab: 'files' | 'history' | 'settings') => void
  setSidebarOpen: (v: boolean) => void
  setTerminalOpen: (v: boolean) => void
  toggleSidebar: () => void
  toggleTerminal: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarTab: 'files',
  sidebarOpen: true,
  terminalOpen: false,
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setTerminalOpen: (v) => set({ terminalOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
}))
