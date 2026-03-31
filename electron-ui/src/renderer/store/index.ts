import { create } from 'zustand'
import { ChatMessage, PermissionMessage, PlanMessage, StandardChatMessage, ClaudePrefs, SessionListItem } from '../types/app.types'
import { ToastItem, ToastType } from '../components/ui/Toast'

// ── Task Queue types ─────────────────────────────
export interface TaskQueueItem {
  id: string
  content: string
  status: 'pending' | 'running' | 'done'
}

// ── Streaming buffer for throttled delta accumulation ──
const streamingBuffer = {
  contentChunks: [] as string[],
  thinkingChunks: [] as string[],
  sessionId: null as string | null,
  messageId: null as string | null,
  rafId: 0,
  dirty: false,
}

function flushStreamingBuffer() {
  streamingBuffer.rafId = 0
  if (!streamingBuffer.dirty) return
  streamingBuffer.dirty = false

  const { contentChunks, thinkingChunks, sessionId, messageId } = streamingBuffer

  useChatStore.setState((s) => {
    const msgs = [...s.messages]
    const lastIdx = msgs.length - 1
    const last = msgs[lastIdx]

    if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
      const std = last as StandardChatMessage
      const prevContentChunks = std._contentChunks || []
      const allContentChunks = [...prevContentChunks, ...contentChunks]
      const prevThinkingChunks = std._thinkingChunks || []
      const allThinkingChunks = [...prevThinkingChunks, ...thinkingChunks]

      msgs[lastIdx] = {
        ...std,
        _contentChunks: allContentChunks,
        content: allContentChunks.join(''),
        _thinkingChunks: allThinkingChunks.length > 0 ? allThinkingChunks : undefined,
        thinking: allThinkingChunks.length > 0 ? allThinkingChunks.join('') : std.thinking,
      } as StandardChatMessage
    } else if (contentChunks.length > 0 || thinkingChunks.length > 0) {
      msgs.push({
        id: messageId || `msg-${Date.now()}-${Math.random()}`,
        role: 'assistant',
        content: contentChunks.join(''),
        _contentChunks: contentChunks.slice(),
        thinking: thinkingChunks.length > 0 ? thinkingChunks.join('') : undefined,
        _thinkingChunks: thinkingChunks.length > 0 ? thinkingChunks.slice() : undefined,
        timestamp: Date.now(),
        isStreaming: true,
      } as StandardChatMessage)
    }

    // Clear buffer
    streamingBuffer.contentChunks = []
    streamingBuffer.thinkingChunks = []

    return { messages: msgs, currentSessionId: sessionId || s.currentSessionId }
  })
}

