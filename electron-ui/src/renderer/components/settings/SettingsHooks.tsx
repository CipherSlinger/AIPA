// Settings → Hooks (Codex only, read-only).
//
// Codex lists every configured hook (`hooks/list`) together with its trust
// state. An `untrusted` or `modified` hook is listed but never executed — that
// is the honest reason a hook the user configured did nothing. The protocol
// has no trust request, so this page never offers a toggle: trusting is a
// config edit (`[hooks.state.'<key>']` + `trusted_hash`) plus a Codex restart.
//
// Same visual language as Settings → MCP: one header, a note block, cards.
import React, { useCallback, useEffect, useState } from 'react'
import { Webhook, AlertCircle, Info, RefreshCw } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import {
  groupHooksByEvent,
  hookCommandLabel,
  hookRunState,
  readHookListReply,
  trustLabelKey,
  type HookListOutcome,
  type HookListRow,
} from './hookListView'

function abbreviatePath(fullPath: string, homeDir: string): string {
  if (homeDir && fullPath.startsWith(homeDir)) return '~' + fullPath.slice(homeDir.length)
  return fullPath
}

function runStateColors(state: ReturnType<typeof hookRunState>): {
  bg: string
  text: string
  border: string
  key: string
} {
  if (state === 'runs') {
    return {
      bg: 'rgba(52,211,153,0.12)',
      text: 'var(--success-text)',
      border: 'rgba(52,211,153,0.25)',
      key: 'settings.hooks.willRun',
    }
  }
  if (state === 'not-running') {
    return {
      bg: 'rgba(239,68,68,0.10)',
      text: 'rgba(239,68,68,0.90)',
      border: 'rgba(239,68,68,0.22)',
      key: 'settings.hooks.notRunning',
    }
  }
  return {
    bg: 'rgba(156,163,175,0.12)',
    text: 'var(--text-faint)',
    border: 'rgba(156,163,175,0.20)',
    key: 'settings.hooks.unknownState',
  }
}

