import React, { useEffect, useState, useCallback } from 'react'
import { Zap, Terminal, MessageSquare, Globe, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import HookAddWizard from './HookAddWizard'
import { useT } from '../../i18n'

// ── Types ──────────────────────────────────────────────────────────────────
interface HookEntry {
  type: string
  command?: string
  prompt?: string
  url?: string
  timeout?: number
  model?: string
  headers?: Record<string, string>
}

interface HookMatcher {
  matcher: string
  hooks: HookEntry[]
}

type HooksConfig = Record<string, HookMatcher[]>

// ── Helpers ────────────────────────────────────────────────────────────────
function hookPreview(hook: HookEntry): string {
  if (hook.type === 'command') return hook.command?.slice(0, 60) ?? ''
  if (hook.type === 'prompt') return hook.prompt?.slice(0, 60) ?? ''
  if (hook.type === 'http') return hook.url?.slice(0, 60) ?? ''
  return hook.type
}

function HookTypeIcon({ type }: { type: string }) {
  const size = 13
  if (type === 'command') return <Terminal size={size} color="var(--text-muted)" />
  if (type === 'prompt') return <MessageSquare size={size} color="var(--text-muted)" />
  if (type === 'http') return <Globe size={size} color="var(--text-muted)" />
  return <Zap size={size} color="var(--text-muted)" />
}

// ── Main component ─────────────────────────────────────────────────────────
export default function HooksSettingsPanel() {
  const t = useT()
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set())

  const loadHooks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const settings = await window.electronAPI.configReadCLISettings()
      setHooks((settings?.hooks as HooksConfig) ?? {})
    } catch (e) {
      setError(t('hooks.loadError', { error: String(e) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadHooks() }, [loadHooks])

  const saveHooks = useCallback(async (next: HooksConfig) => {
    await window.electronAPI.configWriteCLISettings({ hooks: next })
    setHooks(next)
  }, [])

  const handleDelete = useCallback(async (eventType: string, matcherIdx: number, hookIdx: number) => {
    const next: HooksConfig = JSON.parse(JSON.stringify(hooks))
    if (!next[eventType]) return
    next[eventType][matcherIdx].hooks.splice(hookIdx, 1)
    // Clean up empty matchers
    next[eventType] = next[eventType].filter(m => m.hooks.length > 0)
    if (next[eventType].length === 0) delete next[eventType]
    await saveHooks(next)
  }, [hooks, saveHooks])

  const handleAddHook = useCallback(async (eventType: string, hook: Record<string, unknown>, matcher: string) => {
    const next: HooksConfig = JSON.parse(JSON.stringify(hooks))
    if (!next[eventType]) next[eventType] = []

    // Find existing matcher group or create new one
    const existingMatcher = next[eventType].find(m => m.matcher === matcher)
    if (existingMatcher) {
      existingMatcher.hooks.push(hook as unknown as HookEntry)
    } else {
      next[eventType].push({ matcher, hooks: [hook as unknown as HookEntry] })
    }

    await saveHooks(next)
    setShowWizard(false)
  }, [hooks, saveHooks])

  const toggleEvent = (eventType: string) => {
    setCollapsedEvents(prev => {
      const next = new Set(prev)
      if (next.has(eventType)) next.delete(eventType)
      else next.add(eventType)
      return next
    })
  }

  const eventTypes = Object.keys(hooks)

  if (loading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        {t('hooks.loading')}
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            {t('hooks.title')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('hooks.subtitle')}
          </div>
        </div>
        <button
          onClick={() => setShowWizard(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 6,
            background: 'var(--accent)', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <Plus size={13} />
          {t('hooks.addHook')}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 10, padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <HookAddWizard
          onSave={handleAddHook}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Empty state */}
      {eventTypes.length === 0 && !showWizard && (
        <div style={{
          textAlign: 'center', padding: '32px 20px',
          border: '1px dashed var(--border)', borderRadius: 8, marginTop: 8,
        }}>
          <Zap size={28} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>
            {t('hooks.noHooksTitle')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 300, margin: '0 auto' }}>
            {t('hooks.noHooksDesc')}
          </div>
        </div>
      )}

      {/* Hook list grouped by event type */}
      {eventTypes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: showWizard ? 12 : 0 }}>
          {eventTypes.map(eventType => {
            const collapsed = collapsedEvents.has(eventType)
            const matchers = hooks[eventType] ?? []
            const totalHooks = matchers.reduce((sum, m) => sum + m.hooks.length, 0)

            return (
              <div
                key={eventType}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {/* Accordion header */}
                <button
                  onClick={() => toggleEvent(eventType)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    background: 'var(--action-btn-bg)', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {collapsed
                    ? <ChevronRight size={13} color="var(--text-muted)" />
                    : <ChevronDown size={13} color="var(--text-muted)" />
                  }
                  <Zap size={13} color="var(--accent)" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                    {eventType}
                  </span>
                  <span style={{
                    fontSize: 10, color: 'var(--text-muted)',
                    background: 'var(--popup-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '1px 6px',
                  }}>
                    {t('hooks.hookCount', { count: totalHooks })}
                  </span>
                </button>

                {/* Accordion body */}
                {!collapsed && (
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matchers.map((matcherGroup, mi) => (
                      <div key={mi}>
                        {matcherGroup.matcher && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontStyle: 'italic' }}>
                            matcher: <code style={{ fontStyle: 'normal', color: 'var(--text-primary)' }}>{matcherGroup.matcher}</code>
                          </div>
                        )}
                        {matcherGroup.hooks.map((hook, hi) => (
                          <div
                            key={hi}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '5px 8px',
                              background: 'var(--popup-bg)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              marginBottom: 3,
                            }}
                          >
                            <HookTypeIcon type={hook.type} />
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', width: 52, flexShrink: 0 }}>
                              {hook.type}
                            </span>
                            <span style={{
                              fontSize: 11, color: 'var(--text-primary)',
                              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                            }}>
                              {hookPreview(hook)}
                            </span>
                            {hook.timeout && (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                {hook.timeout}s
                              </span>
                            )}
                            <button
                              onClick={() => handleDelete(eventType, mi, hi)}
                              title={t('hooks.deleteHook')}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center',
                                flexShrink: 0,
                              }}
                              aria-label={t('hooks.deleteHook')}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
