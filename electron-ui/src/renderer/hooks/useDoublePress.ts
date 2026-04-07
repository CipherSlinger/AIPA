// useDoublePress — double-press detection hook (Iteration 493)
// Ported from Claude Code sourcemap: src/hooks/useDoublePress.ts
// Usage: detect double-press on Escape (clear input) or other keys.

import { useCallback, useEffect, useRef } from 'react'

export const DOUBLE_PRESS_TIMEOUT_MS = 800

/**
 * Returns a handler function. Call it on each key press.
 * - First press: calls onFirstPress (optional), sets pending state
 * - Second press within DOUBLE_PRESS_TIMEOUT_MS: calls onDoublePress
 *
 * @param setPending - Called with true on first press, false when timeout/double fires
 * @param onDoublePress - Called when double press is detected
 * @param onFirstPress - Optional callback for first press
 */
export function useDoublePress(
  setPending: (pending: boolean) => void,
  onDoublePress: () => void,
  onFirstPress?: () => void,
): () => void {
  const lastPressRef = useRef<number>(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = undefined
    }
  }, [])

  useEffect(() => {
    return () => { clearTimeoutSafe() }
  }, [clearTimeoutSafe])

  return useCallback(() => {
    const now = Date.now()
    const timeSinceLastPress = now - lastPressRef.current
    const isDoublePress =
      timeSinceLastPress <= DOUBLE_PRESS_TIMEOUT_MS &&
      timeoutRef.current !== undefined

    if (isDoublePress) {
      clearTimeoutSafe()
      setPending(false)
      onDoublePress()
    } else {
      onFirstPress?.()
      setPending(true)
      clearTimeoutSafe()
      timeoutRef.current = setTimeout(
        (sp: (p: boolean) => void, tr: typeof timeoutRef) => {
          sp(false)
          tr.current = undefined
        },
        DOUBLE_PRESS_TIMEOUT_MS,
        setPending,
        timeoutRef,
      )
    }

    lastPressRef.current = now
  }, [setPending, onDoublePress, onFirstPress, clearTimeoutSafe])
}
