// Chat store — extracted from store/index.ts (Iteration 440)
// Tab support added in Iteration 515
import { create } from 'zustand'
import { ChatMessage, ElicitationMessage, HistoryAskNotice, HookCallbackMessage, PermissionMessage, PlanMessage, StandardChatMessage } from '../types/app.types'
import { sessionModelStorageKey } from '../lib/sessionModel'
import { type EffortLevel, writeSessionEffortOverride } from '../lib/sessionEffort'
import type { ThreadStatusChip } from '../components/chat/threadStatusText'
import type { ThreadGoalView } from '../utils/threadGoal'
import type { MemoryTurnReceipt } from '../lib/memoryReceipt'

// ── Task Queue types ─────────────────────────────
export interface TaskQueueItem {
  id: string
  content: string
  status: 'pending' | 'running' | 'done' | 'failed'
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
  /** Explicit model pick for this conversation; outranks the persona's model. */
  sessionModelOverride: string | undefined
  /** Explicit effort pick for this conversation; undefined follows the global default. */
  sessionEffortOverride: EffortLevel | undefined
  /** The desk a brand-new conversation was started from; see the flat field. */
  draftDepartmentId: string | undefined
}

export interface TabInfo {
  id: string
  sessionId: string | null
  title: string
  snapshot: TabSnapshot | null  // null = this tab's state is "live" (in the flat chatStore fields)
  /** Per-tab working directory override. undefined = fall back to global prefs.workingDir */
  cwd?: string
}

// ── Codex turn diff (turn/diff/updated) ──────────
/**
 * The aggregate patch for the turn. Authoritative in a way the file-edit tool
 * cards are not: it also contains changes made by shell commands. Kept beside
 * the transcript, never inside it — `messages` is persisted and re-parsed by
 * the session readers, and a synthetic diff message would poison both.
 */
export interface TurnDiffUpdate {
  sessionId: string
  threadId: string | null
  turnId: string | null
  /** Unified-diff text, already tail-limited by the bridge (32 KiB). */
  diff: string
  /** `true` means the beginning of the diff is missing, not the end. */
  truncated: boolean
  /**
   * Epoch ms when AIPA received this snapshot. Drift checks compare file
   * mtimes against it; null means the receipt time is unknown, so no
   * changed/unchanged claim can be made.
   */
  capturedAt: number | null
  /** The thread cwd that diff paths are relative to; null when unknown. */
  cwd: string | null
}

// ── Codex thread settings (thread/settings/updated) ──
/**
 * Only the compact, user-meaningful fields. Null means Codex did not report
 * that field; `sandboxPolicy` is stringified to a short label because the
 * protocol value is sometimes an object.
 */
export interface ThreadSettingsSummary {
  model: string | null
  modelProvider: string | null
  approvalPolicy: string | null
  effort: string | null
  sandboxPolicy: string | null
}

// ── Streaming buffer for throttled delta accumulation ──
// Append-only: chunks are pushed onto the buffered arrays and handed to the
// streaming message's `_contentChunks` in place. The expensive `.join('')` over
// the whole turn happens once, when the turn is finalized in setStreaming(false).
const streamingBuffer = {
  contentChunks: [] as string[],
  thinkingChunks: [] as string[],
  sessionId: null as string | null,
  rafId: 0,
  dirty: false,
}

// Forward-declare the store so flushStreamingBuffer can reference it.
// The actual `create<>()` call is below.
let useChatStoreRef: typeof useChatStore

// Number of user messages in the live list, maintained incrementally so that
// addChangedFile() doesn't need an O(n) scan on every tool use.
let userMessageCount = 0
function recountUserMessages(messages: ChatMessage[]): number {
  let n = 0
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') n++
  }
  userMessageCount = n
  return n
}

/**
 * Deltas are only accepted from the bridge the composer started. Background
 * jobs (memory extraction, away summary) run their own bridge; without this
 * check their tokens were appended to whatever conversation was on screen.
 *
 * A missing `streamSessionId` must never mean "accept anything": `clearMessages`
 * nulls it while the previous bridge is still running in the main process, so a
 * session switch mid-stream would otherwise pour A's answer into B's transcript.
 */
function isTurnSession(sessionId: string): boolean {
  if (!useChatStoreRef) return true
  const s = useChatStoreRef.getState()
  // An event without a bridge id cannot be attributed to anyone.
  if (!sessionId) return false
  // The bridge the composer declared owns the transcript.
  if (s.streamSessionId) return sessionId === s.streamSessionId
  // Between dispatch and the send reply the bridge id is not known yet, so the
  // only bridge that may speak is the one this turn started. If a session was
  // opened in the meantime the conversation no longer matches and the window
  // belongs to a bridge the user left.
  if (s.streamPending) {
    return s.streamConversationId === null || s.streamConversationId === s.viewSessionId
  }
  // `clearMessages()` wiped an in-flight turn. It may still be talking, but its
  // words belong to its own conversation — never to whatever is now on screen.
  const orphan = s.orphanedStream
  return !!orphan && orphan.visible && orphan.bridgeId === sessionId
}

