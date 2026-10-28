/**
 * `thread/goal/updated` → the quiet goal line above the composer.
 *
 * Verified against `.scratch/codex-schema/v2/ThreadGoalUpdatedNotification.json`
 * (0.145) and the literal discriminants in the installed `codex.exe`:
 *
 *   method: 'thread/goal/updated'
 *   params: {
 *     threadId: string
 *     turnId?: string | null
 *     goal: {
 *       threadId: string
 *       objective: string
 *       status: 'active' | 'paused' | 'blocked'
 *             | 'usageLimited' | 'budgetLimited' | 'complete'
 *       createdAt: int64       // unit not stated by the schema — not used
 *       updatedAt: int64       // ditto
 *       timeUsedSeconds: int64 // unit is in the field name
 *       tokensUsed: int64
 *       tokenBudget?: int64 | null
 *     }
 *   }
 *
 * A goal is a standing objective for the thread, not a per-turn plan. The
 * line therefore states the objective and the status the engine named, and
 * (only when the payload carries a budget) the raw used/budget token counts.
 * No percentage or progress bar is derived here.
 *
 * This module is pure: it knows nothing about IPC or the store. The caller
 * decides whether the event belongs to the conversation on screen; the
 * store clears the goal on `thread/goal/cleared` or a conversation change.
 */

export type ThreadGoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'usageLimited'
  | 'budgetLimited'
  | 'complete'

const THREAD_GOAL_STATUSES = new Set<string>([
  'active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete',
])

/** The slice the composer strip renders, validated from the wire. */
export interface ThreadGoalView {
  threadId: string
  objective: string
  /** `null` for a status this build does not know; the line omits the label. */
  status: ThreadGoalStatus | null
  tokensUsed: number | null
  tokenBudget: number | null
}

/** What `describeThreadGoalLine` hands the JSX: already-localized strings. */
export interface ThreadGoalLine {
  /** t('codex.threadGoal.label') — names what the objective text is. */
  label: string
  /** The engine's own sentence, whitespace-collapsed for a one-line strip. */
  objective: string
  /** Localized status, or null when the engine named a status we cannot label. */
  status: string | null
  /** Localized used/budget counts, or null when the payload has no budget. */
  budget: string | null
  /** aria-label for the non-interactive line. */
  aria: string
  /** Tooltip: the full objective, which the ellipsized line may truncate. */
  title: string
}

type Translate = (key: string, params?: Record<string, string | number>) => string

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonNegativeIntOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Validate one `cli:threadGoalUpdated` payload. Null means the line must not
 * change: a missing nested goal, a blank objective, or the notification id
 * disagreeing with `goal.threadId` cannot be attributed honestly. A status
 * outside the enum is kept as `null` (objective still shown) rather than
 * guessed at.
 */
export function readThreadGoalNotice(raw: unknown): ThreadGoalView | null {
  const payload = asRecord(raw)
  const goal = asRecord(payload?.goal)
  if (!goal) return null

  const goalThreadId = typeof goal.threadId === 'string' ? goal.threadId.trim() : ''
  const notificationThreadId = typeof payload?.threadId === 'string' ? payload.threadId.trim() : ''
  if (!goalThreadId) return null
  if (notificationThreadId && notificationThreadId !== goalThreadId) return null

  // One line, no layout-breaking newlines; the words are unchanged.
  const objective = typeof goal.objective === 'string'
    ? goal.objective.replace(/\s+/g, ' ').trim()
    : ''
  if (!objective) return null

  const rawStatus = goal.status
  const status = typeof rawStatus === 'string' && THREAD_GOAL_STATUSES.has(rawStatus)
    ? rawStatus as ThreadGoalStatus
    : null

  return {
    threadId: goalThreadId,
    objective,
    status,
    tokensUsed: nonNegativeIntOrNull(goal.tokensUsed),
    tokenBudget: nonNegativeIntOrNull(goal.tokenBudget),
  }
}

/**
 * Map a validated goal to the line's segments, or null when there is no goal.
 * The budget segment appears only when the payload carries a positive budget
 * and a used count — both numbers are shown verbatim (locale-grouped), never
 * turned into a percentage.
 */
export function describeThreadGoalLine(
  goal: ThreadGoalView | null,
  t: Translate,
): ThreadGoalLine | null {
  if (!goal) return null
  const showBudget = goal.tokenBudget !== null
    && goal.tokenBudget > 0
    && goal.tokensUsed !== null
  return {
    label: t('codex.threadGoal.label'),
    objective: goal.objective,
    status: goal.status ? t(`codex.threadGoal.status.${goal.status}`) : null,
    budget: showBudget
      ? t('codex.threadGoal.tokens', {
          used: goal.tokensUsed!.toLocaleString(),
          budget: goal.tokenBudget!.toLocaleString(),
        })
      : null,
    aria: t('codex.threadGoal.aria'),
    title: goal.objective,
  }
}

/**
 * Whether a `thread/goal/cleared` report may retire the goal on screen.
 *
 * The cleared payload names only a thread, so a cleared event for a
 * different thread is about somebody else's conversation. A missing id is
 * malformed and never clears: the strip stays until a well-formed signal.
 */
export function shouldClearThreadGoal(
  current: ThreadGoalView | null,
  clearedThreadId: unknown,
): boolean {
  if (!current) return false
  if (typeof clearedThreadId !== 'string') return false
  const threadId = clearedThreadId.trim()
  return !!threadId && threadId === current.threadId
}
