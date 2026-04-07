// useTimeout — returns true after a delay elapses (Iteration 497)
// Ported from Claude Code sourcemap: src/hooks/useTimeout.ts
// Useful for showing elements only after N ms (avoid flash on fast operations).

import { useEffect, useState } from 'react'

/**
 * Returns false initially, then true once `delay` ms have elapsed.
 * Resets if `delay` or `resetTrigger` changes.
 *
 * @example
 * // Show a loading spinner only if operation takes > 200ms
 * const showSpinner = useTimeout(200)
 * return showSpinner ? <Spinner /> : null
 */
export function useTimeout(delay: number, resetTrigger?: number): boolean {
  const [isElapsed, setIsElapsed] = useState(false)

  useEffect(() => {
    setIsElapsed(false)
    const timer = setTimeout(setIsElapsed, delay, true)
    return () => clearTimeout(timer)
  }, [delay, resetTrigger])

  return isElapsed
}
