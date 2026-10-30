/**
 * Escape-key handler stack.
 *
 * The view-level Escape handler in `AppShell` registers a capture-phase
 * `keydown` listener on `window` when it mounts, so it always fires before any
 * listener a nested overlay adds later — Escape would close the whole view
 * instead of the innermost layer (e.g. it would leave Settings entirely rather
 * than just closing the open overlay).
 *
 * Usage — push a handler while your layer is open, and let the view-level
 * handler consult the stack before acting on the key:
 *
 *   const release = pushEscapeHandler(() => setOpen(false))
 *   // ...
 *   if (runTopEscape()) return   // a deeper layer consumed it
 *   closeView()
 */

type EscapeHandler = () => void

const stack: EscapeHandler[] = []

/**
 * Register `handler` as the innermost Escape target. Returns a release
 * function; call it when the layer closes (idempotent — safe to call from a
 * `useEffect` cleanup even if the handler already ran).
 */
export function pushEscapeHandler(handler: EscapeHandler): () => void {
  stack.push(handler)
  let released = false
  return () => {
    if (released) return
    released = true
    const i = stack.lastIndexOf(handler)
    if (i !== -1) stack.splice(i, 1)
  }
}

/**
 * Run the innermost handler. Returns true if one consumed the key, meaning the
 * caller should leave the event alone.
 */
export function runTopEscape(): boolean {
  const handler = stack[stack.length - 1]
  if (!handler) return false
  handler()
  return true
}
