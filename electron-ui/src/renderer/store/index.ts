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
  toggleReaction: (msgId: string, reaction: string) => void
  toggleCollapse: (msgId: string) => void
  collapseAll: () => void
  expandAll: () => void
  lastCost: number | null
  totalSessionCost: number
  lastContextUsage: { used: number; total: number } | null
  /** Per-model usage breakdown: model name -> { inputTokens, outputTokens, cacheTokens, costUsd, turns } */
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; costUsd: number; turns: number }>
  setLastCost: (cost: number | null, model?: string, usage?: { inputTokens: number; outputTokens: number; cacheTokens: number }) => void
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

  // Conversation compaction (Iteration 368, inspired by Claude Code)
  isCompacting: boolean
  compactionCount: number
  setCompacting: (v: boolean) => void
  incrementCompactionCount: () => void

  // Conversation rewind (Iteration 377): Remove all messages after the selected one
  rewindToMessage: (messageId: string) => number

  // Per-session persona (Iteration 407): track which persona is active for the current session
  sessionPersonaId: string | undefined
  setSessionPersonaId: (personaId: string | undefined) => void
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
  modelUsage: {},
  currentSessionTitle: null,
  taskQueue: [],
  queuePaused: false,
  isCompacting: false,
  compactionCount: 0,
  sessionPersonaId: undefined,

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
    set({ messages: [], currentSessionId: null, currentSessionTitle: null, isStreaming: false, totalSessionCost: 0, lastCost: null, lastUsage: null, lastContextUsage: null, modelUsage: {}, sessionPersonaId: undefined })
  },
  loadHistory: (messages) => set({ messages, isStreaming: false }),

  appendThinkingDelta: (sessionId, text) => {
    streamingBuffer.thinkingChunks.push(text)
    streamingBuffer.sessionId = sessionId
    streamingBuffer.dirty = true
    scheduleFlush()
  },

  setLastUsage: (u) => set({ lastUsage: u }),
  setLastCost: (cost, model, usage) => set((s) => {
    const newTotal = s.totalSessionCost + (cost ?? 0)
    // Accumulate per-model usage
    if (model && cost != null) {
      const prev = s.modelUsage[model] || { inputTokens: 0, outputTokens: 0, cacheTokens: 0, costUsd: 0, turns: 0 }
      return {
        lastCost: cost,
        totalSessionCost: newTotal,
        modelUsage: {
          ...s.modelUsage,
          [model]: {
            inputTokens: prev.inputTokens + (usage?.inputTokens ?? 0),
            outputTokens: prev.outputTokens + (usage?.outputTokens ?? 0),
            cacheTokens: prev.cacheTokens + (usage?.cacheTokens ?? 0),
            costUsd: prev.costUsd + cost,
            turns: prev.turns + 1,
          },
        },
      }
    }
    return { lastCost: cost, totalSessionCost: newTotal }
  }),
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

  toggleReaction: (msgId, reaction) => set((s) => ({
    messages: s.messages.map(m => {
      if (m.id !== msgId) return m
      const std = m as StandardChatMessage
      const existing = std.reactions || []
      const has = existing.includes(reaction)
      return { ...std, reactions: has ? existing.filter(r => r !== reaction) : [...existing, reaction] } as StandardChatMessage
    })
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
  setCompacting: (v) => set({ isCompacting: v }),
  incrementCompactionCount: () => set((s) => ({ compactionCount: s.compactionCount + 1 })),

  rewindToMessage: (messageId) => {
    const state = get()
    const idx = state.messages.findIndex(m => m.id === messageId)
    if (idx < 0) return 0
    const removed = state.messages.length - idx - 1
    set({ messages: state.messages.slice(0, idx + 1) })
    return removed
  },

  setSessionPersonaId: (personaId) => {
    set({ sessionPersonaId: personaId })
    // Persist session-persona mapping in localStorage
    const sessionId = get().currentSessionId
    if (sessionId) {
      try {
        if (personaId) {
          localStorage.setItem(`aipa:session-persona:${sessionId}`, personaId)
        } else {
          localStorage.removeItem(`aipa:session-persona:${sessionId}`)
        }
      } catch { /* ignore localStorage errors */ }
    }
  },
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
  resumeLastSession: false,
  quickReplies: [
    { label: 'Summarize', prompt: 'Please summarize the above concisely:' },
    { label: 'Translate', prompt: 'Please translate the following text. If it is in Chinese, translate to English; if it is in English, translate to Chinese:' },
    { label: 'Draft email', prompt: 'Please draft a professional email based on the following points:' },
    { label: 'Brainstorm ideas', prompt: 'Please brainstorm creative ideas about:' },
  ],
  effortLevel: 'medium',
  preventSleep: true,
}

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
  setLoaded: (v) => set({ loaded: v }),
}))

