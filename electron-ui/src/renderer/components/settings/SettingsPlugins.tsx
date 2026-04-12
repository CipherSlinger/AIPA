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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
  marginBottom: 12,
}

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
  const [deleteHover, setDeleteHover] = useState<string | null>(null)

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

  const sourceLabel = (source: string) => {
    if (source.startsWith('local:')) return source.slice(6)
    if (source.startsWith('npm:')) return source.slice(4)
    return source
  }

  const sourceTag = (source: string) => {
    if (source.startsWith('local:')) return { label: t('settingsPlugins.sourceLocal'), color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)' }
    if (source.startsWith('npm:')) return { label: t('settingsPlugins.sourceNpm'), color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' }
    return { label: t('settingsPlugins.sourceExternal'), color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' }
  }

  const pluginAccentColor = (source: string) => {
    if (source.startsWith('local:')) return 'rgba(74,222,128,0.55)'
    if (source.startsWith('npm:')) return 'rgba(251,191,36,0.55)'
    return 'rgba(99,102,241,0.55)'
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '7px 10px', fontSize: 13,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 7, color: 'rgba(255,255,255,0.82)',
    outline: 'none', boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Puzzle size={14} style={{ color: '#a5b4fc' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
              {t('settingsPlugins.title')}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
              {t('settingsPlugins.path')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={load}
            title={t('common.refresh')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: '5px 8px',
              color: 'rgba(255,255,255,0.45)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setShowInstallForm(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', fontSize: 12, fontWeight: 600,
              background: showInstallForm
                ? 'rgba(99,102,241,0.25)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: showInstallForm ? '1px solid rgba(99,102,241,0.4)' : 'none',
              borderRadius: 7,
              color: 'rgba(255,255,255,0.82)', cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!showInstallForm) {
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <Plus size={12} /> {t('settingsPlugins.installBtn')}
          </button>
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.45)',
        lineHeight: 1.6, marginTop: -12,
      }}>
        {t('settingsPlugins.description')}
      </div>

      {/* Install form */}
      {showInstallForm && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10, padding: '16px',
        }}>
          <div style={sectionLabelStyle}>{t('settingsPlugins.installLocal')}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              value={installPath}
              onChange={e => setInstallPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleInstallLocal() }}
              placeholder={t('settingsPlugins.installPathPlaceholder')}
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
            />
            <button
              onClick={handleBrowseDir}
              title={t('settingsPlugins.browseDir')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 10px', fontSize: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 7, color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                e.currentTarget.style.color = '#a5b4fc'
                e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
            >
              <FolderOpen size={13} />
            </button>
          </div>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.38)',
            marginBottom: 12, lineHeight: 1.6,
          }}>
            {t('settingsPlugins.installDirHint')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              onClick={() => { setShowInstallForm(false); setInstallPath('') }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 7, padding: '6px 14px',
                cursor: 'pointer', fontSize: 12,
                color: 'rgba(255,255,255,0.60)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleInstallLocal}
              disabled={installing || !installPath.trim()}
              style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 600,
                background: installing || !installPath.trim()
                  ? 'rgba(99,102,241,0.25)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none', borderRadius: 7,
                color: 'rgba(255,255,255,0.82)',
                cursor: installing || !installPath.trim() ? 'not-allowed' : 'pointer',
                opacity: installing || !installPath.trim() ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {installing ? t('settingsPlugins.installingPlugin') : t('settingsPlugins.installPlugin')}
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 10, fontSize: 12, color: '#fca5a5',
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: '#f87171' }} />
          <span style={{ flex: 1, lineHeight: 1.5 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(252,165,165,0.6)', padding: 0,
              display: 'flex', alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(252,165,165,0.6)' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Plugin list */}
      {loading ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, padding: '32px 0',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid rgba(99,102,241,0.25)',
            borderTopColor: 'rgba(99,102,241,0.8)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
            {t('common.loadingEllipsis')}
          </span>
        </div>
      ) : plugins.length === 0 ? (
        <div style={{
          padding: '40px 0', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.07)',
          borderRadius: 10,
        }}>
          <Puzzle size={32} style={{ opacity: 0.18, marginBottom: 10, color: 'rgba(255,255,255,0.60)' }} />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: 500 }}>
            {t('settingsPlugins.noPlugins')}
          </div>
          <div style={{
            fontSize: 11, marginTop: 6,
            color: 'rgba(255,255,255,0.38)', lineHeight: 1.5,
          }}>
            {t('settingsPlugins.noPluginsHint')}
          </div>
        </div>
      ) : (
        <div>
          <div style={sectionLabelStyle}>
            {t('settingsPlugins.installedLabel') || 'Installed'} · {plugins.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plugins.map(plugin => {
              const tag = sourceTag(plugin.source)
              const isConfirmDelete = confirmDelete === plugin.name
              const isToggling = toggling === plugin.name
              const mcpCount = plugin.mcpServers ? Object.keys(plugin.mcpServers).length : 0
              const hooksCount = plugin.hooks ? Object.keys(plugin.hooks).length : 0
              const accentColor = pluginAccentColor(plugin.source)

              return (
                <div
                  key={plugin.name}
                  style={{
                    background: plugin.enabled
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderLeft: `3px solid ${accentColor}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    opacity: plugin.enabled ? 1 : 0.55,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    gap: 10, padding: '12px 14px',
                  }}>
                    {/* Enable toggle */}
                    <button
                      onClick={() => handleToggle(plugin.name, plugin.enabled)}
                      disabled={isToggling}
                      title={plugin.enabled ? t('settingsPlugins.disablePlugin') : t('settingsPlugins.enablePlugin')}
                      style={{
                        width: 34, height: 19, borderRadius: 10, border: 'none',
                        cursor: isToggling ? 'wait' : 'pointer',
                        background: plugin.enabled
                          ? 'rgba(99,102,241,0.70)'
                          : 'rgba(255,255,255,0.12)',
                        position: 'relative', flexShrink: 0,
                        transition: 'all 0.15s ease',
                        boxShadow: plugin.enabled
                          ? '0 0 8px rgba(99,102,241,0.35)'
                          : 'none',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2.5,
                        width: 14, height: 14, borderRadius: '50%',
                        background: '#ffffff', transition: 'all 0.15s ease',
                        left: plugin.enabled ? 18 : 3,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }} />
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        gap: 6, flexWrap: 'wrap',
                      }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: 'rgba(255,255,255,0.82)',
                        }}>
                          {plugin.name}
                        </span>
                        {plugin.version && (
                          <span style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.09)',
                            borderRadius: 20,
                            padding: '1px 7px', fontSize: 10,
                            color: 'rgba(255,255,255,0.45)',
                          }}>
                            v{plugin.version}
                          </span>
                        )}
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                          padding: '2px 6px', borderRadius: 8,
                          background: tag.bg, color: tag.color,
                          border: `1px solid ${tag.border}`,
                        }}>
                          {tag.label}
                        </span>
                      </div>
                      {plugin.description && (
                        <div style={{
                          fontSize: 12, color: 'rgba(255,255,255,0.38)',
                          marginTop: 3, lineHeight: 1.5,
                        }}>
                          {plugin.description}
                        </div>
                      )}
                      {/* Capability badges */}
                      {(mcpCount > 0 || hooksCount > 0) && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          {mcpCount > 0 && (
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: '2px 7px',
                              borderRadius: 8,
                              background: 'rgba(139,92,246,0.10)',
                              color: '#a78bfa',
                              border: '1px solid rgba(167,139,250,0.22)',
                            }}>
                              {t('settingsPlugins.mcpCount', { count: String(mcpCount) })}
                            </span>
                          )}
                          {hooksCount > 0 && (
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: '2px 7px',
                              borderRadius: 8,
                              background: 'rgba(245,158,11,0.10)',
                              color: '#fbbf24',
                              border: '1px solid rgba(251,191,36,0.22)',
                            }}>
                              {hooksCount > 1
                                ? t('settingsPlugins.hookCount_other', { count: String(hooksCount) })
                                : t('settingsPlugins.hookCount_one', { count: String(hooksCount) })}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{
                        fontSize: 10, color: 'rgba(255,255,255,0.38)',
                        marginTop: 5, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                      }}>
                        {sourceLabel(plugin.source)}
                      </div>
                    </div>

                    {/* Delete / uninstall */}
                    <div style={{ flexShrink: 0 }}>
                      {isConfirmDelete ? (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            onClick={() => handleUninstall(plugin.name)}
                            style={{
                              padding: '5px 10px', fontSize: 11, fontWeight: 600,
                              background: 'rgba(239,68,68,0.15)',
                              border: '1px solid rgba(239,68,68,0.30)',
                              borderRadius: 6, color: '#f87171', cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(239,68,68,0.25)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                            }}
                          >
                            {t('settingsPlugins.uninstallConfirm')}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              borderRadius: 6, padding: '5px 8px',
                              fontSize: 11, color: 'rgba(255,255,255,0.45)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            }}
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(plugin.name)}
                          onMouseEnter={() => setDeleteHover(plugin.name)}
                          onMouseLeave={() => setDeleteHover(null)}
                          title={t('settingsPlugins.uninstallConfirm')}
                          style={{
                            background: deleteHover === plugin.name
                              ? 'rgba(239,68,68,0.12)'
                              : 'rgba(255,255,255,0.05)',
                            border: '1px solid ' + (deleteHover === plugin.name
                              ? 'rgba(239,68,68,0.28)'
                              : 'rgba(255,255,255,0.07)'),
                            borderRadius: 7,
                            cursor: 'pointer',
                            color: deleteHover === plugin.name
                              ? '#f87171'
                              : 'rgba(255,255,255,0.38)',
                            padding: '5px 7px',
                            display: 'flex', alignItems: 'center',
                            transition: 'all 0.15s ease',
                          }}
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
        </div>
      )}
    </div>
  )
}
