// Chat store — extracted from store/index.ts (Iteration 440)
import { create } from 'zustand'
import { ChatMessage, PermissionMessage, PlanMessage, StandardChatMessage } from '../types/app.types'

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

// Forward-declare the store so flushStreamingBuffer can reference it.
// The actual `create<>()` call is below.
let useChatStoreRef: typeof useChatStore

function flushStreamingBuffer() {
  streamingBuffer.rafId = 0
  if (!streamingBuffer.dirty) return
  streamingBuffer.dirty = false

  const { contentChunks, thinkingChunks, sessionId, messageId } = streamingBuffer

  useChatStoreRef.setState((s) => {
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

// Wire up the forward reference
useChatStoreRef = useChatStore
