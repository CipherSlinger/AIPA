/**
 * The department a scheduled job is filed under.
 *
 * The org tree lives only in the renderer's localStorage, so the main process
 * cannot look a node up, prove it still exists, or supply a name. All it can
 * check is the shape of the stored value: a trimmed, non-empty id of bounded
 * length — or nothing at all. It never invents a fallback id and never rewrites
 * a stale one; whether an id still resolves is the renderer's question, and the
 * renderer is the only place allowed to show (or re-file) it.
 *
 * This field is attribution, not execution. It is never read when resolving a
 * run's working directory or model, so a job filed under a department does not
 * run "in" it.
 *
 * The one thing it now selects is context: an unattended run reads the desk's
 * handbook from the renderer's snapshot (`dept-handbook.ts`) and prepends it to
 * the prompt envelope, exactly as chat does. That is the department's standing
 * rules, not its folder — the run still executes where the job's action says.
 */

/**
 * Longest id this store accepts. Org ids are generated locally and far shorter,
 * but a hand-edited or synced file could carry anything; bounding it keeps
 * `automations.json` from growing an unusable slab of text.
 */
export const MAX_DEPARTMENT_ID_CHARS = 100

/**
 * A storable department id, or `undefined` when the value is not usable.
 *
 * Whitespace-only, non-string and oversized values all read as "no department"
 * rather than as an error: a corrupt byte must not prevent the job itself from
 * loading, and the job store calls the same function on every read.
 */
export function normalizeDepartmentId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  if (!id || id.length > MAX_DEPARTMENT_ID_CHARS) return undefined
  return id
}

/**
 * The department a *create* request may store.
 *
 * A plugin-created job can never be filed under a department. The plugin
 * `schedule` capability has no such field in its request shape, and this drops
 * any value that reaches the scheduler's plugin entry point anyway — a
 * smuggled id must not become a fact about where the plugin's job belongs.
 * A user-made job keeps a well-formed id.
 */
export function departmentIdForCreate(value: unknown, pluginOwned: boolean): string | undefined {
  if (pluginOwned) return undefined
  return normalizeDepartmentId(value)
}
