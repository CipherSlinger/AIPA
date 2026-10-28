/**
 * Quiet, dismissible inline notice for the engine's own warnings.
 *
 * The text is rendered verbatim: no severity label, no cause, no suggestion is
 * added. The engine already decided what to say; AIPA's job is only to put it
 * where the user can read and dismiss it. This lives above the composer (beside
 * the other compose status rows) and is never written into the transcript.
 */

import React, { useSyncExternalStore } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useT } from '../../i18n'
import { engineNoticeStore } from './engineNoticeStore'

export default function EngineWarningNotices() {
  const t = useT()
  const { warnings, hiddenCount } = useSyncExternalStore(
    engineNoticeStore.subscribe,
    engineNoticeStore.getSnapshot,
    engineNoticeStore.getSnapshot,
  )

  if (warnings.length === 0) return null

  return (
    <div
      role="status"
      aria-label={t('codex.engineNotice.aria')}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '4px 12px',
        background: 'var(--glass-bg-mid)',
        borderTop: '1px solid var(--border)',
        lineHeight: 1.5,
      }}
    >
      {warnings.map(warning => (
        <div key={warning.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <AlertTriangle
            size={11}
            aria-hidden="true"
            style={{ color: 'var(--warning-text)', opacity: 0.75, flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {warning.message}
            </div>
            {warning.details && (
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {warning.details}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={t('codex.engineNotice.dismiss')}
            title={t('codex.engineNotice.dismiss')}
            onClick={() => engineNoticeStore.dismissWarning(warning.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, padding: 0,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', flexShrink: 0,
            }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      {hiddenCount > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 17 }}>
          {t('codex.engineNotice.more', { count: String(hiddenCount) })}
        </span>
      )}
    </div>
  )
}