function scheduleFlush() {
  if (!streamingBuffer.rafId) {
    streamingBuffer.rafId = requestAnimationFrame(flushStreamingBuffer) as unknown as number
  }
}

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
  toggleBookmark: (msgId: string) => void
  togglePin: (msgId: string) => void
  toggleCollapse: (msgId: string) => void
  collapseAll: () => void
  expandAll: () => void
  lastCost: number | null
  totalSessionCost: number
  lastContextUsage: { used: number; total: number } | null
  setLastCost: (cost: number | null) => void
  setLastContextUsage: (usage: { used: number; total: number } | null) => void
  currentSessionTitle: string | null
  setSessionTitle: (title: string | null) => void

  // Task Queue
  taskQueue: TaskQueueItem[]
  queuePaused: boolean
  addToQueue: (content: string) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  toggleQueuePause: () => void
  shiftQueue: () => TaskQueueItem | null
  markQueueItemDone: (id: string) => void

  // Regeneration
  prepareRegeneration: () => string | null

  // Message editing
  editMessageAndTruncate: (msgId: string, newContent: string) => void

  // Response duration tracking
  setResponseDuration: (msgId: string, duration: number) => void

  // Message annotations
  setAnnotation: (msgId: string, text: string) => void

  // Crash recovery (Iteration 308): Restore messages from sessionStorage backup
  setMessages: (messages: ChatMessage[]) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentSessionId: null,
  workingDir: '',
  pendingToolUses: new Map(),
  lastUsage: null,
  lastCost: null,
  totalSessionCost: 0,
  lastContextUsage: null,
  currentSessionTitle: null,
  taskQueue: [],
  queuePaused: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendTextDelta: (sessionId, text) => {
    streamingBuffer.contentChunks.push(text)
    streamingBuffer.sessionId = sessionId
    streamingBuffer.dirty = true
    scheduleFlush()
  },

  setStreaming: (v) => {
    // Flush any pending streaming buffer before finalizing
    if (!v && streamingBuffer.dirty) {
      if (streamingBuffer.rafId) {
        cancelAnimationFrame(streamingBuffer.rafId)
        streamingBuffer.rafId = 0
      }
      flushStreamingBuffer()
    }
    set((s) => {
      const msgs = s.messages.map((m) => {
        if (m.role !== 'permission' && m.role !== 'plan' && (m as StandardChatMessage).isStreaming) {
          const std = m as StandardChatMessage
          // Finalize: join chunks into content and clean up internal fields
          const finalContent = std._contentChunks ? std._contentChunks.join('') : std.content
          const finalThinking = std._thinkingChunks ? std._thinkingChunks.join('') : std.thinking
          const { _contentChunks, _thinkingChunks, ...rest } = std
          return { ...rest, content: finalContent, thinking: finalThinking, isStreaming: false }
        }
        return m
      })
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

  clearMessages: () => {
    // Cancel any pending streaming flush
    if (streamingBuffer.rafId) {
      cancelAnimationFrame(streamingBuffer.rafId)
      streamingBuffer.rafId = 0
    }
    streamingBuffer.contentChunks = []
    streamingBuffer.thinkingChunks = []
    streamingBuffer.sessionId = null
    streamingBuffer.messageId = null
    streamingBuffer.dirty = false
    set({ messages: [], currentSessionId: null, currentSessionTitle: null, isStreaming: false, totalSessionCost: 0, lastCost: null, lastUsage: null, lastContextUsage: null })
  },
  loadHistory: (messages) => set({ messages, isStreaming: false }),

  appendThinkingDelta: (sessionId, text) => {
    streamingBuffer.thinkingChunks.push(text)
    streamingBuffer.sessionId = sessionId
    streamingBuffer.dirty = true
    scheduleFlush()
  },

  setLastUsage: (u) => set({ lastUsage: u }),
  setLastCost: (cost) => set((s) => ({ lastCost: cost, totalSessionCost: s.totalSessionCost + (cost ?? 0) })),
  setLastContextUsage: (usage) => set({ lastContextUsage: usage }),
  setSessionTitle: (title) => set({ currentSessionTitle: title }),

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

  toggleBookmark: (msgId) => set((s) => ({
    messages: s.messages.map(m => m.id === msgId ? { ...m, bookmarked: !(m as StandardChatMessage).bookmarked } as StandardChatMessage : m)
  })),

  togglePin: (msgId) => set((s) => ({
    messages: s.messages.map(m => m.id === msgId ? { ...m, pinned: !(m as StandardChatMessage).pinned } as StandardChatMessage : m)
  })),

  toggleCollapse: (msgId) => set((s) => ({
    messages: s.messages.map(m => m.id === msgId ? { ...m, collapsed: !(m as StandardChatMessage).collapsed } as StandardChatMessage : m)
  })),

  collapseAll: () => set((s) => ({
    messages: s.messages.map(m => m.role !== 'permission' && m.role !== 'plan' ? { ...m, collapsed: true } as StandardChatMessage : m)
  })),

  expandAll: () => set((s) => ({
    messages: s.messages.map(m => m.role !== 'permission' && m.role !== 'plan' ? { ...m, collapsed: false } as StandardChatMessage : m)
  })),

  // ── Task Queue actions ──────────────────────────
  addToQueue: (content) => set((s) => ({
    taskQueue: [...s.taskQueue, { id: `queue-${Date.now()}-${Math.random()}`, content, status: 'pending' as const }]
  })),

  removeFromQueue: (id) => set((s) => ({
    taskQueue: s.taskQueue.filter(item => item.id !== id)
  })),

  clearQueue: () => set((s) => ({
    taskQueue: s.taskQueue.filter(item => item.status !== 'pending')
  })),

  toggleQueuePause: () => set((s) => ({ queuePaused: !s.queuePaused })),

  shiftQueue: () => {
    const state = get()
    const nextItem = state.taskQueue.find(item => item.status === 'pending')
    if (!nextItem) return null
    set((s) => ({
      taskQueue: s.taskQueue.map(item =>
        item.id === nextItem.id ? { ...item, status: 'running' as const } : item
      )
    }))
    return nextItem
  },

  markQueueItemDone: (id) => set((s) => ({
    taskQueue: s.taskQueue.map(item =>
      item.id === id ? { ...item, status: 'done' as const } : item
    )
  })),

  prepareRegeneration: () => {
    const state = get()
    const msgs = state.messages
    // Find the last user message
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx < 0) return null
    const lastUserContent = (msgs[lastUserIdx] as StandardChatMessage).content
    // Remove messages from the last user message onward (the user prompt + assistant response)
    set({ messages: msgs.slice(0, lastUserIdx) })
    return lastUserContent || null
  },

  editMessageAndTruncate: (msgId, newContent) => {
    const state = get()
    const msgs = state.messages
    const idx = msgs.findIndex(m => m.id === msgId)
    if (idx < 0) return
    // Remove the edited message and everything after it; sendMessage will re-add the user message
    set({ messages: msgs.slice(0, idx) })
  },

  setResponseDuration: (msgId, duration) => set((s) => ({
    messages: s.messages.map(m =>
      m.id === msgId && m.role === 'assistant'
        ? { ...(m as StandardChatMessage), responseDuration: duration }
        : m
    ),
  })),

  setAnnotation: (msgId, text) => set((s) => ({
    messages: s.messages.map(m =>
      m.id === msgId
        ? { ...(m as StandardChatMessage), annotation: text || undefined }
        : m
    ),
  })),

  // Crash recovery (Iteration 308): Replace messages array wholesale.
  // Used by ErrorBoundary to restore from sessionStorage backup.
  setMessages: (messages) => set({ messages }),
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
  notifySound: true,
  compactMode: false,
  desktopNotifications: true,
  quickReplies: [
    { label: 'Summarize', prompt: 'Please summarize the above concisely:' },
    { label: 'Translate', prompt: 'Please translate the following text. If it is in Chinese, translate to English; if it is in English, translate to Chinese:' },
    { label: 'Draft email', prompt: 'Please draft a professional email based on the following points:' },
    { label: 'Brainstorm ideas', prompt: 'Please brainstorm creative ideas about:' },
  ],
}

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
  setLoaded: (v) => set({ loaded: v }),
}))

