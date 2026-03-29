import { usePrefsStore } from '../store'
import { PromptHistoryItem } from '../types/app.types'

const MAX_HISTORY = 200

function hashPrompt(text: string): string {
  let hash = 0
  const normalized = text.trim().toLowerCase().slice(0, 200)
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  return `ph-${Math.abs(hash).toString(36)}`
}

export function recordPrompt(text: string): void {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length < 3) return

  const prefs = usePrefsStore.getState().prefs
  const history: PromptHistoryItem[] = prefs.promptHistory || []
  const id = hashPrompt(trimmed)
  const now = Date.now()

  const existing = history.find(h => h.id === id)
  let updated: PromptHistoryItem[]

  if (existing) {
    updated = history.map(h =>
      h.id === id
        ? { ...h, count: h.count + 1, lastUsedAt: now, text: trimmed.slice(0, 500) }
        : h
    )
  } else {
    const newItem: PromptHistoryItem = {
      id,
      text: trimmed.slice(0, 500),
      count: 1,
      lastUsedAt: now,
      firstUsedAt: now,
    }
    updated = [newItem, ...history].slice(0, MAX_HISTORY)
  }

  usePrefsStore.getState().setPrefs({ promptHistory: updated })
}
