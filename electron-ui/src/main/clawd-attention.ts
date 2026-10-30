/**
 * clawd-attention.ts — the single path from main-process events to a surface
 * that can reach the user.
 *
 * Six things can need the user while AIPA is in the background:
 *   - an approval is waiting          (Codex approval / Claude permission / plan)
 *   - an answer is needed             (Claude MCP elicitation)
 *   - a task failed                   (failed turn, bridge crash, API error,
 *                                      failed automation run)
 *   - scheduled work is being held    (a department's daily spending cap)
 *   - a plugin job finished           (plugin AI generate / plugin edit)
 *   - an automation run finished      (a hidden scheduled run)
 *   - tasks fell due                  (one aggregated card a civilised morning)
 *
 * All of them raise one record shape and share one queue, so there is exactly
 * one bubble on screen and exactly one delivery decision. Sources never talk to
 * a surface directly — they call `raiseAttention`.
 *
 * Delivery rule (one decision for every kind):
 *   - window visible and focused: nothing is shown now; approvals/questions
 *     stay queued for the next time the user looks away. The user is already
 *     looking at the in-app state.
 *   - DND / quiet hours: nothing, on either surface.
 *   - pet running and allowed (not hidden, bubbles not hidden, pet alerts on):
 *     the pet bubble is the announcement.
 *   - otherwise, with no application window focused: a native OS notification.
 *   - otherwise (window focused): nothing.
 * The native fallback exists because the pet may never have been launched, may
 * have been closed, or may have bubbles hidden — exactly when a background
 * approval or failure most needs to reach the user.
 *
 * Quiet rule: the pet only calls when the app is not in front of the user.
 * DND / quiet hours apply to *both* surfaces: no native notification is shown
 * while the pet's quiet mode is on. A native notification is never shown when
 * the main window is visible and focused.
 *
 * Dedupe rule: the queue is keyed by `kind + session` (or bridge, or plugin).
 * A repeated failure in the same session refreshes one bubble instead of
 * stacking; approvals/questions collapse into a count and are resolved one
 * request id at a time; plugin completions coalesce into one summary
 * ("3 plugin jobs finished") whose click opens a chooser, never an arbitrary
 * job. Rendering is debounced so a burst becomes one bubble. Native notices
 * are deduped by request id (approvals/questions) and by queue item (the other
 * kinds), so a repeated raise never produces a second OS notification.
 *
 * Retraction rule: when the server resolves or times out a request, its native
 * notification is closed and a later click is ignored. A notification whose
 * request was already answered must never open a conversation as if it still
 * needed an answer.
 */

import { BrowserWindow, Menu, Notification, app } from 'electron'
import { getPref, getRawPref } from './config/config-manager'
import { recordClawdNotice } from './clawd-notifications'
import { createLogger } from './utils/logger'
// Type-only: `due-reminder` calls `raiseAttention`, and this module must not
// close that runtime cycle just to name the aggregate shape.
import type { DueAggregate } from './tasks/due-reminder'
import type { ReviewAggregate } from './tasks/weekly-review'
import type { DayWrapAggregate } from './tasks/day-wrap'
import {
  getClawdLanguage,
  hideClawdAttentionBubble,
  isClawdAttentionAvailable,
  isClawdBubblesHidden,
  isClawdDoNotDisturb,
  isClawdPetHidden,
  isClawdQuietActive,
  setClawdAttentionActivateHandler,
  showClawdAttentionBubble,
  type ClawdBubbleKind,
  type ClawdBubbleMetaRow,
  type ClawdAttentionBubblePayload,
} from './clawd-integration'

const log = createLogger('clawd-attention')

