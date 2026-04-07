// hashUtils — Non-cryptographic hash functions (Iteration 502)
// Ported from Claude Code sourcemap: src/utils/hash.ts
// djb2 is deterministic across runtimes — stable for color/index derivation.

/**
 * djb2 string hash — fast non-cryptographic hash returning a signed 32-bit int.
 * Deterministic across runtimes. Use for color assignment, cache keys,
 * or any stable mapping from string → number.
 *
 * @example djb2Hash('hello') → some stable number
 */
export function djb2Hash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

/**
 * Returns a stable non-negative hash index for use in array lookups.
 * Equivalent to Math.abs(djb2Hash(str)) % length.
 *
 * @example pickIndex('session-abc', colors.length) → a consistent color index
 */
export function hashIndex(str: string, length: number): number {
  return Math.abs(djb2Hash(str)) % length
}
