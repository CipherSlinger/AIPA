import { useMemo } from 'react'

/**
 * Provides inline calculator evaluation for the chat input.
 */
export function useInputCompletion(
  input: string,
  slashQuery: string | null,
  atQuery: string | null,
) {
  // Ghost text removed (prompt history feature removed)
  const ghostText = ''

  // Inline calculator: detect "= expression" and evaluate
  const calcResult = useMemo(() => {
    const trimmed = input.trim()
    if (!trimmed.startsWith('=') || trimmed.length < 2) return null
    const expr = trimmed.slice(1).trim()
    if (!expr) return null
    if (!/^[\d\s+\-*/().,%^]+$/.test(expr)) return null
    try {
      let sanitized = expr
        .replace(/\^/g, '**')
        .replace(/(\d)%/g, '$1/100')
        .replace(/,/g, '')
      if (!sanitized.trim() || /[a-zA-Z_$]/.test(sanitized)) return null
      const fn = new Function(`"use strict"; return (${sanitized})`)
      const result = fn()
      if (typeof result !== 'number' || !isFinite(result)) return null
      return Number(result.toFixed(10)).toString()
    } catch {
      return null
    }
  }, [input])

  return { ghostText, calcResult }
}
