// SnippetPopup — text snippet selection popup in ChatInput (extracted Iteration 456)
import React from 'react'
import { useT } from '../../i18n'

interface Snippet {
  id: string
  keyword: string
  content: string
}

interface SnippetPopupProps {
  snippets: Snippet[]
  selectedIndex: number
  onSelect: (snippet: Snippet) => void
  onHover: (index: number) => void
}

export default function SnippetPopup({ snippets, selectedIndex, onSelect, onHover }: SnippetPopupProps) {
  const t = useT()

  if (snippets.length === 0) return null

  return (
    <div
      className="popup-enter"
      style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
        width: 320,
        background: 'var(--glass-bg-high)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border-md)',
        borderRadius: 12,
        boxShadow: 'var(--glass-shadow)',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      <style>{`.snippet-popup-scroll::-webkit-scrollbar { width: 4px; } .snippet-popup-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 2px; }`}</style>

      {/* Section header — micro-label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-faint)',
        padding: '6px 12px 4px',
        borderBottom: '1px solid var(--glass-border)',
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
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
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
        borderTop: '1px solid var(--glass-border)',
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
              background: 'var(--glass-border)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6,
            }}>
              {key}
            </kbd>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
