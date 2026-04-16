import React from 'react'
import { ClipboardList, FileText, Check, FileEdit, Send } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export type RemoteTriggerAction = 'list' | 'get' | 'create' | 'update' | 'run'

export interface RemoteTriggerItem {
  id?: string
  cron?: string
  prompt?: string
  name?: string
  [key: string]: unknown
}

const REMOTE_TRIGGER_ACTION_CONFIG: Record<RemoteTriggerAction, {
  label: string
  icon: React.ElementType
  bg: string
  border: string
  color: string
}> = {
  list:   { label: 'List',   icon: ClipboardList, bg: 'rgba(100,116,139,0.14)', border: 'rgba(100,116,139,0.30)', color: '#94a3b8' },
  get:    { label: 'Get',    icon: FileText,       bg: 'rgba(59,130,246,0.14)',  border: 'rgba(59,130,246,0.30)',  color: '#93c5fd' },
  create: { label: 'Create', icon: Check,          bg: 'rgba(34,197,94,0.14)',   border: 'rgba(34,197,94,0.30)',   color: '#4ade80' },
  update: { label: 'Update', icon: FileEdit,       bg: 'rgba(234,179,8,0.14)',   border: 'rgba(234,179,8,0.30)',   color: '#fde047' },
  run:    { label: 'Run',    icon: Send,            bg: 'rgba(99,102,241,0.14)',  border: 'rgba(99,102,241,0.30)',  color: '#a5b4fc' },
}

// ── Components ─────────────────────────────────────────────────────────────────

/** RemoteTrigger input display — action chip + trigger_id + prompt preview */
export function RemoteTriggerInputCard({ input }: { input: Record<string, unknown> }) {
  const action = (typeof input.action === 'string' ? input.action : 'list') as RemoteTriggerAction
  const cfg = REMOTE_TRIGGER_ACTION_CONFIG[action] ?? REMOTE_TRIGGER_ACTION_CONFIG.list
  const ActionIcon = cfg.icon
  const triggerId = typeof input.trigger_id === 'string' ? input.trigger_id : null
  const body = input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : null
  const prompt = body && typeof body.prompt === 'string' ? body.prompt : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 8,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          color: cfg.color, fontSize: 11, fontWeight: 600,
        }}>
          <ActionIcon size={10} style={{ flexShrink: 0 }} />
          {cfg.label}
        </span>
        {triggerId && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 6,
            background: 'rgba(8,8,16,0.6)', border: '1px solid rgba(99,102,241,0.22)',
            color: '#a5b4fc', fontSize: 10, fontFamily: 'monospace',
          }}>
            {triggerId}
          </span>
        )}
      </div>
      {prompt && (
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380,
        }}>
          &ldquo;{prompt.length > 60 ? prompt.slice(0, 60) + '\u2026' : prompt}&rdquo;
        </div>
      )}
    </div>
  )
}

/** RemoteTrigger result card */
export function RemoteTriggerResultCard({ action, resultText }: { action: RemoteTriggerAction; resultText: string }) {
  const parsed = (() => { try { return JSON.parse(resultText) } catch { return null } })()

  if (action === 'run') {
    const success = !resultText.toLowerCase().includes('error')
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 8,
        background: success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        border: `1px solid ${success ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
        color: success ? '#4ade80' : '#fca5a5', fontSize: 11, fontWeight: 500,
      }}>
        {success
          ? <Check size={11} style={{ flexShrink: 0 }} />
          : <span style={{ fontSize: 11, flexShrink: 0 }}>✕</span>}
        {success ? 'Triggered' : 'Trigger failed'}
      </div>
    )
  }

  if (action === 'list') {
    const raw: unknown[] = Array.isArray(parsed) ? parsed
      : (parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).triggers)
        ? (parsed as Record<string, unknown>).triggers as unknown[]
        : [])
    const items = raw as RemoteTriggerItem[]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '2px 7px', borderRadius: 6,
          background: 'rgba(100,116,139,0.14)', border: '1px solid rgba(100,116,139,0.28)',
          color: '#94a3b8', fontSize: 10, fontWeight: 700,
        }}>
          {items.length} trigger{items.length !== 1 ? 's' : ''}
        </span>
        {items.slice(0, 5).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <ClipboardList size={10} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <span style={{ fontFamily: 'monospace', color: '#a5b4fc', fontSize: 10 }}>{item.id ?? '\u2014'}</span>
            {item.cron && <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 10 }}>{item.cron}</span>}
            {item.name && (
              <span style={{ color: 'rgba(255,255,255,0.70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                {item.name}
              </span>
            )}
          </div>
        ))}
        {items.length > 5 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>+{items.length - 5} more</span>
        )}
      </div>
    )
  }

  // get / create / update: show trigger detail fields
  const trigger: RemoteTriggerItem | null =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RemoteTriggerItem
      : null
  if (trigger) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {trigger.id && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 44, fontSize: 10 }}>id</span>
            <span style={{ fontFamily: 'monospace', color: '#a5b4fc', fontSize: 10 }}>{trigger.id}</span>
          </div>
        )}
        {trigger.cron && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 44, fontSize: 10 }}>cron</span>
            <span style={{ fontFamily: 'monospace', color: '#fde047', fontSize: 10 }}>{trigger.cron}</span>
          </div>
        )}
        {trigger.prompt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 44, fontSize: 10 }}>prompt</span>
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
              &ldquo;{trigger.prompt.length > 60 ? trigger.prompt.slice(0, 60) + '\u2026' : trigger.prompt}&rdquo;
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <pre style={{ fontSize: 11, margin: 0, fontFamily: 'monospace', background: 'rgba(8,8,16,1)', border: '1px solid var(--bg-hover)', borderRadius: 4, padding: '6px 8px', overflow: 'auto', maxHeight: 120, color: '#a5b4fc', lineHeight: 1.5 }}>
      {resultText}
    </pre>
  )
}
