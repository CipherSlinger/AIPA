/**
 * Single-flight guard for `session:list`.
 *
 * Building the list means scanning every transcript on disk — cheap once the
 * summary index is warm (~50 ms), expensive on the first call of a launch.
 * Several components ask for it independently (app boot, department view,
 * post-turn refresh, title edits), and they tend to ask at the same moment:
 * right after a turn completes. Sharing one in-flight request keeps a burst of
 * callers from each paying for a full scan.
 *
 * A failed request clears the slot so the next caller retries, and a resolved
 * one clears it too — callers must always see fresh data, so this is a
 * de-duplicator, not a cache.
 */
let inFlight: Promise<unknown[] | null> | null = null

export function listSessionsShared(): Promise<unknown[] | null> {
  if (inFlight) return inFlight
  const request = window.electronAPI.sessionList()
    .then((list: unknown) => (list as unknown[]) ?? null)
    .catch(() => null)
    .finally(() => {
      // Only clear if this is still the current request.
      if (inFlight === request) inFlight = null
    })
  inFlight = request
  return request
}