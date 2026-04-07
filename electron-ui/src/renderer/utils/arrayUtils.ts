// arrayUtils — utility functions for arrays (Iteration 494)
// Ported from Claude Code sourcemap: src/utils/array.ts

/**
 * Intersperses a separator between each element of an array.
 * @example intersperse(['a', 'b', 'c'], i => `|${i}`) → ['a', '|1', 'b', '|2', 'c']
 */
export function intersperse<A>(as: A[], separator: (index: number) => A): A[] {
  return as.flatMap((a, i) => (i ? [separator(i), a] : [a]))
}

/**
 * Counts elements in an array matching a predicate.
 * @example count([1, 2, 3, 4], x => x % 2 === 0) → 2
 */
export function count<T>(arr: readonly T[], pred: (x: T) => unknown): number {
  let n = 0
  for (const x of arr) n += +!!pred(x)
  return n
}

/**
 * Returns unique elements from an iterable (preserves insertion order).
 * @example uniq([1, 2, 1, 3, 2]) → [1, 2, 3]
 */
export function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)]
}
