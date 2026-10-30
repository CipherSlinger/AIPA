// PluginInstallPanel — the two install modes for Settings → Plugins: a local
// folder, or an npm package name. The npm path is two steps on purpose (name,
// then a confirmation that says what will happen), because installing a
// package runs third-party code and fetches it from a registry.
import React, { useMemo, useState } from 'react'
import { AlertTriangle, FolderOpen, Package } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  INSTALL_MODES,
  gateMessage,
  localInstallGate,
  npmInstallGate,
  installResultMessage,
  type InstallMessage,
  type InstallMode,
  type NpmInstallResult,
} from '../../lib/pluginInstallInput'

interface PluginInstallPanelProps {
  busy: boolean
  mode: InstallMode
  onModeChange: (mode: InstallMode) => void
  onInstallLocal: (folder: string) => Promise<void>
  onInstallNpm: (spec: string) => Promise<NpmInstallResult | null>
  onBrowse: () => Promise<string | null>
  onClose: () => void
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: 12,
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '7px 10px', fontSize: 13,
  background: 'var(--bg-input)',
  border: '1px solid var(--glass-border)',
  borderRadius: 7, color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
  transition: 'all 0.15s ease',
}

function noteStyle(tone: 'error' | 'info'): React.CSSProperties {
  return {
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 12,
    color: tone === 'error' ? 'var(--danger-text)' : 'var(--text-faint)',
  }
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 6,
  cursor: 'pointer',
  border: active ? '1px solid rgba(99,102,241,0.40)' : '1px solid var(--glass-border)',
  background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
  color: active ? 'var(--accent-text)' : 'var(--text-muted)',
  transition: 'all 0.15s ease',
})

const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '6px 16px', fontSize: 12, fontWeight: 600,
  background: enabled
    ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
    : 'rgba(99,102,241,0.25)',
  border: 'none', borderRadius: 7,
  color: 'var(--text-primary)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.6,
  transition: 'all 0.15s ease',
})

const ghostButtonStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--glass-border)',
  borderRadius: 7, padding: '6px 14px',
  cursor: 'pointer', fontSize: 12,
  color: 'var(--text-secondary)',
  transition: 'all 0.15s ease',
}

export default function PluginInstallPanel({
  busy, mode, onModeChange, onInstallLocal, onInstallNpm, onBrowse, onClose,
}: PluginInstallPanelProps) {
  const { t } = useI18n()
  const [installPath, setInstallPath] = useState('')
  const [npmSpec, setNpmSpec] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [npmNote, setNpmNote] = useState<InstallMessage | null>(null)

  const localGate = useMemo(() => localInstallGate(installPath, busy), [installPath, busy])
  const npmGate = useMemo(() => npmInstallGate(npmSpec, busy), [npmSpec, busy])
  const localMessage = gateMessage(localGate)
  const npmMessage = gateMessage(npmGate)

  // A confirmation belongs to one spec; editing the name retracts it.
  const changeSpec = (value: string) => {
    setNpmSpec(value)
    setConfirming(false)
    setNpmNote(null)
  }

  const handleBrowse = async () => {
    const picked = await onBrowse()
    if (picked) setInstallPath(picked)
  }

  const handleInstallLocal = async () => {
    if (!localGate.enabled) return
    await onInstallLocal(installPath.trim())
  }


  const askConfirmation = () => {
    if (!npmGate.enabled) return
    setConfirming(true)
  }

  const handleConfirmNpm = async () => {
    if (!npmGate.enabled || !confirming) return
    setConfirming(false)
    setNpmNote(null)
    const result = await onInstallNpm(npmSpec.trim())
    if (result) setNpmNote(installResultMessage(result, npmSpec))
  }

  return (
    <div style={{
      background: 'var(--glass-shimmer)',
      border: '1px solid var(--glass-border)',
      borderRadius: 10, padding: '16px',
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {INSTALL_MODES.map(candidate => (
          <button
            key={candidate}
            onClick={() => onModeChange(candidate)}
            disabled={busy}
            style={tabStyle(mode === candidate)}
          >
            {t(candidate === 'local' ? 'settingsPlugins.mode.local' : 'settingsPlugins.mode.npm')}
          </button>
        ))}
      </div>

      {mode === 'local' ? (
        <>
          <div style={sectionLabelStyle}>{t('settingsPlugins.installLocal')}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              value={installPath}
              onChange={e => setInstallPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleInstallLocal() }}
              placeholder={t('settingsPlugins.installPathPlaceholder')}
              disabled={busy}
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            />
            <button
              onClick={handleBrowse}
              disabled={busy}
              title={t('settingsPlugins.browseDir')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 10px', fontSize: 12,
                background: 'var(--bg-input)',
                border: '1px solid var(--glass-border)',
                borderRadius: 7, color: 'var(--text-secondary)', cursor: busy ? 'wait' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <FolderOpen size={13} />
            </button>
          </div>
          <div style={noteStyle('info')}>{t('settingsPlugins.installDirHint')}</div>
          {localMessage && (
            <div style={noteStyle('error')}>{t(localMessage.key, localMessage.params)}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={onClose} disabled={busy} style={ghostButtonStyle}>
              {t('common.cancel')}
            </button>
            <button
              onClick={handleInstallLocal}
              disabled={!localGate.enabled}
              style={primaryButtonStyle(localGate.enabled)}
            >
              {busy ? t('settingsPlugins.installingPlugin') : t('settingsPlugins.installPlugin')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={sectionLabelStyle}>{t('settingsPlugins.installNpm')}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              value={npmSpec}
              onChange={e => changeSpec(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                if (!confirming) askConfirmation()
                else handleConfirmNpm()
              }}
              placeholder={t('settingsPlugins.npmPlaceholder')}
              disabled={busy}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            />
            <button
              onClick={askConfirmation}
              disabled={!npmGate.enabled || confirming}
              style={{
                ...primaryButtonStyle(npmGate.enabled && !confirming),
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Package size={12} /> {t('settingsPlugins.npmAskAction')}
            </button>
          </div>
          <div style={noteStyle('info')}>{t('settingsPlugins.npmHint')}</div>
          {npmMessage && (
            <div style={noteStyle('error')}>{t(npmMessage.key, npmMessage.params)}</div>
          )}

          {npmGate.enabled && confirming && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '10px 14px',
              background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.22)',
              borderRadius: 10, marginBottom: 12,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--warning-text)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.55 }}>
                  {t('settingsPlugins.npmConfirm', { spec: npmSpec.trim() })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                  <button onClick={() => setConfirming(false)} style={ghostButtonStyle}>
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleConfirmNpm}
                    style={{
                      ...primaryButtonStyle(true),
                      background: 'linear-gradient(135deg, rgba(251,191,36,0.85), rgba(245,158,11,0.85))',
                    }}
                  >
                    {t('settingsPlugins.npmConfirmAction')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            {busy
              ? t('settingsPlugins.npmProgress', { spec: npmSpec.trim() })
              : t('settingsPlugins.npmSecurity')}
          </div>
          {npmNote && (
            <div style={{
              fontSize: 12, lineHeight: 1.6, marginTop: 8,
              color: 'var(--text-secondary)',
            }}>
              {t(npmNote.key, npmNote.params)}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
            <button onClick={onClose} disabled={busy} style={ghostButtonStyle}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}