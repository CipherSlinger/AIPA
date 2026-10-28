/**
 * clawd-attention.ts — the single path from main-process events to the
 * desktop pet's attention bubble.
 *
 * Five things can need the user while AIPA is in the background:
 *   - an approval is waiting          (Codex approval / Claude permission / plan)
 *   - an answer is needed             (Claude MCP elicitation)
 *   - a task failed                   (failed turn, bridge crash, API error,
 *                                      failed automation run)
 *   - a plugin job finished           (plugin AI generate / plugin edit)
 *   - an automation run finished      (a hidden scheduled run)
 *
 * All five raise one record shape and share one queue, so there is exactly one
 * bubble on screen and exactly one rule for when it may appear. Sources never
 * talk to the pet directly — they call `raiseAttention`.
 *
 * Quiet rule: nothing is shown while the main window is focused, visible and
 * not minimised. Items raised while the user is looking stay queued (approvals
 * and questions) so that alt-tabbing away surfaces them; transient items
 * (failures, plugin completions, finished automation runs) expire instead of
 * nagging later.
 *
 * Dedupe rule: the queue is keyed by `kind + session` (or bridge, or plugin).
 * A repeated failure in the same session refreshes one bubble instead of
 * stacking; approvals/questions collapse into a count and are resolved one
 * request id at a time; plugin completions coalesce into one summary
 * ("3 plugin jobs finished") whose click opens a chooser, never an arbitrary
 * job. Rendering is debounced so a burst becomes one bubble.
 *
 * Notification rule: for these events the pet bubble *is* the notification.
 * Chat completions keep their native OS notification, and so does an
 * automation run when the pet cannot speak; the scheduler owns that fallback
 * and uses `raiseAttention`'s return value to skip it when the pet took the
 * event. This module still never shows a native notification itself, so the
 * same run can never be announced twice. When the pet cannot show (disabled,
 * hidden, asleep, or its own "hide bubbles" setting), we stay silent rather
 * than fall back to a second surface.
 */

import { BrowserWindow, Menu, app } from 'electron'
import { getPref } from './config/config-manager'
import { createLogger } from './utils/logger'
import {
  getClawdLanguage,
  hideClawdAttentionBubble,
  isClawdAttentionAvailable,
  isClawdBubblesHidden,
  isClawdDoNotDisturb,
  isClawdPetHidden,
  setClawdAttentionActivateHandler,
  showClawdAttentionBubble,
  type ClawdAttentionBubblePayload,
} from './clawd-integration'

const log = createLogger('clawd-attention')

// The pet's own string table. It is keyed by the pet language ("en" | "zh" |
// "ko"): the bubble is rendered inside the pet window, so it must speak the
// pet's language, not the app's.
const { createTranslator } = require('./clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}

export type AttentionKind = 'approval' | 'clarification' | 'failed' | 'plugin-done' | 'automation-done'

export interface AttentionInput {
  kind: AttentionKind
  /** Openable AIPA session id (Codex thread id / Claude session id), if known. */
  sessionId?: string | null
  /** Bridge that produced the event. Used to resolve an item before its openable id is known. */
  bridgeId?: string | null
  /** Permission / elicitation request id — one answer clears one pending request. */
  requestId?: string | null
  /** Tool name, plugin name or error summary, shown inside the bubble body. */
  detail?: string | null
  /** Plugin that owns the job (plugin-done / plugin failure). */
  pluginId?: string | null
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
  /** Finished plugin jobs collapsed into this bubble; >1 means the click chooses. */
  plugins: PluginJob[]
  createdAt: number
  /** How many items collapsed into this record (approvals, plugin completions). */
  count: number
  /** Outstanding request ids for approvals/questions; one is removed per answer. */
  requestIds: Set<string>
  /** Last time this item was actually on screen (0 = never). */
  lastShownAt: number
}

const KIND_PRIORITY: Record<AttentionKind, number> = {
  approval: 0,
  clarification: 1,
  failed: 2,
  'plugin-done': 3,
  'automation-done': 4,
}

/** A burst of events becomes one bubble: wait for the quiet gap first. */
const RENDER_DEBOUNCE_MS = 250
/** After a failed show, wait for a real change instead of retrying in a loop. */
const SHOW_RETRY_MS = 15_000
/** A failure older than this is no longer worth a bubble when the user returns. */
const TRANSIENT_TTL_MS = 2 * 60 * 1000
const PLUGIN_DONE_KEY = 'plugin-done:batch'
/** How long after a failed turn its own completion notification stays suppressed. */
const FAILURE_SUPPRESSION_MS = 5000

const items = new Map<string, AttentionItem>()

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
  items.clear()
  recentFailureAt.clear()
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
 * Returns true when the pet can take this event right now. A caller that also
 * owns a native notification (the automation scheduler) uses that to make the
 * pet the one and only announcement for the run.
 */
export function raiseAttention(input: AttentionInput): boolean {
  if (!initialized) return false
  if (!isAttentionEnabled()) return false
  if (!input || !input.kind) return false

  const now = Date.now()
  // The renderer's completion notification is sent from the same result event
  // that raised this failure; window-handlers uses this to let the pet be the
  // one and only notification for that particular turn.
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
      plugins: [],
      createdAt: now,
      count: 0,
      requestIds: new Set<string>(),
      lastShownAt: 0,
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
    return willShowNow(item)
  }

  const key = attentionKey(input)
  const existing = items.get(key)
  if (existing) {
    if (input.requestId) existing.requestIds.add(input.requestId)
    // Approvals/questions collapse to a count; failures and their repeats are
    // a single "this session is failing" fact.
    existing.count = Math.max(1, existing.requestIds.size, existing.count)
    if (input.detail) existing.detail = input.detail
    existing.createdAt = now
    if (input.sessionId) existing.sessionId = input.sessionId
    if (input.bridgeId) existing.bridgeId = input.bridgeId
    if (input.pluginId) existing.pluginId = input.pluginId
    scheduleRender()
    return willShowNow(existing)
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
    plugins: [],
    createdAt: now,
    count: Math.max(1, requestIds.size),
    requestIds,
    lastShownAt: 0,
  }
  items.set(key, item)
  scheduleRender()
  return willShowNow(item)
}

