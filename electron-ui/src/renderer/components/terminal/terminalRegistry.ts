/**
 * Imperative handles for the mounted xterm instances.
 *
 * The dock header (Clear, focus on activation) lives outside a tab's component,
 * but xterm instances are owned by the tabs. A tiny registry bridges the two
 * without lifting the terminals into React state — which would recreate them
 * on every render, the exact thing this wave must not do.
 */

export interface TerminalHandle {
  clear: () => void
  focus: () => void
}

const handles = new Map<string, TerminalHandle>()

/** Returns an unregister function; unregistering a replaced handle is a no-op. */
export function registerTerminalHandle(tabId: string, handle: TerminalHandle): () => void {
  handles.set(tabId, handle)
  return () => {
    if (handles.get(tabId) === handle) handles.delete(tabId)
  }
}

export function getTerminalHandle(tabId: string): TerminalHandle | null {
  return handles.get(tabId) ?? null
}

export function clearTerminal(tabId: string): boolean {
  const handle = handles.get(tabId)
  if (!handle) return false
  handle.clear()
  return true
}

export function focusTerminal(tabId: string): boolean {
  const handle = handles.get(tabId)
  if (!handle) return false
  handle.focus()
  return true
}

export function terminalHandleCount(): number {
  return handles.size
}
