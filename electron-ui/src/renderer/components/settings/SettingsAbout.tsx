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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
  marginBottom: 10,
}

const sectionCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 12,
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.05)',
  margin: '8px 0',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* App identity */}
      <div style={{ ...sectionCardStyle, textAlign: 'center', padding: '20px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>AIPA</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{t('settings.about.aiPersonalAssistant')}</div>
        <div style={{
          display: 'inline-block',
          marginTop: 10,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 20,
          padding: '3px 10px',
          fontSize: 12,
          fontWeight: 700,
          color: '#818cf8',
          fontVariantNumeric: 'tabular-nums',
        }}>
          v{window.electronAPI.versions?.app || '1.0.0'}
        </div>
      </div>

      {/* Links */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('settings.about.links')}</div>
        {[
          { label: t('settings.about.githubRepo'), url: 'https://github.com/CipherSlinger/AIPA' },
          { label: t('settings.about.anthropicConsole'), url: 'https://console.anthropic.com/' },
          { label: t('settings.about.apiDocs'), url: 'https://docs.anthropic.com/' },
          { label: t('settings.about.getApiKey'), url: 'https://console.anthropic.com/settings/keys' },
        ].map((link, i, arr) => (
          <React.Fragment key={link.url}>
            <button
              onClick={() => window.electronAPI.shellOpenExternal(link.url)}
              aria-label={link.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '6px 14px', marginBottom: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 6,
                color: '#818cf8', cursor: 'pointer', fontSize: 12,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.textDecoration = 'none';
              }}
            >
              <ExternalLink size={12} style={{ color: 'rgba(129,140,248,0.6)', flexShrink: 0 }} />
              {link.label}
            </button>
            {i < arr.length - 1 && <div style={dividerStyle} />}
          </React.Fragment>
        ))}
      </div>

      {/* Keyboard shortcuts -- link to full cheatsheet */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('settings.about.keyboardShortcuts')}</div>
        <button
          onClick={onShowShortcuts}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.82)', cursor: 'pointer', fontSize: 12,
            justifyContent: 'space-between',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Keyboard size={14} style={{ color: '#a5b4fc' }} />
            {t('settings.about.viewAllShortcuts')}
          </span>
          <kbd style={{
            fontSize: 10, color: 'rgba(255,255,255,0.38)',
            background: 'rgba(12,12,22,0.6)',
            border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '1px 6px',
            fontFamily: 'inherit',
          }}>Ctrl+/</kbd>
        </button>
      </div>

      {/* Data Backup & Restore */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('backup.title')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flex: 1,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.82)', cursor: backupLoading ? 'wait' : 'pointer', fontSize: 12,
              justifyContent: 'center', opacity: backupLoading ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!backupLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            {backupLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} style={{ color: '#a5b4fc' }} />}
            {t('backup.export')}
          </button>
          <button
            onClick={handleRestore}
            disabled={restoreLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flex: 1,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.82)', cursor: restoreLoading ? 'wait' : 'pointer', fontSize: 12,
              justifyContent: 'center', opacity: restoreLoading ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!restoreLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            {restoreLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} style={{ color: '#a5b4fc' }} />}
            {t('backup.import')}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 8, lineHeight: 1.5 }}>
          {t('backup.hint')}
        </div>
      </div>

      {/* System Diagnostics */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('diagnostics.title')}</div>
        <button
          onClick={() => setShowDiagnostics(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.82)', cursor: 'pointer', fontSize: 12,
            justifyContent: 'space-between',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} style={{ color: '#a5b4fc' }} />
            {t('diagnostics.runDiagnostics')}
          </span>
        </button>
      </div>

      {/* Runtime info */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('settings.about.runtime')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { key: 'Electron', val: window.electronAPI.versions?.electron || 'N/A' },
            { key: 'Node.js', val: window.electronAPI.versions?.node || 'N/A' },
            { key: 'Chromium', val: window.electronAPI.versions?.chrome || 'N/A' },
            { key: 'Platform', val: `${window.electronAPI.versions?.platform || 'unknown'} / ${window.electronAPI.versions?.arch || 'unknown'}` },
          ].map((row, i, arr) => (
            <React.Fragment key={row.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums' }}>{row.key}</span>
                <span style={{
                  fontFamily: 'monospace', fontSize: 11, color: 'rgba(165,180,252,0.8)',
                  background: 'rgba(12,12,22,0.6)', borderRadius: 6, padding: '1px 5px',
                }}>{row.val}</span>
              </div>
              {i < arr.length - 1 && <div style={dividerStyle} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Reset defaults */}
      <button
        onClick={onResetDefaults}
        aria-label={t('settings.about.resetDefaults')}
        style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 6,
          padding: '8px 16px',
          color: '#fca5a5',
          cursor: 'pointer',
          fontSize: 12,
          width: '100%',
          textAlign: 'center',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
      >
        {t('settings.about.resetDefaults')}
      </button>
    </div>
  )
}
