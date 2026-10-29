// The context chip for the last exchange.
//
// The chip names the question the next ask will continue from, and clicking it
// puts the caret at the end of the current input so the user can extend the
// question instead of retyping it. It is hidden while a turn runs, so it cannot
// look like the answer being streamed belongs to the older question.

import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { useT } from '../../../i18n'

interface Props {
  question: string
  onFollowUp: () => void
  onDismiss: () => void
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

const CHIP_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

export function FollowUpRow({ question, onFollowUp, onDismiss }: Props) {
  const t = useT()
  return (
    <div style={ROW_STYLE}>
      <button
        type="button"
        onClick={onFollowUp}
        title={t('askHistory.followUpOn', { question })}
        style={CHIP_STYLE}
      >
        {t('askHistory.followUpOn', { question })}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        title={t('askHistory.followUpDismiss')}
        aria-label={t('askHistory.followUpDismiss')}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <X size={11} />
      </button>
    </div>
  )
}