function HookRow({ hook, homeDir }: { hook: HookListRow; homeDir: string }) {
  const t = useT()
  const state = hookRunState(hook)
  const tone = runStateColors(state)
  const source = abbreviatePath(hook.sourcePath, homeDir)
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <code style={{
          flex: 1, minWidth: 0,
          fontSize: 12, color: 'var(--text-primary)',
          fontFamily: 'monospace', wordBreak: 'break-all',
          userSelect: 'text',
        }}>
          {hookCommandLabel(hook)}
        </code>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase',
          background: tone.bg, color: tone.text,
          border: `1px solid ${tone.border}`,
          borderRadius: 4, padding: '2px 6px', flexShrink: 0,
        }}>
          {t(tone.key)}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase',
          background: hook.enabled ? 'rgba(99,102,241,0.12)' : 'rgba(156,163,175,0.12)',
          color: hook.enabled ? 'var(--accent-text)' : 'var(--text-faint)',
          border: `1px solid ${hook.enabled ? 'rgba(99,102,241,0.25)' : 'rgba(156,163,175,0.20)'}`,
          borderRadius: 4, padding: '2px 6px', flexShrink: 0,
        }}>
          {t(hook.enabled ? 'settings.hooks.enabled' : 'settings.hooks.disabled')}
        </span>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
        fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.5,
      }}>
        <span>
          {t('settings.hooks.trustLabel')}{' '}
          <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {hook.trustStatus || '—'}
          </code>
        </span>
        <span>
          {t('settings.hooks.matcherLabel')}{' '}
          <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {hook.matcher ?? '—'}
          </code>
        </span>
        <span>
          {t('settings.hooks.handlerLabel')}{' '}
          <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {hook.handlerType || '—'}
          </code>
        </span>
      </div>

      {hook.sourcePath && (
        <div style={{
          fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace',
          wordBreak: 'break-all',
        }} title={hook.sourcePath}>
          {t('settings.hooks.sourceLabel')} {source}
        </div>
      )}

      {/* A trust status this page cannot classify gets the engine's own word
          instead of a localized claim in either direction. */}
      {state === 'unknown' && hook.trustStatus && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          {t(trustLabelKey(hook.trustStatus))}
        </div>
      )}

      {/* The trust note quotes `<key>` and `<currentHash>`; show the actual
          values so the config edit it describes can be made without guessing.
          Selectable text, not a control: AIPA still cannot trust anything. */}
      {(hook.trustStatus === 'untrusted' || hook.trustStatus === 'modified') && (
        <div style={{
          fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.6,
          fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'text',
        }}>
          {hook.key && (
            <div>
              {t('settings.hooks.keyLabel')}{' '}
              <code style={{ color: 'var(--text-muted)' }}>{hook.key}</code>
            </div>
          )}
          {hook.currentHash && (
            <div>
              {t('settings.hooks.hashLabel')}{' '}
              <code style={{ color: 'var(--text-muted)' }}>{hook.currentHash}</code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SettingsHooks() {
  const t = useT()
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  const [engineKind, setEngineKind] = useState<'codex' | 'claude' | 'none' | null>(null)
  const [outcome, setOutcome] = useState<HookListOutcome>({ ok: true, groups: [], error: null })
  const [homeDir, setHomeDir] = useState('')
  const [loading, setLoading] = useState(true)

  // Refetch on open (the tab mounts) and whenever the working directory
  // changes. Deliberately no interval: hooks are configuration, not a live
  // feed, and each read may spawn a short-lived app-server.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const engine = await window.electronAPI.engineGetActive()
      setEngineKind(engine.kind)
      if (engine.kind !== 'codex') {
        setOutcome({ ok: true, groups: [], error: null })
        return
      }
      let home = ''
      try {
        home = await window.electronAPI.fsGetHome() as string
      } catch {
        // Without the home path the list still works; only the `~` shortening
        // is unavailable.
      }
      setHomeDir(home)
      const cwd = workingDir || home
      const raw = await window.electronAPI.hooksList(cwd ? { cwds: [cwd] } : undefined)
      setOutcome(readHookListReply(raw))
    } catch (err) {
      setOutcome({ ok: false, groups: [], error: String(err) })
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  useEffect(() => {
    void load()
  }, [load])

  const groups = outcome.ok ? outcome.groups : []
  const eventGroups = groupHooksByEvent(groups)
  const hookCount = eventGroups.reduce((sum, group) => sum + group.hooks.length, 0)
  const warnings = groups.flatMap(group => group.warnings)
  const errors = groups.flatMap(group => group.errors)
  const activeCwd = groups.find(group => group.cwd)?.cwd ?? (workingDir || homeDir)

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Webhook size={16} color="#818cf8" />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('settings.hooks.title')}
          </span>
          {engineKind === 'codex' && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', borderRadius: 4, padding: '2px 6px',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: 'var(--accent-text)',
            }}>
              codex
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            title={t('settings.hooks.refresh')}
            aria-label={t('settings.hooks.refresh')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginLeft: 'auto', padding: '3px 8px', borderRadius: 6,
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              color: loading ? 'var(--text-faint)' : 'var(--text-secondary)',
              cursor: loading ? 'wait' : 'pointer', fontSize: 10,
            }}
          >
            <RefreshCw size={10} />
            {t('settings.hooks.refresh')}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('settings.hooks.subtitle')}
        </div>
        {activeCwd && (
          <div style={{
            marginTop: 6, fontSize: 10, color: 'var(--text-faint)',
            fontFamily: 'monospace', wordBreak: 'break-all',
          }}>
            {activeCwd}
          </div>
        )}
      </div>

      {/* Codex-only. The Claude CLI has no `hooks/list`; showing an empty list
          there would look like "no hooks configured". */}
      {!loading && engineKind !== 'codex' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'var(--glass-shimmer)',
          border: '1px solid var(--glass-border)',
          borderRadius: 8, padding: '10px 12px',
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          <Info size={13} color="var(--text-faint)" style={{ flexShrink: 0, marginTop: 1 }} />
          {t('settings.hooks.codexOnly')}
        </div>
      )}

      {loading && (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          {t('settings.hooks.loading')}
        </div>
      )}

      {!loading && engineKind === 'codex' && (
        <>
          {/* Trust is the whole point of this page. No button: the protocol has
              no trust request, and pretending otherwise would hide the restart
              Codex needs before the hook actually runs. */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'var(--glass-shimmer)',
            border: '1px solid var(--glass-border)',
            borderRadius: 8, padding: '9px 12px', marginBottom: 14,
          }}>
            <Info size={12} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              {t('settings.hooks.trustNote')}
            </div>
          </div>

          {!outcome.ok && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.20)',
              borderRadius: 8, padding: '10px 12px', marginBottom: 16,
            }}>
              <AlertCircle size={14} color="rgba(239,68,68,0.80)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.90)', lineHeight: 1.5 }}>
                {outcome.error ?? t('settings.hooks.readFailed')}
              </div>
            </div>
          )}

          {outcome.ok && warnings.length > 0 && (
            <div style={{
              border: '1px solid rgba(251,191,36,0.25)',
              background: 'rgba(251,191,36,0.07)',
              borderRadius: 8, padding: '9px 12px', marginBottom: 10,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 4 }}>
                {t('settings.hooks.warningsTitle')}
              </div>
              {warnings.map((warning, index) => (
                <div key={`warn-${index}`} style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
                }}>
                  {warning}
                </div>
              ))}
            </div>
          )}

          {outcome.ok && errors.length > 0 && (
            <div style={{
              border: '1px solid rgba(239,68,68,0.22)',
              background: 'rgba(239,68,68,0.07)',
              borderRadius: 8, padding: '9px 12px', marginBottom: 10,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(239,68,68,0.90)', marginBottom: 4 }}>
                {t('settings.hooks.errorsTitle')}
              </div>
              {errors.map((error, index) => (
                <div key={`error-${index}`} style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
                }}>
                  {error.path && (
                    <code style={{ fontFamily: 'monospace', color: 'var(--text-faint)' }}>
                      {error.path}:{' '}
                    </code>
                  )}
                  {error.message}
                </div>
              ))}
            </div>
          )}

          {outcome.ok && hookCount === 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 16px', background: 'var(--bg-secondary)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 12, color: 'var(--text-faint)',
            }}>
              <Webhook size={13} />
              {t('settings.hooks.emptyTitle')}
            </div>
          )}

          {outcome.ok && hookCount > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {eventGroups.map(group => (
                <div key={group.eventName}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                  }}>
                    <code style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                    }}>
                      {group.eventName}
                    </code>
                    <span style={{
                      fontSize: 9, color: 'var(--text-faint)',
                      background: 'var(--bg-hover)', borderRadius: 4,
                      padding: '1px 5px',
                    }}>
                      {group.hooks.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.hooks.map((hook, index) => (
                      <HookRow
                        key={hook.key || `${hook.eventName}-${hook.displayOrder}-${index}`}
                        hook={hook}
                        homeDir={homeDir}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