// The pet's own string table. It is keyed by the pet language ("en" | "zh" |
// "ko"): the bubble is rendered inside the pet window, so it must speak the
// pet's language, not the app's.
const { createTranslator } = require('./clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}

export type AttentionKind =
  | 'approval'
  | 'clarification'
  | 'failed'
  | 'limit-hold'
  | 'plugin-done'
  | 'automation-done'
  | 'task-due'
  | 'task-review'
  | 'day-wrap'

export interface AttentionInput {
  kind: AttentionKind
  /** Openable AIPA session id (Codex thread id / Claude session id), if known. */
  sessionId?: string | null
  /** Bridge that produced the event. Used to resolve an item before its openable id is known. */
  bridgeId?: string | null
  /** Permission / elicitation request id — one answer clears one pending request. */
  requestId?: string | null
  /** Tool, plugin, automation or job name, shown inside the bubble body. */
  detail?: string | null
  /** Plugin that owns the job (plugin-done / plugin failure). */
  pluginId?: string | null
  /**
   * The aggregate for a `task-due` card. The reminder raises one card for every
   * newly due task, so the bubble needs counts plus the first few titles (the
   * rows it can name). Ignored by every other kind.
   */
  due?: DueAggregate
  /**
   * The aggregate for a `task-review` card: the week's finished tasks and the
   * desk as it stands at the moment of the card. Ignored by every other kind.
   */
  review?: ReviewAggregate
  /**
   * The aggregate for a `day-wrap` card: what was finished today and the desk
   * as it stands this evening. Ignored by every other kind.
   */
  wrap?: DayWrapAggregate | null
}

interface PluginJob {
  pluginId: string
  detail: string | null
}

interface AttentionItem {
  key: string
  kind: AttentionKind
  sessionId: string | null
  bridgeId: string | null
  pluginId: string | null
  detail: string | null
  /** Counts for a `task-due` card; null for every other kind. */
  due: DueAggregate | null
  /** Counts for a `task-review` card; null for every other kind. */
  review: ReviewAggregate | null
  /** Today's counts for a `day-wrap` card; null for every other kind. */
  wrap: DayWrapAggregate | null
  /** Finished plugin jobs collapsed into this bubble; >1 means the click chooses. */
  plugins: PluginJob[]
  createdAt: number
  /** How many items collapsed into this record (approvals, plugin completions). */
  count: number
  /** Outstanding request ids for approvals/questions; one is removed per answer. */
  requestIds: Set<string>
  /** Last time this item was actually on screen (0 = never). */
  lastShownAt: number
  /**
   * Whether this item has already been written to the announcement history.
   * The card is re-rendered whenever the queue changes (a "1/2" badge), and
   * recording on every render turned one notice into several history rows.
   */
  recorded: boolean
  /**
   * A native notification already owns this item while the pet cannot speak.
   * `pickNext` must skip it, or a pet window that starts later (or becomes
   * visible after a blur) would announce the same event a second time.
   */
  nativePending: boolean
}

/**
 * A native OS notification raised for an item that the pet could not announce.
 * It keeps the item (not a copy) so a click sees the session id learned after
 * the approval arrived, and `requestId` so resolution can close exactly the
 * notification for the request that was answered.
 */
interface NativeNotice {
  notification: Notification
  item: AttentionItem
  kind: AttentionKind
  bridgeId: string | null
  sessionId: string | null
  requestId: string | null
  active: boolean
}

const KIND_PRIORITY: Record<AttentionKind, number> = {
  approval: 0,
  clarification: 1,
  failed: 2,
  // A held department sits just below a failure: it is not something that
  // broke, but it is a rail the user set that is silently stopping work.
  'limit-hold': 3,
  'plugin-done': 4,
  'automation-done': 5,
  // A reminder, not a failure: it waits behind anything that already needs an
  // answer, but a morning should not lose it to a stale plugin toast.
  'task-due': 6,
  // The week behind the user, not the day in front of them: it waits for the
  // due card, but a Monday morning should still say it.
  'task-review': 7,
  // The day just ending, not the week behind it: it waits for the review but
  // still speaks on a Tuesday evening.
  'day-wrap': 8,
}

/** A burst of events becomes one bubble: wait for the quiet gap first. */
const RENDER_DEBOUNCE_MS = 250
/** After a failed show, wait for a real change instead of retrying in a loop. */
const SHOW_RETRY_MS = 15_000
/** A failure older than this is no longer worth a bubble when the user returns. */
const TRANSIENT_TTL_MS = 2 * 60 * 1000
const PLUGIN_DONE_KEY = 'plugin-done:batch'
/**
 * One card, not a flood: every due task the same morning belongs to this one
 * queue item, so a second raise updates its counts instead of stacking.
 */
const TASK_DUE_KEY = 'task-due:agenda'
/**
 * One review card per week, so a re-check after a suppressed raise updates the
 * same queue item instead of stacking a second summary.
 */
const TASK_REVIEW_KEY = 'task-review:week'
/**
 * One evening card per day, so a re-check after a suppressed raise updates the
 * same queue item instead of stacking a second summary.
 */
const DAY_WRAP_KEY = 'day-wrap:today'
/** How long after a failed turn its own completion notification stays suppressed. */
const FAILURE_SUPPRESSION_MS = 5000

const items = new Map<string, AttentionItem>()
/** Native notices that are still on screen, keyed by request id or item key. */
const nativeNotices = new Map<string, NativeNotice>()

let current: AttentionItem | null = null
let currentSignature = ''
/** Incremented on every show/retract so a stale promise resolution is ignored. */
let showSeq = 0
let renderTimer: NodeJS.Timeout | null = null
let lastShowFailureAt = 0
/**
 * When a failed turn last raised attention, keyed by the id that failed:
 * session id when known, bridge id before it is (see `bindAttentionSession`),
 * and `plugin:<id>` for plugin jobs that have no session at all.
 *
 * One global timestamp used to drop *any* completion notification that arrived
 * within 5 s of *any* failure, so conversation A failing silenced conversation
 * B's completion. Suppression is now per subject and only applies to the
 * notification about that subject.
 */
const recentFailureAt = new Map<string, number>()
/**
 * Failures whose native fallback actually spoke. The renderer sends a generic
 * completion notice from the same failed result; that notice is a duplicate of
 * the native attention notification and must be suppressed even when the pet
 * is not available to take the event itself.
 */
const recentNativeFailureAt = new Map<string, number>()
let initialized = false
let getWindow: () => BrowserWindow | null = () => null

/** The pet's UI language, refreshed per render so a whole bubble uses one language. */
let lang = 'en'
const t = createTranslator(() => lang)

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

function isAttentionEnabled(): boolean {
  // Default on: the preference only exists to switch the feature off.
  return getPref('petAttentionAlerts') !== false
}

function attentionKey(input: AttentionInput): string {
  const owner = input.sessionId || input.bridgeId || input.pluginId || 'unknown'
  return `${input.kind}:${owner}`
}

// ── Public API ──────────────────────────────────────

/**
 * Initialize once, after the main window exists. The getter (not the window)
 * is stored because the app can recreate its window without restarting.
 */
export function initClawdAttention(windowGetter: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true
  getWindow = windowGetter
  setClawdAttentionActivateHandler(activateCurrent)

  // Focus changes are the quiet rule's only input besides the raise itself.
  // Both directions matter: blur surfaces what was queued while looking,
  // focus retracts a bubble the user is now seeing in-app anyway.
  const onFocusChange = (_event: unknown, win: BrowserWindow): void => {
    if (win === getWindow()) scheduleRender()
  }
  app.on('browser-window-focus', onFocusChange)
  app.on('browser-window-blur', onFocusChange)
}

export function shutdownClawdAttention(): void {
  if (!initialized) return
  initialized = false
  setClawdAttentionActivateHandler(null)
  if (renderTimer) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  for (const key of [...nativeNotices.keys()]) closeNativeNotice(key)
  items.clear()
  recentFailureAt.clear()
  recentNativeFailureAt.clear()
  retract()
  current = null
  currentSignature = ''
}

/**
 * Remember which subject just failed, so only *its* completion notification
 * is swallowed. Also prunes entries older than the suppression window.
 */
function noteFailureAttention(input: AttentionInput): void {
  const now = Date.now()
  for (const [key, at] of recentFailureAt) {
    if (now - at > FAILURE_SUPPRESSION_MS) recentFailureAt.delete(key)
  }
  for (const [key, at] of recentNativeFailureAt) {
    if (now - at > FAILURE_SUPPRESSION_MS) recentNativeFailureAt.delete(key)
  }
  if (input.sessionId) recentFailureAt.set(input.sessionId, now)
  if (input.bridgeId) recentFailureAt.set(input.bridgeId, now)
  if (!input.sessionId && !input.bridgeId && input.pluginId) {
    recentFailureAt.set(`plugin:${input.pluginId}`, now)
  }
}

/**
 * Record something that needs the user. Cheap and safe to call from any event
 * handler; rendering is always asynchronous.
 *
 * The return value is true when this raise is owned by a surface: the pet will
 * take it now, or a native notification (new or already pending) is the
 * announcement. It is not a promise that the debounced bubble has already
 * appeared. The automation scheduler no longer owns a fallback of its own;
 * every surface decision is made here.
 */
export function raiseAttention(input: AttentionInput): boolean {
  if (!initialized) return false
  // No early `isAttentionEnabled()` return: that preference governs the pet
  // bubble only. A native notice can still be the right surface when it is off
  // (see `announceAttention`).
  if (!input || !input.kind) return false

  const now = Date.now()
  // The renderer's completion notification is sent from the same result event
  // that raised this failure; window-handlers uses this to let the chosen
  // surface be the one and only notification for that particular turn.
  if (input.kind === 'failed') noteFailureAttention(input)

  if (input.kind === 'plugin-done') {
    const pluginId = input.pluginId || 'unknown'
    const item = items.get(PLUGIN_DONE_KEY) || {
      key: PLUGIN_DONE_KEY,
      kind: 'plugin-done' as AttentionKind,
      sessionId: null,
      bridgeId: null,
      pluginId: null,
      detail: null,
      due: null,
      review: null,
      wrap: null,
      plugins: [],
      createdAt: now,
      count: 0,
      requestIds: new Set<string>(),
      lastShownAt: 0,
      recorded: false,
      nativePending: false,
    }
    // Keep every finished job, not just the last one: the bubble has to be
    // able to name the batch and offer a real choice on click.
    const job: PluginJob = { pluginId, detail: input.detail || null }
    const duplicate = item.plugins.findIndex(j => j.pluginId === pluginId)
    if (duplicate === -1) item.plugins.push(job)
    else item.plugins[duplicate] = job
    item.count = item.plugins.length
    // A single job can be named and opened directly; a batch is summarised by
    // count and must not pretend to be the last job that happened to arrive.
    item.pluginId = item.plugins.length === 1 ? pluginId : null
    item.detail = item.plugins.length === 1 ? job.detail : null
    item.createdAt = now
    items.set(PLUGIN_DONE_KEY, item)
    scheduleRender()
    return announceAttention(item, null)
  }

  const key = input.kind === 'task-due'
    ? TASK_DUE_KEY
    : input.kind === 'task-review' ? TASK_REVIEW_KEY
    : input.kind === 'day-wrap' ? DAY_WRAP_KEY : attentionKey(input)
  const existing = items.get(key)
  if (existing) {
    if (input.requestId) existing.requestIds.add(input.requestId)
    // Approvals/questions collapse to a count; failures and their repeats are
    // a single "this session is failing" fact.
    existing.count = Math.max(1, existing.requestIds.size, existing.count)
    // A second due task found while the morning card is still queued updates
    // that card's counts; it never becomes a second bubble.
    if (input.kind === 'task-due' && input.due) {
      existing.due = input.due
      existing.count = Math.max(1, input.due.total)
    }
    if (input.kind === 'task-review' && input.review) existing.review = input.review
    // A second wrap while the evening card is still queued refreshes the same
    // queue item's counts; it never becomes a second bubble.
    if (input.kind === 'day-wrap' && input.wrap) {
      existing.wrap = input.wrap
      existing.count = Math.max(1, input.wrap.finishedTasks)
    }
    if (input.detail) existing.detail = input.detail
    existing.createdAt = now
    if (input.sessionId) existing.sessionId = input.sessionId
    if (input.bridgeId) existing.bridgeId = input.bridgeId
    if (input.pluginId) existing.pluginId = input.pluginId
    scheduleRender()
    return announceAttention(existing, input.requestId || null)
  }

  const requestIds = new Set<string>()
  if (input.requestId) requestIds.add(input.requestId)
  const item: AttentionItem = {
    key,
    kind: input.kind,
    sessionId: input.sessionId || null,
    bridgeId: input.bridgeId || null,
    pluginId: input.pluginId || null,
    detail: input.detail || null,
    due: input.kind === 'task-due' ? (input.due ?? null) : null,
    review: input.kind === 'task-review' ? (input.review ?? null) : null,
    wrap: input.kind === 'day-wrap' ? (input.wrap ?? null) : null,
    plugins: [],
    createdAt: now,
    count: input.kind === 'task-due' && input.due
      ? Math.max(1, input.due.total)
      : input.kind === 'day-wrap' && input.wrap
        ? Math.max(1, input.wrap.finishedTasks)
        : Math.max(1, requestIds.size),
    requestIds,
    lastShownAt: 0,
    recorded: false,
    nativePending: false,
  }
  items.set(key, item)
  scheduleRender()
  return announceAttention(item, input.requestId || null)
}

/**
 * Forget everything raised for a bridge. Used when the user aborts or ends a
 * session: a pending approval for a turn that no longer exists is noise.
 */
export function clearAttentionForBridge(bridgeId: string): void {
  if (!initialized || !bridgeId) return
  for (const [key, notice] of [...nativeNotices]) {
    if (notice.bridgeId === bridgeId || notice.item.bridgeId === bridgeId) closeNativeNotice(key)
  }
  let changed = false
  for (const [key, item] of items) {
    if (item.bridgeId !== bridgeId) continue
    items.delete(key)
    if (current === item) {
      retract()
      current = null
      currentSignature = ''
    }
    changed = true
  }
  if (changed) scheduleRender()
}

/**
 * Learn the openable session id for a bridge (Codex `threadStarted` /
 * `result`, or a Claude resume id). Approval events can arrive before the
 * thread id is known; re-keying afterwards keeps one bubble per session.
 */
export function bindAttentionSession(bridgeId: string, sessionId: string): void {
  if (!initialized || !bridgeId || !sessionId) return
  // A failure may have been recorded under the bridge id before the session id
  // was known. Copy the timestamp so the notification about this session is
  // still recognised as the one the pet already covered.
  const failureAt = recentFailureAt.get(bridgeId)
  if (failureAt) recentFailureAt.set(sessionId, failureAt)
  const nativeFailureAt = recentNativeFailureAt.get(bridgeId)
  if (nativeFailureAt) recentNativeFailureAt.set(sessionId, nativeFailureAt)
  let changed = false
  for (const [key, item] of items) {
    if (item.bridgeId !== bridgeId || item.sessionId === sessionId) continue
    item.sessionId = sessionId
    // The displayed item keeps its key: its pending bubble promise closes over
    // this object, and re-keying it would make the click resolution miss.
    if (item === current) continue
    const nextKey = `${item.kind}:${sessionId}`
    if (nextKey === key) continue
    items.delete(key)
    const merged = items.get(nextKey)
    if (merged) {
      // Another bridge already reported this session+kind: fold into it so
      // one session still owns one bubble.
      merged.count = Math.max(merged.count, item.count)
      if (item.detail) merged.detail = item.detail
      merged.createdAt = Math.min(merged.createdAt, item.createdAt)
      merged.nativePending = merged.nativePending || item.nativePending
      // A native notice must point at the surviving record, or a click would
      // route from a deleted item and resolution would not clear its flag.
      for (const notice of nativeNotices.values()) {
        if (notice.item === item) notice.item = merged
      }
    } else {
      item.key = nextKey
      items.set(nextKey, item)
    }
    changed = true
  }
  if (changed) scheduleRender()
}

/**
 * One outstanding request was answered. Removes just that request id, so five
 * queued approvals become four rather than vanishing.
 */
export function resolveAttention(input: {
  kind: AttentionKind
  sessionId?: string | null
  bridgeId?: string | null
  requestId?: string | null
}): void {
  if (!initialized) return

  // Close the OS notification for this request before touching the queue. If
  // the server resolved or the request timed out, a click must not later open
  // a conversation that no longer needs an answer.
  for (const [key, notice] of [...nativeNotices]) {
    if (notice.kind !== input.kind) continue
    if (input.requestId && notice.requestId !== input.requestId) continue
    if (nativeNoticeMatchesSubject(notice, input)) closeNativeNotice(key)
  }

  let changed = false
  for (const [key, item] of items) {
    if (item.kind !== input.kind) continue
    const matches = (!!input.bridgeId && item.bridgeId === input.bridgeId) ||
      (!!input.sessionId && (item.sessionId === input.sessionId || item.bridgeId === input.sessionId))
    if (!matches) continue

    if (input.requestId && item.requestIds.size > 0) {
      if (!item.requestIds.delete(input.requestId)) continue
      item.count = item.requestIds.size
      changed = true
      if (item.requestIds.size > 0) continue
    }

    items.delete(key)
    if (current === item) {
      retract()
      current = null
      currentSignature = ''
    }
    changed = true
  }
  if (changed) scheduleRender()
}

/**
 * The renderer sends a generic "AIPA" completion notification from the same
 * `cli:result` that just failed. It is a duplicate when the attention path
 * already spoke for this exact failed turn.
 *
 * Suppression is keyed by session because one conversation failing must not
 * mute another conversation's completion. A notification with no session
 * cannot be attributed, so it is left alone. DND applies to native
 * notifications too, so this is also true while the pet is in quiet mode even
 * for a completion that did not raise attention.
 */
export function shouldSuppressNativeNotification(sessionId?: string | null): boolean {
  if (!initialized) return false
  // Quiet hours / DND: the pet's quiet mode silences the native surface as
  // well. This is checked before `sessionId` so an unattributed completion
  // cannot bypass DND.
  if (isDndEnabled()) return true
  if (!sessionId) return false

  const now = Date.now()
  const nativeAt = recentNativeFailureAt.get(sessionId)
  if (nativeAt && now - nativeAt <= FAILURE_SUPPRESSION_MS) return true

  const at = recentFailureAt.get(sessionId)
  if (!at) return false
  if (now - at > FAILURE_SUPPRESSION_MS) return false
  return canSummon()
}

/** Re-evaluate the queue, e.g. after the preference was toggled. */
export function refreshAttention(): void {
  if (!initialized) return
  if (!isAttentionEnabled()) {
    // Turning the pet off clears its queue but leaves a native notice that is
    // already on screen alone: it belongs to the OS surface, not the pet.
    items.clear()
    retract()
    current = null
    currentSignature = ''
    return
  }
  scheduleRender()
}

// ── Rendering ──────────────────────────────────────

function scheduleRender(): void {
  if (!initialized) return
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderTimer = null
    render()
  }, RENDER_DEBOUNCE_MS)
  renderTimer.unref?.()
}

