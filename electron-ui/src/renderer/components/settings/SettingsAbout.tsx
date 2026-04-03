import React, { useState } from 'react'
import { ExternalLink, Keyboard, Activity, Download, Upload, Loader } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import DiagnosticsPanel from './DiagnosticsPanel'

interface SettingsAboutProps {
  onResetDefaults: () => void
  saved: boolean
  onShowShortcuts?: () => void
}

export default function SettingsAbout({ onResetDefaults, saved, onShowShortcuts }: SettingsAboutProps) {
  const { t } = useI18n()
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const addToast = useUiStore(s => s.addToast)

  const handleBackup = async () => {
    setBackupLoading(true)
    try {
      const result = await window.electronAPI.backupExport()
      if (result.success && result.counts) {
        const parts: string[] = []
        if (result.counts.personas > 0) parts.push(`${result.counts.personas} personas`)
        if (result.counts.workflows > 0) parts.push(`${result.counts.workflows} workflows`)
        if (result.counts.notes > 0) parts.push(`${result.counts.notes} notes`)
        if (result.counts.memories > 0) parts.push(`${result.counts.memories} memories`)
        if (result.counts.snippets > 0) parts.push(`${result.counts.snippets} snippets`)
        addToast('success', t('backup.exportSuccess', { size: String(result.sizeKB), items: parts.join(', ') || 'settings' }))
      } else if (result.error) {
        addToast('error', result.error)
      }
    } catch (err) {
      addToast('error', String(err))
    }
    setBackupLoading(false)
  }

  const handleRestore = async () => {
    setRestoreLoading(true)
    try {
      const result = await window.electronAPI.backupImport()
      if (result.success && result.imported) {
        const parts: string[] = []
        for (const [key, count] of Object.entries(result.imported)) {
          if (key !== 'settings' && count > 0) parts.push(`${count} ${key}`)
        }
        addToast('success', t('backup.importSuccess', { items: parts.join(', ') || 'settings' }))
        // Reload prefs from store after import
        const allPrefs = await window.electronAPI.prefsGetAll()
        if (allPrefs) {
          window.location.reload()
        }
      } else if (result.error) {
        addToast('error', result.error)
      }
    } catch (err) {
      addToast('error', String(err))
    }
    setRestoreLoading(false)
  }

  if (showDiagnostics) {
    return <DiagnosticsPanel onBack={() => setShowDiagnostics(false)} />
  }

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

      {/* Data Backup & Restore */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('backup.title')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flex: 1,
              padding: '10px 12px', background: 'var(--bg-active)',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', cursor: backupLoading ? 'wait' : 'pointer', fontSize: 12,
              justifyContent: 'center', opacity: backupLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!backupLoading) e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {backupLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} style={{ color: 'var(--accent)' }} />}
            {t('backup.export')}
          </button>
          <button
            onClick={handleRestore}
            disabled={restoreLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flex: 1,
              padding: '10px 12px', background: 'var(--bg-active)',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', cursor: restoreLoading ? 'wait' : 'pointer', fontSize: 12,
              justifyContent: 'center', opacity: restoreLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!restoreLoading) e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {restoreLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} style={{ color: 'var(--accent)' }} />}
            {t('backup.import')}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          {t('backup.hint')}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* System Diagnostics */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('diagnostics.title')}</div>
        <button
          onClick={() => setShowDiagnostics(true)}
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
            <Activity size={14} style={{ color: 'var(--accent)' }} />
            {t('diagnostics.runDiagnostics')}
          </span>
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Runtime info */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.runtime')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          Electron {window.electronAPI.versions?.electron || 'N/A'}<br />
          Node.js {window.electronAPI.versions?.node || 'N/A'}<br />
          Chromium {window.electronAPI.versions?.chrome || 'N/A'}<br />
          {window.electronAPI.versions?.platform || 'unknown'} / {window.electronAPI.versions?.arch || 'unknown'}
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
