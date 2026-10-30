/**
 * pet-activity.ts — the live "what is the agent doing right now" state behind
 * the pet's activity strip.
 *
 * The bridge already emits turn/started (`messageStart`), toolUse, toolResult
 * and the final result envelope; this module reduces those into one display
 * state instead of forwarding events. Three rules matter:
 *
 *   - One strip. Updates are throttled and coalesced so a fast tool loop cannot
 *     flood the pet window; a burst of events becomes one card update.
 *   - No-op events are dropped. If nothing a user could read changed, the pet
 *     is not touched.
 *   - A second bridge cannot blank the first. The strip belongs to the bridge
 *     whose turn started it; a background turn's completion is ignored.
 *
 * Rendering lives in `clawd-integration.showClawdActivity`, which owns the
 * suppression rules (DND, hidden bubbles, an attention card already up).
 */

import { createLogger } from './utils/logger'
import { hideClawdActivity, showClawdActivity } from './clawd-integration'

const log = createLogger('pet-activity')

export type PetActivityPhase = 'idle' | 'thinking' | 'tool' | 'awaiting' | 'error'

export interface PetActivity {
  phase: PetActivityPhase
  /** Tool card name as the renderer knows it ("Bash", "Edit", …). */
  toolName?: string
  /** When the turn began, for the TURN meta row. */
  turnStartedAt?: number
  /** Tools finished this turn; drives the TOOLS progress label. */
  toolCount: number
  /** ≤80 chars from the tool input: the command, path or query. */
  preview?: string
}

/**
 * The narrow slice of bridge events the reducer needs. Deliberately not the
 * bridge's own payload types: the wiring layer maps one event to one field,
 * and the reducer never reaches into a protocol shape.
 */
export interface PetActivityEvent {
  type:
    | 'turn-start'
    | 'thinking'
    | 'tool-start'
    | 'tool-finish'
    | 'awaiting'
    | 'turn-error'
    | 'turn-complete'
    | 'reset'
  /** Bridge that raised the event; used only to keep concurrent turns apart. */
  bridgeId?: string
  toolId?: string
  toolName?: string
  input?: Record<string, unknown>
  message?: string
  outcome?: string
}

/** A fast tool loop must not repaint the pet on every event. */
const MIN_UPDATE_MS = 700
/**
 * Re-sending an unchanged state is not free: it resets the strip's TTL and
 * redraws the TURN clock. After this gap an identical state is worth a refresh
 * (the card may have auto-hidden), while a true burst still collapses.
 */
const SAME_STATE_REDRAW_MS = 1500
const PREVIEW_LIMIT = 80

/** Fields that read best as a one-line preview, in the order a human scans them. */
const PREVIEW_KEYS = ['command', 'file_path', 'path', 'query', 'pattern', 'url', 'description']

let activity: PetActivity = { phase: 'idle', toolCount: 0 }
/** Which bridge owns the strip; null when idle. */
let owner: string | null = null
/** Tool ids already counted, so a re-emitted completed item is not counted twice. */
const finishedTools = new Set<string>()

let lastDrawAt = 0
let drawTimer: NodeJS.Timeout | null = null
let lastDrawn: PetActivity | null = null
let lastDrawnAt = 0

function clipPreview(value: string | undefined): string | undefined {
  if (!value) return undefined
  const flat = value.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > PREVIEW_LIMIT ? `${flat.slice(0, PREVIEW_LIMIT - 1)}…` : flat
}

/** The most human field of a tool input, clipped to one line. */
function toolPreview(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined
  for (const key of PREVIEW_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return clipPreview(value)
  }
  // MCP and dynamic tools name their fields arbitrarily; any string beats
  // showing nothing at all.
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) return clipPreview(value)
  }
  return undefined
}

function normalizeToolName(value: string | undefined): string | undefined {
  if (!value) return undefined
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat || undefined
}

function sameActivity(a: PetActivity, b: PetActivity): boolean {
  return a.phase === b.phase
    && a.toolName === b.toolName
    && a.preview === b.preview
    && a.toolCount === b.toolCount
    && a.turnStartedAt === b.turnStartedAt
}

/** A turn started on a bridge: the strip adopts it and forgets the last one. */
function beginTurn(bridgeId?: string): void {
  // A second start from the bridge that already owns the strip is not a new
  // turn: older engines emit `message_start` per assistant message, and
  // resetting here would snap TURN back to 00:00 and TOOLS to zero after every
  // tool round. Only an idle strip, or a different bridge, starts a turn.
  if (bridgeId && bridgeId === owner && activity.phase !== 'idle') return
  owner = bridgeId ?? owner
  activity = { phase: 'thinking', turnStartedAt: Date.now(), toolCount: 0 }
  finishedTools.clear()
}

/**
 * Record one agent event. Cheap and safe from any event handler; rendering is
 * asynchronous and throttled.
 */
