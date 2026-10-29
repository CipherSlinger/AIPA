// Between two and three characters the ask floor would otherwise be invisible:
// the question is long enough to search but too short to ask about. Say how many
// characters are missing instead of leaving a key that does nothing.

import { Sparkles } from 'lucide-react'
import { useT } from '../../../i18n'

interface Props {
  /** Characters still needed before Ctrl+Enter starts a turn. */
  remaining: number
}

export function AskMoreCharsHint({ remaining }: Props) {
  const t = useT()
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}
    >
      <Sparkles size={11} style={{ flexShrink: 0, color: 'var(--accent-text)' }} aria-hidden="true" />
      <span>
        {t(
          remaining === 1
            ? 'globalSearch.askMoreCharOne'
            : 'globalSearch.askMoreChars',
          { count: remaining },
        )}
      </span>
    </div>
  )
}