/** The user has the app in front of them: in-app state is enough. */
function isUserLooking(): boolean {
  const win = getWindow()
  return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused()
}

/**
 * The pet's DND / quiet mode. Both surfaces honour it: a native notification
 * must not defeat the user's explicit "do not disturb". `isClawdDoNotDisturb`
 * is safe when the pet was never initialized (it returns false).
 */
function isDndEnabled(): boolean {
  try {
    // Sleep (the pet's DND) and a timed "silence" are the same promise to the
    // user: do not call me. Both silence the native fallback too.
    return isClawdDoNotDisturb() || isClawdQuietActive()
  } catch {
    // A broken pet must not turn DND into a notification storm.
    return true
  }
}

/**
 * The single delivery decision. Returns true when this raise is owned by a
 * surface; the caller must not announce it again.
 *
 * Order matters:
 *   1. The window is visible and focused → in-app UI is the delivery; nothing
 *      on screen or in the OS.
 *   2. DND → nothing. This applies to native just as much as to the pet.
 *   3. Pet running and allowed → pet bubble.
 *   4. No window focused → native OS notification.
 *   5. Otherwise → nothing (the user is looking at the app).
 *
 * An item that already has a native notice stays on the native path so a pet
 * that launches later cannot duplicate it.
 */
function announceAttention(item: AttentionItem, requestId: string | null): boolean {
  if (!initialized) return false
  if (isUserLooking()) return false
  if (isDndEnabled()) return false
  // `petAttentionAlerts` is the pet's own switch ("Call Me Through the Pet"),
  // not a master mute: turning the bubble off must not also silence the OS
  // fallback, or a user who dislikes the pet would stop being told about
  // approvals. Only the pet path reads it — DND still silences both.
  if (isAttentionEnabled() && canSummon() && !item.nativePending) {
    // The item may already be in the queue behind another bubble; it is still
    // owned by the pet and will surface when the queue reaches it.
    return true
  }
  return showNativeNotice(item, requestId)
}

