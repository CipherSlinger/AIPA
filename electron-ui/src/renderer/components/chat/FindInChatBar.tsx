import React, { useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useT } from '../../i18n'
import { normalizeFindQuery, type FindState } from '../../lib/findInText'

/**
 * CSS Custom Highlight API rules. Two registries rather than one so the match
 * the user is standing on can be painted distinctly; a Range belongs to at
 * most one of them at a time, which also avoids priority fights.
 *
 * The fallback rules mark the containing message text block when the engine
 * lacks `CSS.highlights`; they never touch the markdown that React rendered.
 */
const FIND_STYLES = `
::highlight(aipa-find) {
  background-color: rgba(99, 102, 241, 0.30);
  color: inherit;
}
::highlight(aipa-find-current) {
  background-color: rgba(99, 102, 241, 0.88);
  color: #ffffff;
}
[data-find-scope][data-find-fallback] {
  outline: 2px solid rgba(99, 102, 241, 0.45);
  outline-offset: 2px;
  border-radius: 2px;
}
[data-find-scope][data-find-fallback][data-find-fallback-current] {
  outline-color: rgba(99, 102, 241, 1);
}
`

interface Props {
  query: string
  state: FindState
  onQueryChange: (query: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  /** Owned by the hook so the shortcut can focus the same input. */
  inputRef?: React.RefObject<HTMLInputElement>
}

const buttonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  borderRadius: 6,
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  cursor: 'pointer',
  padding: 0,
  transition: 'background 0.15s ease, color 0.15s ease',
}

export function FindInChatBar({
  query, state, onQueryChange, onNext, onPrev, onClose, inputRef,
}: Props) {
  const t = useT()
  const localRef = useRef<HTMLInputElement>(null)
  const fieldRef = inputRef ?? localRef
  // The sentence must show exactly what was searched: the trimmed query, the
  // same string the matcher received.
  const searchedQuery = normalizeFindQuery(query)

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      // The chat panel's global Escape handler aborts a running turn when no
      // field has focus; closing the bar is the narrower intent here.
      e.stopPropagation()
      onClose()
      return
    }
    // Enter is the find bar's step key, but only while its own field has the
    // caret — pressing Enter on the close button must activate that button.
    if (e.key === 'Enter' && e.target === fieldRef.current) {
      e.preventDefault()
      if (e.shiftKey) onPrev()
      else onNext()
    }
  }, [fieldRef, onClose, onNext, onPrev])

  const handleHover = (e: React.MouseEvent<HTMLButtonElement>, enter: boolean) => {
    e.currentTarget.style.background = enter ? 'var(--accent-bg)' : 'transparent'
    e.currentTarget.style.color = enter ? 'var(--accent-text)' : 'var(--text-muted)'
  }

  return (
    <div
      data-find-bar=""
      role="search"
      aria-label={t('find.barLabel')}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        minHeight: 32,
        padding: '0 10px',
        background: 'var(--bg-input)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        animation: 'slideUp 0.12s ease',
      }}
    >
      <style>{FIND_STYLES}</style>
      <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
      <input
        ref={fieldRef}
        type="text"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={t('find.placeholder')}
        aria-label={t('find.inputLabel')}
        autoComplete="off"
        spellCheck={false}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: 12,
          lineHeight: 1.4,
          padding: 0,
          fontFamily: 'inherit',
        }}
      />
      {/*
        One live region for every state message. It stays mounted while the bar
        is open so a count update is announced; its content is empty when no
        query has been typed, which is why nothing reads as "0 of 0".
      */}
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 260,
          flexShrink: 1,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}
      >
        {state.kind === 'matches' && (
          <span data-find-counter="">
            {t('find.counter', {
              current: String(state.current + 1),
              total: String(state.total),
            })}
          </span>
        )}
        {state.kind === 'none' && (
          <span data-find-none="">{t('find.noMatches', { query: searchedQuery })}</span>
        )}
        {state.kind === 'empty-conversation' && (
          <span data-find-empty="">{t('find.emptyConversation')}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={state.kind !== 'matches'}
        aria-label={t('find.previous')}
        title={t('find.previous')}
        style={{ ...buttonStyle, opacity: state.kind === 'matches' ? 1 : 0.35 }}
        onMouseEnter={e => handleHover(e, true)}
        onMouseLeave={e => handleHover(e, false)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={state.kind !== 'matches'}
        aria-label={t('find.next')}
        title={t('find.next')}
        style={{ ...buttonStyle, opacity: state.kind === 'matches' ? 1 : 0.35 }}
        onMouseEnter={e => handleHover(e, true)}
        onMouseLeave={e => handleHover(e, false)}
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('find.close')}
        title={t('find.close')}
        style={buttonStyle}
        onMouseEnter={e => handleHover(e, true)}
        onMouseLeave={e => handleHover(e, false)}
      >
        <X size={14} />
      </button>
    </div>
  )
}
