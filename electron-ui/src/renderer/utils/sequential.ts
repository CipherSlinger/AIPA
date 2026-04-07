// sequential — Sequential async execution wrapper (Iteration 501)
// Ported from Claude Code sourcemap: src/utils/sequential.ts
// Ensures concurrent calls to an async function run one at a time in order.

/**
 * Wraps an async function so concurrent calls are executed sequentially
 * (one at a time, in the order they arrived). Return values are preserved
 * per-call — each caller gets back the result of their own invocation.
 *
 * Useful for protecting writes, IPC calls, or any operation that would
 * cause conflicts if executed concurrently.
 *
 * @example
 * const safeSave = sequential(async (data) => { await writeFile(data) })
 * // Concurrent calls queue up instead of racing:
 * void safeSave(a)  // starts immediately
 * void safeSave(b)  // waits for a to finish
 */
export function sequential<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  const queue: Array<{
    args: T
    resolve: (value: R) => void
    reject: (reason?: unknown) => void
    context: unknown
  }> = []
  let processing = false

  async function processQueue(): Promise<void> {
    if (processing) return
    if (queue.length === 0) return

    processing = true

    while (queue.length > 0) {
      const { args, resolve, reject, context } = queue.shift()!
      try {
        const result = await fn.apply(context as ThisParameterType<typeof fn>, args)
        resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    processing = false

    if (queue.length > 0) void processQueue()
  }

  return function (this: unknown, ...args: T): Promise<R> {
    return new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject, context: this })
      void processQueue()
    })
  }
}
