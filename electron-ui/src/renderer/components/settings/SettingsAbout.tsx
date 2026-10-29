import React, { useState } from 'react'
import { ExternalLink, Keyboard, Activity, Download, Upload, Loader } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import DiagnosticsPanel from './DiagnosticsPanel'
import AutoBackupPanel from './AutoBackupPanel'
import {
  backupErrorText,
  presentImportReport,
  summarizeBackupCounts,
  type BackupReportLine,
} from './backupReport'

declare const __BUILD_DATE__: string
declare const __COMMIT_HASH__: string
declare const __CLI_VERSION__: string

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
  color: 'var(--text-faint)',
  marginBottom: 10,
}

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 12,
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '8px 0',
}

interface BackupReport {
  kind: 'export' | 'import'
  lines: BackupReportLine[]
  canReload: boolean
}

export default function SettingsAbout({ onResetDefaults, onShowShortcuts }: SettingsAboutProps) {
  const { t } = useI18n()
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [report, setReport] = useState<BackupReport | null>(null)
  const addToast = useUiStore(s => s.addToast)

  const summarize = (counts: Record<string, number> | undefined, keys: string[]): string =>
    summarizeBackupCounts(counts, keys, t)

  const errorText = (code: string | undefined, fallback: string | undefined): string =>
    backupErrorText(code, fallback, t)

  const handleBackup = async () => {
    setBackupLoading(true)
    try {
      const result = await window.electronAPI.backupExport()
      if (result.success && result.counts) {
        const items = summarize(result.counts, [
          'personas', 'workflows', 'notes', 'memories', 'snippets', 'quickReplies', 'templates',
          'tagNames', 'jobs', 'jobTrash', 'skills', 'trashedSkills', 'memoryFiles', 'sessionTrash',
        ])
        const lines: BackupReportLine[] = [
          { tone: 'ok', text: t('backup.report.exported', { size: String(result.sizeKB), items: items || t('backup.report.settingsOnly') }) },
        ]
        const skipped = result.counts.skippedFiles || 0
        if (skipped > 0) {
          lines.push({ tone: 'warn', text: t('backup.report.exportSkippedFiles', { n: String(skipped) }) })
        }
        lines.push({ tone: 'muted', text: t('backup.report.exportNotIncluded') })
        setReport({ kind: 'export', lines, canReload: false })
        addToast('success', t('backup.exportSuccess', { size: String(result.sizeKB), items: items || t('backup.report.settingsOnly') }))
      } else if (result.error) {
        addToast('error', errorText(result.error, undefined))
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
      if (result.success) {
        const presented = presentImportReport(result, t)
        setReport({ kind: 'import', lines: presented.lines, canReload: presented.canReload })
        addToast('success', presented.writtenSummary
          ? t('backup.importSuccess', { items: presented.writtenSummary })
          : t('backup.report.nothingWritten'))
      } else if (result.error) {
        addToast('error', errorText(result.errorCode || result.error, result.error))
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
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>AIPA</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{t('settings.about.aiPersonalAssistant')}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 20,
            padding: '3px 10px',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--accent-text)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            App v{window.electronAPI.versions?.app || '1.0.0'}
          </div>
          <div style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.28)',
            borderRadius: 20,
            padding: '3px 10px',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--success-text)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            CLI v{__CLI_VERSION__}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 8 }}>
          Built {__BUILD_DATE__} · {__COMMIT_HASH__}
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
                background: 'var(--bg-hover)',
                border: '1px solid var(--glass-border-md)',
                borderRadius: 6,
                color: 'var(--accent-text)', cursor: 'pointer', fontSize: 12,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--glass-border-md)';
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
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
            background: 'var(--bg-hover)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6,
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
            justifyContent: 'space-between',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-border-md)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Keyboard size={14} style={{ color: 'var(--accent-text)' }} />
            {t('settings.about.viewAllShortcuts')}
          </span>
          <kbd style={{
            fontSize: 10, color: 'var(--text-faint)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--glass-border-md)', borderRadius: 6, padding: '1px 6px',
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
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 6,
              color: 'var(--text-primary)', cursor: backupLoading ? 'wait' : 'pointer', fontSize: 12,
              justifyContent: 'center', opacity: backupLoading ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!backupLoading) e.currentTarget.style.background = 'var(--glass-border-md)' }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          >
            {backupLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} style={{ color: 'var(--accent-text)' }} />}
            {t('backup.export')}
          </button>
          <button
            onClick={handleRestore}
            disabled={restoreLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flex: 1,
              padding: '10px 12px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 6,
              color: 'var(--text-primary)', cursor: restoreLoading ? 'wait' : 'pointer', fontSize: 12,
              justifyContent: 'center', opacity: restoreLoading ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!restoreLoading) e.currentTarget.style.background = 'var(--glass-border-md)' }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          >
            {restoreLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} style={{ color: 'var(--accent-text)' }} />}
            {t('backup.import')}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          {t('backup.scopeHint')}
        </div>
        {report && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              borderTop: '1px solid var(--glass-border)',
              paddingTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            <div style={{ ...sectionLabelStyle, marginBottom: 0 }}>
              {report.kind === 'export' ? t('backup.report.exportTitle') : t('backup.report.importTitle')}
            </div>
            {report.lines.map((line, index) => (
              <div
                key={`${line.tone}-${index}`}
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: line.tone === 'ok'
                    ? 'var(--text-primary)'
                    : line.tone === 'warn'
                      ? 'var(--warning-text, var(--text-primary))'
                      : 'var(--text-muted)',
                }}
              >
                {line.text}
              </div>
            ))}
            {report.canReload && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 2,
                  padding: '4px 10px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--glass-border-md)',
                  borderRadius: 6,
                  color: 'var(--accent-text)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {t('backup.report.reload')}
              </button>
            )}
          </div>
        )}
        <AutoBackupPanel />
      </div>

      {/* System Diagnostics */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('diagnostics.title')}</div>
        <button
          onClick={() => setShowDiagnostics(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 12px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6,
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
            justifyContent: 'space-between',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-border-md)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} style={{ color: 'var(--accent-text)' }} />
            {t('diagnostics.runDiagnostics')}
          </span>
        </button>
      </div>

      {/* Runtime info */}
      <div style={sectionCardStyle}>
        <div style={sectionLabelStyle}>{t('settings.about.runtime')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { key: 'App', val: `v${window.electronAPI.versions?.app || '1.0.0'}` },
            { key: 'CLI', val: `v${__CLI_VERSION__}` },
            { key: 'Electron', val: window.electronAPI.versions?.electron || 'N/A' },
            { key: 'Node.js', val: window.electronAPI.versions?.node || 'N/A' },
            { key: 'Chromium', val: window.electronAPI.versions?.chrome || 'N/A' },
            { key: 'Platform', val: `${window.electronAPI.versions?.platform || 'unknown'} / ${window.electronAPI.versions?.arch || 'unknown'}` },
          ].map((row, i, arr) => (
            <React.Fragment key={row.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{row.key}</span>
                <span style={{
                  fontFamily: 'monospace', fontSize: 11, color: 'var(--accent-text)',
                  background: 'var(--bg-primary)', borderRadius: 6, padding: '1px 5px',
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
          color: 'var(--danger-text)',
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
