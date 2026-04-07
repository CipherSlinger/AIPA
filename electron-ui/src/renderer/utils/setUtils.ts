// setUtils — Set utility functions (Iteration 498)
// Ported from Claude Code sourcemap: src/utils/set.ts
// Hot-path optimized for speed.

/**
 * Returns elements in `a` that are not in `b`.
 * @example difference(new Set([1,2,3]), new Set([2,3])) → Set {1}
 */
export function difference<A>(a: Set<A>, b: Set<A>): Set<A> {
  const result = new Set<A>()
  for (const item of a) {
    if (!b.has(item)) result.add(item)
  }
  return result
}

/**
 * Returns true if sets `a` and `b` share at least one element.
 * @example intersects(new Set([1,2]), new Set([2,3])) → true
 */
export function intersects<A>(a: Set<A>, b: Set<A>): boolean {
  if (a.size === 0 || b.size === 0) return false
  for (const item of a) {
    if (b.has(item)) return true
  }
  return false
}

/**
 * Returns true if every element of `a` is also in `b`.
 * @example every(new Set([1,2]), new Set([1,2,3])) → true
 */
export function every<A>(a: ReadonlySet<A>, b: ReadonlySet<A>): boolean {
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

/**
 * Returns the union of two sets.
 * @example union(new Set([1,2]), new Set([2,3])) → Set {1, 2, 3}
 */
export function union<A>(a: Set<A>, b: Set<A>): Set<A> {
  const result = new Set<A>()
  for (const item of a) result.add(item)
  for (const item of b) result.add(item)
  return result
}
