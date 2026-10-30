// KeyModelsPanel — the model list of one API key, expanded inline inside the
// API key pool list. Purely presentational: SettingsApiKeyPool owns the pool,
// persists the per-key list and the derived global catalogue, and holds the
// add-input draft so it survives re-renders of the parent.

import React from 'react'
import { Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useT } from '../../i18n'
import type { ApiKeyEntry, AvailableModel } from '../../types/app.types'

interface KeyModelsPanelProps {
  entry: ApiKeyEntry
  /** A fetch is in flight; every control except close is locked. */
  loading: boolean
  draft: string
  onDraftChange: (value: string) => void
  /** The draft is a valid, not-yet-listed model id. */
  canAdd: boolean
  onReload: () => void
  onAdd: () => void
  onRemove: (model: AvailableModel) => void
  onClose: () => void
}

const PANEL_STYLE: React.CSSProperties = {
  background: 'var(--glass-bg-low)',
  border: '1px solid var(--glass-border)',
  borderRadius: 8,
  padding: '10px 12px',
  marginBottom: 4,
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  padding: 2,
  flexShrink: 0,
  transition: 'color 0.15s ease',
}

const lockedIconButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  cursor: 'not-allowed',
  opacity: 0.5,
}

export default function KeyModelsPanel({
  entry,
  loading,
  draft,
  onDraftChange,
  canAdd,
  onReload,
  onAdd,
  onRemove,
  onClose,
}: KeyModelsPanelProps) {
  const t = useT()
  const models = entry.models ?? []

  const submitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (canAdd) onAdd()
  }

  return (
    <div style={PANEL_STYLE} role="group" aria-label={t('settings.keyModelsTitle', { label: entry.label })} aria-busy={loading}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span
          title={entry.label}
          style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{t('settings.keyModelsTitle', { label: entry.label })}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
          {t('settings.keyModelsCount', { count: models.length })}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          aria-label={t('settings.keyModelsReload')}
          title={t('settings.keyModelsReload')}
          style={loading ? lockedIconButtonStyle : iconButtonStyle}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.color = 'var(--accent-text)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        ><RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /></button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          style={iconButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        ><X size={11} /></button>
      </div>

      {loading && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: models.length ? 6 : 8 }}>
          {t('settings.keyModelsLoading')}
        </div>
      )}

      {!loading && models.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 8 }}>
          {t('settings.keyModelsEmpty')}
        </div>
      )}

      {models.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          {models.map(model => {
            const label = model.name || model.id
            return (
              <div key={model.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span
                  title={label}
                  style={{
                    fontSize: 11, color: 'var(--text-primary)', flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >{label}</span>
                {/* The id is only worth a column when the API gave the model a
                    different display name. */}
                {model.name && model.name !== model.id && (
                  <span
                    title={model.id}
                    style={{
                      fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)',
                      maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >{model.id}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(model)}
                  disabled={loading}
                  aria-label={t('settings.keyModelsRemove', { model: label })}
                  title={t('settings.keyModelsRemove', { model: label })}
                  style={loading ? lockedIconButtonStyle : iconButtonStyle}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.color = 'var(--danger-text)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                ><Trash2 size={10} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={t('settings.keyModelsAddPlaceholder')}
          aria-label={t('settings.keyModelsAddPlaceholder')}
          disabled={loading}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            flex: 1, minWidth: 0,
            background: 'var(--bg-input)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--text-primary)',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          style={{
            flexShrink: 0,
            background: canAdd ? 'var(--accent-bg)' : 'var(--bg-hover)',
            border: '1px solid ' + (canAdd ? 'var(--glass-border-md)' : 'var(--glass-border)'),
            borderRadius: 6,
            padding: '4px 8px',
            color: canAdd ? 'var(--accent-text)' : 'var(--text-muted)',
            cursor: canAdd ? 'pointer' : 'not-allowed',
            fontSize: 11,
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        ><Plus size={11} />{t('settings.keyModelsAdd')}</button>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>
        {t('settings.keyModelsHint')}
      </div>
    </div>
  )
}
