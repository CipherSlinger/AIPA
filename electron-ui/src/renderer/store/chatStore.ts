// Chat store — extracted from store/index.ts (Iteration 440)
// Tab support added in Iteration 515
import { create } from 'zustand'
import { ChatMessage, ElicitationMessage, HookCallbackMessage, PermissionMessage, PlanMessage, StandardChatMessage } from '../types/app.types'

// ── Task Queue types ─────────────────────────────
export interface TaskQueueItem {
  id: string
  content: string
  status: 'pending' | 'running' | 'done'
  /** Optional workflow metadata for template variable substitution */
  workflowId?: string
  stepIndex?: number  // 0-based index of this step within the workflow
}

// ── Tab types (Iteration 515) ────────────────────
export interface TabSnapshot {
  messages: ChatMessage[]
  sessionId: string | null
  sessionTitle: string | null
  scrollTop: number
  totalSessionCost: number
  lastCost: number | null
  lastUsage: { inputTokens: number; outputTokens: number; cacheTokens: number } | null
  lastContextUsage: { used: number; total: number } | null
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; costUsd: number; turns: number }>
  sessionPersonaId: string | undefined
}

export interface TabInfo {
  id: string
  sessionId: string | null
  title: string
  snapshot: TabSnapshot | null  // null = this tab's state is "live" (in the flat chatStore fields)
  /** Per-tab working directory override. undefined = fall back to global prefs.workingDir */
  cwd?: string
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

// Module-level cache for scroll positions — avoids Zustand re-renders on every scroll event
const tabScrollTopCache = new Map<string, number>()
/** Read the cached scrollTop for a tab (used by TabBar/ChatPanel to restore scroll) */
export function getTabScrollTop(tabId: string): number {
  return tabScrollTopCache.get(tabId) ?? 0
}

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
  addHookCallback: (msg: HookCallbackMessage) => void
  resolveHookCallback: (requestId: string, decision: 'approved' | 'blocked') => void
  addElicitation: (msg: ElicitationMessage) => void
  resolveElicitation: (requestId: string, decision: 'accepted' | 'declined' | 'cancelled') => void
  cancelPendingInteractiveMessages: () => void
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
  addToQueue: (content: string, meta?: { workflowId?: string; stepIndex?: number }) => void
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

  // Conversation compaction (Iteration 368, inspired by Claude Code; enhanced Iteration 519)
  isCompacting: boolean
  compactionCount: number
  /** Snapshot of context usage before compact for before/after comparison (Iteration 519) */
  contextBeforeCompact: { used: number; total: number } | null
  setCompacting: (v: boolean) => void
  incrementCompactionCount: () => void
  setContextBeforeCompact: (usage: { used: number; total: number } | null) => void

  // Conversation rewind (Iteration 377): Remove all messages after the selected one
  rewindToMessage: (messageId: string) => number

  // Per-session persona (Iteration 407): track which persona is active for the current session
  sessionPersonaId: string | undefined
  setSessionPersonaId: (personaId: string | undefined) => void

  // Plan Mode (Iteration 520): Claude only plans, does not execute tools
  isPlanMode: boolean
  setPlanMode: (v: boolean) => void

  // Changed files tracking (Iteration 521: code changes view)
  changedFiles: Array<{ filePath: string; turnIndex: number; toolName: string; timestamp: number }>
  addChangedFile: (filePath: string, toolName: string) => void
  clearChangedFiles: () => void

  // Temporary system prompt override (Iteration 523): set per-session, cleared on new conversation
  tempSystemPrompt: string | null
  setTempSystemPrompt: (prompt: string | null) => void

  // Hook events (Iteration 525): live hook execution status in chat
  hookEvents: Array<{ id: string; hookEvent: string; hookType: string; status: 'running' | 'success' | 'error'; output?: string; timestamp: number }>
  addHookEvent: (event: { id: string; hookEvent: string; hookType: string; status: 'running' | 'success' | 'error'; output?: string; timestamp: number }) => void
  updateHookEvent: (id: string, update: Partial<{ id: string; hookEvent: string; hookType: string; status: 'running' | 'success' | 'error'; output?: string; timestamp: number }>) => void
  clearHookEvents: () => void

