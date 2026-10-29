/**
 * The reasoning-effort levels a scheduled job may choose — one list, three readers.
 *
 * Before this file the same union was written out by hand in the renderer
 * (`EffortPicker`, the status bar, the prefs type) and never in main, because the
 * effort was a global preference: there was nothing in the main process that
 * needed to name a level. A job now carries its own level, so the store's
 * whitelist, the scheduler's resolver and the dialog must agree on what a level
 * is; a second literal list would let the dialog offer a value the store drops.
 *
 * This module deliberately imports nothing. That is what makes it safe to load
 * from the renderer bundle as well as the main process — the dialog imports the
 * array directly instead of restating it. `src/preload/index.ts` still repeats
 * the union as a type, as it does for every automation field: a type cannot cross
 * the process boundary and the preload build has its own `rootDir`.
 */
export const AUTOMATION_EFFORT_LEVELS = ['auto', 'low', 'medium', 'high', 'max'] as const

export type AutomationEffort = (typeof AUTOMATION_EFFORT_LEVELS)[number]

export function isAutomationEffort(value: unknown): value is AutomationEffort {
  return typeof value === 'string' &&
    (AUTOMATION_EFFORT_LEVELS as readonly string[]).includes(value)
}

/**
 * A stored or submitted effort, or undefined when it is not one of the levels.
 *
 * `auto` is kept, not folded into absent: it is how a job says "never follow the
 * app default — let the engine decide", which is a different promise from "use
 * whatever the app is set to on the night". Absent means the latter.
 *
 * An unknown value is dropped rather than rejected, like `personaId` and
 * `missedRunPolicy`: effort is not a safety rail, and refusing the whole save
 * would be a harsher outcome than falling back to the app default.
 */
export function normalizeJobEffort(value: unknown): AutomationEffort | undefined {
  return isAutomationEffort(value) ? value : undefined
}

/**
 * What an unattended run should actually send, given the job's choice and the
 * app's preference *as read at run time*.
 *
 * The global is passed in rather than read here so the scheduler is the only
 * place that knows about prefs, and so this rule is testable without Electron.
 *
 * `auto` resolves to `undefined` at this last step: neither engine takes a
 * turn-level "auto". The chat path omits the field for `auto` too, and an
 * automation must behave exactly like a chat turn with the same setting.
 */
export function resolveRunEffort(
  jobEffort: AutomationEffort | undefined,
  globalEffort: unknown,
): AutomationEffort | undefined {
  const chosen = jobEffort ?? normalizeJobEffort(globalEffort)
  return chosen === 'auto' ? undefined : chosen
}