/** The quiet rule: the pet only calls when the app is not in front of the user. */
function canSummon(): boolean {
  if (!isAttentionEnabled()) return false
  const win = getWindow()
  if (!win || win.isDestroyed()) return false
  if (isUserLooking()) return false
  if (!isClawdAttentionAvailable()) return false
  // A timed silence ("Silence for…") is an explicit "leave me alone", the same
  // as DND. It already suppresses the native notice through `isDndEnabled`, so
  // leaving it out here would keep the pet popping cards while the OS went
  // quiet — the opposite of what the user asked for.
  if (isClawdPetHidden() || isClawdDoNotDisturb() || isClawdBubblesHidden()) return false
  if (isClawdQuietActive()) return false
  return true
}

// ── Native fallback ───────────────────────────────────

/**
 * Native notices are one per request id for approvals/questions, and one per
 * queue item for the other kinds. A repeated raise of the same failure or
 * plugin completion refreshes the item, not the OS notification stack.
 */
function findNativeNotice(item: AttentionItem, requestId: string | null): NativeNotice | null {
  for (const notice of nativeNotices.values()) {
    if (!notice.active) continue
    if (requestId) {
      // Request ids are only unique within a bridge in some engines, so the
      // subject is part of the identity, not just the kind.
      if (
        notice.kind === item.kind &&
        notice.requestId === requestId &&
        nativeNoticeMatchesSubject(notice, { bridgeId: item.bridgeId, sessionId: item.sessionId })
      ) return notice
    } else if (notice.item === item) {
      return notice
    }
  }
  return null
}

function nativeNoticeKey(item: AttentionItem, requestId: string | null): string {
  // Request ids are the unit of answer, so they are the dedupe key. The kind
  // and subject prevent two conversations' "request 1" from colliding.
  const subject = item.bridgeId || item.sessionId || 'unknown'
  return requestId ? `${item.kind}:${subject}:request:${requestId}` : `item:${item.key}`
}

/** Native text follows the pet language when it exists, else the app locale. */
function nativeAttentionLanguage(): string {
  if (isClawdAttentionAvailable()) return petLanguage()
  let value = ''
  try {
    const stored = getRawPref('language')
    value = typeof stored === 'string' && stored !== 'system' ? stored : app.getLocale()
  } catch {
    value = 'en'
  }
  const lower = value.toLowerCase()
  if (lower.startsWith('zh')) return 'zh'
  if (lower.startsWith('ko')) return 'ko'
  return 'en'
}

function buildNativeContent(item: AttentionItem): { title: string; body: string } {
  // `buildPayload` is the one string table for both surfaces: the native
  // notification takes its title and body from the same switch as the pet
  // bubble, so a new kind needs no separate OS copy. The pet is not rendering
  // this bubble, so choose the app language rather than the pet's (which is
  // "en" while it has no instance).
  const previous = lang
  lang = nativeAttentionLanguage()
  try {
    const payload = buildPayload(item)
    return { title: payload.title, body: payload.message }
  } finally {
    lang = previous
  }
}

/**
 * Show the fallback and remember it. Returns false when the OS cannot show a
 * notification at all, so a caller does not incorrectly report delivery.
 */
function showNativeNotice(item: AttentionItem, requestId: string | null): boolean {
  // Already announced: a repeated raise must not stack a second notice.
  if (findNativeNotice(item, requestId)) {
    item.nativePending = true
    return true
  }
  if (!Notification.isSupported()) return false

  const key = nativeNoticeKey(item, requestId)
  if (nativeNotices.has(key)) return true

  const content = buildNativeContent(item)
  try {
    const notification = new Notification({
      title: content.title,
      body: content.body,
      silent: true,
    })
    const notice: NativeNotice = {
      notification,
      item,
      kind: item.kind,
      bridgeId: item.bridgeId,
      sessionId: item.sessionId,
      requestId,
      active: true,
    }
    nativeNotices.set(key, notice)
    item.nativePending = true
    notification.on('click', () => onNativeNoticeClick(key))
    notification.show()
    if (item.kind === 'failed') noteNativeFailure(item)
    return true
  } catch (err) {
    // Construction/show can fail (unsupported platform, broken shell). Do not
    // leave a phantom notice that would block the pet path forever.
    nativeNotices.delete(key)
    if (![...nativeNotices.values()].some(n => n.active && n.item === item)) {
      item.nativePending = false
    }
    log.warn('Could not show native attention notification:', String(err))
    return false
  }
}

