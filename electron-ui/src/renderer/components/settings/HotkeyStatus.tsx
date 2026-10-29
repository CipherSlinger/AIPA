// HotkeyStatus — what the OS actually accepted for AIPA's global chords.
//
// Registration happens once at launch in main. This card reports that recorded
// result instead of repeating the documentation: a refused chord is shown as
// unavailable, and an unread status is shown as unknown, never as available.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'
import {
  buildHotkeyRows,
  isShortcutStatusSnapshot,
  type ShortcutAvailability,
  type ShortcutStatusSnapshot,
} from '../../lib/hotkeyStatus'

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 12,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
}

const descStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
  marginBottom: 12,
}

function badgeStyle(state: ShortcutAvailability): React.CSSProperties {
  if (state === 'available') {
    return {
      color: 'var(--success-text)',
      background: 'rgba(34,197,94,0.10)',
      border: '1px solid rgba(34,197,94,0.22)',
    }
  }
  if (state === 'unavailable') {
    return {
      color: 'var(--warning-text)',
      background: 'rgba(251,191,36,0.10)',
      border: '1px solid rgba(251,191,36,0.22)',
    }
  }
  // Unknown is deliberately neutral — it must never look like success.
  return {
    color: 'var(--text-faint)',
    background: 'var(--bg-hover)',
    border: '1px solid var(--glass-border)',
  }
}

export default function HotkeyStatus() {
  const t = useT()
  const [status, setStatus] = useState<ShortcutStatusSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const api = window.electronAPI
      if (!api || typeof api.windowShortcutStatus !== 'function') {
        setStatus(null)
        return
      }
      const next: unknown = await api.windowShortcutStatus()
      // A malformed payload is unknown, not a partial status.
      setStatus(isShortcutStatusSnapshot(next) ? next : null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load when the panel mounts and whenever AIPA regains focus: the settings
  // panel can stay open across an alt-tab. No polling timer.
  useEffect(() => {
    void load()
    const onFocus = () => { void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const rows = useMemo(() => buildHotkeyRows(status, t), [status, t])

  return (
    <div style={sectionCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={sectionTitleStyle}>{t('settings.hotkeys.title')}</div>
        <button
          onClick={() => { void load() }}
          disabled={loading}
          aria-label={t('common.refresh')}
          title={t('common.refresh')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', fontSize: 11,
            background: 'transparent', border: '1px solid var(--glass-border)',
            borderRadius: 6,
            color: loading ? 'var(--text-faint)' : 'var(--text-muted)',
            cursor: loading ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw size={11} />
          {t('common.refresh')}
        </button>
      </div>
      <div style={descStyle}>{t('settings.hotkeys.description')}</div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(row => (
          <div
            key={row.id}
            style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.label}</span>
                {row.chord && (
                  <kbd style={{
                    background: 'var(--border)',
                    border: '1px solid var(--border)',
                    borderRadius: 5,
                    padding: '1px 5px',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}>
                    {row.chord}
                  </kbd>
                )}
              </div>
              <span style={{
                ...badgeStyle(row.state),
                fontSize: 10,
                borderRadius: 4,
                padding: '1px 6px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {row.stateLabel}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 4 }}>
              {row.detail}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 12 }}>
        {t('settings.hotkeys.focusOnlyNote')}
      </div>
    </div>
  )
}
