// ExportDialog — dialog for exporting conversation as Markdown or JSON
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { useClickOutside } from '../../hooks/useClickOutside'
import { generateShortWordSlug } from '../../utils/wordSlug'

interface Props {
  onClose: () => void
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function buildMarkdown(
  messages: ChatMessage[],
  sessionId: string | null,
  sessionTitle: string | null,
  includeTools: boolean,
  includeTimestamps: boolean,
): string {
  const now = new Date()
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 19)
  const title = sessionTitle || 'AIPA Conversation'

  const lines: string[] = [
    `# ${title}`,
    '',
    `**Exported**: ${dateStr}`,
    ...(sessionId ? [`**Session**: ${sessionId}`] : []),
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    if (msg.role === 'permission' || (msg.role as string) === 'plan') continue

    const std = msg as StandardChatMessage
    const roleLabel =
      std.role === 'user' ? '**User**' : std.role === 'assistant' ? '**Assistant**' : '**System**'

    if (includeTimestamps && std.timestamp) {
      const ts = new Date(std.timestamp).toLocaleTimeString()
      lines.push(`${roleLabel} _(${ts})_`)
    } else {
      lines.push(roleLabel)
    }
    lines.push('')
    lines.push(std.content || '')
    lines.push('')

    if (includeTools && std.toolUses && std.toolUses.length > 0) {
      for (const tool of std.toolUses) {
        lines.push(`> [Tool call: **${tool.name || 'Unknown'}**]`)
      }
      lines.push('')
    }

    lines.push('---', '')
  }

  return lines.join('\n')
}

function buildJson(
  messages: ChatMessage[],
  sessionId: string | null,
): string {
  return JSON.stringify(
    {
      sessionId: sessionId || null,
      exportedAt: new Date().toISOString(),
      messages,
    },
    null,
    2,
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExportDialog({ onClose }: Props) {
  const messages = useChatStore(s => s.messages)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const addToast = useUiStore(s => s.addToast)

  const [format, setFormat] = useState<'markdown' | 'json'>('markdown')
  const [includeTools, setIncludeTools] = useState(true)
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [saving, setSaving] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  useClickOutside(dialogRef, true, onClose)

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const content = useMemo(() => {
    if (format === 'json') return buildJson(messages, currentSessionId)
    return buildMarkdown(messages, currentSessionId, currentSessionTitle, includeTools, includeTimestamps)
  }, [format, messages, currentSessionId, currentSessionTitle, includeTools, includeTimestamps])

  const preview = content.length > 500 ? content.slice(0, 500) + '\n...' : content

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const slug = generateShortWordSlug()
      const ext = format === 'json' ? 'json' : 'md'
      const defaultName = `aipa-${slug}.${ext}`
      const filters =
        format === 'json'
          ? [{ name: 'JSON', extensions: ['json'] }]
          : [{ name: 'Markdown', extensions: ['md'] }]

      const filePath = await window.electronAPI.fsShowSaveDialog(defaultName, filters)
      if (!filePath) { setSaving(false); return }

      const result = await window.electronAPI.fsWriteFile(filePath, content)
      if ((result as any)?.error) {
        addToast('error', `Export failed: ${(result as any).error}`)
      } else {
        addToast('success', 'Conversation exported successfully')
        onClose()
      }
    } catch (err: any) {
      addToast('error', `Export failed: ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Shared style pieces ──────────────────────────────────────────────────

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.5)',
  }

  const dialogStyle: React.CSSProperties = {
    background: 'var(--popup-bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    width: 480,
    maxWidth: 'calc(100vw - 40px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  }

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
  }

  const radioOptionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? 'rgba(59,130,246,0.12)' : 'var(--bg-input)',
    color: active ? 'var(--accent)' : 'var(--text-primary)',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    transition: 'border-color 150ms, background 150ms, color 150ms',
    userSelect: 'none',
  })

  const checkRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    userSelect: 'none',
  }

  const previewBoxStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 11,
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    maxHeight: 160,
    lineHeight: 1.5,
  }

  const btnBase: React.CSSProperties = {
    padding: '6px 16px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 150ms',
  }

  return (
    <div style={overlayStyle}>
      <div ref={dialogRef} style={dialogStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>
            导出会话
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 4,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Format picker */}
        <div>
          <div style={labelStyle}>格式</div>
          <div style={radioGroupStyle}>
            <div style={radioOptionStyle(format === 'markdown')} onClick={() => setFormat('markdown')}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: `2px solid ${format === 'markdown' ? 'var(--accent)' : 'var(--text-muted)'}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {format === 'markdown' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </span>
              Markdown
            </div>
            <div style={radioOptionStyle(format === 'json')} onClick={() => setFormat('json')}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: `2px solid ${format === 'json' ? 'var(--accent)' : 'var(--text-muted)'}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {format === 'json' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </span>
              JSON
            </div>
          </div>
        </div>

        {/* Options — only relevant for Markdown */}
        {format === 'markdown' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={checkRowStyle}>
              <input
                type="checkbox"
                checked={includeTools}
                onChange={e => setIncludeTools(e.target.checked)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              包含工具调用详情
            </label>
            <label style={checkRowStyle}>
              <input
                type="checkbox"
                checked={includeTimestamps}
                onChange={e => setIncludeTimestamps(e.target.checked)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              包含时间戳
            </label>
          </div>
        )}

        {/* Preview */}
        <div>
          <div style={labelStyle}>预览（前 500 字）</div>
          <div style={previewBoxStyle}>{preview}</div>
        </div>

        {/* Footer buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              ...btnBase,
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || messages.length === 0}
            style={{
              ...btnBase,
              background: 'var(--accent)',
              color: '#fff',
              opacity: saving || messages.length === 0 ? 0.5 : 1,
              cursor: saving || messages.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={13} />
            {saving ? '保存中...' : '选择路径并保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
