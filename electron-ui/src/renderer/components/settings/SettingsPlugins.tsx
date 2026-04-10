// SettingsPlugins — install, manage, and enable/disable Claude Code plugins
import React, { useState, useEffect, useCallback } from 'react'
import { Puzzle, Plus, Trash2, RefreshCw, AlertTriangle, X, FolderOpen } from 'lucide-react'
import { useI18n } from '../../i18n'

interface InstalledPlugin {
  name: string
  version?: string
  source: string
  enabled: boolean
  installDate: string
  description?: string
  mcpServers?: Record<string, unknown>
  hooks?: Record<string, unknown>
}

type InstallMode = 'local'

export default function SettingsPlugins() {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installPath, setInstallPath] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [showInstallForm, setShowInstallForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.electronAPI.pluginList()
      setPlugins(list)
    } catch (e) {
      setError(t('settingsPlugins.loadError', { error: String(e) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleInstallLocal = async () => {
    if (!installPath.trim()) return
    setInstalling(true)
    setError(null)
    try {
      await window.electronAPI.pluginRegisterLocal(installPath.trim())
      setInstallPath('')
      setShowInstallForm(false)
      await load()
    } catch (e) {
      setError(t('settingsPlugins.installError', { error: String(e) }))
    } finally {
      setInstalling(false)
    }
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    setToggling(name)
    try {
      await window.electronAPI.pluginSetEnabled(name, !enabled)
      await load()
    } catch (e) {
      setError(t('settingsPlugins.toggleError', { error: String(e) }))
    } finally {
      setToggling(null)
    }
  }

  const handleUninstall = async (name: string) => {
    try {
      await window.electronAPI.pluginUninstall(name)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(t('settingsPlugins.uninstallError', { error: String(e) }))
    }
  }

  const handleBrowseDir = async () => {
    try {
      const dir = await window.electronAPI.fsShowOpenDialog()
      if (dir) setInstallPath(dir)
    } catch { /* cancelled */ }
  }

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 4,
  }

  const sourceLabel = (source: string) => {
    if (source.startsWith('local:')) return source.slice(6)
    if (source.startsWith('npm:')) return source.slice(4)
    return source
  }

  const sourceTag = (source: string) => {
    if (source.startsWith('local:')) return { label: t('settingsPlugins.sourceLocal'), color: '#10b981' }
    if (source.startsWith('npm:')) return { label: t('settingsPlugins.sourceNpm'), color: '#f59e0b' }
    return { label: t('settingsPlugins.sourceExternal'), color: '#8b5cf6' }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Puzzle size={15} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settingsPlugins.title')}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('settingsPlugins.path')}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={load} title={t('common.refresh')} style={{ ...btnStyle, color: 'var(--text-muted)' }}>
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setShowInstallForm(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', fontSize: 11, fontWeight: 500,
              background: 'var(--accent)', border: 'none', borderRadius: 6,
              color: '#fff', cursor: 'pointer',
            }}
          >
            <Plus size={11} /> {t('settingsPlugins.installBtn')}
          </button>
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {t('settingsPlugins.description')}
      </div>

      {/* Install form */}
      {showInstallForm && (
        <div style={{
          background: 'var(--bg-input)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 12, marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>{t('settingsPlugins.installLocal')}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              value={installPath}
              onChange={e => setInstallPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleInstallLocal() }}
              placeholder={t('settingsPlugins.installPathPlaceholder')}
              style={{
                flex: 1, padding: '6px 10px', fontSize: 12,
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button
              onClick={handleBrowseDir}
              title={t('settingsPlugins.browseDir')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', fontSize: 11,
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <FolderOpen size={13} />
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
            {t('settingsPlugins.installDirHint')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => { setShowInstallForm(false); setInstallPath('') }} style={{ ...btnStyle, padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)' }}>{t('common.cancel')}</button>
            <button
              onClick={handleInstallLocal}
              disabled={installing || !installPath.trim()}
              style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 500,
                background: 'var(--accent)', border: 'none', borderRadius: 5,
                color: '#fff', cursor: installing || !installPath.trim() ? 'not-allowed' : 'pointer',
                opacity: installing || !installPath.trim() ? 0.6 : 1,
              }}
            >
              {installing ? t('settingsPlugins.installingPlugin') : t('settingsPlugins.installPlugin')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '8px 10px', background: 'rgba(239,68,68,0.1)',
          borderRadius: 6, fontSize: 11, color: 'var(--error)', marginBottom: 12,
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ ...btnStyle, color: 'var(--error)' }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Plugin list */}
      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{t('common.loadingEllipsis')}</div>
      ) : plugins.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          <Puzzle size={28} style={{ opacity: 0.2, marginBottom: 8 }} />
          <div>{t('settingsPlugins.noPlugins')}</div>
          <div style={{ fontSize: 10, marginTop: 4 }}>{t('settingsPlugins.noPluginsHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plugins.map(plugin => {
            const tag = sourceTag(plugin.source)
            const isConfirmDelete = confirmDelete === plugin.name
            const isToggling = toggling === plugin.name
            const mcpCount = plugin.mcpServers ? Object.keys(plugin.mcpServers).length : 0
            const hooksCount = plugin.hooks ? Object.keys(plugin.hooks).length : 0

            return (
              <div
                key={plugin.name}
                style={{
                  border: '1px solid ' + (plugin.enabled ? 'var(--border)' : 'rgba(107,114,128,0.3)'),
                  borderRadius: 8, overflow: 'hidden',
                  background: plugin.enabled ? 'var(--bg-input)' : 'rgba(107,114,128,0.05)',
                  opacity: plugin.enabled ? 1 : 0.7,
                  transition: 'opacity 200ms, border-color 200ms',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  {/* Enable toggle */}
                  <button
                    onClick={() => handleToggle(plugin.name, plugin.enabled)}
                    disabled={isToggling}
                    title={plugin.enabled ? t('settingsPlugins.disablePlugin') : t('settingsPlugins.enablePlugin')}
                    style={{
                      width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
                      background: plugin.enabled ? 'var(--accent)' : 'var(--border)',
                      position: 'relative', flexShrink: 0,
                      transition: 'background 200ms',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
                      background: '#fff', transition: 'left 200ms',
                      left: plugin.enabled ? 16 : 2,
                    }} />
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {plugin.name}
                      </span>
                      {plugin.version && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>v{plugin.version}</span>
                      )}
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 8,
                        background: `${tag.color}22`, color: tag.color,
                      }}>
                        {tag.label}
                      </span>
                    </div>
                    {plugin.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {plugin.description}
                      </div>
                    )}
                    {/* Capability badges */}
                    {(mcpCount > 0 || hooksCount > 0) && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {mcpCount > 0 && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
                            {t('settingsPlugins.mcpCount', { count: String(mcpCount) })}
                          </span>
                        )}
                        {hooksCount > 0 && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                            {hooksCount > 1 ? t('settingsPlugins.hookCount_other', { count: String(hooksCount) }) : t('settingsPlugins.hookCount_one', { count: String(hooksCount) })}
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sourceLabel(plugin.source)}
                    </div>
                  </div>

                  {/* Delete button */}
                  <div style={{ flexShrink: 0 }}>
                    {isConfirmDelete ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => handleUninstall(plugin.name)} style={{ padding: '3px 8px', fontSize: 10, background: 'var(--error)', border: 'none', borderRadius: 5, color: '#fff', cursor: 'pointer' }}>
                          {t('settingsPlugins.uninstallConfirm')}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(plugin.name)}
                        title={t('settingsPlugins.uninstallConfirm')}
                        style={{ ...btnStyle, color: 'var(--error)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
