import { useMemo } from 'react'
import { PromptHistoryItem } from '../../types/app.types'
import { usePrefsStore } from '../../store'

/**
 * Provides ghost-text autocomplete from prompt history and inline calculator evaluation.
 */
export function useInputCompletion(
  input: string,
  slashQuery: string | null,
  atQuery: string | null,
) {
  const prefs = usePrefsStore((s) => s.prefs)
  const promptHistory: PromptHistoryItem[] = prefs.promptHistory || []

  // Ghost text autocomplete from prompt history
  const ghostText = useMemo(() => {
    const trimmed = input.trimStart()
    if (trimmed.length < 3 || slashQuery !== null || atQuery !== null) return ''
    const lower = trimmed.toLowerCase()
    let best: PromptHistoryItem | null = null
    for (const item of promptHistory) {
      const itemLower = item.text.toLowerCase()
      if (
        itemLower.startsWith(lower) &&
        itemLower !== lower
      ) {
        if (
          !best ||
          item.count > best.count ||
          (item.count === best.count && item.lastUsedAt > best.lastUsedAt)
        ) {
          best = item
        }
      }
    }
    if (!best) return ''
    return best.text.slice(trimmed.length)
  }, [input, promptHistory, slashQuery, atQuery])

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