// ── UI store ────────────────────────────────────
export type SidebarTab = 'history' | 'files' | 'notes' | 'skills' | 'memory' | 'workflows' | 'channel' | 'notifications'
export type NavItem = 'chat' | 'history' | 'files' | 'settings' | 'notes' | 'skills' | 'memory' | 'workflows' | 'channel' | 'notifications'

export interface NotificationEntry {
  id: string
  type: ToastType
  message: string
  timestamp: number
}

interface UiState {
  sidebarTab: SidebarTab
  sidebarOpen: boolean
  commandPaletteOpen: boolean
  toasts: ToastItem[]
  setSidebarTab: (tab: SidebarTab) => void
  setSidebarOpen: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  toggleSidebar: () => void
  toggleCommandPalette: () => void
  focusMode: boolean
  toggleFocusMode: () => void
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void

  // Notification history
  notifications: NotificationEntry[]
  unreadNotificationCount: number
  markNotificationsRead: () => void
  clearNotifications: () => void

  // NavRail active item tracking
  activeNavItem: NavItem
  setActiveNavItem: (item: NavItem) => void

  // Quote reply: text to prefill into the input bar
  quotedText: string | null
  setQuotedText: (text: string | null) => void

  // Always-on-top (pin window)
  alwaysOnTop: boolean
  setAlwaysOnTop: (v: boolean) => void

  // Terminal session resumption
  terminalResumeSessionId: string | null
  setTerminalResumeSessionId: (id: string | null) => void

  // Settings modal (opens as overlay instead of sidebar panel)
  settingsModalOpen: boolean
  setSettingsModalOpen: (v: boolean) => void
  openSettingsModal: () => void
  closeSettingsModal: () => void

  // Main content area view (Iteration 412: settings as page; Iteration 414: persona/workflow editors)
  mainView: 'chat' | 'settings' | 'persona-editor' | 'workflow-editor'
  setMainView: (view: 'chat' | 'settings' | 'persona-editor' | 'workflow-editor') => void

  // Persona/Workflow editor: ID of item being edited (null = new)
  editingPersonaId: string | null
  editingWorkflowId: string | null
  openPersonaEditor: (personaId: string | null) => void
  openWorkflowEditor: (workflowId: string | null) => void

  // Session Quick Switcher (Ctrl+K)
  sessionSwitcherOpen: boolean
  setSessionSwitcherOpen: (v: boolean) => void
  toggleSessionSwitcher: () => void

  // Session Pinned Notes (keyed by session ID)
  sessionNotes: Record<string, string>
  setSessionNote: (sessionId: string, note: string) => void
  removeSessionNote: (sessionId: string) => void

  // Pinned Note ID per session (Iteration 439) — max 1 note pinned to chat header
  pinnedNoteIds: Record<string, string>
  setPinnedNoteId: (sessionId: string, noteId: string) => void
  removePinnedNoteId: (sessionId: string) => void
}

// Restore last sidebar tab from localStorage
const savedSidebarTab = (() => {
  try {
    const saved = localStorage.getItem('aipa:sidebar-tab')
    const valid = ['history', 'files', 'notes', 'skills', 'memory', 'workflows', 'channel', 'notifications']
    if (saved && valid.includes(saved)) return saved as UiState['sidebarTab']
  } catch {}
  return 'history' as const
})()

