import { ChatMessage, StandardChatMessage } from '../types/app.types'

/**
 * Formats a list of chat messages as a Markdown document for export.
 */
export function formatMarkdown(
  messages: ChatMessage[],
  sessionId: string | null,
  exportDate: Date,
  sessionTitle?: string | null,
  model?: string,
): string {
  const dateStr = exportDate.toISOString().replace('T', ' ').slice(0, 19)
  const contentMessages = messages.filter(m => m.role !== 'permission' && m.role !== 'plan')
  const userCount = contentMessages.filter(m => m.role === 'user').length
  const assistantCount = contentMessages.filter(m => m.role === 'assistant').length

  const lines: string[] = [
    `# ${sessionTitle || 'AIPA Conversation'}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Exported** | ${dateStr} |`,
    `| **Session** | ${sessionId || 'New conversation'} |`,
    ...(model ? [`| **Model** | ${model} |`] : []),
    `| **Messages** | ${userCount} user, ${assistantCount} assistant |`,
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    if (msg.role === 'permission') continue
    if (msg.role === 'plan') {
      lines.push('**Plan**', '', (msg as any).planContent || '', '', '---', '')
      continue
    }

    const std = msg as StandardChatMessage
    const ts = new Date(std.timestamp).toLocaleTimeString()
    const role = std.role === 'user' ? 'User' : std.role === 'assistant' ? 'Assistant' : 'System'

    lines.push(`**${role}** (${ts})`, '')
    lines.push(std.content || '', '')

    if (std.toolUses && std.toolUses.length > 0) {
      for (const tool of std.toolUses) {
        const toolLabel = tool.name || 'Unknown tool'
        lines.push(`<details>`)
        lines.push(`<summary>Tool: ${toolLabel}</summary>`)
        lines.push('')
        lines.push('**Input:**')
        lines.push('```json')
        lines.push(JSON.stringify(tool.input, null, 2))
        lines.push('```')
        if (tool.result !== undefined) {
          const resultStr = typeof tool.result === 'string'
            ? tool.result
            : JSON.stringify(tool.result, null, 2)
          const truncated = resultStr.length > 500
            ? resultStr.slice(0, 500) + '\n... (truncated)'
            : resultStr
          lines.push('')
          lines.push(`**Result** (${tool.status}):`)
          lines.push('```')
          lines.push(truncated)
          lines.push('```')
        }
        lines.push('</details>')
        lines.push('')
      }
    }

    if (std.thinking) {
      lines.push('<details>')
      lines.push('<summary>Thinking</summary>')
      lines.push('')
      lines.push(std.thinking)
      lines.push('</details>')
      lines.push('')
    }

    lines.push('---', '')
  }

  return lines.join('\n')
}
