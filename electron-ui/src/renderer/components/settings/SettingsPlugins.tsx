// SettingsPlugins — install, manage, and enable/disable Claude Code plugins
import React, { useState, useEffect, useCallback } from 'react'
import { Puzzle, Plus, Trash2, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import PluginInstallPanel from './PluginInstallPanel'
import {
  isNpmInstallResult,
  navReloadSummary,
  reloadMessage,
  type InstallMessage,
  type InstallMode,
  type NpmInstallResult,
} from '../../lib/pluginInstallInput'

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

interface NavPluginBrief {
  manifest: { id: string }
  dirPath: string
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: 12,
}

export default function SettingsPlugins() {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installingLocal, setInstallingLocal] = useState(false)
  const [installingNpm, setInstallingNpm] = useState(false)
  const [installMode, setInstallMode] = useState<InstallMode>('local')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [showInstallForm, setShowInstallForm] = useState(false)
  const [deleteHover, setDeleteHover] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const [reloadNote, setReloadNote] = useState<InstallMessage | null>(null)

  const busy = installingLocal || installingNpm

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.electronAPI.pluginList()
      setPlugins(list as InstalledPlugin[])
    } catch (e) {
      setError(t('settingsPlugins.loadError', { error: String(e) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Local folder install ─────────────────────────────────────────────────
  const handleInstallLocal = async (folder: string) => {
    if (installingLocal || installingNpm) return
    setInstallingLocal(true)
    setError(null)
    try {
      await window.electronAPI.pluginRegisterLocal(folder)
      await load()
    } catch (e) {
      setError(t('settingsPlugins.installError', { error: String(e) }))
    } finally {
      setInstallingLocal(false)
    }
  }

  const handleBrowse = async (): Promise<string | null> => {
    try {
      const dir = await window.electronAPI.fsShowOpenDialog()
      return dir || null
    } catch {
      return null
    }
  }

  // ── npm package install ──────────────────────────────────────────────────
  // The main process answers with a refusal carrying its reason; this only
  // refreshes and reloads after a success, and never claims a plugin appeared
  // on a refusal.
  const handleInstallNpm = async (spec: string): Promise<NpmInstallResult | null> => {
    if (installingLocal || installingNpm) return null
    setInstallingNpm(true)
    setError(null)
    try {
      const raw = await window.electronAPI.pluginInstallNpm(spec)
      const result: NpmInstallResult = isNpmInstallResult(raw) ? raw : { ok: false, reason: 'install_failed' }
      if (!result.ok) return result
      await load()
      // The same channel the sidebar uses; no second reload channel exists.
      await reloadNavPlugins()
      return result
    } catch (e) {
      // A rejected invoke is not a refusal reason; report it as a failed
      // install so the form still says something true.
      return { ok: false, reason: 'install_failed', detail: String(e) }
    } finally {
      setInstallingNpm(false)
    }
  }

  // ── Nav plugin reload ────────────────────────────────────────────────────
  // Compares the rail before and after so "nothing changed" can be said
  // honestly, instead of implying a plugin appeared.
  const reloadNavPlugins = useCallback(async (): Promise<void> => {
    if (reloading) return
    setReloading(true)
    setReloadNote(null)
    try {
      const before = (await window.electronAPI.pluginNavList()) as NavPluginBrief[]
      const after = (await window.electronAPI.pluginNavReload()) as NavPluginBrief[]
      const summary = navReloadSummary(
        (before || []).map(p => ({ id: p.manifest.id, dirPath: p.dirPath })),
        (after || []).map(p => ({ id: p.manifest.id, dirPath: p.dirPath })),
      )
      setReloadNote(reloadMessage(summary))
    } catch (e) {
      setReloadNote({ key: 'settingsPlugins.reload.failed', params: { error: String(e) } })
    } finally {
      setReloading(false)
    }
  }, [reloading])

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

  const sourceLabel = (source: string) => {
    if (source.startsWith('local:')) return source.slice(6)
    if (source.startsWith('npm:')) return source.slice(4)
    return source
  }

  const sourceTag = (source: string) => {
    if (source.startsWith('local:')) return { label: t('settingsPlugins.sourceLocal'), color: 'var(--success-text)', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.25)' }
    if (source.startsWith('npm:')) return { label: t('settingsPlugins.sourceNpm'), color: 'var(--warning-text)', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' }
    return { label: t('settingsPlugins.sourceExternal'), color: 'var(--violet-text)', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' }
  }

  const pluginAccentColor = (source: string) => {
    if (source.startsWith('local:')) return 'rgba(74,222,128,0.55)'
    if (source.startsWith('npm:')) return 'rgba(251,191,36,0.55)'
    return 'rgba(99,102,241,0.55)'
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
            <Puzzle size={14} style={{ color: 'var(--accent-text)' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('settingsPlugins.title')}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
              {t('settingsPlugins.path')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { void reloadNavPlugins() }}
            disabled={reloading}
            title={t('settingsPlugins.reload.title')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border)',
              borderRadius: 6, cursor: reloading ? 'wait' : 'pointer',
              padding: '5px 8px', fontSize: 11,
              color: 'var(--text-muted)',
              transition: 'all 0.15s ease',
              opacity: reloading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: reloading ? 'spin 0.8s linear infinite' : undefined }} />
            {t('settingsPlugins.reload.action')}
          </button>
          <button
            onClick={() => { void load() }}
            title={t('common.refresh')}
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border)',
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: '5px 8px',
              color: 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--glass-border-md)'
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.background = 'var(--glass-border)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--glass-border)'
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'var(--bg-hover)'
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
              color: 'var(--text-primary)', cursor: 'pointer',
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
        fontSize: 12, color: 'var(--text-muted)',
        lineHeight: 1.6, marginTop: -12,
      }}>
        {t('settingsPlugins.description')}
      </div>

      {/* Reload note — honest about whether anything changed */}
      {reloadNote && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '8px 12px', marginTop: -8,
          background: 'var(--glass-shimmer)',
          border: '1px solid var(--glass-border)',
          borderRadius: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
          <RefreshCw size={12} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>{t(reloadNote.key, reloadNote.params)}</span>
          <button
            onClick={() => setReloadNote(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Install panel */}
      {showInstallForm && (
        <PluginInstallPanel
          busy={busy}
          mode={installMode}
          onModeChange={setInstallMode}
          onInstallLocal={handleInstallLocal}
          onInstallNpm={handleInstallNpm}
          onBrowse={handleBrowse}
          onClose={() => setShowInstallForm(false)}
        />
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 10, fontSize: 12, color: 'var(--danger-text)',
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-error)' }} />
          <span style={{ flex: 1, lineHeight: 1.5 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(252,165,165,0.6)', padding: 0,
              display: 'flex', alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger-text)' }}
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
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {t('common.loadingEllipsis')}
          </span>
        </div>
      ) : plugins.length === 0 ? (
        <div style={{
          padding: '40px 0', textAlign: 'center',
          background: 'var(--glass-shimmer)',
          border: '1px dashed var(--glass-border)',
          borderRadius: 10,
        }}>
          <Puzzle size={32} style={{ opacity: 0.18, marginBottom: 10, color: 'var(--text-secondary)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 500 }}>
            {t('settingsPlugins.noPlugins')}
          </div>
          <div style={{
            fontSize: 11, marginTop: 6,
            color: 'var(--text-faint)', lineHeight: 1.5,
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
                      ? 'var(--bg-hover)'
                      : 'var(--glass-shimmer)',
                    border: '1px solid var(--glass-border)',
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
                          : 'var(--glass-border-md)',
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
                          color: 'var(--text-primary)',
                        }}>
                          {plugin.name}
                        </span>
                        {plugin.version && (
                          <span style={{
                            background: 'var(--glass-border)',
                            border: '1px solid var(--glass-border-md)',
                            borderRadius: 20,
                            padding: '1px 7px', fontSize: 10,
                            color: 'var(--text-muted)',
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
                          fontSize: 12, color: 'var(--text-faint)',
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
                              color: 'var(--violet-text)',
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
                              color: 'var(--warning-text)',
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
                        fontSize: 10, color: 'var(--text-faint)',
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
                              borderRadius: 6, color: 'var(--color-error)', cursor: 'pointer',
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
                              background: 'var(--bg-hover)',
                              border: '1px solid var(--glass-border)',
                              borderRadius: 6, padding: '5px 8px',
                              fontSize: 11, color: 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--glass-border-md)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'var(--bg-hover)'
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
                              : 'var(--bg-hover)',
                            border: '1px solid ' + (deleteHover === plugin.name
                              ? 'rgba(239,68,68,0.28)'
                              : 'var(--glass-border)'),
                            borderRadius: 7,
                            cursor: 'pointer',
                            color: deleteHover === plugin.name
                              ? 'var(--danger-text)'
                              : 'var(--text-faint)',
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