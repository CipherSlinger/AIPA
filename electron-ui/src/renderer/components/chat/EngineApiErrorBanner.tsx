import React, { useSyncExternalStore } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useT } from '../../i18n'
import { apiErrorStore } from './apiErrorStore'

/**
 * The fallback engine's own report, kept as a banner rather than a toast.
 *
 * A toast disappears before a long authentication message can be read, and an
 * assistant bubble would make the report look like something AIPA said. This
 * surface shows only what the engine sent (message plus its type/code) and is
 * explicitly not a claim that the turn failed — that claim belongs to the
 * turn's result event.
 */
export default function EngineApiErrorBanner() {
  const banner = useSyncExternalStore(
    apiErrorStore.subscribe,
    apiErrorStore.getSnapshot,
    apiErrorStore.getSnapshot,
  )
  const t = useT()
  if (!banner) return null

  return (
    <div
      data-engine-api-error=""
      role="status"
      aria-label={t('engineApiError.aria')}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 16px',
        background: 'rgba(251, 191, 36, 0.10)',
        borderBottom: '1px solid rgba(251, 191, 36, 0.30)',
        fontSize: 12,
        flexShrink: 0,
        maxHeight: 150,
        overflow: 'hidden',
      }}
    >
      <AlertTriangle
        size={14}
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 1, color: '#d97706' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('engineApiError.title')}
          {banner.code && (
            <span style={{ fontWeight: 500, fontFamily: 'monospace' }}>
              {' · '}
              {t('engineApiError.type', { code: banner.code })}
            </span>
          )}
        </div>
        {banner.message && (
          <div
            // The full engine text stays reachable on hover even when the
            // banner has to clip it.
            title={banner.message}
            style={{
              marginTop: 2,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 66,
              overflowY: 'auto',
              scrollbarWidth: 'thin',
            }}
          >
            {banner.message}
          </div>
        )}
        <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {banner.clipped && <span>{t('engineApiError.clipped')} </span>}
          {banner.repeats > 1 && <span>{t('engineApiError.repeats', { count: banner.repeats })} </span>}
          <span>{t('engineApiError.note')}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => apiErrorStore.dismiss()}
        title={t('codex.engineNotice.dismiss')}
        aria-label={t('codex.engineNotice.dismiss')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          padding: '2px 8px',
          background: 'transparent',
          border: '1px solid rgba(251, 191, 36, 0.35)',
          borderRadius: 4,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 11,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <X size={11} aria-hidden="true" />
        {t('error.dismiss')}
      </button>
    </div>
  )
}
