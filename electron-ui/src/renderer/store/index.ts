import { create } from 'zustand'
import { ChatMessage, PermissionMessage, PlanMessage, StandardChatMessage, ClaudePrefs, SessionListItem } from '../types/app.types'
import { ToastItem, ToastType } from '../components/ui/Toast'

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
  appendThinkingDelta: (sessionId: string, text: string) => void
  lastUsage: { inputTokens: number; outputTokens: number; cacheTokens: number } | null
  setLastUsage: (u: { inputTokens: number; outputTokens: number; cacheTokens: number }) => void
  addPermissionRequest: (msg: PermissionMessage) => void
  resolvePermission: (permissionId: string, decision: 'allowed' | 'denied') => void
  denyPendingPermissions: () => void
  addPlanMessage: (msg: PlanMessage) => void
  resolvePlan: (planId: string, decision: 'accepted' | 'rejected') => void
  rateMessage: (msgId: string, rating: 'up' | 'down' | null) => void
  lastCost: number | null
  lastContextUsage: { used: number; total: number } | null
  setLastCost: (cost: number | null) => void
  setLastContextUsage: (usage: { used: number; total: number } | null) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentSessionId: null,
  workingDir: '',
  pendingToolUses: new Map(),
  lastUsage: null,
  lastCost: null,
  lastContextUsage: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendTextDelta: (sessionId, text) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
        msgs[msgs.length - 1] = { ...last, content: (last as StandardChatMessage).content + text } as StandardChatMessage
      } else {
        msgs.push({
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
          isStreaming: true,
        } as StandardChatMessage)
      }
      return { messages: msgs, currentSessionId: sessionId || s.currentSessionId }
    })
  },

  setStreaming: (v) => {
    set((s) => {
      const msgs = s.messages.map((m) =>
        m.role !== 'permission' && m.role !== 'plan' && (m as StandardChatMessage).isStreaming
          ? { ...m, isStreaming: false }
          : m
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
        if (m.id === msgId && m.role !== 'permission') {
          const std = m as StandardChatMessage
          const toolUses = [...(std.toolUses || []), { id: toolId, name, input, status: 'running' as const }]
          return { ...std, toolUses }
        }
        return m
      })
      return { messages: msgs, pendingToolUses: pending }
    })
  },

  resolveToolUse: (toolId, result, isError) => {
    set((s) => {
      const msgs = s.messages.map((m) => {
        if (m.role === 'permission') return m
        const std = m as StandardChatMessage
        if (!std.toolUses) return m
        const toolUses = std.toolUses.map((t) =>
          t.id === toolId
            ? { ...t, result, status: (isError ? 'error' : 'done') as 'done' | 'error' }
            : t
        )
        return { ...std, toolUses }
      })
      const pending = new Map(s.pendingToolUses)
      pending.delete(toolId)
      return { messages: msgs, pendingToolUses: pending }
    })
  },

  clearMessages: () => set({ messages: [], currentSessionId: null, isStreaming: false }),
  loadHistory: (messages) => set({ messages, isStreaming: false }),

  appendThinkingDelta: (sessionId, text) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
        const prev = (last as StandardChatMessage).thinking || ''
        msgs[msgs.length - 1] = { ...last, thinking: prev + text } as StandardChatMessage
      } else {
        msgs.push({
          id: `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: '',
          thinking: text,
          timestamp: Date.now(),
          isStreaming: true,
        } as StandardChatMessage)
      }
      return { messages: msgs, currentSessionId: sessionId || s.currentSessionId }
    })
  },

  setLastUsage: (u) => set({ lastUsage: u }),
  setLastCost: (cost) => set({ lastCost: cost }),
  setLastContextUsage: (usage) => set({ lastContextUsage: usage }),

  addPermissionRequest: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  resolvePermission: (permissionId, decision) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === 'permission' && m.permissionId === permissionId
          ? { ...m, decision }
          : m
      ),
    })),

  denyPendingPermissions: () =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === 'permission' && m.decision === 'pending'
          ? { ...m, decision: 'denied' as const }
          : m
      ),
    })),

  addPlanMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  resolvePlan: (planId, decision) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === 'plan' && m.id === planId
          ? { ...m, decision }
          : m
      ),
    })),

  rateMessage: (msgId, rating) => set((s) => ({
    messages: s.messages.map(m => m.id === msgId ? { ...m, rating } as StandardChatMessage : m)
  })),
}))

// ── Session store ───────────────────────────────
interface SessionState {
  sessions: SessionListItem[]
  loading: boolean
  searchQuery: string
  setSessions: (sessions: SessionListItem[]) => void
  setLoading: (v: boolean) => void
  setSearchQuery: (query: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  loading: false,
  searchQuery: '',
  setSessions: (sessions) => set({ sessions }),
  setLoading: (v) => set({ loading: v }),
  setSearchQuery: (query) => set({ searchQuery: query }),
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
  skipPermissions: true,
  verbose: false,
  theme: 'vscode',
  thinkingLevel: 'off',
  systemPrompt: '',
  maxTurns: undefined,
  maxBudgetUsd: undefined,
}

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
  setLoaded: (v) => set({ loaded: v }),
}))

// ── UI store ────────────────────────────────────
interface UiState {
  sidebarTab: 'history' | 'settings'
  sidebarOpen: boolean
  terminalOpen: boolean
  toasts: ToastItem[]
  setSidebarTab: (tab: 'history' | 'settings') => void
  setSidebarOpen: (v: boolean) => void
  setTerminalOpen: (v: boolean) => void
  toggleSidebar: () => void
  toggleTerminal: () => void
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarTab: 'history',
  sidebarOpen: true,
  terminalOpen: false,
  toasts: [],
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setTerminalOpen: (v) => set({ terminalOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  addToast: (type, message, duration) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    set((s) => ({ toasts: [...s.toasts, { id, type, message, duration }] }))
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
