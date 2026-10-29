// SnippetPopup — text snippet selection popup in ChatInput (extracted Iteration 456)
import React from 'react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'

interface Snippet {
  id: string
  keyword: string
  content: string
}

interface SnippetPopupProps {
  snippets: Snippet[]
  /** All stored snippets, before the query filter. Zero means the user has
   *  never made one, which is the only case that gets the setup row; a query
   *  that matches nothing still closes the popup as before. */
  totalCount: number
  selectedIndex: number
  onSelect: (snippet: Snippet) => void
  onHover: (index: number) => void
  onDismiss: () => void
}

export default function SnippetPopup({
  snippets,
  totalCount,
  selectedIndex,
  onSelect,
  onHover,
  onDismiss,
}: SnippetPopupProps) {
  const t = useT()

  // Typing `::` with no snippets used to render nothing at all: the syntax
  // existed, but there was no way to learn that it needs a snippet or where to
  // make one. This is a row about the empty set, not a fake snippet: it has no
  // keyword, cannot be selected with the keyboard and never inserts text.
  if (snippets.length === 0) {
    if (totalCount > 0) return null
    return (
      <div
        className="popup-enter"
        style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          width: 320,
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
          zIndex: 200,
          overflow: 'hidden',
        }}
      >
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase' as const,
          color: 'var(--text-muted)',
          padding: '6px 12px 4px',
          borderBottom: '1px solid var(--border)',
        }}>
          {t('snippet.title')}
        </div>
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
            {t('snippet.chatEmptyTitle')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            {t('snippet.chatEmptyBody')}
          </div>
          <button
            onClick={() => {
              onDismiss()
              useUiStore.getState().openSettingsAt('snippets')
            }}
            style={{
              width: '100%',
              background: 'rgba(99,102,241,0.14)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--accent-text)',
              cursor: 'pointer',
            }}
          >
            {t('snippet.chatEmptyAction')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="popup-enter"
      style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
        width: 320,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        zIndex: 200,
        overflow: 'hidden',
      }}
    >
      <style>{`.snippet-popup-scroll::-webkit-scrollbar { width: 4px; } .snippet-popup-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }`}</style>

      {/* Section header — micro-label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-muted)',
        padding: '6px 12px 4px',
        borderBottom: '1px solid var(--border)',
      }}>
        {t('snippet.title')}
      </div>

      {/* Snippet list */}
      <div className="snippet-popup-scroll" style={{ maxHeight: 240, overflowY: 'auto', padding: '2px 0' }}>
        {snippets.map((snippet, idx) => {
          const isSelected = idx === selectedIndex
          return (
            <button
              key={snippet.id}
              onClick={() => onSelect(snippet)}
              onMouseEnter={() => onHover(idx)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '7px 12px',
                background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                borderLeft: isSelected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
                }
              }}
              onMouseOut={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }
              }}
            >
              {/* :: badge */}
              <div style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: isSelected ? '#a5b4fc' : '#818cf8',
                  fontFamily: 'monospace',
                }}>
                  ::
                </span>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Keyword name */}
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: isSelected ? '#818cf8' : 'var(--text-primary)',
                  marginBottom: 2,
                  transition: 'all 0.15s ease',
                }}>
                  {snippet.keyword}
                </div>
                {/* Preview — monospace, muted */}
                <div style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}>
                  {snippet.content}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer — keyboard hints as kbd */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderTop: '1px solid var(--border)',
        flexWrap: 'wrap' as const,
      }}>
        {[
          ['↑↓', 'navigate'],
          ['↵', 'select'],
          ['Esc', 'dismiss'],
        ].map(([key, label]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <kbd style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              {key}
            </kbd>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
