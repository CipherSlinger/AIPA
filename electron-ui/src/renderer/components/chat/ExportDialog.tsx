// ExportDialog — dialog for exporting conversation as Markdown or JSON
import React, { useState, useMemo, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useT } from '../../i18n'
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
  const t = useT()
  const messages = useChatStore(s => s.messages)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const addToast = useUiStore(s => s.addToast)

  const [format, setFormat] = useState<'markdown' | 'json'>('markdown')
  const [includeTools, setIncludeTools] = useState(false)
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [saving, setSaving] = useState(false)

  const dialogRef = useFocusTrap(true)
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
        addToast('error', t('chat.exportFailed', { error: (result as any).error }))
      } else {
        // The dialog closes on success, so the toast is the only place the
        // finished file can be reached. Longer than the 4s default because
        // the notice has to be read before the button is usable.
        addToast('success', t('chat.exportSuccess'), 8000, {
          label: t('toast.action.showInFolder'),
          ariaLabel: t('toast.action.showInFolderAria'),
          onClick: () => {
            void window.electronAPI.shellShowItemInFolder(filePath)
              .then((shown) => {
                if (shown && !shown.success) {
                  console.error('[AIPA] Failed to reveal exported file', filePath, shown.error)
                  addToast('error', t('chat.exportShowFailed'))
                }
              })
              .catch((err: unknown) => {
                console.error('[AIPA] Failed to reveal exported file', filePath, err)
                addToast('error', t('chat.exportShowFailed'))
              })
          },
        })
        onClose()
      }
    } catch (err: any) {
      addToast('error', t('chat.exportFailed', { error: err?.message || err }))
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
    background: 'var(--glass-overlay)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.15s ease',
  }

  const dialogStyle: React.CSSProperties = {
    background: 'var(--popup-bg)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 20,
    width: 480,
    maxWidth: 'calc(100vw - 40px)',
    maxHeight: 'calc(100vh - 48px)',
    boxShadow: 'var(--dialog-shadow)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    overflow: 'hidden',
    animation: 'slideUp 0.15s ease',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 6,
  }

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex',
    background: 'var(--bg-hover)',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  }

  const radioOptionStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: 6,
    background: active ? 'var(--accent-solid)' : 'transparent',
    border: 'none',
    color: active ? 'rgba(255,255,255,0.95)' : 'var(--text-muted)',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    userSelect: 'none',
  })

  const checkRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  }

  const previewBoxStyle: React.CSSProperties = {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
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
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.15s ease',
  }

  return (
    <div style={overlayStyle}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.exportTitle')}
        style={dialogStyle}
      >
        {/* Header — stays put while the body scrolls at 200% zoom. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--bg-hover)', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
            {t('chat.exportTitle')}
          </span>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 8,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', minHeight: 0 }}>
          {/* Format picker */}
          <div>
            <div style={labelStyle}>{t('chat.exportFormat')}</div>
            <div style={radioGroupStyle}>
              <button style={radioOptionStyle(format === 'markdown')} onClick={() => setFormat('markdown')}>
                Markdown
              </button>
              <button style={radioOptionStyle(format === 'json')} onClick={() => setFormat('json')}>
                JSON
              </button>
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
                  style={{ accentColor: 'var(--accent-solid)', cursor: 'pointer', width: 14, height: 14 }}
                />
                {t('chat.exportIncludeTools')}
              </label>
              <label style={checkRowStyle}>
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={e => setIncludeTimestamps(e.target.checked)}
                  style={{ accentColor: 'var(--accent-solid)', cursor: 'pointer', width: 14, height: 14 }}
                />
                {t('chat.exportIncludeTimestamps')}
              </label>
            </div>
          )}

          {/* Preview */}
          <div>
            <div style={labelStyle}>{t('chat.exportPreview')}</div>
            <div style={previewBoxStyle}>{preview}</div>
          </div>
        </div>

        {/* Footer buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              ...btnBase,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--border)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || messages.length === 0}
            style={{
              ...btnBase,
              background: 'var(--cta-gradient)',
              border: 'none',
              color: 'rgba(255,255,255,0.95)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
              opacity: saving || messages.length === 0 ? 0.5 : 1,
              cursor: saving || messages.length === 0 ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (!saving && messages.length > 0) { e.currentTarget.style.filter = 'brightness(0.95)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' } }}
            onMouseLeave={e => { if (!saving && messages.length > 0) { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' } }}
          >
            <Download size={13} />
            {saving ? t('chat.exportSaving') : t('chat.exportChoosePath')}
          </button>
        </div>
      </div>
    </div>
  )
}