/**
 * Forget everything raised for a bridge. Used when the user aborts or ends a
 * session: a pending approval for a turn that no longer exists is noise.
 */
export function clearAttentionForBridge(bridgeId: string): void {
  if (!initialized || !bridgeId) return
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
 * Notification rule for the four attention events: the pet replaces the
 * native OS notification. The renderer sends a generic "AIPA" completion
 * notification from the same `cli:result` that just failed, so that one is
 * dropped while the pet is about to speak. Approvals, questions and plugin
 * completions never had a native notification, so nothing else overlaps.
 *
 * If the pet cannot show (disabled, hidden, asleep, bubbles hidden, pref
 * off), this returns false and the native notification remains the fallback.
 *
 * `sessionId` is the conversation the notification is about. Suppression is
 * keyed by it because the notification is only a duplicate of the pet bubble
 * when it reports the *same* failed turn. A notification that carries no
 * session cannot be attributed, so it is left alone: dropping it on the
 * strength of someone else's recent failure is exactly the bug that made
 * conversation B's completion disappear after conversation A failed.
 */
export function shouldSuppressNativeNotification(sessionId?: string | null): boolean {
  if (!initialized || !sessionId) return false
  const at = recentFailureAt.get(sessionId)
  if (!at) return false
  if (Date.now() - at > FAILURE_SUPPRESSION_MS) return false
  return canSummon()
}

/** Re-evaluate the queue, e.g. after the preference was toggled. */
export function refreshAttention(): void {
  if (!initialized) return
  if (!isAttentionEnabled()) {
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

/** The quiet rule: the pet only calls when the app is not in front of the user. */
function canSummon(): boolean {
  if (!isAttentionEnabled()) return false
  const win = getWindow()
  if (!win || win.isDestroyed()) return false
  if (isUserLooking()) return false
  if (!isClawdAttentionAvailable()) return false
  if (isClawdPetHidden() || isClawdDoNotDisturb() || isClawdBubblesHidden()) return false
  return true
}

/**
 * Whether this specific item is about to be shown: the quiet rule allows it,
 * no other bubble is on screen, the backoff after a failed show has elapsed,
 * and `pickNext` would choose it. A caller that also owns a native
 * notification should treat anything else as "the pet is not announcing this
 * now" — a queued item behind an approval may show much later, or expire.
 */
function willShowNow(item: AttentionItem): boolean {
  if (!canSummon()) return false
  if (current) return false
  if (Date.now() - lastShowFailureAt < SHOW_RETRY_MS) return false
  return pickNext()?.key === item.key
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

function buildPayload(item: AttentionItem): BuiltBubble {
  const count = Math.max(1, item.count)
  // A plugin batch is openable as a whole even though it names no single job;
  // the click resolves through `openItem`, which offers a choice.
  const openable = !!(item.sessionId || item.pluginId || item.plugins.length > 0)
  const name = item.detail || ''
  const pluginJobCount = item.kind === 'plugin-done' ? item.plugins.length : 0

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
  }

  const payload: ClawdAttentionBubblePayload = {
    mode: item.kind === 'plugin-done' || item.kind === 'automation-done' ? 'done' : 'attention',
    lang,
    title,
    message,
    pill,
    clickAction: openable ? 'open' : 'dismiss',
  }
  if (openable) {
    // One obvious affordance; clicking anywhere on the card does the same.
    payload.actions = [{
      id: 'open',
      label: t(
        pluginJobCount > 1
          ? 'attentionChoosePlugin'
          : item.pluginId ? 'attentionOpenPlugin' : 'attentionOpen',
      ),
      variant: 'primary',
    }]
  }

  return { ...payload, signature: `${title}|${message}|${pill}|${payload.clickAction}` }
}

function show(item: AttentionItem, payload: BuiltBubble): void {
  const seq = ++showSeq
  current = item
  currentSignature = payload.signature
  item.lastShownAt = Date.now()

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

function openItem(item: AttentionItem): void {
  const win = getWindow()
  if (!win || win.isDestroyed()) return

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

  // Nothing openable (e.g. a failure before the thread id existed): at least
  // bring the app forward so the in-app state is visible.
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
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