function noteNativeFailure(item: AttentionItem): void {
  const now = Date.now()
  if (item.sessionId) recentNativeFailureAt.set(item.sessionId, now)
  if (item.bridgeId) recentNativeFailureAt.set(item.bridgeId, now)
  if (!item.sessionId && !item.bridgeId && item.pluginId) {
    recentNativeFailureAt.set(`plugin:${item.pluginId}`, now)
  }
}

function nativeNoticeMatchesSubject(notice: NativeNotice, input: {
  sessionId?: string | null
  bridgeId?: string | null
}): boolean {
  const item = notice.item
  return (!!input.bridgeId && (
    notice.bridgeId === input.bridgeId ||
    item.bridgeId === input.bridgeId
  )) || (!!input.sessionId && (
    notice.sessionId === input.sessionId ||
    notice.bridgeId === input.sessionId ||
    item.sessionId === input.sessionId ||
    item.bridgeId === input.sessionId
  ))
}

/**
 * Remove one notice from the OS and our bookkeeping. Idempotent; used by
 * resolution and shutdown.
 */
function closeNativeNotice(key: string): void {
  const notice = nativeNotices.get(key)
  if (!notice) return
  notice.active = false
  nativeNotices.delete(key)
  try {
    notice.notification.close()
  } catch {
    // The OS may already have dismissed it.
  }
  if (![...nativeNotices.values()].some(n => n.active && n.item === notice.item)) {
    notice.item.nativePending = false
  }
}

/**
 * Clicking the fallback opens the same target the pet bubble would: the
 * request's conversation, the failed turn, the finished automation's session,
 * or the plugin that finished. A request resolved in the meantime is dropped
 * rather than opening a conversation whose card is already gone.
 */
function onNativeNoticeClick(key: string): void {
  const notice = nativeNotices.get(key)
  if (!notice || !notice.active) return

  const requestStillPending = !notice.requestId ||
    notice.item.requestIds.has(notice.requestId)
  const tracked = [...items.values()].includes(notice.item)
  closeNativeNotice(key)

  if (!requestStillPending) {
    log.debug('native attention notification ignored — request already resolved')
    return
  }

  openItem(notice.item)
  if (tracked) {
    dropItem(notice.item)
    scheduleRender()
  }
}

/**
 * A transient item that was already on screen is not repeated when the user
 * comes back: they are now looking at the app, which shows the same outcome.
 * Approvals and questions stay queued because they are still actionable.
 */
function dropShownTransientItems(): void {
  for (const [key, item] of items) {
    if (item.kind !== 'failed' && item.kind !== 'plugin-done' && item.kind !== 'automation-done') continue
    if (item !== current && !item.lastShownAt) continue
    items.delete(key)
  }
}

function pruneExpired(now: number): void {
  for (const [key, item] of items) {
    if (item === current) continue
    if (item.kind === 'approval' || item.kind === 'clarification') continue
    if (now - item.createdAt <= TRANSIENT_TTL_MS) continue
    items.delete(key)
  }
}

function pickNext(): AttentionItem | null {
  let best: AttentionItem | null = null
  for (const item of items.values()) {
    // A native notice already announced this item; a pet window that becomes
    // available later must not say it again.
    if (item.nativePending) continue
    if (!best) {
      best = item
      continue
    }
    const pa = KIND_PRIORITY[item.kind]
    const pb = KIND_PRIORITY[best.kind]
    if (pa < pb || (pa === pb && item.createdAt < best.createdAt)) best = item
  }
  return best
}

function render(): void {
  if (!initialized) return
  const now = Date.now()
  pruneExpired(now)

  if (!canSummon()) {
    // The user is looking (or the pet cannot speak): keep approvals/questions
    // queued for the next time they look away, drop the bubble meanwhile.
    if (isUserLooking()) dropShownTransientItems()
    retract()
    return
  }

  // A bubble that could not be shown must not be retried on a timer: without
  // this, a rejected show would re-render every debounce tick forever.
  if (now - lastShowFailureAt < SHOW_RETRY_MS) return

  const next = pickNext()
  if (!next) {
    retract()
    return
  }

  lang = petLanguage()
  const payload = buildPayload(next)
  if (current === next && payload.signature === currentSignature) return
  show(next, payload)
}

interface BuiltBubble extends ClawdAttentionBubblePayload {
  signature: string
}

/**
 * Attention kind → bubble accent/icon vocabulary. The bubble decides what the
 * kind looks like; this mapping only picks the word. `quest` is the scheduled
 * job that finished, `error` the failed turn, `warning` the spending rail.
 */
const KIND_BUBBLE: Record<AttentionKind, ClawdBubbleKind> = {
  approval: 'approval',
  clarification: 'clarification',
  failed: 'error',
  'limit-hold': 'warning',
  'plugin-done': 'success',
  'automation-done': 'quest',
  // A calm slate accent: the due card is a reminder, not a failure.
  'task-due': 'due',
  // The week's summary gets its own warm accent: it is neither a reminder nor
  // a success, and should not wear the due card's urgent slate.
  'task-review': 'review',
  // The evening wrap shares the review's warm accent: it is a look back, not
  // an alarm.
  'day-wrap': 'review',
}

/** Approvals and questions wait for the user; the rest expire on their own. */
function isTransientKind(kind: AttentionKind): boolean {
  return kind !== 'approval' && kind !== 'clarification'
}

/**
 * The short weekday of a stored local day, in the pet's language. The review
 * names the day a task was finished rather than repeating its count: "what I
 * got done, and when" is the sentence a weekly card is for.
 */
function weekdayShort(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return ''
  try {
    return new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(year, month - 1, date))
  } catch {
    // A runtime without Intl weekday data: the row keeps its title alone.
    return ''
  }
}

