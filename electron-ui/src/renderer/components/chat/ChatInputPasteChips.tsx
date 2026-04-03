// ChatInput paste action chips — extracted from ChatInput.tsx (Iteration 314)
// Displays URL paste actions, long text paste actions, and quote preview banner.

import React from 'react'
import { X, Link2, FileText, MessageSquareQuote, Code2 } from 'lucide-react'
import { useT } from '../../i18n'

interface PasteState {
  pastedUrl: string | null
  setPastedUrl: (v: string | null) => void
  pastedLongText: boolean
  setPastedLongText: (v: boolean) => void
  pendingQuote: string | null
  setPendingQuote: (v: string | null) => void
  handleUrlAction: (label: string) => void
  handleLongTextAction: (label: string) => void
  urlChipTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  longTextTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  onWrapAsBlock?: () => void  // wrap pasted text in a code/collapse block
}

interface ChatInputPasteChipsProps {
  paste: PasteState
  inputLength: number
}

const chipStyle: React.CSSProperties = {
  padding: '2px 8px', fontSize: 10, fontWeight: 500,
  background: 'rgba(0, 122, 204, 0.1)', border: '1px solid rgba(0, 122, 204, 0.25)',
  borderRadius: 10, color: 'var(--accent)', cursor: 'pointer',
  transition: 'background 150ms, border-color 150ms', whiteSpace: 'nowrap',
}

function chipHoverOn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(0, 122, 204, 0.2)'
  e.currentTarget.style.borderColor = 'var(--accent)'
}
function chipHoverOff(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(0, 122, 204, 0.1)'
  e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.25)'
}

export default function ChatInputPasteChips({ paste, inputLength }: ChatInputPasteChipsProps) {
  const t = useT()

  return (
    <>
      {/* URL paste quick action chips */}
      {paste.pastedUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
          <Link2 size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paste.pastedUrl}</span>
          {[
            { key: 'summarize', label: t('chat.urlAction.summarize') },
            { key: 'explain', label: t('chat.urlAction.explain') },
            { key: 'translate', label: t('chat.urlAction.translate') },
          ].map(action => (
            <button
              key={action.key}
              onClick={() => paste.handleUrlAction(action.label)}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={() => { paste.setPastedUrl(null); if (paste.urlChipTimerRef.current) clearTimeout(paste.urlChipTimerRef.current) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.6 }}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {/* Long text paste quick action chips */}
      {paste.pastedLongText && !paste.pastedUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
          <FileText size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {t('chat.longPaste', { count: String(inputLength) })}
          </span>
          {[
            { key: 'summarize', label: t('chat.urlAction.summarize') },
            { key: 'explain', label: t('chat.urlAction.explain') },
            { key: 'translate', label: t('chat.urlAction.translate') },
            { key: 'rewrite', label: t('clipboard.rewrite') },
          ].map(action => (
            <button
              key={action.key}
              onClick={() => paste.handleLongTextAction(action.label)}
              style={chipStyle}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
            >
              {action.label}
            </button>
          ))}
          {paste.onWrapAsBlock && (
            <button
              onClick={() => { paste.onWrapAsBlock?.(); paste.setPastedLongText(false) }}
              style={{ ...chipStyle, display: 'flex', alignItems: 'center', gap: 3 }}
              onMouseEnter={chipHoverOn}
              onMouseLeave={chipHoverOff}
              title={t('chat.wrapAsBlock')}
            >
              <Code2 size={10} />
              {t('chat.wrapAsBlock')}
            </button>
          )}
          <button
            onClick={() => { paste.setPastedLongText(false); if (paste.longTextTimerRef.current) clearTimeout(paste.longTextTimerRef.current) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.6 }}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {/* Pending quote preview banner */}
      {paste.pendingQuote && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', marginBottom: 6, background: 'rgba(0, 122, 204, 0.08)', borderLeft: '3px solid var(--accent)', borderRadius: 4, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <MessageSquareQuote size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
            {paste.pendingQuote.length > 150 ? paste.pendingQuote.slice(0, 150) + '...' : paste.pendingQuote}
          </div>
          <button
            onClick={() => paste.setPendingQuote(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4, flexShrink: 0, transition: 'color 150ms' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
            title={t('common.close')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  )
}
