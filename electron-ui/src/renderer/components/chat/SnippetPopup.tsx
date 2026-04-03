// SnippetPopup — text snippet selection popup in ChatInput (extracted Iteration 455)
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
        width: 320, maxHeight: 240, overflowY: 'auto',
        background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
        borderRadius: 8, boxShadow: 'var(--popup-shadow)', padding: '4px 0', zIndex: 50,
      }}
    >
      <div style={{ padding: '4px 10px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
        {t('snippet.title')}
      </div>
      {snippets.map((snippet, idx) => (
        <button
          key={snippet.id}
          onClick={() => onSelect(snippet)}
          onMouseEnter={() => onHover(idx)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '6px 10px',
            background: idx === selectedIndex ? 'var(--popup-item-hover)' : 'transparent',
            border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', borderRadius: 0,
          }}
        >
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--accent)',
            fontFamily: 'monospace', flexShrink: 0, minWidth: 48,
          }}>
            ::{snippet.keyword}
          </span>
          <span style={{
            fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            lineHeight: 1.4, opacity: 0.8,
          }}>
            {snippet.content.length > 80 ? snippet.content.slice(0, 80) + '...' : snippet.content}
          </span>
        </button>
      ))}
    </div>
  )
}
