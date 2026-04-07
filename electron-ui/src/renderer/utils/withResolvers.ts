// withResolvers -- Promise.withResolvers() polyfill (Iteration 503)
// Ported from Claude Code sourcemap: src/utils/withResolvers.ts
// ES2024 / Node 22+ native; polyfill for Node 18+ compatibility.

/** Local type definition for PromiseWithResolvers (ES2024, not available in all tsconfigs) */
interface PromiseWithResolversResult<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

/**
 * Polyfill for Promise.withResolvers() (ES2024, Node 22+).
 * Returns { promise, resolve, reject } -- useful for converting callback-based
 * APIs to promises, or for deferred resolution patterns.
 *
 * @example
 * const { promise, resolve } = withResolvers<string>()
 * setTimeout(() => resolve('done'), 1000)
 * const result = await promise // 'done'
 */
export function withResolvers<T>(): PromiseWithResolversResult<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