export const useUiStore = create<UiState>((set) => ({
  sidebarTab: savedSidebarTab,
  sidebarOpen: true,
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
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleFocusMode: () => set((s) => {
    if (!s.focusMode) {
      // Entering focus mode: hide sidebar
      return { focusMode: true, sidebarOpen: false }
    }
    // Exiting focus mode: restore sidebar
    return { focusMode: false, sidebarOpen: true }
  }),
  addToast: (type, message, duration) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    // Error toasts persist longer (8s default vs 4s)
    const effectiveDuration = duration ?? (type === 'error' ? 8000 : 4000)
    set((s) => ({
      toasts: [...s.toasts, { id, type, message, duration: effectiveDuration }],
      // Also add to notification history (max 50)
      notifications: [
        { id, type, message, timestamp: Date.now() },
        ...s.notifications,
      ].slice(0, 50),
      unreadNotificationCount: s.unreadNotificationCount + 1,
    }))
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  notifications: [],
  unreadNotificationCount: 0,
  markNotificationsRead: () => set({ unreadNotificationCount: 0 }),
  clearNotifications: () => set({ notifications: [], unreadNotificationCount: 0 }),
  setActiveNavItem: (item) => set((s) => {
    // Settings opens as a modal overlay, not in the sidebar
    if (item === 'settings') {
      return { settingsModalOpen: true }
    }
    if (item === 'history' || item === 'files' || item === 'notes' || item === 'skills' || item === 'memory' || item === 'workflows' || item === 'channel' || item === 'notifications') {
      try { localStorage.setItem('aipa:sidebar-tab', item) } catch {}
      return { activeNavItem: item, sidebarTab: item, sidebarOpen: true }
    }
    return { activeNavItem: item }
  }),
  setQuotedText: (text) => set({ quotedText: text }),
  setAlwaysOnTop: (v) => set({ alwaysOnTop: v }),
  terminalResumeSessionId: null,
  setTerminalResumeSessionId: (id) => set({ terminalResumeSessionId: id }),
  settingsModalOpen: false,
  setSettingsModalOpen: (v) => set({ settingsModalOpen: v }),
  openSettingsModal: () => set({ settingsModalOpen: true, mainView: 'settings' }),
  closeSettingsModal: () => set({ settingsModalOpen: false, mainView: 'chat' }),
  mainView: 'chat',
  setMainView: (view) => set({ mainView: view }),
  editingPersonaId: null,
  editingWorkflowId: null,
  openPersonaEditor: (personaId) => set({ mainView: 'persona-editor', editingPersonaId: personaId, settingsModalOpen: false }),
  openWorkflowEditor: (workflowId) => set({ mainView: 'workflow-editor', editingWorkflowId: workflowId, settingsModalOpen: false }),
  sessionSwitcherOpen: false,
  setSessionSwitcherOpen: (v) => set({ sessionSwitcherOpen: v }),
  toggleSessionSwitcher: () => set((s) => ({ sessionSwitcherOpen: !s.sessionSwitcherOpen })),
  sessionNotes: (() => {
    try {
      const saved = localStorage.getItem('aipa:session-notes')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })(),
  setSessionNote: (sessionId, note) => set((s) => {
    const updated = { ...s.sessionNotes, [sessionId]: note }
    try { localStorage.setItem('aipa:session-notes', JSON.stringify(updated)) } catch {}
    return { sessionNotes: updated }
  }),
  removeSessionNote: (sessionId) => set((s) => {
    const updated = { ...s.sessionNotes }
    delete updated[sessionId]
    try { localStorage.setItem('aipa:session-notes', JSON.stringify(updated)) } catch {}
    return { sessionNotes: updated }
  }),

  // Pinned Note ID per session (Iteration 439)
  pinnedNoteIds: (() => {
    try {
      const saved = localStorage.getItem('aipa:pinned-note-ids')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })(),
  setPinnedNoteId: (sessionId, noteId) => set((s) => {
    const updated = { ...s.pinnedNoteIds, [sessionId]: noteId }
    try { localStorage.setItem('aipa:pinned-note-ids', JSON.stringify(updated)) } catch {}
    return { pinnedNoteIds: updated }
  }),
  removePinnedNoteId: (sessionId) => set((s) => {
    const updated = { ...s.pinnedNoteIds }
    delete updated[sessionId]
    try { localStorage.setItem('aipa:pinned-note-ids', JSON.stringify(updated)) } catch {}
    return { pinnedNoteIds: updated }
  }),
}))