function metaRows(item: AttentionItem): ClawdBubbleMetaRow[] {
  // The due card's sentence states the counts; these rows answer "which ones?"
  // A REQUESTS row derived from `count` would still misdescribe it as approvals.
  if (item.kind === 'task-due') {
    const due = item.due
    // Defensive: an aggregate built by an older caller may predate `rows`.
    if (!due || !Array.isArray(due.rows) || due.rows.length === 0) return []
    const dueRows: ClawdBubbleMetaRow[] = due.rows.map(row => ({
      label: row.title,
      value: row.daysOverdue > 0
        ? fmt(t('attentionTaskDueRowLate'), { n: row.daysOverdue })
        : t('attentionTaskDueRowToday'),
      title: row.title,
      variant: 'due',
    }))
    if (due.more > 0) {
      dueRows.push({
        label: '',
        value: fmt(t('attentionTaskDueMore'), { n: due.more }),
        variant: 'more',
      })
    }
    return dueRows
  }
  // The review's rows are the opposite question: which tasks were finished,
  // and on which day. They share the due card's task-row look (`variant:
  // 'due'`) because they are the card's content, not its diagnostics.
  if (item.kind === 'task-review') {
    const review = item.review
    if (!review || !Array.isArray(review.rows) || review.rows.length === 0) return []
    const reviewRows: ClawdBubbleMetaRow[] = review.rows.map(row => ({
      label: row.title,
      value: weekdayShort(row.day),
      title: row.title,
      variant: 'due',
    }))
    if (review.more > 0) {
      reviewRows.push({
        label: '',
        value: fmt(t('attentionReviewMore'), { n: review.more }),
        variant: 'more',
      })
    }
    return reviewRows
  }
  // The evening wrap names what was finished today, with a ×N marker when a
  // repeating task was checked off more than once, then the first two of
  // tomorrow's tasks. Same task-row look as the due and review cards: the rows
  // are the card's content, not diagnostics.
  if (item.kind === 'day-wrap') {
    const wrap = item.wrap
    if (!wrap) return []
    // An aggregate built by an older caller predates `tomorrowRows`; a legacy
    // one must render exactly as before rather than throw on `undefined.map`.
    const tomorrow = Array.isArray(wrap.tomorrowRows) ? wrap.tomorrowRows : []
    const doneRows = Array.isArray(wrap.rows) ? wrap.rows : []
    // A day with nothing finished still ends with tomorrow's work: an empty
    // finished list is not a reason to drop the rows that tell the user what
    // to start on in the morning.
    if (doneRows.length === 0 && tomorrow.length === 0) return []
    const done = t('attentionDayWrapRowDone')
    const wrapRows: ClawdBubbleMetaRow[] = doneRows.map(row => ({
      label: row.title,
      value: row.count > 1 ? `${done} ×${row.count}` : done,
      title: row.title,
      variant: 'due',
    }))
    if (wrap.more > 0) {
      wrapRows.push({
        label: '',
        value: fmt(t('attentionDayWrapMore'), { n: wrap.more }),
        variant: 'more',
      })
    }
    // Tomorrow's named tasks come last, so the card ends with what is next.
    const tomorrowLabel = t('attentionDayWrapRowTomorrow')
    for (const title of tomorrow) {
      wrapRows.push({ label: title, value: tomorrowLabel, title, variant: 'due' })
    }
    return wrapRows
  }
  const rows: ClawdBubbleMetaRow[] = []
  if (item.sessionId) {
    rows.push({ label: t('attentionMetaSession'), value: item.sessionId.slice(0, 8) })
  }
  const requests = Math.max(1, item.count)
  if (requests > 1) {
    rows.push({ label: t('attentionMetaRequests'), value: String(requests) })
  }
  if (item.kind === 'plugin-done' && item.plugins.length > 1) {
    rows.push({ label: t('attentionMetaJobs'), value: String(item.plugins.length) })
  }
  return rows
}

/** 1-based position of an item in the order the queue would show it. */
function queuePosition(item: AttentionItem): { index: number; total: number } {
  const ordered = [...items.values()]
    .filter(entry => !entry.nativePending)
    .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.createdAt - b.createdAt)
  const index = ordered.indexOf(item)
  return { index: index >= 0 ? index + 1 : 1, total: ordered.length }
}

