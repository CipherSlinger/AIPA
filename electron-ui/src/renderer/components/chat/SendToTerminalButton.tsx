import { TerminalSquare } from 'lucide-react'
import { useT } from '../../i18n'

/**
 * "Send to terminal" — the second shell-block action, beside Run.
 *
 * It only ever types: the store writes the command to the shell with no CR/LF,
 * so the user's Enter is the sole execution trigger. When it cannot act, the
 * reason is printed next to the disabled button rather than hidden in a
 * tooltip that a keyboard user may never open.
 */
export default function SendToTerminalButton({
  onSend,
  disabled,
  reason,
}: {
  onSend: () => void
  disabled: boolean
  reason: string
}) {
  const t = useT()
  const label = t('codeAction.terminal.send')
  const description = disabled ? reason : label

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        aria-disabled={disabled}
        aria-label={description}
        title={description}
        className="code-action"
        style={{
          background: 'rgba(99,102,241,0.14)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 6,
          padding: '2px 6px',
          color: '#a5b4fc',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.65 : 1,
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        <TerminalSquare size={11} />
        {label}
      </button>
      {disabled && reason && (
        <span
          title={reason}
          style={{
            fontSize: 10,
            color: 'var(--code-text-muted)',
            maxWidth: 200,
            minWidth: 0,
            flexShrink: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {reason}
        </span>
      )}
    </span>
  )
}
