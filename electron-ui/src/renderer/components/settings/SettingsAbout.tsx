import React from 'react'
import { ExternalLink, Keyboard } from 'lucide-react'
import { useI18n } from '../../i18n'

interface SettingsAboutProps {
  onResetDefaults: () => void
  saved: boolean
  onShowShortcuts?: () => void
}

export default function SettingsAbout({ onResetDefaults, saved, onShowShortcuts }: SettingsAboutProps) {
  const { t } = useI18n()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* App identity */}
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', letterSpacing: 1 }}>AIPA</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('settings.about.aiPersonalAssistant')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>v{window.electronAPI.versions?.app || '1.0.0'}</div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Links */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.links')}</div>
        {[
          { label: t('settings.about.githubRepo'), url: 'https://github.com/CipherSlinger/AIPA' },
          { label: t('settings.about.anthropicConsole'), url: 'https://console.anthropic.com/' },
          { label: t('settings.about.apiDocs'), url: 'https://docs.anthropic.com/' },
          { label: t('settings.about.getApiKey'), url: 'https://console.anthropic.com/settings/keys' },
        ].map(link => (
          <button
            key={link.url}
            onClick={() => window.electronAPI.shellOpenExternal(link.url)}
            aria-label={link.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '7px 10px', marginBottom: 4, background: 'none',
              border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {link.label}
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Keyboard shortcuts -- link to full cheatsheet */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.keyboardShortcuts')}</div>
        <button
          onClick={onShowShortcuts}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 12px', background: 'var(--bg-active)',
            border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
            justifyContent: 'space-between',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Keyboard size={14} style={{ color: 'var(--accent)' }} />
            {t('settings.about.viewAllShortcuts')}
          </span>
          <kbd style={{
            fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)',
            border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px',
            fontFamily: 'inherit',
          }}>Ctrl+/</kbd>
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Runtime info */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.runtime')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          Electron {window.electronAPI.versions?.electron || 'N/A'}<br />
          Node.js {window.electronAPI.versions?.node || 'N/A'}<br />
          Chromium {window.electronAPI.versions?.chrome || 'N/A'}
        </div>
      </div>

      {/* Reset defaults */}
      <button
        onClick={onResetDefaults}
        aria-label={t('settings.about.resetDefaults')}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 4,
          padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
          width: '100%', textAlign: 'center', marginTop: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--error)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        {t('settings.about.resetDefaults')}
      </button>
    </div>
  )
}