function flushStreamingBuffer() {
  streamingBuffer.rafId = 0
  if (!streamingBuffer.dirty) return
  streamingBuffer.dirty = false

  const { contentChunks, thinkingChunks, sessionId } = streamingBuffer
  if (contentChunks.length === 0 && thinkingChunks.length === 0) return

  // Detach the buffer upfront so the next frame starts clean; the arrays are
  // handed to the store below (append-only, never rebuilt).
  streamingBuffer.contentChunks = []
  streamingBuffer.thinkingChunks = []

  const newContent = contentChunks.join('')
  const newThinking = thinkingChunks.join('')

  useChatStoreRef.setState((s) => {
    const msgs = s.messages
    const lastIdx = msgs.length - 1
    const last = msgs[lastIdx]

    if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
      const std = last as StandardChatMessage
      // Append the new chunks to the existing arrays in place (no spread/rebuild).
      const mergedContentChunks = std._contentChunks
        ? (std._contentChunks.push(...contentChunks), std._contentChunks)
        : contentChunks
      const mergedThinkingChunks = std._thinkingChunks
        ? (std._thinkingChunks.push(...thinkingChunks), std._thinkingChunks)
        : (thinkingChunks.length > 0 ? thinkingChunks : undefined)

      // Shallow copy keeps every non-last message object (and thus `React.memo`
      // bails in MessageList) identical across frames.
      const nextMsgs = msgs.slice()
      nextMsgs[lastIdx] = {
        ...std,
        _contentChunks: mergedContentChunks,
        content: std.content + newContent,
        _thinkingChunks: mergedThinkingChunks,
        thinking: newThinking ? (std.thinking || '') + newThinking : std.thinking,
      } as StandardChatMessage
      return { messages: nextMsgs, currentSessionId: sessionId || s.currentSessionId }
    }

    // First chunk of a new assistant turn
    const nextMsgs = msgs.slice()
    nextMsgs.push({
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'assistant',
      content: newContent,
      _contentChunks: contentChunks,
      thinking: newThinking || undefined,
      _thinkingChunks: thinkingChunks.length > 0 ? thinkingChunks : undefined,
      timestamp: Date.now(),
      isStreaming: true,
    } as StandardChatMessage)

    return { messages: nextMsgs, currentSessionId: sessionId || s.currentSessionId }
  })
}

function scheduleFlush() {
  if (!streamingBuffer.rafId) {
    streamingBuffer.rafId = requestAnimationFrame(flushStreamingBuffer) as unknown as number
  }
}

// ── Chat store ──────────────────────────────────

