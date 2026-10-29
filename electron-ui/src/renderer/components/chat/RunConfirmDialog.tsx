// RunConfirmDialog — confirmation dialog for executing shell commands
import React from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Play, Terminal, ShieldAlert } from 'lucide-react'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'

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
  const dialogRef = useFocusTrap(true)
  const isDangerous = isDangerousCommand(command)

  // CodeBlock lives inside react-markdown's <pre>, so an inline overlay would
  // inherit `white-space: pre` and a monospace font. Portal it to the body.
  const dialog = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('codeAction.confirmRunTitle')}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: isDangerous
            ? '1px solid rgba(239,68,68,0.25)'
            : '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--dialog-shadow)',
          maxWidth: 480,
          width: '90%',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
          // The dialog is rendered inside a markdown <pre>, which inherits
          // `white-space: pre` into every label and refuses to wrap.
          whiteSpace: 'normal',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.15s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 20px',
            borderBottom: isDangerous
              ? '1px solid rgba(239,68,68,0.15)'
              : '1px solid var(--border)',
            background: isDangerous ? 'rgba(239,68,68,0.05)' : 'transparent',
            flexShrink: 0,
          }}
        >
          {/* Icon badge */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isDangerous ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
            border: isDangerous ? '1px solid rgba(239,68,68,0.28)' : '1px solid rgba(99,102,241,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {isDangerous
              ? <ShieldAlert size={15} style={{ color: 'var(--color-error)' }} />
              : <Terminal size={15} style={{ color: '#6366f1' }} />
            }
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
            {t('codeAction.confirmRunTitle')}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', minHeight: 0 }}>
          {/* Description */}
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('codeAction.confirmRunMessage')}
          </div>

          {/*
            The assistant's approval rules and sandbox do not apply to this
            path: it is a real shell on the user's machine. Say so next to the
            folder rather than letting the command preview imply otherwise.
          */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('codeAction.run.confirmScope', { cwd: workingDir })}
          </div>

          {/* Command preview — deep dark monospace */}
          <pre
            style={{
              background: 'rgba(8,8,16,0.80)',
              border: `1px solid ${isDangerous ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 12,
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              // This box stays near-black in both themes, so the text must be
              // fixed-light: `--danger-text` (#b91c1c in light) measured 1.81:1
              // here. #fca5a5 keeps 6.19:1 and #a5b4fc 6.4:1 on the same glass.
              color: isDangerous ? '#fca5a5' : '#a5b4fc',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 160,
              overflowY: 'auto',
              margin: 0,
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
              lineHeight: 1.6,
            }}
          >
            {command}
          </pre>

          {/* Working directory */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <span style={{ flexShrink: 0 }}>{t('codeAction.workingDirectory')}:</span>
            <span
              title={workingDir}
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 11,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: 'var(--text-muted)',
                // A deep Windows path has no break opportunities; without
                // minWidth:0 it widens the whole dialog body and clips the
                // danger warning beside it.
                minWidth: 0, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {workingDir}
            </span>
          </div>

          {/* Danger warning */}
          {isDangerous && (
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8,
                padding: '10px 14px',
              }}
            >
              <AlertTriangle size={14} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--danger-text)', lineHeight: 1.5, minWidth: 0 }}>
                {t('codeAction.dangerWarning')}
              </span>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            {/* Cancel — ghost */}
            <button
              onClick={onCancel}
              aria-label={t('common.cancel')}
              style={{
                padding: '7px 18px',
                fontSize: 13,
                borderRadius: 8,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              {t('common.cancel')}
            </button>

            {/* Confirm — danger red or indigo gradient */}
            <button
              onClick={onConfirm}
              aria-label={t('codeAction.runInTerminal')}
              style={{
                padding: '7px 18px',
                fontSize: 13,
                borderRadius: 8,
                background: isDangerous
                  ? 'rgba(239,68,68,0.15)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: isDangerous ? '1px solid rgba(239,68,68,0.35)' : 'none',
                color: isDangerous ? 'var(--danger-text)' : 'rgba(255,255,255,0.95)',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
                boxShadow: isDangerous ? 'none' : '0 2px 8px rgba(99,102,241,0.30)',
              }}
              onMouseEnter={e => {
                if (isDangerous) {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.25)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.50)'
                  e.currentTarget.style.color = '#f87171'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(239,68,68,0.20)'
                } else {
                  e.currentTarget.style.filter = 'brightness(1.08)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40)'
                }
              }}
              onMouseLeave={e => {
                if (isDangerous) {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
                  e.currentTarget.style.color = '#fca5a5'
                  e.currentTarget.style.boxShadow = 'none'
                } else {
                  e.currentTarget.style.filter = ''
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.30)'
                }
              }}
            >
              <Play size={12} />
              {t('codeAction.runInTerminal')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
