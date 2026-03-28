import { ChatMessage, StandardChatMessage } from '../types/app.types'

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Simple markdown-to-HTML converter for basic formatting.
 * Handles: headers, bold, italic, code blocks, inline code, links, lists, paragraphs.
 */
function simpleMarkdownToHtml(md: string): string {
  let html = escapeHtml(md)

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
    return `<div class="code-block">${langLabel}<pre><code>${code.trimEnd()}</code></pre></div>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)

  // Task list checkboxes
  html = html.replace(/<li>\[x\] /g, '<li class="task-done">&#9745; ')
  html = html.replace(/<li>\[ \] /g, '<li class="task-todo">&#9744; ')

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}

/**
 * Formats chat messages as a self-contained HTML file with embedded styles.
 */
export function formatHtml(
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
  const title = escapeHtml(sessionTitle || 'AIPA Conversation')

  const messageBlocks: string[] = []

  for (const msg of messages) {
    if (msg.role === 'permission') continue
    if (msg.role === 'plan') {
      messageBlocks.push(`
        <div class="message plan">
          <div class="message-header"><span class="role">Plan</span></div>
          <div class="message-content">${simpleMarkdownToHtml((msg as any).planContent || '')}</div>
        </div>
      `)
      continue
    }

    const std = msg as StandardChatMessage
    const ts = new Date(std.timestamp).toLocaleTimeString()
    const isUser = std.role === 'user'
    const roleLabel = isUser ? 'You' : std.role === 'assistant' ? 'AIPA' : 'System'
    const roleClass = isUser ? 'user' : std.role === 'assistant' ? 'assistant' : 'system'

    let toolHtml = ''
    if (std.toolUses && std.toolUses.length > 0) {
      const toolItems = std.toolUses.map(tool => {
        const toolLabel = escapeHtml(tool.name || 'Unknown tool')
        const inputJson = escapeHtml(JSON.stringify(tool.input, null, 2))
        let resultHtml = ''
        if (tool.result !== undefined) {
          const resultStr = typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)
          const truncated = resultStr.length > 500 ? resultStr.slice(0, 500) + '\n... (truncated)' : resultStr
          resultHtml = `<div class="tool-result"><span class="tool-label">Result (${escapeHtml(tool.status || 'done')}):</span><pre>${escapeHtml(truncated)}</pre></div>`
        }
        return `
          <details class="tool-use">
            <summary>Tool: ${toolLabel}</summary>
            <div class="tool-input"><span class="tool-label">Input:</span><pre>${inputJson}</pre></div>
            ${resultHtml}
          </details>
        `
      }).join('')
      toolHtml = `<div class="tool-uses">${toolItems}</div>`
    }

    let thinkingHtml = ''
    if (std.thinking) {
      thinkingHtml = `
        <details class="thinking">
          <summary>Thinking</summary>
          <div class="thinking-content">${simpleMarkdownToHtml(std.thinking)}</div>
        </details>
      `
    }

    const duration = (std as any).responseDuration
    const durationStr = duration && duration > 0
      ? `<span class="duration">${Math.round(duration / 1000)}s</span>`
      : ''

    messageBlocks.push(`
      <div class="message ${roleClass}">
        <div class="message-header">
          <span class="role">${roleLabel}</span>
          <span class="timestamp">${ts}${durationStr}</span>
        </div>
        <div class="message-content">${simpleMarkdownToHtml(std.content || '')}</div>
        ${toolHtml}
        ${thinkingHtml}
      </div>
    `)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      line-height: 1.6;
      padding: 0;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header {
      text-align: center;
      padding: 32px 20px;
      margin-bottom: 24px;
      background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 { font-size: 24px; color: #fff; margin-bottom: 12px; font-weight: 700; }
    .meta { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; font-size: 12px; color: #8b95a5; }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .messages { display: flex; flex-direction: column; gap: 16px; }
    .message {
      padding: 16px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .message.user {
      background: #1e3a5f;
      border-color: rgba(53, 114, 165, 0.3);
      margin-left: 40px;
    }
    .message.assistant {
      background: #1e1e2e;
      border-color: rgba(255,255,255,0.08);
      margin-right: 40px;
    }
    .message.system {
      background: #2e1e1e;
      border-color: rgba(239, 68, 68, 0.2);
      font-style: italic;
    }
    .message.plan {
      background: #1e2e1e;
      border-color: rgba(74, 222, 128, 0.2);
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .role { font-weight: 600; color: #7aa2f7; }
    .message.user .role { color: #7dcfff; }
    .timestamp { color: #565f89; font-size: 11px; }
    .duration { margin-left: 6px; opacity: 0.7; }
    .message-content { font-size: 14px; line-height: 1.7; }
    .message-content p { margin-bottom: 8px; }
    .message-content h1 { font-size: 20px; margin: 16px 0 8px; color: #c0caf5; }
    .message-content h2 { font-size: 17px; margin: 14px 0 6px; color: #c0caf5; }
    .message-content h3 { font-size: 15px; margin: 12px 0 4px; color: #c0caf5; }
    .message-content strong { color: #fff; }
    .message-content a { color: #7aa2f7; text-decoration: none; }
    .message-content a:hover { text-decoration: underline; }
    .message-content ul { margin: 8px 0; padding-left: 20px; }
    .message-content li { margin-bottom: 4px; }
    .inline-code {
      background: rgba(255,255,255,0.08);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
      font-size: 13px;
      color: #bb9af7;
    }
    .code-block {
      margin: 12px 0;
      background: #0d1117;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
    }
    .code-block .code-lang {
      display: block;
      padding: 6px 12px;
      font-size: 11px;
      color: #565f89;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-weight: 500;
    }
    .code-block pre {
      padding: 12px;
      overflow-x: auto;
      font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #c9d1d9;
    }
    .code-block code { background: none; }
    .tool-uses { margin-top: 12px; }
    .tool-use {
      margin: 8px 0;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .tool-use summary {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: #9ece6a;
      font-weight: 500;
    }
    .tool-use summary:hover { background: rgba(255,255,255,0.03); }
    .tool-label { font-size: 11px; color: #565f89; display: block; margin-bottom: 4px; font-weight: 500; }
    .tool-input, .tool-result { padding: 8px 12px; }
    .tool-input pre, .tool-result pre {
      background: #0d1117;
      padding: 8px;
      border-radius: 4px;
      font-size: 11px;
      overflow-x: auto;
      color: #c9d1d9;
      font-family: 'Fira Code', Consolas, monospace;
    }
    .thinking {
      margin-top: 12px;
      background: rgba(255,255,255,0.02);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .thinking summary {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: #bb9af7;
      font-weight: 500;
    }
    .thinking-content { padding: 8px 12px; font-size: 13px; color: #9b9bb0; }
    .footer {
      text-align: center;
      margin-top: 32px;
      padding: 16px;
      font-size: 11px;
      color: #565f89;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .task-done { list-style: none; color: #9ece6a; }
    .task-todo { list-style: none; color: #565f89; }
    @media (max-width: 600px) {
      .container { padding: 12px; }
      .message.user { margin-left: 12px; }
      .message.assistant { margin-right: 12px; }
      .header { padding: 20px 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <div class="meta">
        <span class="meta-item">Exported: ${escapeHtml(dateStr)}</span>
        ${model ? `<span class="meta-item">Model: ${escapeHtml(model)}</span>` : ''}
        <span class="meta-item">${userCount} user, ${assistantCount} assistant messages</span>
      </div>
    </div>
    <div class="messages">
      ${messageBlocks.join('\n')}
    </div>
    <div class="footer">
      Exported from AIPA &mdash; AI Personal Assistant
    </div>
  </div>
</body>
</html>`
}
