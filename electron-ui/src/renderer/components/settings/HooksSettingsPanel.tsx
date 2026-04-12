import React, { useEffect, useState, useCallback } from 'react'
import { Zap, Terminal, MessageSquare, Globe, Trash2, Plus, ChevronDown, ChevronRight, Pencil } from 'lucide-react'
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

// Editing state for inline edits
interface EditState {
  eventType: string
  matcherIdx: number
  hookIdx: number
  hookType: string
  // editable fields
  matcher: string
  command: string
  prompt: string
  url: string
  timeout: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
function hookPreview(hook: HookEntry): string {
  if (hook.type === 'command') return hook.command?.slice(0, 50) ?? ''
  if (hook.type === 'prompt' || hook.type === 'agent') return hook.prompt?.slice(0, 50) ?? ''
  if (hook.type === 'http') return hook.url?.slice(0, 50) ?? ''
  return hook.type
}

function HookTypeIcon({ type }: { type: string }) {
  const size = 13
  if (type === 'command') return <Terminal size={size} color="rgba(255,255,255,0.45)" />
  if (type === 'prompt') return <MessageSquare size={size} color="rgba(255,255,255,0.45)" />
  if (type === 'http') return <Globe size={size} color="rgba(255,255,255,0.45)" />
  return <Zap size={size} color="rgba(255,255,255,0.45)" />
}

// Color palette for event-type badges
const EVENT_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  PreToolUse:    { bg: 'rgba(255,165,0,0.15)',   color: 'rgba(255,165,0,0.90)' },
  PostToolUse:   { bg: 'rgba(99,102,241,0.15)',  color: 'rgba(165,180,252,0.90)' },
  PostToolUseFailure: { bg: 'rgba(99,102,241,0.12)', color: 'rgba(165,180,252,0.75)' },
  SessionStart:  { bg: 'rgba(34,197,94,0.15)',   color: 'rgba(34,197,94,0.90)' },
  SessionEnd:    { bg: 'rgba(34,197,94,0.10)',   color: 'rgba(34,197,94,0.70)' },
  Stop:          { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' },
  StopFailure:   { bg: 'rgba(239,68,68,0.12)',   color: 'rgba(252,165,165,0.80)' },
  Notification:  { bg: 'rgba(251,191,36,0.12)',  color: 'rgba(251,191,36,0.80)' },
  UserPromptSubmit: { bg: 'rgba(99,102,241,0.10)', color: 'rgba(165,180,252,0.70)' },
  SubagentStop:  { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' },
  PreCompact:    { bg: 'rgba(139,92,246,0.12)',  color: 'rgba(196,181,253,0.80)' },
}

function EventTypeBadge({ eventType }: { eventType: string }) {
  const style = EVENT_BADGE_STYLES[eventType] ?? { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }
  return (
    <span style={{
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase' as const,
      padding: '2px 8px',
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.color.replace(/[\d.]+\)$/, '0.25)')}`,
      flexShrink: 0,
      transition: 'all 0.15s ease',
    }}>
      {eventType}
    </span>
  )
}

function HookTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    command: 'rgba(165,180,252,0.80)',
    http:    'rgba(34,197,94,0.80)',
    prompt:  'rgba(251,191,36,0.80)',
  }
  const color = colorMap[type] ?? 'rgba(255,255,255,0.55)'
  return (
    <span style={{
      borderRadius: 5,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      padding: '2px 6px',
      background: color.replace(/[\d.]+\)$/, '0.12)'),
      color,
      border: `1px solid ${color.replace(/[\d.]+\)$/, '0.22)')}`,
      flexShrink: 0,
      transition: 'all 0.15s ease',
    }}>
      {type}
    </span>
  )
}

// ── Inline editor for a hook card ──────────────────────────────────────────
interface InlineEditorProps {
  editState: EditState
  onEditChange: (partial: Partial<EditState>) => void
  onSave: () => void
  onCancel: () => void
}

function InlineEditor({ editState, onEditChange, onSave, onCancel }: InlineEditorProps) {
  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 8,
    padding: '6px 10px',
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
    letterSpacing: '0.04em',
  }

  const focusIn = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.border = '1px solid rgba(99,102,241,0.45)'
  }
  const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.09)'
  }

  return (
    <div style={{
      marginTop: 8,
      padding: '12px 14px',
      background: 'rgba(10,10,22,0.85)',
      border: '1px solid rgba(99,102,241,0.20)',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* matcher */}
      <div>
        <label style={labelStyle}>Tool Matcher</label>
        <input
          value={editState.matcher}
          onChange={e => onEditChange({ matcher: e.target.value })}
          placeholder="Leave empty for all tools"
          style={inputBase}
          onFocus={focusIn}
          onBlur={focusOut}
        />
      </div>

      {/* command */}
      {editState.command !== undefined && (
        <div>
          <label style={labelStyle}>Command</label>
          <textarea
            value={editState.command}
            onChange={e => onEditChange({ command: e.target.value })}
            placeholder="e.g. echo hello"
            style={{ ...inputBase, resize: 'vertical', minHeight: 56, fontFamily: 'monospace' }}
            onFocus={focusIn}
            onBlur={focusOut}
          />
        </div>
      )}

      {/* prompt */}
      {editState.prompt !== undefined && (
        <div>
          <label style={labelStyle}>{editState.hookType === 'agent' ? 'Sub-Agent Prompt' : 'Prompt'}</label>
          <textarea
            value={editState.prompt}
            onChange={e => onEditChange({ prompt: e.target.value })}
            placeholder="Summarize the tool result"
            style={{ ...inputBase, resize: 'vertical', minHeight: 56, fontFamily: 'monospace' }}
            onFocus={focusIn}
            onBlur={focusOut}
          />
        </div>
      )}

      {/* url */}
      {editState.url !== undefined && (
        <div>
          <label style={labelStyle}>URL</label>
          <input
            value={editState.url}
            onChange={e => onEditChange({ url: e.target.value })}
            placeholder="https://example.com/webhook"
            style={inputBase}
            onFocus={focusIn}
            onBlur={focusOut}
          />
        </div>
      )}

      {/* timeout */}
      <div>
        <label style={labelStyle}>Timeout (s)</label>
        <input
          value={editState.timeout}
          onChange={e => onEditChange({ timeout: e.target.value })}
          type="number"
          min="1"
          placeholder="10"
          style={{ ...inputBase, width: 96 }}
          onFocus={focusIn}
          onBlur={focusOut}
        />
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button
          onClick={onSave}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: 'none',
            borderRadius: 8,
            padding: '7px 14px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.95)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          保存
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 14px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 12,
            color: 'rgba(255,255,255,0.60)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
          }}
        >
          取消
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function HooksSettingsPanel() {
  const t = useT()
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [disableAllHooks, setDisableAllHooks] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set())
  const [deleteHover, setDeleteHover] = useState<string | null>(null)
  const [editHover, setEditHover] = useState<string | null>(null)
  const [addBtnHover, setAddBtnHover] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [fireCounts, setFireCounts] = useState<Record<string, number>>({})

  const loadHooks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const settings = await window.electronAPI.configReadCLISettings()
      setHooks((settings?.hooks as HooksConfig) ?? {})
      setDisableAllHooks(!!(settings as Record<string, unknown>)?.disableAllHooks)
    } catch (e) {
      setError(t('hooks.loadError', { error: String(e) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadHooks() }, [loadHooks])

  useEffect(() => {
    if (!window.electronAPI.onHookEvent) return
    const unsub = window.electronAPI.onHookEvent((data: { eventType?: string }) => {
      if (data?.eventType) {
        setFireCounts(prev => ({ ...prev, [data.eventType!]: (prev[data.eventType!] ?? 0) + 1 }))
      }
    })
    return () => unsub?.()
  }, [])

  const saveHooks = useCallback(async (next: HooksConfig) => {
    await window.electronAPI.configWriteCLISettings({ hooks: next })
    setHooks(next)
  }, [])

  const handleToggleDisableAll = useCallback(async () => {
    const next = !disableAllHooks
    setDisableAllHooks(next)
    await window.electronAPI.configWriteCLISettings({ disableAllHooks: next } as Record<string, unknown>)
  }, [disableAllHooks])

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

  const startEdit = useCallback((eventType: string, matcherIdx: number, hookIdx: number) => {
    const hook = hooks[eventType][matcherIdx].hooks[hookIdx]
    const matcherStr = hooks[eventType][matcherIdx].matcher
    const state: EditState = {
      eventType,
      matcherIdx,
      hookIdx,
      hookType: hook.type,
      matcher: matcherStr,
      command: hook.type === 'command' ? (hook.command ?? '') : undefined as unknown as string,
      prompt: (hook.type === 'prompt' || hook.type === 'agent') ? (hook.prompt ?? '') : undefined as unknown as string,
      url: hook.type === 'http' ? (hook.url ?? '') : undefined as unknown as string,
      timeout: hook.timeout != null ? String(hook.timeout) : '',
    }
    setEditState(state)
  }, [hooks])

  const handleEditSave = useCallback(async () => {
    if (!editState) return
    const { eventType, matcherIdx, hookIdx } = editState
    const next: HooksConfig = JSON.parse(JSON.stringify(hooks))

    const hook = next[eventType][matcherIdx].hooks[hookIdx]

    // Update hook fields
    if (hook.type === 'command' && editState.command !== undefined) {
      hook.command = editState.command
    }
    if ((hook.type === 'prompt' || hook.type === 'agent') && editState.prompt !== undefined) {
      hook.prompt = editState.prompt
    }
    if (hook.type === 'http' && editState.url !== undefined) {
      hook.url = editState.url
    }
    const t_ = parseInt(editState.timeout)
    if (!isNaN(t_) && t_ > 0) {
      hook.timeout = t_
    } else {
      delete hook.timeout
    }

    // Update matcher — if matcher changed, move hook to correct matcher group
    const oldMatcher = hooks[eventType][matcherIdx].matcher
    const newMatcher = editState.matcher

    if (oldMatcher !== newMatcher) {
      // Remove from old group
      next[eventType][matcherIdx].hooks.splice(hookIdx, 1)
      // Clean up empty matchers
      next[eventType] = next[eventType].filter(m => m.hooks.length > 0)

      // Find or create the new matcher group
      const existing = next[eventType].find(m => m.matcher === newMatcher)
      if (existing) {
        existing.hooks.push(hook)
      } else {
        next[eventType].push({ matcher: newMatcher, hooks: [hook] })
      }
    }

    await saveHooks(next)
    setEditState(null)
  }, [editState, hooks, saveHooks])

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Disable All toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.07em',
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              userSelect: 'none',
            }}>
              禁用全部
            </span>
            <button
              type="button"
              onClick={handleToggleDisableAll}
              aria-pressed={disableAllHooks}
              style={{
                position: 'relative',
                width: 32,
                height: 18,
                borderRadius: 9,
                background: disableAllHooks
                  ? 'rgba(239,68,68,0.35)'
                  : 'rgba(255,255,255,0.12)',
                border: disableAllHooks
                  ? '1px solid rgba(239,68,68,0.50)'
                  : '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: disableAllHooks ? 14 : 2,
                width: 12,
                height: 12,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.90)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                transition: 'left 0.15s ease',
                display: 'block',
              }} />
            </button>
          </div>

          {/* Add Hook button */}
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
              transition: 'all 0.15s ease',
              boxShadow: addBtnHover ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
            }}
          >
            <Plus size={13} />
            {t('hooks.addHook')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 10, padding: '6px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* disableAllHooks warning banner */}
      {disableAllHooks && (
        <div style={{
          background: 'rgba(255,165,0,0.12)',
          border: '1px solid rgba(255,165,0,0.30)',
          borderRadius: 8,
          padding: '8px 12px',
          color: 'rgba(255,165,0,0.80)',
          fontSize: 12,
          marginBottom: 12,
          lineHeight: 1.5,
        }}>
          ⚠ 所有 Hooks 已暂时禁用 — 点击开关重新启用
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
                  <EventTypeBadge eventType={eventType} />
                  <span style={{ flex: 1 }} />
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: 'rgba(255,255,255,0.38)',
                    flexShrink: 0,
                  }}>
                    {t('hooks.hookCount', { count: totalHooks })}
                  </span>
                  {(fireCounts[eventType] ?? 0) > 0 && (
                    <span style={{
                      background: 'rgba(99,102,241,0.18)',
                      border: '1px solid rgba(99,102,241,0.30)',
                      borderRadius: 10,
                      padding: '1px 6px',
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'rgba(165,180,252,0.90)',
                      flexShrink: 0,
                    }}>
                      ▶ {fireCounts[eventType]}
                    </span>
                  )}
                </button>

                {/* Accordion body */}
                {!collapsed && (
                  <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matchers.map((matcherGroup, mi) => (
                      <div key={mi}>
                        {matcherGroup.hooks.map((hook, hi) => {
                          const cardKey = `${eventType}-${mi}-${hi}`
                          const isEditing = editState !== null
                            && editState.eventType === eventType
                            && editState.matcherIdx === mi
                            && editState.hookIdx === hi

                          return (
                            <div key={hi} style={{ marginBottom: 3 }}>
                              {/* Hook row */}
                              <div
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  background: isEditing ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.03)',
                                  border: isEditing
                                    ? '1px solid rgba(99,102,241,0.25)'
                                    : '1px solid rgba(255,255,255,0.07)',
                                  borderRadius: 8,
                                  padding: '10px 14px',
                                  transition: 'background 0.15s ease',
                                }}
                              >
                                <HookTypeIcon type={hook.type} />
                                <HookTypeBadge type={hook.type} />
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
                                {matcherGroup.matcher && (
                                  <span style={{
                                    fontSize: 10, color: 'rgba(255,165,0,0.75)',
                                    background: 'rgba(255,165,0,0.08)',
                                    border: '1px solid rgba(255,165,0,0.18)',
                                    borderRadius: 5,
                                    padding: '2px 7px',
                                    fontFamily: 'monospace',
                                    flexShrink: 0,
                                    maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {matcherGroup.matcher}
                                  </span>
                                )}
                                {hook.timeout && (
                                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>
                                    {hook.timeout}s
                                  </span>
                                )}

                                {/* Edit button */}
                                <button
                                  onClick={() => isEditing ? setEditState(null) : startEdit(eventType, mi, hi)}
                                  onMouseEnter={() => setEditHover(cardKey)}
                                  onMouseLeave={() => setEditHover(null)}
                                  title="编辑 hook"
                                  style={{
                                    background: isEditing
                                      ? 'rgba(99,102,241,0.18)'
                                      : editHover === cardKey
                                        ? 'rgba(99,102,241,0.12)'
                                        : 'rgba(255,255,255,0.07)',
                                    border: isEditing
                                      ? '1px solid rgba(99,102,241,0.35)'
                                      : '1px solid ' + (editHover === cardKey ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)'),
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    color: isEditing
                                      ? '#a5b4fc'
                                      : editHover === cardKey
                                        ? '#a5b4fc'
                                        : 'rgba(255,255,255,0.38)',
                                    padding: '4px 6px', display: 'flex', alignItems: 'center',
                                    flexShrink: 0,
                                    transition: 'all 0.15s ease',
                                  }}
                                  aria-label="编辑 hook"
                                >
                                  <Pencil size={12} />
                                </button>

                                {/* Delete button */}
                                <button
                                  onClick={() => handleDelete(eventType, mi, hi)}
                                  onMouseEnter={() => setDeleteHover(cardKey)}
                                  onMouseLeave={() => setDeleteHover(null)}
                                  title={t('hooks.deleteHook')}
                                  style={{
                                    background: deleteHover === cardKey ? 'rgba(252,165,165,0.1)' : 'rgba(255,255,255,0.07)',
                                    border: '1px solid ' + (deleteHover === cardKey ? 'rgba(252,165,165,0.25)' : 'rgba(255,255,255,0.07)'),
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    color: deleteHover === cardKey ? '#fca5a5' : 'rgba(255,255,255,0.38)',
                                    padding: '4px 6px', display: 'flex', alignItems: 'center',
                                    flexShrink: 0,
                                    transition: 'all 0.15s ease',
                                  }}
                                  aria-label={t('hooks.deleteHook')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>

                              {/* Inline editor — expands below the hook row */}
                              {isEditing && editState && (
                                <InlineEditor
                                  editState={editState}
                                  onEditChange={partial => setEditState(prev => prev ? { ...prev, ...partial } : prev)}
                                  onSave={handleEditSave}
                                  onCancel={() => setEditState(null)}
                                />
                              )}
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