// ── UI store ────────────────────────────────────
interface UiState {
  sidebarTab: 'history' | 'files' | 'notes' | 'skills' | 'memory' | 'workflows' | 'prompthistory' | 'channel'
  sidebarOpen: boolean
  terminalOpen: boolean
  commandPaletteOpen: boolean
  toasts: ToastItem[]
  setSidebarTab: (tab: 'history' | 'files' | 'notes' | 'skills' | 'memory' | 'workflows' | 'prompthistory' | 'channel') => void
  setSidebarOpen: (v: boolean) => void
  setTerminalOpen: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  toggleSidebar: () => void
  toggleTerminal: () => void
  toggleCommandPalette: () => void
  focusMode: boolean
  toggleFocusMode: () => void
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void

  // NavRail active item tracking
  activeNavItem: 'chat' | 'history' | 'files' | 'terminal' | 'settings' | 'notes' | 'skills' | 'memory' | 'workflows' | 'prompthistory' | 'channel'
  setActiveNavItem: (item: UiState['activeNavItem']) => void

  // Quote reply: text to prefill into the input bar
  quotedText: string | null
  setQuotedText: (text: string | null) => void

  // Always-on-top (pin window)
  alwaysOnTop: boolean
  setAlwaysOnTop: (v: boolean) => void

  // Settings modal (opens as overlay instead of sidebar panel)
  settingsModalOpen: boolean
  setSettingsModalOpen: (v: boolean) => void
  openSettingsModal: () => void
  closeSettingsModal: () => void
}

// Restore last sidebar tab from localStorage
const savedSidebarTab = (() => {
  try {
    const saved = localStorage.getItem('aipa:sidebar-tab')
    const valid = ['history', 'files', 'notes', 'skills', 'memory', 'workflows', 'prompthistory', 'channel']
    if (saved && valid.includes(saved)) return saved as UiState['sidebarTab']
  } catch {}
  return 'history' as const
})()

export const useUiStore = create<UiState>((set) => ({
  sidebarTab: savedSidebarTab,
  sidebarOpen: true,
  terminalOpen: false,
  commandPaletteOpen: false,
  focusMode: false,
  toasts: [],
  activeNavItem: savedSidebarTab,
  quotedText: null,
  alwaysOnTop: false,
  setSidebarTab: (tab) => {
    try { localStorage.setItem('aipa:sidebar-tab', tab) } catch {}
    set({ sidebarTab: tab })
  },
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setTerminalOpen: (v) => set({ terminalOpen: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleFocusMode: () => set((s) => {
    if (!s.focusMode) {
      // Entering focus mode: hide sidebar and terminal
      return { focusMode: true, sidebarOpen: false, terminalOpen: false }
    }
    // Exiting focus mode: restore sidebar
    return { focusMode: false, sidebarOpen: true }
  }),
  addToast: (type, message, duration) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    set((s) => ({ toasts: [...s.toasts, { id, type, message, duration }] }))
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  setActiveNavItem: (item) => set((s) => {
    // Settings opens as a modal overlay, not in the sidebar
    if (item === 'settings') {
      return { settingsModalOpen: true }
    }
    if (item === 'history' || item === 'files' || item === 'notes' || item === 'skills' || item === 'memory' || item === 'workflows' || item === 'prompthistory' || item === 'channel') {
      try { localStorage.setItem('aipa:sidebar-tab', item) } catch {}
      return { activeNavItem: item, sidebarTab: item, sidebarOpen: true }
    }
    return { activeNavItem: item }
  }),
  setQuotedText: (text) => set({ quotedText: text }),
  setAlwaysOnTop: (v) => set({ alwaysOnTop: v }),
  settingsModalOpen: false,
  setSettingsModalOpen: (v) => set({ settingsModalOpen: v }),
  openSettingsModal: () => set({ settingsModalOpen: true }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),
}))
