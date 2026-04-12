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
  if (type === 'command') return <Terminal size={size} color="rgba(255,255,255,0.45)" />
  if (type === 'prompt') return <MessageSquare size={size} color="rgba(255,255,255,0.45)" />
  if (type === 'http') return <Globe size={size} color="rgba(255,255,255,0.45)" />
  return <Zap size={size} color="rgba(255,255,255,0.45)" />
}

// ── Main component ─────────────────────────────────────────────────────────
export default function HooksSettingsPanel() {
  const t = useT()
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set())
  const [deleteHover, setDeleteHover] = useState<string | null>(null)
  const [addBtnHover, setAddBtnHover] = useState(false)

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
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
        {t('hooks.loading')}
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginBottom: 2 }}>
            {t('hooks.title')}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            {t('hooks.subtitle')}
          </div>
        </div>
        <button
          onClick={() => setShowWizard(v => !v)}
          onMouseEnter={() => setAddBtnHover(true)}
          onMouseLeave={() => setAddBtnHover(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 8,
            background: addBtnHover
              ? 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'
              : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: 'none',
            color: 'rgba(255,255,255,0.95)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            flexShrink: 0,
            transition: 'all 0.15s ease',
            boxShadow: addBtnHover ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
          }}
        >
          <Plus size={13} />
          {t('hooks.addHook')}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 10, padding: '6px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8 }}>
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
          fontSize: 12, color: 'rgba(255,255,255,0.38)',
          textAlign: 'center', padding: 24,
          border: '1px dashed rgba(255,255,255,0.09)', borderRadius: 12, marginTop: 8,
        }}>
          <Zap size={28} color="rgba(255,255,255,0.2)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', fontWeight: 500, marginBottom: 6 }}>
            {t('hooks.noHooksTitle')}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', maxWidth: 300, margin: '0 auto' }}>
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
                  background: 'rgba(15,15,25,0.85)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {/* Accordion header */}
                <button
                  onClick={() => toggleEvent(eventType)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {collapsed
                    ? <ChevronRight size={13} color="rgba(255,255,255,0.38)" />
                    : <ChevronDown size={13} color="rgba(255,255,255,0.38)" />
                  }
                  <Zap size={13} color="rgba(99,102,241,0.85)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)', flex: 1 }}>
                    {eventType}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: 10,
                    padding: '1px 8px',
                  }}>
                    {t('hooks.hookCount', { count: totalHooks })}
                  </span>
                </button>

                {/* Accordion body */}
                {!collapsed && (
                  <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matchers.map((matcherGroup, mi) => (
                      <div key={mi}>
                        {matcherGroup.matcher && (
                          <div style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                            textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
                            marginBottom: 6,
                          }}>
                            matcher: <code style={{ fontStyle: 'normal', color: 'rgba(165,180,252,0.85)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>{matcherGroup.matcher}</code>
                          </div>
                        )}
                        {matcherGroup.hooks.map((hook, hi) => {
                          const deleteKey = `${eventType}-${mi}-${hi}`
                          return (
                            <div
                              key={hi}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: 8,
                                padding: '10px 14px',
                                marginBottom: 3,
                                transition: 'background 0.15s ease',
                              }}
                            >
                              <HookTypeIcon type={hook.type} />
                              <span style={{
                                fontSize: 10, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.07em',
                                color: 'rgba(255,255,255,0.38)',
                                width: 52, flexShrink: 0,
                              }}>
                                {hook.type}
                              </span>
                              <span style={{
                                background: 'rgba(15,15,25,0.70)',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: 11,
                                color: 'rgba(165,180,252,0.85)',
                                fontFamily: 'monospace',
                                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {hookPreview(hook)}
                              </span>
                              {hook.timeout && (
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>
                                  {hook.timeout}s
                                </span>
                              )}
                              <button
                                onClick={() => handleDelete(eventType, mi, hi)}
                                onMouseEnter={() => setDeleteHover(deleteKey)}
                                onMouseLeave={() => setDeleteHover(null)}
                                title={t('hooks.deleteHook')}
                                style={{
                                  background: deleteHover === deleteKey ? 'rgba(252,165,165,0.1)' : 'rgba(255,255,255,0.07)',
                                  border: '1px solid ' + (deleteHover === deleteKey ? 'rgba(252,165,165,0.25)' : 'rgba(255,255,255,0.07)'),
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  color: deleteHover === deleteKey ? '#fca5a5' : 'rgba(255,255,255,0.38)',
                                  padding: '4px 6px', display: 'flex', alignItems: 'center',
                                  flexShrink: 0,
                                  transition: 'all 0.15s ease',
                                }}
                                aria-label={t('hooks.deleteHook')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )
                        })}
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