function buildPayload(item: AttentionItem): BuiltBubble {
  const count = Math.max(1, item.count)
  // A plugin batch is openable as a whole even though it names no single job;
  // the click resolves through `openItem`, which offers a choice. A due card
  // always opens the task brief (or the Tasks view) where its rows can be acted
  // on; it names no conversation of its own.
  const openable = item.kind === 'task-due' || item.kind === 'task-review' ||
    item.kind === 'day-wrap' || !!(item.sessionId || item.pluginId || item.plugins.length > 0)
  const name = item.detail || ''
  const pluginJobCount = item.kind === 'plugin-done' ? item.plugins.length : 0
  const meta = metaRows(item)
  const queue = queuePosition(item)

  let title = ''
  let pill = ''
  let message = ''

  switch (item.kind) {
    case 'approval':
      title = t('attentionApprovalTitle')
      pill = t('attentionApprovalPill')
      message = count > 1
        ? fmt(t('attentionApprovalBodyCount'), { n: count })
        : (name ? fmt(t('attentionApprovalBodyTool'), { name }) : t('attentionApprovalBody'))
      break
    case 'clarification':
      title = t('attentionClarificationTitle')
      pill = t('attentionClarificationPill')
      message = count > 1
        ? fmt(t('attentionClarificationBodyCount'), { n: count })
        : t('attentionClarificationBody')
      break
    case 'failed':
      title = t('attentionFailedTitle')
      pill = t('attentionFailedPill')
      message = count > 1
        ? fmt(t('attentionFailedBodyCount'), { n: count })
        : (name ? fmt(t('attentionFailedBodyDetail'), { name }) : t('attentionFailedBody'))
      break
    case 'limit-hold':
      // Same shape as `automation-done`: `detail` carries the job's name, so
      // the bubble says which job was held instead of only that something was.
      // The text is deliberately about the limit, not about a failure — the
      // job did nothing wrong, and the user's own cap is what stopped it.
      title = t('attentionLimitHoldTitle')
      pill = t('attentionLimitHoldPill')
      message = name
        ? fmt(t('attentionLimitHoldBody'), { name })
        : t('attentionLimitHoldBodyGeneric')
      break
    case 'plugin-done':
      title = t('attentionPluginDoneTitle')
      pill = t('attentionPluginDonePill')
      // The count comes from the batch itself: a coalesced bubble must not
      // wear the name of whichever job happened to land last.
      message = pluginJobCount > 1
        ? fmt(t('attentionPluginDoneBodyCount'), { n: pluginJobCount })
        : (name ? fmt(t('attentionPluginDoneBody'), { name }) : t('attentionPluginDoneBodyGeneric'))
      break
    case 'automation-done':
      // `detail` carries the automation's name, which makes the bubble say
      // which job actually ran rather than just "something finished".
      title = t('attentionAutomationDoneTitle')
      pill = t('attentionAutomationDonePill')
      message = name
        ? fmt(t('attentionAutomationDoneBody'), { name })
        : t('attentionAutomationDoneBodyGeneric')
      break
    case 'task-due': {
      // One card, one sentence. `due` is the aggregate over the tasks newly
      // announced this day; `count` is the same total as a fallback.
      title = t('attentionTaskDueTitle')
      pill = t('attentionTaskDuePill')
      const due = item.due ?? {
        total: count, today: count, overdue: 0, oldestOverdueDays: 0, rows: [], more: 0,
      }
      if (due.overdue > 0 && due.today > 0) {
        message = fmt(t('attentionTaskDueMixed'), { n: due.total, overdue: due.overdue })
      } else if (due.overdue > 0) {
        // Singular tasks and singular days each have their own sentence, so a
        // card never says "1 tasks" or "1 days".
        if (due.overdue === 1) {
          message = due.oldestOverdueDays === 1
            ? t('attentionTaskDueOverdueOneDay')
            : fmt(t('attentionTaskDueOverdueOneDays'), { n: due.oldestOverdueDays })
        } else {
          message = due.oldestOverdueDays === 1
            ? fmt(t('attentionTaskDueOverdueManyDay'), { n: due.overdue })
            : fmt(t('attentionTaskDueOverdueManyDays'), { n: due.overdue, d: due.oldestOverdueDays })
        }
      } else {
        message = due.today === 1
          ? t('attentionTaskDueTodayOne')
          : fmt(t('attentionTaskDueTodayMany'), { n: due.today })
      }
      break
    }
    case 'task-review': {
      // Two sentences at most: what the week produced, then what is still on
      // the desk. `finished` counts occurrences, so a daily habit that ran
      // five times is five — the week's own arithmetic, not a task total.
      title = t('attentionReviewTitle')
      pill = t('attentionReviewPill')
      const review = item.review ?? {
        finished: 0, finishedTasks: 0, open: 0, overdue: 0, rows: [], more: 0, weekStart: '',
      }
      const finished = review.finished > 0
        ? (review.finished === 1
          ? t('attentionReviewFinishedOne')
          : fmt(t('attentionReviewFinishedMany'), { n: review.finished }))
        : t('attentionReviewNothingFinished')
      let desk: string
      if (review.open === 0) {
        desk = t('attentionReviewDeskClear')
      } else if (review.open === 1) {
        desk = review.overdue > 0 ? t('attentionReviewDeskOpenOneLate') : t('attentionReviewDeskOpenOne')
      } else {
        desk = review.overdue > 0
          ? fmt(t('attentionReviewDeskOpenManyLate'), { n: review.open, overdue: review.overdue })
          : fmt(t('attentionReviewDeskOpenMany'), { n: review.open })
      }
      // Two sentences, one space between them in the languages that use one;
      // Chinese and Japanese already close a sentence with a full stop and do
      // not want a space after it.
      const glue = lang === 'zh' || lang === 'ja' ? '' : ' '
      message = `${finished}${glue}${desk}`
      break
    }
    case 'day-wrap': {
      // Three sentences at most: what got done today, what is still on the
      // desk, and — only when there is something — what is due tomorrow.
      // `finished` counts occurrences, so a habit checked off three times is
      // three; the rows below name the task once.
      title = t('attentionDayWrapTitle')
      pill = t('attentionDayWrapPill')
      const wrap = item.wrap ?? {
        day: '', finished: 0, finishedTasks: 0, rows: [], more: 0,
        open: 0, overdue: 0, dueTomorrow: 0, tomorrowRows: [],
      }
      const finished = wrap.finished > 0
        ? (wrap.finished === 1
          ? t('attentionDayWrapFinishedOne')
          : fmt(t('attentionDayWrapFinishedMany'), { n: wrap.finished }))
        : t('attentionDayWrapNothingFinished')
      let desk: string
      if (wrap.open === 0) {
        desk = t('attentionReviewDeskClear')
      } else if (wrap.open === 1) {
        desk = wrap.overdue > 0 ? t('attentionReviewDeskOpenOneLate') : t('attentionReviewDeskOpenOne')
      } else {
        desk = wrap.overdue > 0
          ? fmt(t('attentionReviewDeskOpenManyLate'), { n: wrap.open, overdue: wrap.overdue })
          : fmt(t('attentionReviewDeskOpenMany'), { n: wrap.open })
      }
      const glue = lang === 'zh' || lang === 'ja' ? '' : ' '
      let messageParts = `${finished}${glue}${desk}`
      if (wrap.dueTomorrow > 0) {
        const tomorrow = wrap.dueTomorrow === 1
          ? t('attentionDayWrapTomorrowOne')
          : fmt(t('attentionDayWrapTomorrowMany'), { n: wrap.dueTomorrow })
        messageParts = `${messageParts}${glue}${tomorrow}`
      }
      message = messageParts
      break
    }
  }

  const payload: ClawdAttentionBubblePayload = {
    mode: item.kind === 'plugin-done' || item.kind === 'automation-done' ? 'done' : 'attention',
    lang,
    title,
    message,
    pill,
    clickAction: openable ? 'open' : 'dismiss',
    kind: KIND_BUBBLE[item.kind],
    // Actionable cards must be readable at a glance; the rest may type out.
    typed: isTransientKind(item.kind),
  }
  if (meta.length) payload.meta = meta
  if (queue.total > 1) payload.queue = queue
  if (isTransientKind(item.kind)) {
    // The queue drops transient items after this long; the bar drains with it.
    payload.countdownMs = Math.max(0, TRANSIENT_TTL_MS - (Date.now() - item.createdAt))
  }
  if (openable) {
    // One obvious affordance; clicking anywhere on the card does the same.
    payload.actions = [{
      id: 'open',
      label: t(
        item.kind === 'task-due' || item.kind === 'task-review' || item.kind === 'day-wrap'
          ? 'attentionOpenTasks'
          : pluginJobCount > 1
            ? 'attentionChoosePlugin'
            : item.pluginId ? 'attentionOpenPlugin' : 'attentionOpen',
      ),
      variant: 'primary',
    }]
    if (item.kind === 'task-due') {
      // A deliberate "not now" beside the primary: the card still opens the
      // task desk, but waiting two hours is a real choice and must not be the
      // same gesture as opening. The reminder module owns the timer.
      payload.actions.push({
        id: 'later',
        label: t('attentionTaskDueLater'),
        variant: 'secondary',
      })
    }
  }

  const signature = [
    title,
    message,
    pill,
    payload.clickAction,
    `${queue.index}/${queue.total}`,
    meta.map(row => `${row.label}:${row.value}`).join(';'),
  ].join('|')
  return { ...payload, signature }
}

function show(item: AttentionItem, payload: BuiltBubble): void {
  const seq = ++showSeq
  current = item
  currentSignature = payload.signature
  item.lastShownAt = Date.now()
  // The pet's own memory of what it announced. A dismissed bubble leaves no
  // trace on screen, so the history is the only way back to it. Once per item:
  // a queue change re-renders the same card, it does not announce a new one.
  if (!item.recorded) {
    item.recorded = true
    recordClawdNotice({
      kind: payload.kind || 'system',
      title: payload.title,
      message: payload.message,
      // A due card's last row is only a count (`+2 more`), with no field name;
      // joining it as ": +2 more" would read like a broken label.
      detail: payload.meta?.map(row => (row.label ? `${row.label}: ${row.value}` : row.value)).join('\n'),
      sessionId: item.sessionId,
      pluginId: item.pluginId,
    })
  }

  const { signature: _signature, ...bubble } = payload
  // The factory sets requireAction/defaultAction; a superseded bubble resolves
  // null, which the seq guard below ignores.
  void showClawdAttentionBubble(bubble).then((action) => {
    if (seq !== showSeq) return
    if (current !== item) return
    current = null
    currentSignature = ''
    if (!action) {
      // Cannot display right now (pet window gone, show failed). Keep the item
      // queued, but wait for the next real change before trying again.
      lastShowFailureAt = Date.now()
      return
    }
    if (action === 'open') openItem(item)
    else if (action === 'later' && item.kind === 'task-due') snoozeDueCard()
    // The bubble module hid its own window; the pet also needs its click
    // target released, or a later click would try to open a gone item.
    hideClawdAttentionBubble()
    dropItem(item)
    scheduleRender()
  })
}

function retract(): void {
  if (!current) return
  current = null
  currentSignature = ''
  // Invalidate the pending promise: it will resolve later with null.
  showSeq++
  hideClawdAttentionBubble()
}

function dropItem(item: AttentionItem): void {
  items.delete(item.key)
}

