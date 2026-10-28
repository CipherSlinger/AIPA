/**
 * useAutoMemory -- Automatic memory extraction from conversations.
 * Inspired by Claude Code's services/extractMemories/extractMemories.ts.
 *
 * After each assistant response, if autoMemoryEnabled is true,
 * scans the last exchange for durable facts/preferences/instructions
 * and saves them to the user's memory store.
 */
import { useCallback, useRef } from 'react'
import { useChatStore, usePrefsStore, useUiStore } from '../store'
import { StandardChatMessage, MemoryItem, MemoryCategory, MemoryType } from '../types/app.types'
import { useT } from '../i18n'
import { suggestMemoryType } from '../components/memory/memoryConstants'

const EXTRACT_PROMPT = `Analyze the conversation below and extract any durable memories worth saving for future conversations. Focus on:

1. User preferences (e.g., "I prefer concise answers", "I work with TypeScript")
2. Personal facts (e.g., "My project is called X", "I'm a data scientist")
3. Instructions (e.g., "Always explain in simple terms", "Don't use emojis")
4. Context (e.g., "Working on a React migration", "Deadline is Friday")

Return a JSON array of objects with these fields:
- "content": the memory text (max 200 chars, self-contained)
- "category": one of "preference", "fact", "instruction", "context"
- "memoryType": one of "user", "feedback", "project", "reference" — map as: user=about the person, feedback=correction/style guidance, project=ongoing work/deadline, reference=external link/tool

If nothing worth remembering, return an empty array: []
Return ONLY the JSON array, no other text.`

/** Rate limit: extract at most once per 5 minutes */
const EXTRACT_COOLDOWN_MS = 5 * 60 * 1000

export function useAutoMemory() {
  const t = useT()
  const isExtractingRef = useRef(false)
  const lastExtractRef = useRef(0)

  const tryExtractMemories = useCallback(async () => {
    const prefs = usePrefsStore.getState().prefs
    if (!prefs.autoMemoryEnabled) return

    if (isExtractingRef.current) return
    if (Date.now() - lastExtractRef.current < EXTRACT_COOLDOWN_MS) return

    const messages = useChatStore.getState().messages
    const chatMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant') as StandardChatMessage[]

    // Need at least 4 messages (2 exchanges) to have meaningful context
    if (chatMessages.length < 4) return

    isExtractingRef.current = true
    lastExtractRef.current = Date.now()

    try {
      // Take the last 6 messages for analysis
      const recentMessages = chatMessages.slice(-6)
      const conversationText = recentMessages
        .map(m => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 1000)}`)
        .join('\n\n')

      // The extraction turn runs on its own internal bridge: its tokens never
      // reach the chat channels, and the final text comes back from the invoke.
      const result = await window.electronAPI.cliRunInternal({
        prompt: `${conversationText}\n\n${EXTRACT_PROMPT}`,
        cwd: prefs.workingDir || await window.electronAPI.fsGetHome(),
        model: prefs.advisorModel || prefs.model,
        timeoutMs: 90_000,
      })
      if (!result?.success || !result.text) return

      // Parse JSON from the response
      const jsonMatch = result.text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return

      let extracted: { content: string; category: MemoryCategory; memoryType?: string }[]
      try {
        extracted = JSON.parse(jsonMatch[0])
      } catch {
        return
      }

      if (!Array.isArray(extracted) || extracted.length === 0) return

      // Deduplicate against existing memories
      const existingMemories = prefs.memories || []
      const existingContents = new Set(existingMemories.map(m => m.content.toLowerCase()))

      const VALID_MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference']
      const newMemories: MemoryItem[] = extracted
        .filter(e => e.content && e.category && !existingContents.has(e.content.toLowerCase()))
        .slice(0, 3) // Max 3 new memories per extraction
        .map(e => ({
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          content: e.content.slice(0, 500),
          category: (['preference', 'fact', 'instruction', 'context'].includes(e.category)
            ? e.category
            : 'context') as MemoryCategory,
          // Use AI-provided memoryType if valid, else auto-suggest from content (Iteration 480)
          memoryType: (e.memoryType && VALID_MEMORY_TYPES.includes(e.memoryType as MemoryType)
            ? e.memoryType as MemoryType
            : suggestMemoryType(e.content)),
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: 'auto',
        }))

      if (newMemories.length === 0) return

      // Check limit (200 max)
      const totalAfter = existingMemories.length + newMemories.length
      if (totalAfter > 200) return

      // This electron-store list is the prompt's "personal" memory tier: see
      // assembleMemoryContext() in promptMemory.ts. Reader and writer are
      // deliberately the same store — do not redirect one without the other.
      const updatedMemories = [...existingMemories, ...newMemories]
      usePrefsStore.getState().setPrefs({ memories: updatedMemories })
      window.electronAPI.prefsSet('memories', updatedMemories)

      // Toast notification
      useUiStore.getState().addToast('info',
        t('autoMemory.extracted', { count: String(newMemories.length) })
      )
    } catch {
      // Silent failure -- auto-memory is best-effort
    } finally {
      isExtractingRef.current = false
    }
  }, [t])

  return { tryExtractMemories }
}