// Sessions the user renamed by hand. The first automatic title is generated
// asynchronously; if the user names a conversation while that request is in
// flight, the late result must not overwrite their choice. Persisted as well,
// because a resumed session with a single user message can trigger the title
// generator again in a later run. Module-level (not store state) because
// nothing renders from it.
const manuallyTitledSessions = new Set<string>()
const MANUAL_TITLE_KEY_PREFIX = 'aipa:session-manual-title:'

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
  /**
   * Patch the ephemeral history-ask row as its answer streams in or settles.
   * It writes only to the in-memory message array; nothing downstream persists
   * the row, which is exactly what the row tells the user.
   */
  updateHistoryAsk: (messageId: string, patch: Partial<HistoryAskNotice>) => void
  /** Mark a user message's images as undelivered, with the honest reason. */
  markAttachmentsNotSent: (msgId: string, reason: string) => void
  /**
   * Record what memory block this turn prepended to the prompt, so the user's
   * row can disclose it verbatim. Addressed by id — the row was already added
   * when assembly resolves — and never written to any other message.
   */
  noteMemoryReceipt: (msgId: string, receipt: MemoryTurnReceipt) => void
  /**
   * Drop a receipt whose turn never reached the engine. The disclosure
   * describes a prompt block the model was given; if the request failed to
   * start, that block was never delivered, and saying nothing is truthful
   * where "told · …" would not be.
   */
  clearMemoryReceipt: (msgId: string) => void
  /**
   * Tag the newest still-unattributed user row with the Codex turn it started.
   * The engine echoes each prompt as a `userMessage` item carrying `turnId`;
   * this matches that echo to the row the renderer added just before the turn.
   * Guidance rows are skipped (they name their turn in `guidance.turnId`), and
   * a row that already has a turn id makes this a no-op — the echo arrives on
   * both `item/started` and `item/completed`.
   */
  attachTurnToLastUserMessage: (turnId: string) => void
  /**
   * The turn currently running in the main process, as the composer knows it:
   * which engine owns it, and the Codex turn id once `turn/started` names it.
   * Steering is only legal against this id, never against a remembered one.
   * Null whenever no turn is live — the composer checks `isStreaming` first,
   * so a stale value can never turn into a steer.
   */
  liveTurn: { engine: 'codex' | 'legacy'; turnId: string | null } | null
  /** A turn was dispatched; its id may not be known yet. */
  beginLiveTurn: (engine: 'codex' | 'legacy') => void
  /** `turn/started` (or the turn/start reply) named the running turn. */
  setLiveTurnId: (turnId: string) => void
  /** Record the fate of one guidance row, in place. */
  settleGuidance: (msgId: string, state: 'sent' | 'failed', error?: string) => void
  /**
   * The turn ended while guidance was still in flight. Settle those rows as
   * failed with the given reason instead of leaving them claiming delivery.
   */
  settlePendingGuidance: (error: string) => void
  appendTextDelta: (sessionId: string, text: string) => void
  setStreaming: (v: boolean) => void
  /**
   * Set the turn diff's capture time to the moment the turn ended, so the
   * card's drift check answers "changed after this turn" rather than "changed
   * after some mid-turn snapshot". A no-op when there is no diff.
   */
  markTurnDiffCaptured: (capturedAt: number) => void
  /**
   * Bridge id of the turn the composer started. Deltas from any other bridge
   * (background memory extraction, away summary) are dropped by
   * appendTextDelta/appendThinkingDelta.
   */
  streamSessionId: string | null
  /**
   * Engine session id of the conversation the live/expected bridge answers in.
   * `null` = a brand-new conversation whose id is not known yet.
   */
  streamConversationId: string | null
  /**
   * True from the moment a turn is dispatched until its bridge id is announced
   * by `setStreamSession` — text deltas can arrive before that reply does.
   */
  streamPending: boolean
  /**
   * The conversation the user is actually looking at. Unlike `currentSessionId`
   * this is never overwritten by a flushing delta — `flushStreamingBuffer`
   * writes the bridge id into `currentSessionId`, which makes it useless as a
   * "same view?" test while a turn is in flight.
   */
  viewSessionId: string | null
  /**
   * A bridge that was mid-turn when `clearMessages()` wiped the view. It keeps
   * running in the main process; it may only write again while its own
   * conversation is the one that was reopened (`visible`).
   */
  orphanedStream: { bridgeId: string; conversationId: string; visible: boolean } | null
  /** Record the conversation a freshly dispatched turn belongs to. */
  beginTurn: () => void
  /**
   * Whether a cli:* event carrying this bridge id belongs to the turn answering
   * the visible conversation. Deltas already pass through the same internal
   * rule; turn-end handling asks it explicitly so a background or other-tab
   * bridge finishing cannot clear the foreground's streaming state.
   */
  isOwnedStreamEvent: (sessionId: string) => boolean
  /**
   * Drop the remembered orphan when its bridge ends while its conversation is
   * not on screen. The turn can no longer be reattached; keeping the marker
   * would leave a dead bridge owning a future view.
   */
  releaseOrphanStream: (bridgeId: string) => void
  setStreamSession: (id: string | null) => void
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
  /**
   * Retire a still-pending permission/elicitation card because the server or
   * the bridge settled the request without a user answer. Only `pending`
   * messages move — a user decision already recorded wins, and unknown
   * request ids are a no-op.
   */
  settleServerRequest: (requestId: string, outcome: 'resolved' | 'expired') => void
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
  /**
   * Collapse exactly these messages. `expandAll()` has no inverse, so the find
   * bar needs a way to put back the rows it expanded on the user's behalf
   * without touching anything else.
   */
  collapseMessages: (msgIds: readonly string[]) => void
  lastCost: number | null
  totalSessionCost: number
  lastContextUsage: { used: number; total: number } | null
  /** Per-model usage breakdown: model name -> { inputTokens, outputTokens, cacheTokens, costUsd, turns } */
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; costUsd: number; turns: number }>
  setLastCost: (cost: number | null, model?: string, usage?: { inputTokens: number; outputTokens: number; cacheTokens: number }) => void
  setLastContextUsage: (usage: { used: number; total: number } | null) => void
  currentSessionTitle: string | null
  setSessionTitle: (title: string | null) => void
  /**
   * Apply a title to the session it was generated for. Automatic titles arrive
   * asynchronously, after the user may have opened another conversation;
   * routing them through setSessionTitle renamed whatever was open instead.
   */
  setSessionTitleFor: (sessionId: string, title: string) => void
  /** Sessions named by hand — a late automatic title must not overwrite them. */
  markSessionTitleManual: (sessionId: string) => void
  isSessionTitleManual: (sessionId: string) => boolean

  // Task Queue
  taskQueue: TaskQueueItem[]
  queuePaused: boolean
  addToQueue: (content: string, meta?: { workflowId?: string; stepIndex?: number }) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
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

  // Per-session model override: an explicit pick beats the persona's model.
  // undefined means "follow the persona (or the global default when none)".
  sessionModelOverride: string | undefined
  setSessionModelOverride: (modelId: string | undefined) => void

  // Per-session effort: an explicit pick beats the global default, exactly as
  // an explicit model pick beats the persona. `undefined` (and `'auto'`, which
  // resolves to the same thing) means "follow the global default".
  sessionEffortOverride: EffortLevel | undefined
  setSessionEffortOverride: (level: EffortLevel | undefined) => void

  /**
   * The department desk a brand-new conversation was started from.
   *
   * A draft has no session id, so the org tree cannot resolve it yet. This is
   * the department view's own assertion ("this conversation started at that
   * desk"), not a guess: nothing else sets it, it names an id that must still
   * exist in the tree at send time, and it is consulted only while the
   * conversation has no session row of its own. The working directory and the
   * conversation title are deliberately not used this way — either can differ
   * from where the conversation really lives.
   */
  draftDepartmentId: string | undefined
  setDraftDepartmentId: (deptId: string | undefined) => void

  // Plan Mode (Iteration 520): Claude only plans, does not execute tools
  isPlanMode: boolean
  setPlanMode: (v: boolean) => void

  // Changed files tracking (Iteration 521: code changes view)
  changedFiles: Array<{ filePath: string; turnIndex: number; toolName: string; timestamp: number }>
  addChangedFile: (filePath: string, toolName: string) => void
  clearChangedFiles: () => void

  // Codex aggregate turn diff — see TurnDiffUpdate. Cleared with the
  // conversation and when a new turn starts, so a finished turn's card cannot
  // sit under the next turn's answer.
  turnDiff: TurnDiffUpdate | null
  setTurnDiff: (update: TurnDiffUpdate | null) => void
  clearTurnDiff: () => void

  // Settings the Codex thread actually runs with (model / approval / effort).
  // Read-only reporting: nothing here drives what a turn sends.
  threadSettings: ThreadSettingsSummary | null
  setThreadSettings: (settings: ThreadSettingsSummary | null) => void
  clearThreadSettings: () => void

  // Last `thread/status/changed` report, reduced to what the composer shows.
  // Null means no live claim. The mapping rules (including idle / notLoaded /
  // malformed → no chip) live in components/chat/threadStatusText.ts.
  threadStatus: ThreadStatusChip | null
  setThreadStatus: (status: ThreadStatusChip | null) => void

  // Standing goal reported by `thread/goal/updated` (validated by
  // utils/threadGoal). A goal belongs to one thread; it is cleared by
  // `thread/goal/cleared` or when the conversation changes.
  threadGoal: ThreadGoalView | null
  setThreadGoal: (goal: ThreadGoalView | null) => void
  clearThreadGoal: () => void

  // Temporary system prompt override (Iteration 523): set per-session, cleared on new conversation
  tempSystemPrompt: string | null
  setTempSystemPrompt: (prompt: string | null) => void

  // Hook events (Iteration 525): live hook execution status in chat
  hookEvents: Array<{ id: string; hookEvent: string; hookType: string; status: 'running' | 'success' | 'error'; output?: string; timestamp: number }>
  addHookEvent: (event: { id: string; hookEvent: string; hookType: string; status: 'running' | 'success' | 'error'; output?: string; timestamp: number }) => void
  updateHookEvent: (id: string, update: Partial<{ id: string; hookEvent: string; hookType: string; status: 'running' | 'success' | 'error'; output?: string; timestamp: number }>) => void
  clearHookEvents: () => void

  // Plan approval request (multi-agent protocol): pending request from a sub-agent
  pendingPlanApproval: { sessionId: string; requestId: string; from: string; planContent: string; planFilePath: string } | null
  setPendingPlanApproval: (req: { sessionId: string; requestId: string; from: string; planContent: string; planFilePath: string } | null) => void

  // DreamTask events: memory consolidation runs. `source: 'cli'` is the CLI's
  // own `.consolidate-lock` marker; `source: 'dream'` is an AIPA background pass
  // that wrote `entries` memory statements to `file`.
  dreamEvents: Array<{
    id: string
    timestamp: number
    sessionsReviewed?: number
    source?: 'cli' | 'dream'
    entries?: number
    file?: string
  }>
  addDreamEvent: (event: {
    id: string
    timestamp: number
    sessionsReviewed?: number
    source?: 'cli' | 'dream'
    entries?: number
    file?: string
  }) => void
  clearDreamEvents: () => void

  /**
   * Quiet tail marker for a Codex turn the protocol did not report as
   * completed. `interrupted` and `unknown` are shown as muted inline lines —
   * never as an error, never as a successful finish.
   */
  lastTurnOutcome: 'interrupted' | 'unknown' | null
  setLastTurnOutcome: (outcome: 'interrupted' | 'unknown' | null) => void

  // Result event stats (P0-5): permission denials, turns, duration from CLI result
  permissionDenials: Array<{ tool_name: string; reason?: string }>
  lastNumTurns: number | null
  lastDurationMs: number | null
  lastResultUuid: string | null
  fastModeState: string | null
  setResultStats: (denials: Array<{ tool_name: string; reason?: string }>, numTurns: number | null, durationMs: number | null) => void
  setLastResultUuid: (uuid: string | null) => void
  setFastModeState: (state: string | null) => void
  clearResultStats: () => void

  // Active worktree state (P4-6): updated when CLI emits worktree-state event
  activeWorktree: { path: string; branch: string; state: string } | null
  setActiveWorktree: (wt: { path: string; branch: string; state: string } | null) => void

  // system.init data — updated at the start of each CLI session
  availableTools: string[]
  availableSkills: string[]
  activePlugins: string[]
  mcpServers: Array<{ name: string; status: string }>
  activeModel: string
  permissionMode: string
  setSystemInit: (data: { sessionId: string; tools: string[]; mcpServers: Array<{ name: string; status: string }>; model: string; permissionMode: string; cwd: string; skills?: string[]; plugins?: string[] }) => void

  // ── Tabs (Iteration 515) ──────────────────────────
  tabs: TabInfo[]
  activeTabId: string | null
  openTab: (sessionId: string, title: string, messages: ChatMessage[]) => string  // returns tabId
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  nextTab: () => void
  prevTab: () => void
  setTabScrollTop: (tabId: string, scrollTop: number) => void
  clearTabScrollTop: (tabId: string) => void
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
  liveTurn: null,
  streamSessionId: null,
  streamConversationId: null,
  streamPending: false,
  viewSessionId: null,
  orphanedStream: null,
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
  sessionModelOverride: undefined,
  sessionEffortOverride: undefined,
  draftDepartmentId: undefined,
  isPlanMode: false,
  changedFiles: [],
  turnDiff: null,
  threadSettings: null,
  threadStatus: null,
  threadGoal: null,
  tempSystemPrompt: null,
  hookEvents: [],
  dreamEvents: [],
  lastTurnOutcome: null,
  permissionDenials: [],
  lastNumTurns: null,
  lastDurationMs: null,
  lastResultUuid: null,
  fastModeState: null,
  activeWorktree: null,
  availableTools: [],
  availableSkills: [],
  activePlugins: [],
  mcpServers: [],
  activeModel: '',
  permissionMode: 'default',
  pendingPlanApproval: null,

  addMessage: (msg) => {
    if (msg.role === 'user') userMessageCount++
    set((s) => ({ messages: [...s.messages, msg] }))
  },

  updateHistoryAsk: (messageId, patch) => set((s) => ({
    messages: s.messages.map(message => {
      if (message.id !== messageId) return message
      const standard = message as StandardChatMessage
      if (!standard.historyAsk) return message
      return { ...standard, historyAsk: { ...standard.historyAsk, ...patch } }
    }),
  })),

  markAttachmentsNotSent: (msgId, reason) => set((s) => ({
    messages: s.messages.map(m => (
      m.id === msgId && m.role === 'user'
        ? { ...(m as StandardChatMessage), attachmentError: reason }
        : m
    )),
  })),

  noteMemoryReceipt: (msgId, receipt) => set((s) => {
    const index = s.messages.findIndex(m => m.id === msgId && m.role === 'user')
    // The row may have been dropped (conversation switched while assembly was
    // still running); there is nowhere to put the disclosure, and attributing
    // it to another row would be a lie.
    if (index < 0) return s
    const messages = s.messages.slice()
    messages[index] = { ...(messages[index] as StandardChatMessage), memoryReceipt: receipt }
    return { messages }
  }),

  clearMemoryReceipt: (msgId) => set((s) => {
    const index = s.messages.findIndex(m => m.id === msgId && m.role === 'user')
    if (index < 0) return s
    const current = s.messages[index] as StandardChatMessage
    if (!current.memoryReceipt) return s
    // A receipt says "the model was handed this block". A request that never
    // reached the engine makes that false, and absence is the only honest
    // description of what the model got — unknown, not "nothing".
    const next: StandardChatMessage = { ...current }
    delete next.memoryReceipt
    const messages = s.messages.slice()
    messages[index] = next
    return { messages }
  }),

  attachTurnToLastUserMessage: (turnId) => set((s) => {
    if (!turnId) return s
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const msg = s.messages[i]
      if (msg.role !== 'user') continue
      const std = msg as StandardChatMessage
      // Guidance entered a turn that was already running; its turn id is in
      // the receipt, not a branch point of its own.
      if (std.guidance) continue
      // Already attributed: the second phase of the same item echo is a no-op.
      if (std.turnId) return s
      const messages = s.messages.slice()
      messages[i] = { ...std, turnId }
      return { messages }
    }
    return s
  }),

  beginLiveTurn: (engine) => set({ liveTurn: { engine, turnId: null } }),

  setLiveTurnId: (turnId) => set((s) =>
    s.liveTurn ? { liveTurn: { ...s.liveTurn, turnId } } : s
  ),

  settleGuidance: (msgId, state, error) => set((s) => {
    let changed = false
    const messages = s.messages.map((m) => {
      if (m.role !== 'user' || m.id !== msgId) return m
      const std = m as StandardChatMessage
      if (!std.guidance) return m
      changed = true
      // `error` only describes a failure; a settled success must not keep it.
      return { ...std, guidance: { ...std.guidance, state, ...(state === 'failed' ? { error } : {}) } }
    })
    return changed ? { messages } : s
  }),

  settlePendingGuidance: (error) => set((s) => {
    let changed = false
    const messages = s.messages.map((m) => {
      const std = m as StandardChatMessage
      if (m.role !== 'user' || !std.guidance || std.guidance.state !== 'sending') return m
      changed = true
      return { ...std, guidance: { ...std.guidance, state: 'failed' as const, error } }
    })
    return changed ? { messages } : s
  }),

  isOwnedStreamEvent: (sessionId) => isTurnSession(sessionId),

  releaseOrphanStream: (bridgeId) => set((s) =>
    s.orphanedStream?.bridgeId === bridgeId ? { orphanedStream: null } : {}
  ),

  appendTextDelta: (sessionId, text) => {
    if (!isTurnSession(sessionId)) return
    streamingBuffer.contentChunks.push(text)
    streamingBuffer.sessionId = sessionId
    streamingBuffer.dirty = true
    scheduleFlush()
  },

  beginTurn: () => set((s) => ({
    streamPending: true,
    streamConversationId: s.viewSessionId,
    orphanedStream: null,
    // A new turn owns the tail; the previous turn's stopped marker retires.
    lastTurnOutcome: null,
  })),

  setStreamSession: (id) => set((s) => {
    if (!id) return { streamSessionId: null, streamPending: false }
    // A bridge announced after the user left its conversation must not claim
    // the new view — its deltas would land in the wrong transcript.
    const stillOnScreen =
      s.streamConversationId === null || s.streamConversationId === s.viewSessionId
    if (stillOnScreen) return { streamSessionId: id, streamPending: false }
    // Remember the bridge instead of discarding it: reopening the conversation
    // it belongs to reattaches the stream, so a slow send reply cannot cut that
    // turn off. An empty `streamConversationId` is the abandoned first-turn
    // marker written by clearMessages — that one has no view to return to.
    return {
      streamPending: false,
      orphanedStream: s.streamConversationId
        ? { bridgeId: id, conversationId: s.streamConversationId, visible: false }
        : s.orphanedStream,
    }
  }),

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
          // Destructured purely to drop the two internal chunk arrays.
          const { _contentChunks: _c, _thinkingChunks: _t, ...rest } = std
          return { ...rest, content: finalContent, thinking: finalThinking, isStreaming: false }
        }
        return m
      })
      // A finished (or aborted) turn owns no stream any more: releasing the
      // bridge here keeps `clearMessages` from orphaning completed streams and
      // makes the next send establish its own expectation.
      return {
        isStreaming: v,
        messages: msgs,
        // A finished turn has no id left to steer. Keeping it would let a
        // stale id survive into the next turn; `decideSend` also checks
        // `isStreaming`, but the store should not carry a lie.
        liveTurn: v ? s.liveTurn : null,
        ...(v ? {} : {
          streamSessionId: null,
          streamPending: false,
          orphanedStream: null,
        }),
      }
    })
  },

  setSessionId: (id) => {
    const personaId = get().sessionPersonaId
    const modelOverride = get().sessionModelOverride
    const effortOverride = get().sessionEffortOverride
    set((s) => ({
      currentSessionId: id,
      viewSessionId: id,
      // Opening the conversation an interrupted bridge belongs to reattaches it;
      // any other view keeps that bridge's deltas out.
      orphanedStream: s.orphanedStream
        ? { ...s.orphanedStream, visible: id !== null && id === s.orphanedStream.conversationId }
        : null,
    }))
    // A new conversation has no id when the persona is chosen; the first
    // cli:result assigns one. Write the session→persona mapping then, or a
    // reload would open the conversation without its expert. Only a defined
    // persona writes: openSessionCore clears it before this runs, so opening an
    // existing session can never erase the mapping it is about to restore.
    if (id && personaId) {
      try {
        localStorage.setItem(`aipa:session-persona:${id}`, personaId)
      } catch { /* localStorage unavailable — the live session still works */ }
    }
    // Same deferred-write story for an explicit model pick made before the
    // first turn had an id: persist it to the id that just arrived.
    if (id && modelOverride) {
      try {
        localStorage.setItem(sessionModelStorageKey(id), modelOverride)
      } catch { /* localStorage unavailable — the live session still works */ }
    }
    // Effort picked in a draft (no id yet) is recorded under the id the first
    // turn ends up with, so reopening the conversation keeps the choice. Only a
    // concrete level is written: 'auto' means "follow the default" and must stay
    // an absent record.
    if (id && effortOverride) {
      writeSessionEffortOverride(id, effortOverride)
    }
  },
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
    streamingBuffer.dirty = false
    userMessageCount = 0
    const s = get()
    // A turn that is still streaming keeps running in the main process after
    // the transcript is wiped. Remember which conversation it was answering in;
    // the next setSessionId() decides whether that view may reattach. A finished
    // bridge (isStreaming false) is not worth remembering.
    const orphan = s.isStreaming && s.streamSessionId && s.streamConversationId
      ? { bridgeId: s.streamSessionId, conversationId: s.streamConversationId, visible: false }
      : s.orphanedStream
        ? { ...s.orphanedStream, visible: false }
        : null
    set({
      messages: [],
      currentSessionId: null,
      viewSessionId: null,
      streamSessionId: null,
      // A first turn whose bridge id is still in flight has no session id to be
      // reopened with, so abandon it: `''` never matches a real conversation and
      // its late announcement cannot claim another view.
      streamConversationId: s.streamPending ? (s.streamConversationId ?? '') : s.streamConversationId,
      orphanedStream: orphan,
      currentSessionTitle: null,
      isStreaming: false,
      liveTurn: null,
      totalSessionCost: 0,
      lastCost: null,
      lastUsage: null,
      lastContextUsage: null,
      modelUsage: {},
      sessionPersonaId: undefined,
      sessionModelOverride: undefined,
      // The view's effort pick dies with the view. The persisted record stays
      // keyed by its session id: a deleted conversation that comes back from
      // Recently deleted is the same conversation and keeps it.
      sessionEffortOverride: undefined,
      // The wiped view's desk assertion dies with it. The next conversation
      // must be started from a department again to claim one.
      draftDepartmentId: undefined,
      isPlanMode: false,
      changedFiles: [],
      turnDiff: null,
      threadSettings: null,
      threadStatus: null,
      threadGoal: null,
      tempSystemPrompt: null,
      hookEvents: [],
      dreamEvents: [],
      lastTurnOutcome: null,
      permissionDenials: [],
      lastNumTurns: null,
      lastDurationMs: null,
      lastResultUuid: null,
      fastModeState: null,
    })
  },
  loadHistory: (messages) => {
    recountUserMessages(messages)
    set({ messages, isStreaming: false, lastTurnOutcome: null })
  },

  appendThinkingDelta: (sessionId, text) => {
    if (!isTurnSession(sessionId)) return
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
  setSessionTitleFor: (sessionId, title) => set((s) => {
    const viewing = s.viewSessionId === sessionId
    return {
      // The open header changes only when the open conversation is the one the
      // title belongs to.
      ...(viewing ? { currentSessionTitle: title } : {}),
      // Cached tabs carry their own title; rename the matching one even though
      // it is not on screen, so switching to it later shows the new name.
      tabs: s.tabs.map(tab => {
        if (tab.snapshot && tab.snapshot.sessionId === sessionId) {
          return { ...tab, title, snapshot: { ...tab.snapshot, sessionTitle: title } }
        }
        if (!tab.snapshot && (tab.sessionId === sessionId || (viewing && tab.id === s.activeTabId))) {
          return { ...tab, title }
        }
        return tab
      }),
    }
  }),
  markSessionTitleManual: (sessionId) => {
    if (!sessionId) return
    manuallyTitledSessions.add(sessionId)
    try {
      localStorage.setItem(MANUAL_TITLE_KEY_PREFIX + sessionId, '1')
    } catch { /* localStorage unavailable — the in-memory marker still holds for this run */ }
  },
  isSessionTitleManual: (sessionId) => {
    if (!sessionId) return false
    if (manuallyTitledSessions.has(sessionId)) return true
    try {
      if (localStorage.getItem(MANUAL_TITLE_KEY_PREFIX + sessionId) === '1') {
        manuallyTitledSessions.add(sessionId)
        return true
      }
    } catch { /* localStorage unavailable — fall through to "not manual" */ }
    return false
  },

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

  settleServerRequest: (requestId, outcome) => {
    if (!requestId) return
    set((s) => {
      let changed = false
      const messages = s.messages.map((m) => {
        if (m.role === 'permission') {
          const permission = m as PermissionMessage
          if (permission.permissionId === requestId && permission.decision === 'pending') {
            changed = true
            return { ...permission, decision: outcome }
          }
        } else if (m.role === 'elicitation') {
          const elicitation = m as ElicitationMessage
          if (elicitation.requestId === requestId && elicitation.decision === 'pending') {
            changed = true
            return { ...elicitation, decision: outcome }
          }
        }
        return m
      })
      return changed ? { messages } : s
    })
  },

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

  // Restores only the ids handed in: a message that arrived while the find
  // bar was expanding the transcript was never collapsed by it, so it keeps
  // whatever state it has.
  collapseMessages: (msgIds) => {
    const targets = new Set(msgIds)
    if (targets.size === 0) return
    set((s) => ({
      messages: s.messages.map(m => targets.has(m.id) && (m as StandardChatMessage).collapsed !== true
        ? { ...m, collapsed: true } as StandardChatMessage
        : m)
    }))
  },

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

  reorderQueue: (fromIndex, toIndex) => set((s) => {
    const queue = [...s.taskQueue]
    // Only allow reordering pending items (not running or done)
    const item = queue[fromIndex]
    if (!item || item.status !== 'pending') return s
    queue.splice(fromIndex, 1)
    queue.splice(toIndex, 0, item)
    return { taskQueue: queue }
  }),

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
    const next = msgs.slice(0, lastUserIdx)
    recountUserMessages(next)
    set({ messages: next })
    return lastUserContent || null
  },

  // `newContent` is unused on purpose: the caller re-sends it through
  // sendMessage(), which appends the fresh user turn. Truncating here and
  // re-adding would double up the message.
  editMessageAndTruncate: (msgId, _newContent) => {
    const state = get()
    const msgs = state.messages
    const idx = msgs.findIndex(m => m.id === msgId)
    if (idx < 0) return
    // Remove the edited message and everything after it; sendMessage will re-add the user message
    const next = msgs.slice(0, idx)
    recountUserMessages(next)
    set({ messages: next })
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
  setMessages: (messages) => {
    recountUserMessages(messages)
    set({ messages })
  },
  setCompacting: (v) => set({ isCompacting: v }),
  incrementCompactionCount: () => set((s) => ({ compactionCount: s.compactionCount + 1 })),
  setContextBeforeCompact: (usage) => set({ contextBeforeCompact: usage }),

  rewindToMessage: (messageId) => {
    const state = get()
    const idx = state.messages.findIndex(m => m.id === messageId)
    if (idx < 0) return 0
    const removed = state.messages.length - idx - 1
    const next = state.messages.slice(0, idx + 1)
    recountUserMessages(next)
    set({ messages: next })
    return removed
  },

  setDraftDepartmentId: (deptId) => set({ draftDepartmentId: deptId }),

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

  setSessionEffortOverride: (level) => {
    // `'auto'` and `undefined` mean the same thing here: follow the global
    // default. Storing 'auto' would look like an override that pins nothing.
    const next = level === 'auto' ? undefined : level
    set({ sessionEffortOverride: next })
    // A draft has no id yet; `setSessionId` writes the pending pick once the
    // first turn assigns one (same mechanism as the persona and model records).
    const sessionId = get().currentSessionId
    if (sessionId) writeSessionEffortOverride(sessionId, next)
  },

  setSessionModelOverride: (modelId) => {
    set({ sessionModelOverride: modelId })
    // A new conversation has no id yet; `setSessionId` writes the pending pick
    // once the first turn assigns one (same mechanism as the persona binding).
    const sessionId = get().currentSessionId
    if (sessionId) {
      try {
        if (modelId) {
          localStorage.setItem(sessionModelStorageKey(sessionId), modelId)
        } else {
          localStorage.removeItem(sessionModelStorageKey(sessionId))
        }
      } catch { /* ignore localStorage errors */ }
    }
  },

  // Plan Mode toggle (Iteration 520)
  setPlanMode: (v) => set({ isPlanMode: v }),

  // Changed files tracking (Iteration 521)
  addChangedFile: (filePath, toolName) => set((s) => {
    // O(1) turn index — the user-message count is maintained by addMessage /
    // loadHistory / clearMessages instead of re-scanning the whole list.
    const turnIndex = userMessageCount
    return {
      changedFiles: [
        ...s.changedFiles,
        { filePath, turnIndex, toolName, timestamp: Date.now() },
      ].slice(-500),
    }
  }),
  clearChangedFiles: () => set({ changedFiles: [] }),
  setTurnDiff: (turnDiff) => set({ turnDiff }),
  clearTurnDiff: () => set({ turnDiff: null }),
  // The diff arrives incrementally while the turn is still writing files, so
  // its receipt time cannot answer "did the disk change after this turn?" —
  // it is only the moment one snapshot was taken. Re-stamping at turn end is
  // what makes the drift claim mean what the card says.
  markTurnDiffCaptured: (capturedAt) => set((s) => (
    s.turnDiff ? { turnDiff: { ...s.turnDiff, capturedAt } } : {}
  )),
  setThreadSettings: (threadSettings) => set({ threadSettings }),
  clearThreadSettings: () => set({ threadSettings: null }),
  setThreadStatus: (threadStatus) => set({ threadStatus }),
  setThreadGoal: (threadGoal) => set({ threadGoal }),
  clearThreadGoal: () => set({ threadGoal: null }),

  // Temp system prompt override (Iteration 523)
  setTempSystemPrompt: (prompt) => set({ tempSystemPrompt: prompt }),

  // Hook events (Iteration 525)
  addHookEvent: (event) => set((s) => ({ hookEvents: [...s.hookEvents, event].slice(-50) })),
  updateHookEvent: (id, update) => set((s) => ({
    hookEvents: s.hookEvents.map(e => e.id === id ? { ...e, ...update } : e),
  })),
  clearHookEvents: () => set({ hookEvents: [] }),

  // Plan approval request (multi-agent)
  setPendingPlanApproval: (req) => set({ pendingPlanApproval: req }),

  // DreamTask events (memory consolidation detection)
  addDreamEvent: (event) => set((s) => ({ dreamEvents: [...s.dreamEvents.slice(-9), event] })),
  clearDreamEvents: () => set({ dreamEvents: [] }),

  // Quiet marker for a stopped/unknown turn at the transcript tail.
  setLastTurnOutcome: (lastTurnOutcome) => set({ lastTurnOutcome }),

  // Result stats setters (P0-5)
  setResultStats: (denials, numTurns, durationMs) => set({ permissionDenials: denials, lastNumTurns: numTurns, lastDurationMs: durationMs }),
  setLastResultUuid: (uuid) => set({ lastResultUuid: uuid }),
  setFastModeState: (state) => set({ fastModeState: state }),
  clearResultStats: () => set({ permissionDenials: [], lastNumTurns: null, lastDurationMs: null, lastResultUuid: null, fastModeState: null }),

  // Active worktree setter (P4-6)
  setActiveWorktree: (wt) => set({ activeWorktree: wt }),

  // system.init handler
  setSystemInit: (data) => set({
    availableTools: data.tools,
    availableSkills: data.skills ?? [],
    activePlugins: data.plugins ?? [],
    mcpServers: data.mcpServers ?? [],
    activeModel: data.model,
    permissionMode: data.permissionMode,
  }),

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
        sessionModelOverride: undefined,
        sessionEffortOverride: undefined,
        // An opened conversation has a row, so membership comes from the org
        // tree; it must not inherit a draft desk left in this tab.
        draftDepartmentId: undefined,
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
      set({
        tabs: [initialTab, newTab],
        activeTabId: initialTabId,  // will be switched immediately below
      })
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

    const isActive = state.activeTabId === tabId
    // The tab is gone for good — drop its cached scroll offset.
    tabScrollTopCache.delete(tabId)

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
      streamingBuffer.dirty = false
      userMessageCount = 0
      set({
        tabs: [],
        activeTabId: null,
        messages: [],
        currentSessionId: null,
        viewSessionId: null,
        currentSessionTitle: null,
        isStreaming: false,
        totalSessionCost: 0,
        lastCost: null,
        lastUsage: null,
        lastContextUsage: null,
        modelUsage: {},
        sessionPersonaId: undefined,
        sessionModelOverride: undefined,
        sessionEffortOverride: undefined,
        draftDepartmentId: undefined,
        isPlanMode: false,
        turnDiff: null,
        threadSettings: null,
        threadStatus: null,
        threadGoal: null,
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
          recountUserMessages(sole.snapshot.messages)
          set({
            tabs: [{ ...sole, snapshot: null }],
            activeTabId: sole.id,
            messages: sole.snapshot.messages,
            currentSessionId: sole.snapshot.sessionId,
            viewSessionId: sole.snapshot.sessionId,
            currentSessionTitle: sole.snapshot.sessionTitle,
            totalSessionCost: sole.snapshot.totalSessionCost,
            lastCost: sole.snapshot.lastCost,
            lastUsage: sole.snapshot.lastUsage,
            lastContextUsage: sole.snapshot.lastContextUsage,
            modelUsage: sole.snapshot.modelUsage,
            sessionPersonaId: sole.snapshot.sessionPersonaId,
            sessionModelOverride: sole.snapshot.sessionModelOverride,
            sessionEffortOverride: sole.snapshot.sessionEffortOverride,
            draftDepartmentId: sole.snapshot.draftDepartmentId,
            // A turn diff belongs to the conversation that produced it; the
            // snapshot does not carry one, so the reopened tab starts clean.
            turnDiff: null,
            threadSettings: null,
            threadStatus: null,
            threadGoal: null,
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
        recountUserMessages(newActive.snapshot.messages)
        set({
          tabs: remainingTabs.map(t =>
            t.id === newActive.id ? { ...t, snapshot: null } : t
          ),
          activeTabId: newActive.id,
          messages: newActive.snapshot.messages,
          currentSessionId: newActive.snapshot.sessionId,
          viewSessionId: newActive.snapshot.sessionId,
          currentSessionTitle: newActive.snapshot.sessionTitle,
          totalSessionCost: newActive.snapshot.totalSessionCost,
          lastCost: newActive.snapshot.lastCost,
          lastUsage: newActive.snapshot.lastUsage,
          lastContextUsage: newActive.snapshot.lastContextUsage,
          modelUsage: newActive.snapshot.modelUsage,
          sessionPersonaId: newActive.snapshot.sessionPersonaId,
          sessionModelOverride: newActive.snapshot.sessionModelOverride,
          sessionEffortOverride: newActive.snapshot.sessionEffortOverride,
          draftDepartmentId: newActive.snapshot.draftDepartmentId,
          turnDiff: null,
          threadSettings: null,
          threadStatus: null,
          threadGoal: null,
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
            sessionModelOverride: state.sessionModelOverride,
            sessionEffortOverride: state.sessionEffortOverride,
            draftDepartmentId: state.draftDepartmentId,
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
      recountUserMessages(targetTab.snapshot.messages)
      set({
        tabs: updatedTabs,
        activeTabId: tabId,
        messages: targetTab.snapshot.messages,
        currentSessionId: targetTab.snapshot.sessionId,
        viewSessionId: targetTab.snapshot.sessionId,
        currentSessionTitle: targetTab.snapshot.sessionTitle,
        totalSessionCost: targetTab.snapshot.totalSessionCost,
        lastCost: targetTab.snapshot.lastCost,
        lastUsage: targetTab.snapshot.lastUsage,
        lastContextUsage: targetTab.snapshot.lastContextUsage,
        modelUsage: targetTab.snapshot.modelUsage,
        sessionPersonaId: targetTab.snapshot.sessionPersonaId,
        sessionModelOverride: targetTab.snapshot.sessionModelOverride,
        sessionEffortOverride: targetTab.snapshot.sessionEffortOverride,
        draftDepartmentId: targetTab.snapshot.draftDepartmentId,
        turnDiff: null,
        threadSettings: null,
        threadStatus: null,
        threadGoal: null,
        isStreaming: false,
        // The turn belongs to the view that was just left; this transcript is
        // not the one the engine is talking into.
        liveTurn: null,
      })
    } else {
      // Tab has no snapshot (already live) — just update tabs & activeTabId.
      // The status chip describes the thread that was on screen; a switch
      // retires it even on this fallback path.
      set({ tabs: updatedTabs, activeTabId: tabId, threadStatus: null, threadGoal: null })
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

  clearTabScrollTop: (tabId) => {
    // Without this the cache grows for every tab ever opened — it is keyed by
    // a fresh `tab-${Date.now()}` id each time, so entries never get reused.
    tabScrollTopCache.delete(tabId)
  },
}))

// Wire up the forward reference
useChatStoreRef = useChatStore