export function notePetActivity(event: PetActivityEvent): void {
  if (!event || !event.type) return

  if (event.type === 'turn-complete' || event.type === 'reset') {
    // A completion from another bridge must not blank a turn that is still
    // running here. Only the owner (or nobody) may end the strip.
    if (event.bridgeId && owner && event.bridgeId !== owner) return
    resetPetActivity()
    return
  }

  // A new turn on another bridge takes over the one strip. Mid-turn events from
  // a non-owner are ignored instead of stealing or clearing the display.
  if (event.bridgeId && owner && event.bridgeId !== owner) {
    if (event.type !== 'turn-start' && event.type !== 'thinking') return
  }

  const before = { ...activity }

  switch (event.type) {
    case 'turn-start':
      beginTurn(event.bridgeId)
      break
    case 'thinking':
      if (activity.phase === 'idle') beginTurn(event.bridgeId)
      // A tool mid-flight or a pending approval is the truer state; a stray
      // delta must not make the strip claim the agent is back to thinking.
      else if (activity.phase !== 'tool' && activity.phase !== 'awaiting') {
        activity = { ...activity, phase: 'thinking', preview: undefined }
      }
      break
    case 'tool-start':
      if (activity.phase === 'idle') beginTurn(event.bridgeId)
      activity = {
        ...activity,
        phase: 'tool',
        toolName: normalizeToolName(event.toolName),
        preview: toolPreview(event.input),
      }
      break
    case 'tool-finish': {
      if (activity.phase === 'idle') break
      const id = event.toolId ?? ''
      // `plan-*` is a synthetic result the bridge emits to close the checklist
      // card, not something the user watched run.
      const synthetic = id.startsWith('plan-')
      const countable = !synthetic && (!id || !finishedTools.has(id))
      if (countable && id) finishedTools.add(id)
      activity = {
        ...activity,
        phase: 'thinking',
        toolName: undefined,
        preview: undefined,
        toolCount: countable ? activity.toolCount + 1 : activity.toolCount,
      }
      break
    }
    case 'awaiting':
      if (activity.phase === 'idle') beginTurn(event.bridgeId)
      activity = { ...activity, phase: 'awaiting' }
      break
    case 'turn-error':
      if (activity.phase === 'idle') beginTurn(event.bridgeId)
      activity = { ...activity, phase: 'error', preview: clipPreview(event.message) }
      break
  }

  if (sameActivity(before, activity)) return
  scheduleDraw()
}

/** The current display state (a copy; callers must not mutate the reducer). */
export function getPetActivity(): PetActivity {
  return { ...activity }
}

/**
 * The bridge whose turn owns the strip, or null when idle. The pet's STOP
 * petal needs this to stop exactly the turn the user is watching: the main
 * process has no other "current conversation" notion, and aborting
 * `firstLive()` could kill a different, idle bridge instead.
 */
export function getPetActivityOwner(): string | null {
  return owner
}

/** Clear the strip and return to idle. Used on completion, failure and exit. */
export function resetPetActivity(): void {
  if (drawTimer) {
    clearTimeout(drawTimer)
    drawTimer = null
  }
  activity = { phase: 'idle', toolCount: 0 }
  owner = null
  finishedTools.clear()
  lastDrawn = null
  lastDrawnAt = 0
  lastDrawAt = 0
  hideClawdActivity()
}

function scheduleDraw(): void {
  if (activity.phase === 'idle') return
  const wait = MIN_UPDATE_MS - (Date.now() - lastDrawAt)
  if (wait <= 0) {
    if (drawTimer) {
      clearTimeout(drawTimer)
      drawTimer = null
    }
    draw()
    return
  }
  // Already holding a slot: the burst collapses into the draw that fires next.
  if (drawTimer) return
  drawTimer = setTimeout(() => {
    drawTimer = null
    draw()
  }, wait)
  drawTimer.unref?.()
}

function draw(): void {
  if (activity.phase === 'idle') return
  const snapshot: PetActivity = { ...activity }
  const now = Date.now()
  // Count this attempt even when it is skipped: the throttle is about how often
  // the pet may be touched, not about how often state happened to change.
  lastDrawAt = now
  // An identical state is skipped only inside the coalescing window. Past it,
  // the card may have auto-hidden, and a silent turn that keeps reporting the
  // same state must be able to bring its strip back.
  if (lastDrawn && sameActivity(lastDrawn, snapshot) && now - lastDrawnAt < SAME_STATE_REDRAW_MS) {
    return
  }
  let shown = false
  try {
    shown = showClawdActivity(snapshot)
  } catch (err) {
    log.warn('activity draw failed:', String(err))
  }
  // A suppressed draw is not remembered: the next event retries, in case an
  // attention card has cleared by then.
  lastDrawn = shown ? snapshot : null
  if (shown) lastDrawnAt = now
}