/**
 * The due card's "Later" action. Dismissing is the same as any other card;
 * the wait itself belongs to the reminder module, which rereads the task
 * store when the two hours are up. Loaded lazily: `due-reminder` imports this
 * module at runtime, so a top-level import would close that cycle.
 */
function snoozeDueCard(): void {
  try {
    const { snoozeDueReminder } = require('./tasks/due-reminder') as {
      snoozeDueReminder: () => boolean
    }
    if (!snoozeDueReminder()) log.debug('due card "Later" was not scheduled')
  } catch (err) {
    log.warn('Could not schedule the due card for later:', String(err))
  }
}

function petLanguage(): string {
  const value = getClawdLanguage()
  return value === 'zh' || value === 'ko' ? value : 'en'
}

/** Pet click while an attention bubble is up. */
function activateCurrent(): void {
  if (!current) return
  const item = current
  showSeq++
  hideClawdAttentionBubble()
  current = null
  currentSignature = ''
  openItem(item)
  dropItem(item)
  scheduleRender()
}

// ── Opening the thing that needs attention ──────────

/**
 * Focus the main window, recreating it when it was closed. `index.ts` owns
 * window construction and listens for `activate`; emitting it keeps a single
 * source of truth, exactly as the automation scheduler's former fallback did.
 */
function openMainWindow(): BrowserWindow | null {
  const live = getWindow()
  if (live && !live.isDestroyed()) {
    bringForward(live)
    return live
  }
  app.emit('activate')
  const created = BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) ?? null
  if (created) bringForward(created)
  return created
}

function openItem(item: AttentionItem): void {
  // The review card's destination is the week-review window: the same week the
  // bubble just summarised, opened in full. It owns its own window and can be
  // opened without summoning AIPA; if it cannot be created, fall back to the
  // brief through the same route a due card uses.
  if (item.kind === 'task-review') {
    try {
      const { openClawdWeekReview } = require('./clawd-week-review') as {
        openClawdWeekReview: () => boolean
      }
      if (openClawdWeekReview() === true) return
    } catch (err) {
      log.warn('Could not open the week review for a review card:', String(err))
    }
    openDueTasks()
    return
  }

  // The due card's destination is the task brief, not a conversation. It owns
  // its own window and can be opened without summoning AIPA at all; if it
  // cannot be created, fall back to the Tasks view through the same hand-off
  // the notice centre uses. The evening wrap opens the same desk: its rows
  // are today's finished tasks and whatever waits for tomorrow.
  if (item.kind === 'task-due' || item.kind === 'day-wrap') {
    openDueTasks()
    return
  }

  // The window may have been closed to the dock. Recreate it through the app's
  // normal activation path, the same route the automation scheduler used.
  const win = openMainWindow()
  if (!win) return

  if (item.kind === 'plugin-done' && item.plugins.length > 0) {
    if (item.plugins.length === 1) openPlugin(win, item.plugins[0].pluginId)
    else openPluginChooser(win, item.plugins)
    return
  }
  if (item.pluginId) {
    openPlugin(win, item.pluginId)
    return
  }
  if (item.sessionId) {
    openSession(win, item.sessionId)
    return
  }

  // A scheduled run's held permission request has no conversation to open —
  // the run's transcript may not exist yet. The background-work panel is the
  // only place it can be answered, so the click opens that panel on the exact
  // request. The renderer says so itself when the request settled in between.
  const heldJobId = automationApprovalJobId(item)
  const heldRequestId = item.requestIds.values().next().value
  if (heldJobId && typeof heldRequestId === 'string' && heldRequestId) {
    openHeldApproval(win, heldJobId, heldRequestId)
    return
  }

  // Nothing openable (e.g. a failure before the thread id existed): at least
  // bring the app forward so the in-app state is visible.
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

/**
 * Open the rows behind a due card (or the week a review card just summarised).
 * The brief is the existing pet-side surface
 * that lists the task desk, already ordered with dated work first and Today /
 * overdue markers — exactly where a due row can be started or finished. It is
 * loaded lazily because it lives beside the pet factory and imports this
 * module's sibling surfaces, not because it is optional.
 *
 * If the brief cannot be created (assets missing, no pet install), the app's
 * own Tasks view is the honest fallback. Both are existing destinations; this
 * function never creates a second kind of window.
 */
function openDueTasks(): void {
  try {
    const { openClawdTaskBrief } = require('./clawd-task-brief') as {
      openClawdTaskBrief: () => boolean
    }
    if (openClawdTaskBrief() === true) return
  } catch (err) {
    log.warn('Could not open the task brief for a due reminder:', String(err))
  }

  const win = openMainWindow()
  if (!win) return
  bringForward(win)
  const deliver = (): void => {
    if (!win.isDestroyed()) win.webContents.send('menu:openTasks')
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver)
  else deliver()
}

/**
 * The job behind an unattended run's held request, read from its attention
 * bridge (`automation:<jobId>`, written by the scheduler's `onApprovalWait`).
 *
 * Chat approvals carry a bridge id of their own and open a conversation, so
 * only the automation prefix routes here. A `failed` item also uses that
 * prefix; the kind check keeps it out.
 */
function automationApprovalJobId(item: AttentionItem): string | null {
  if (item.kind !== 'approval' || !item.bridgeId) return null
  const prefix = 'automation:'
  if (!item.bridgeId.startsWith(prefix)) return null
  const jobId = item.bridgeId.slice(prefix.length)
  return jobId || null
}

/**
 * Open the background-work panel on one held request.
 *
 * There is no IPC channel of its own: `menu:*` is already the app's one-way
 * hand-off to the renderer, and `onMenuEvent` in the preload is generic. The
 * payload names the job *and* the request, because the panel answers exactly
 * one request id and never a job-wide "always allow".
 */
function openHeldApproval(win: BrowserWindow, jobId: string, requestId: string): void {
  bringForward(win)
  const deliver = (): void => {
    if (!win.isDestroyed()) win.webContents.send('menu:focusApproval', { jobId, requestId })
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver)
  else deliver()
}

/**
 * The renderer already has exactly one listener for `menu:openSession`
 * (`useAppEventBridge` → `openSessionCore`), which is the same hand-off the
 * tray and the automation scheduler use.
 */
function openSession(win: BrowserWindow, sessionId: string): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  const deliver = (): void => {
    if (!win.isDestroyed()) win.webContents.send('menu:openSession', sessionId)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver)
  else deliver()
}

/**
 * Several plugin jobs finished inside one debounce window. The bubble can
 * only say "N jobs finished"; opening the first or last would silently throw
 * the others away, so the click asks which one the user meant.
 */
function openPluginChooser(win: BrowserWindow, jobs: PluginJob[]): void {
  bringForward(win)
  const menu = Menu.buildFromTemplate(jobs.map(job => ({
    label: job.detail || job.pluginId,
    click: () => openPlugin(win, job.pluginId),
  })))
  menu.popup({ window: win })
}

function bringForward(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

/** Plugin jobs have no chat session; open the plugin that finished instead. */
function openPlugin(win: BrowserWindow, pluginId: string): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  const deliver = (): void => {
    if (!win.isDestroyed()) win.webContents.send('plugin:open', pluginId)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver)
  else deliver()
}

log.debug('attention module loaded')
