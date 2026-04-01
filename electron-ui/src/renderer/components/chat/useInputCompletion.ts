import { useMemo } from 'react'

/**
 * Provides inline calculator evaluation and prompt suggestion ghost text for the chat input.
 */
export function useInputCompletion(
  input: string,
  slashQuery: string | null,
  atQuery: string | null,
  promptSuggestion?: string | null,
) {
  // Ghost text: show prompt suggestion when input is empty and no popups are active
  const ghostText = (!input.trim() && !slashQuery && !atQuery && promptSuggestion) ? promptSuggestion : ''

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
