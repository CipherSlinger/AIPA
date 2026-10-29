// The running turn: streamed text with a blinking caret, or the reading state
// before the first token arrives.
//
// Both branches carry a Stop button. Stop only ends the turn and returns to the
// search list; Cancel closes the overlay, which aborts through unmount. Keeping
// the two visible matters because the turn can take a long time and Escape is
// not the only way out.

import { Loader2 } from 'lucide-react'
import { useT } from '../../../i18n'
import { EMPTY_STYLE, GHOST_BUTTON_STYLE } from './shared'

interface Props {
  /** Cumulative text pushed by the main process; empty before the first token. */
  draft: string
  onStop: () => void
  onClose: () => void
}

export function AskRunningView({ draft, onStop, onClose }: Props) {
  const t = useT()

  if (draft) {
    return (
      <div
        role="region"
        aria-label={t('askHistory.answerLabel')}
        aria-live="polite"
        style={{ padding: '16px 16px 14px' }}
      >
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {draft}
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 1,
              height: '1em',
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              background: 'var(--accent-text)',
              animation: 'ask-caret-blink 1s steps(1, end) infinite',
            }}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onStop} style={GHOST_BUTTON_STYLE}>
            {t('askHistory.stop')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      aria-live="polite"
      style={{
        ...EMPTY_STYLE,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Loader2
          size={20}
          style={{ color: 'var(--accent-text)', animation: 'spin 1s linear infinite' }}
        />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {t('askHistory.reading')}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Stops just the turn and returns to the search list. Closing
            still dismisses the overlay and aborts through unmount. */}
        <button type="button" onClick={onStop} style={GHOST_BUTTON_STYLE}>
          {t('askHistory.stop')}
        </button>
        <button type="button" onClick={onClose} style={GHOST_BUTTON_STYLE}>
          {t('askHistory.cancel')}
        </button>
      </div>
    </div>
  )
}