  // ── Tabs (Iteration 515) ──────────────────────────
  tabs: TabInfo[]
  activeTabId: string | null
  openTab: (sessionId: string, title: string, messages: ChatMessage[]) => string  // returns tabId
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  nextTab: () => void
  prevTab: () => void
  setTabScrollTop: (tabId: string, scrollTop: number) => void
  /** Find tab by session ID; returns tabId or null */
  findTabBySessionId: (sessionId: string) => string | null
  /** Update the title of a tab (e.g. when session title changes) */
  updateTabTitle: (tabId: string, title: string) => void
  /** Set (or clear) the per-tab working directory override */
  setTabCwd: (tabId: string, cwd: string | undefined) => void
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
  contextBeforeCompact: null,
  sessionPersonaId: undefined,
  isPlanMode: false,
  changedFiles: [],
  tempSystemPrompt: null,
  hookEvents: [],

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
        if (m.role !== 'permission' && m.role !== 'plan' && m.role !== 'hook_callback' && m.role !== 'elicitation' && (m as StandardChatMessage).isStreaming) {
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
    set({ messages: [], currentSessionId: null, currentSessionTitle: null, isStreaming: false, totalSessionCost: 0, lastCost: null, lastUsage: null, lastContextUsage: null, modelUsage: {}, sessionPersonaId: undefined, isPlanMode: false, changedFiles: [], tempSystemPrompt: null, hookEvents: [] })
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

  addHookCallback: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  resolveHookCallback: (requestId, decision) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === 'hook_callback' && (m as HookCallbackMessage).requestId === requestId
          ? { ...m, decision }
          : m
      ),
    })),

  addElicitation: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  resolveElicitation: (requestId, decision) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === 'elicitation' && (m as ElicitationMessage).requestId === requestId
          ? { ...m, decision }
          : m
      ),
    })),

  cancelPendingInteractiveMessages: () =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.role === 'hook_callback' && (m as HookCallbackMessage).decision === 'pending') {
          return { ...m, decision: 'blocked' as const }
        }
        if (m.role === 'elicitation' && (m as ElicitationMessage).decision === 'pending') {
          return { ...m, decision: 'cancelled' as const }
        }
        return m
      }),
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
    messages: s.messages.map(m => m.role !== 'permission' && m.role !== 'plan' && m.role !== 'hook_callback' && m.role !== 'elicitation' ? { ...m, collapsed: true } as StandardChatMessage : m)
  })),

  expandAll: () => set((s) => ({
    messages: s.messages.map(m => m.role !== 'permission' && m.role !== 'plan' && m.role !== 'hook_callback' && m.role !== 'elicitation' ? { ...m, collapsed: false } as StandardChatMessage : m)
  })),

  // ── Task Queue actions ──────────────────────────
  addToQueue: (content, meta) => set((s) => ({
    taskQueue: [...s.taskQueue, {
      id: `queue-${Date.now()}-${Math.random()}`,
      content,
      status: 'pending' as const,
      ...(meta?.workflowId !== undefined ? { workflowId: meta.workflowId } : {}),
      ...(meta?.stepIndex !== undefined ? { stepIndex: meta.stepIndex } : {}),
    }]
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
  setContextBeforeCompact: (usage) => set({ contextBeforeCompact: usage }),

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

  // Plan Mode toggle (Iteration 520)
  setPlanMode: (v) => set({ isPlanMode: v }),

  // Changed files tracking (Iteration 521)
  addChangedFile: (filePath, toolName) => set((s) => {
    const turnIndex = s.messages.filter(m => m.role === 'user').length
    return {
      changedFiles: [
        ...s.changedFiles,
        { filePath, turnIndex, toolName, timestamp: Date.now() },
      ],
    }
  }),
  clearChangedFiles: () => set({ changedFiles: [] }),

  // Temp system prompt override (Iteration 523)
  setTempSystemPrompt: (prompt) => set({ tempSystemPrompt: prompt }),

  // Hook events (Iteration 525)
  addHookEvent: (event) => set((s) => ({ hookEvents: [...s.hookEvents, event] })),
  updateHookEvent: (id, update) => set((s) => ({
    hookEvents: s.hookEvents.map(e => e.id === id ? { ...e, ...update } : e),
  })),
  clearHookEvents: () => set({ hookEvents: [] }),

  // ── Tab actions (Iteration 515) ────────────────────
  tabs: [],
  activeTabId: null,

  findTabBySessionId: (sessionId) => {
    const tab = get().tabs.find(t => t.sessionId === sessionId)
    return tab ? tab.id : null
  },

  updateTabTitle: (tabId, title) => {
    set((s) => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, title } : t),
    }))
  },

  setTabCwd: (tabId, cwd) => {
    set((s) => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, cwd } : t),
    }))
  },

  openTab: (sessionId, title, messages) => {
    const state = get()
    // Check if already open in a tab
    const existing = state.tabs.find(t => t.sessionId === sessionId)
    if (existing) {
      // Just switch to it
      state.switchTab(existing.id)
      return existing.id
    }
    // Max 8 tabs
    if (state.tabs.length >= 8) {
      return ''  // caller should show toast
    }
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const newTab: TabInfo = {
      id: tabId,
      sessionId,
      title: title || 'Untitled',
      snapshot: {
        messages,
        sessionId,
        sessionTitle: title,
        scrollTop: 0,
        totalSessionCost: 0,
        lastCost: null,
        lastUsage: null,
        lastContextUsage: null,
        modelUsage: {},
        sessionPersonaId: undefined,
      },
    }
    // If there's a current session in the store with no tab, snapshot it first as the "initial" tab
    if (state.tabs.length === 0 && (state.messages.length > 0 || state.currentSessionId)) {
      const initialTabId = `tab-${Date.now()}-init`
      const initialTab: TabInfo = {
        id: initialTabId,
        sessionId: state.currentSessionId,
        title: state.currentSessionTitle || 'Chat',
        snapshot: null,  // live — its data is already in the flat store fields
      }
      set((s) => ({
        tabs: [initialTab, newTab],
        activeTabId: initialTabId,  // will be switched immediately below
      }))
    } else {
      set((s) => ({
        tabs: [...s.tabs, newTab],
      }))
    }
    // Now switch to the new tab
    get().switchTab(tabId)
    return tabId
  },

  closeTab: (tabId) => {
    const state = get()
    const tabIdx = state.tabs.findIndex(t => t.id === tabId)
    if (tabIdx < 0) return

    const closingTab = state.tabs[tabIdx]
    const isActive = state.activeTabId === tabId

    // If the closing tab is streaming, dispatch abort event
    // (useStreamJson hook will handle the actual abort via bridge ID)
    if (isActive && state.isStreaming) {
      window.dispatchEvent(new CustomEvent('aipa:abortStream'))
    }

    const remainingTabs = state.tabs.filter(t => t.id !== tabId)

    if (remainingTabs.length === 0) {
      // Last tab — clear everything, back to welcome screen
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
      set({
        tabs: [],
        activeTabId: null,
        messages: [],
        currentSessionId: null,
        currentSessionTitle: null,
        isStreaming: false,
        totalSessionCost: 0,
        lastCost: null,
        lastUsage: null,
        lastContextUsage: null,
        modelUsage: {},
        sessionPersonaId: undefined,
        isPlanMode: false,
        tempSystemPrompt: null,
      })
      return
    }

    if (remainingTabs.length === 1) {
      // Going back to single-tab mode — ensure the remaining tab's state is live
      const sole = remainingTabs[0]
      if (isActive) {
        // The closing tab was active, so we need to restore the remaining tab
        if (sole.snapshot) {
          set({
            tabs: [{ ...sole, snapshot: null }],
            activeTabId: sole.id,
            messages: sole.snapshot.messages,
            currentSessionId: sole.snapshot.sessionId,
            currentSessionTitle: sole.snapshot.sessionTitle,
            totalSessionCost: sole.snapshot.totalSessionCost,
            lastCost: sole.snapshot.lastCost,
            lastUsage: sole.snapshot.lastUsage,
            lastContextUsage: sole.snapshot.lastContextUsage,
            modelUsage: sole.snapshot.modelUsage,
            sessionPersonaId: sole.snapshot.sessionPersonaId,
            isStreaming: false,
          })
        } else {
          // Remaining tab was already live? Shouldn't happen but just update tabs list
          set({ tabs: remainingTabs, activeTabId: sole.id })
        }
      } else {
        // The closing tab was inactive (had a snapshot), just remove it
        set({ tabs: remainingTabs })
      }
      return
    }

    // Multiple tabs remain
    if (isActive) {
      // Switch to adjacent tab
      const newIdx = tabIdx >= remainingTabs.length ? remainingTabs.length - 1 : tabIdx
      const newActive = remainingTabs[newIdx]
      // Restore the new active tab's snapshot
      if (newActive.snapshot) {
        set({
          tabs: remainingTabs.map(t =>
            t.id === newActive.id ? { ...t, snapshot: null } : t
          ),
          activeTabId: newActive.id,
          messages: newActive.snapshot.messages,
          currentSessionId: newActive.snapshot.sessionId,
          currentSessionTitle: newActive.snapshot.sessionTitle,
          totalSessionCost: newActive.snapshot.totalSessionCost,
          lastCost: newActive.snapshot.lastCost,
          lastUsage: newActive.snapshot.lastUsage,
          lastContextUsage: newActive.snapshot.lastContextUsage,
          modelUsage: newActive.snapshot.modelUsage,
          sessionPersonaId: newActive.snapshot.sessionPersonaId,
          isStreaming: false,
        })
      } else {
        set({ tabs: remainingTabs, activeTabId: newActive.id })
      }
    } else {
      // Just remove the inactive tab
      set({ tabs: remainingTabs })
    }
  },

  switchTab: (tabId) => {
    const state = get()
    if (state.activeTabId === tabId) return
    const targetTab = state.tabs.find(t => t.id === tabId)
    if (!targetTab) return

    // Snapshot the current active tab
    const currentTabId = state.activeTabId
    const updatedTabs = state.tabs.map(t => {
      if (t.id === currentTabId) {
        return {
          ...t,
          snapshot: {
            messages: state.messages,
            sessionId: state.currentSessionId,
            sessionTitle: state.currentSessionTitle,
            scrollTop: tabScrollTopCache.get(currentTabId!) ?? 0,
            totalSessionCost: state.totalSessionCost,
            lastCost: state.lastCost,
            lastUsage: state.lastUsage,
            lastContextUsage: state.lastContextUsage,
            modelUsage: state.modelUsage,
            sessionPersonaId: state.sessionPersonaId,
          },
        }
      }
      if (t.id === tabId) {
        return { ...t, snapshot: null }  // this tab becomes "live"
      }
      return t
    })

    // Restore target tab's state
    if (targetTab.snapshot) {
      // Pre-cache scrollTop so ChatPanel can read it on mount
      tabScrollTopCache.set(tabId, targetTab.snapshot.scrollTop)
      set({
        tabs: updatedTabs,
        activeTabId: tabId,
        messages: targetTab.snapshot.messages,
        currentSessionId: targetTab.snapshot.sessionId,
        currentSessionTitle: targetTab.snapshot.sessionTitle,
        totalSessionCost: targetTab.snapshot.totalSessionCost,
        lastCost: targetTab.snapshot.lastCost,
        lastUsage: targetTab.snapshot.lastUsage,
        lastContextUsage: targetTab.snapshot.lastContextUsage,
        modelUsage: targetTab.snapshot.modelUsage,
        sessionPersonaId: targetTab.snapshot.sessionPersonaId,
        isStreaming: false,
      })
    } else {
      // Tab has no snapshot (already live) — just update tabs & activeTabId
      set({ tabs: updatedTabs, activeTabId: tabId })
    }
  },

  nextTab: () => {
    const state = get()
    if (state.tabs.length < 2) return
    const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
    const nextIdx = (idx + 1) % state.tabs.length
    state.switchTab(state.tabs[nextIdx].id)
  },

  prevTab: () => {
    const state = get()
    if (state.tabs.length < 2) return
    const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
    const prevIdx = (idx - 1 + state.tabs.length) % state.tabs.length
    state.switchTab(state.tabs[prevIdx].id)
  },

  setTabScrollTop: (tabId, scrollTop) => {
    // Store scrollTop in a module-level map so switchTab can pick it up.
    // We don't put it in Zustand state to avoid re-renders on every scroll event.
    tabScrollTopCache.set(tabId, scrollTop)
  },
}))

// Wire up the forward reference
useChatStoreRef = useChatStore
