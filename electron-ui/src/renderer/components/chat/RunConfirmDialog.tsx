// RunConfirmDialog — confirmation dialog for executing shell commands (Iteration 510)
import React from 'react'
import { AlertTriangle, Play, Terminal } from 'lucide-react'
import { useT } from '../../i18n'

// Dangerous command patterns
const DANGER_PATTERNS = [
  /\brm\s+(-\w*r\w*f|--recursive|--force)/i,
  /\brm\s+-\w*f\w*r/i,
  /\bformat\b/i,
  /\bdel\s+\/[fs]/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\b:\(\)\{.*\};\s*:/,           // fork bomb
  /\bchmod\s+-R\s+777\b/i,
  /\b>\s*\/dev\/sd/i,
]

function isDangerousCommand(cmd: string): boolean {
  return DANGER_PATTERNS.some(p => p.test(cmd))
}

interface RunConfirmDialogProps {
  command: string
  workingDir: string
  onConfirm: () => void
  onCancel: () => void
}

export default function RunConfirmDialog({ command, workingDir, onConfirm, onCancel }: RunConfirmDialogProps) {
  const t = useT()
  const isDangerous = isDangerousCommand(command)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
          borderRadius: 12, padding: '20px 24px', maxWidth: 480, width: '90%',
          boxShadow: 'var(--popup-shadow)',
          animation: 'popup-in 0.15s ease-out',
        }}
      >
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Terminal size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>
            {t('codeAction.confirmRunTitle')}
          </span>
        </div>

        {/* Description */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {t('codeAction.confirmRunMessage')}
        </div>

        {/* Command preview */}
        <pre
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${isDangerous ? 'var(--error)' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
            color: 'var(--text-bright)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 160,
            overflowY: 'auto',
            margin: '0 0 10px 0',
          }}
        >
          {command}
        </pre>

        {/* Working directory */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: isDangerous ? 10 : 18, display: 'flex', gap: 4 }}>
          <span style={{ fontWeight: 500 }}>{t('codeAction.workingDirectory')}:</span>
          <span style={{ fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace" }}>{workingDir}</span>
        </div>

        {/* Danger warning */}
        {isDangerous && (
          <div
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.3)',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 18,
            }}
          >
            <AlertTriangle size={14} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--error)', lineHeight: 1.5 }}>
              {t('codeAction.dangerWarning')}
            </span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            aria-label={t('common.cancel')}
            style={{
              padding: '7px 18px', fontSize: 12, borderRadius: 6,
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--popup-item-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            aria-label={t('codeAction.runInTerminal')}
            style={{
              padding: '7px 18px', fontSize: 12, borderRadius: 6,
              background: isDangerous ? 'var(--error)' : 'var(--accent)',
              border: 'none',
              color: '#fff', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <Play size={12} />
            {t('codeAction.runInTerminal')}
          </button>
        </div>
      </div>
    </div>
  )
}
