import { SessionMessage, StandardChatMessage, ToolUseInfo, ChatMessage } from '../../types/app.types'

// ── Tag preset colors ──
export const TAG_PRESETS = [
  { id: 'tag-1', color: '#3b82f6', defaultKey: 'tags.work' },
  { id: 'tag-2', color: '#22c55e', defaultKey: 'tags.personal' },
  { id: 'tag-3', color: '#f59e0b', defaultKey: 'tags.research' },
  { id: 'tag-4', color: '#ef4444', defaultKey: 'tags.debug' },
  { id: 'tag-5', color: '#8b5cf6', defaultKey: 'tags.docs' },
  { id: 'tag-6', color: '#6b7280', defaultKey: 'tags.archive' },
]

// ── Session avatar color palette ──
export const SESSION_AVATAR_COLORS = [
  '#4a90d9',  // blue
  '#50b86e',  // green
  '#e67e22',  // orange
  '#9b59b6',  // purple
  '#e74c3c',  // red
  '#1abc9c',  // teal
  '#f39c12',  // amber
  '#34495e',  // slate
]

export function hashSessionId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getSessionAvatarColor(sessionId: string): string {
  return SESSION_AVATAR_COLORS[hashSessionId(sessionId) % SESSION_AVATAR_COLORS.length]
}

export function formatSessionDuration(firstTs: number | undefined, lastTs: number): string | null {
  if (!firstTs || firstTs >= lastTs) return null
  const diffMs = lastTs - firstTs
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
}

export function parseSessionMessages(raw: SessionMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  // Map tool_use_id -> result message index so tool_results can be attached
  const toolUseIdToMsgIdx = new Map<string, number>()

  for (const entry of raw) {
    if (entry.type === 'user') {
      const msg = entry.message as Record<string, unknown> | undefined
      if (!msg) continue
      const content = msg.content
      // Check if this user message is only tool_results (attach to prior assistant messages)
      if (Array.isArray(content)) {
        const blocks = content as Record<string, unknown>[]
        const hasOnlyToolResults = blocks.length > 0 && blocks.every(b => b.type === 'tool_result')
        if (hasOnlyToolResults) {
          for (const block of blocks) {
            const toolUseId = block.tool_use_id as string
            const msgIdx = toolUseIdToMsgIdx.get(toolUseId)
            if (msgIdx !== undefined) {
              const target = result[msgIdx] as StandardChatMessage
              if (target?.toolUses) {
                target.toolUses = target.toolUses.map(t =>
                  t.id === toolUseId
                    ? { ...t, result: block.content, status: block.is_error ? 'error' as const : 'done' as const }
                    : t
                )
              }
            }
          }
          continue
        }
        // Mixed content: extract text
        const textBlock = blocks.find(b => b.type === 'text')
        const text = (textBlock?.text as string) || ''
        if (!text.trim()) continue
        result.push({
          id: `hist-user-${entry.timestamp || Date.now()}-${result.length}`,
          role: 'user',
          content: text,
          timestamp: entry.timestamp ? new Date(String(entry.timestamp)).getTime() : Date.now(),
        } as StandardChatMessage)
      } else if (typeof content === 'string') {
        if (!content.trim()) continue
        result.push({
          id: `hist-user-${entry.timestamp || Date.now()}-${result.length}`,
          role: 'user',
          content,
          timestamp: entry.timestamp ? new Date(String(entry.timestamp)).getTime() : Date.now(),
        } as StandardChatMessage)
      }

    } else if (entry.type === 'assistant') {
      const msg = entry.message as Record<string, unknown> | undefined
      if (!msg) continue
      const content = msg.content as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(content)) continue

      let text = ''
      let thinking = ''
      const toolUses: ToolUseInfo[] = []

      for (const block of content) {
        if (block.type === 'text') text += (block.text as string) || ''
        else if (block.type === 'thinking') thinking += (block.thinking as string) || ''
        else if (block.type === 'tool_use') {
          const toolId = block.id as string
          toolUses.push({
            id: toolId,
            name: block.name as string,
            input: (block.input ?? {}) as Record<string, unknown>,
            status: 'done',
          })
        }
      }

      if (!text.trim() && toolUses.length === 0 && !thinking) continue

      const msgIdx = result.length
      for (const tu of toolUses) {
        toolUseIdToMsgIdx.set(tu.id, msgIdx)
      }

      result.push({
        id: `hist-asst-${entry.timestamp || Date.now()}-${result.length}`,
        role: 'assistant',
        content: text,
        thinking: thinking || undefined,
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        timestamp: entry.timestamp ? new Date(String(entry.timestamp)).getTime() : Date.now(),
      } as StandardChatMessage)
    }
  }

  return result
}

export function getDateGroup(ts: number, t: (key: string) => string): string {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  if (date >= today) return t('session.today')
  if (date >= yesterday) return t('session.yesterday')
  if (date >= weekAgo) return t('session.thisWeek')
  return t('session.earlier')
}

export function getMatchContext(session: { title?: string; lastPrompt?: string; project?: string }, query: string, t: (key: string) => string): { source: string; snippet: string } | null {
  if (!query.trim()) return null
  const q = query.toLowerCase()
  const title = session.title || ''
  const content = session.lastPrompt || ''
  const project = session.project || ''

  let source = ''
  let text = ''
  if (title.toLowerCase().includes(q)) {
    source = t('session.inTitle')
    text = title
  } else if (content.toLowerCase().includes(q)) {
    source = t('session.inContent')
    text = content
  } else if (project.toLowerCase().includes(q)) {
    source = t('session.inProject')
    text = project
  } else {
    return null
  }

  // Extract context around the match
  const idx = text.toLowerCase().indexOf(q)
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + query.length + 30)
  let snippet = text.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'
  return { source, snippet }
}
