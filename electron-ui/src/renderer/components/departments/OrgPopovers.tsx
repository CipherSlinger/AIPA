// The two popovers the org chart opens, plus the empty state.
//
// All three are self-contained: they read a department and a list of employees
// and render a panel at a fixed screen position. Keeping them out of OrgChart.tsx
// matters because the chart's own body is the layout, and a 200-line popover in
// the middle of it hides where the tree is actually assembled.
//
// The popovers are positioned in viewport coordinates, not container ones: they
// are rendered outside the scrolling pane precisely so they can escape its
// overflow clipping.

import React from 'react'
import { AlertTriangle, Building2 } from 'lucide-react'
import { descendantIds, type Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import { formatRelativeTime, kindOf } from './deptUtils'
import { COMPANY_TEMPLATES } from './deptPresets'

const ACCENT = '#6366f1'

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const POPOVER_CHROME: React.CSSProperties = {
  position: 'fixed',
  zIndex: 200,
  background: 'var(--glass-bg-deep)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: 10,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  animation: 'slideUp 0.15s ease',
}

/** Clamp a viewport-anchored popover so it never opens off-screen. */
const clamp = (value: number, max: number) => Math.max(8, Math.min(value, max))

// ── Department stats ────────────────────────────────────────────────────────

export interface DeptStatsPopoverProps {
  dept: Department
  sessions: SessionListItem[]
  position: { x: number; y: number }
  onClose: () => void
  onEnter: () => void
}

export function DeptStatsPopover({ dept, sessions, position, onClose, onEnter }: DeptStatsPopoverProps) {
  const t = useT()
  const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const todayCount = sessions.filter(s => s.timestamp >= todayStart).length
  const openPositions = dept.positions?.length ?? 0

  const exportSessions = () => {
    const data = sessions.map(s => ({
      id: s.sessionId,
      title: s.title || s.lastPrompt?.slice(0, 60) || 'Untitled',
      lastPrompt: s.lastPrompt,
      messageCount: s.messageCount,
      timestamp: new Date(s.timestamp).toISOString(),
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${dept.name.replace(/[^a-z0-9]/gi, '_')}_employees.json`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <div
      style={{
        ...POPOVER_CHROME,
        left: clamp(position.x, window.innerWidth - 240),
        top: clamp(position.y, window.innerHeight - 220),
        border: `1px solid ${dept.color || 'var(--bg-active)'}`,
        padding: '12px 16px',
        minWidth: 200,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color || ACCENT, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dept.name}</span>
        <button
          onClick={onClose}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      {[
        { label: t('dept.staff'), value: sessions.length as number | string },
        { label: t('dept.statsToday'), value: todayCount as number | string },
        { label: t('dept.msgCount'), value: totalMessages as number | string },
        ...(openPositions > 0 ? [{ label: t('dept.positions'), value: openPositions as number | string }] : []),
        {
          label: t('dept.statsLastActive'),
          value: sessions.length === 0 ? '—' : formatRelativeTime(sessions[0].timestamp, t),
        },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--bg-hover)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, opacity: 0.6, ...ELLIPSIS }}>
        {dept.directory}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={() => { onEnter(); onClose() }}
          style={{
            flex: 1, padding: '4px 8px', borderRadius: 5,
            border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.10)',
            color: '#818cf8', fontSize: 10, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('dept.enter')}
        </button>
        <button
          onClick={exportSessions}
          style={{
            flex: 1, padding: '4px 8px', borderRadius: 5,
            border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
            color: '#22c55e', fontSize: 10, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('dept.exportSessions')}
        </button>
      </div>
    </div>
  )
}

// ── Delete confirmation ─────────────────────────────────────────────────────

export interface DeleteDeptPopoverProps {
  node: Department
  /** Every node in the store — needed to count what the delete cascades into. */
  departments: Department[]
  position: { x: number; y: number }
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The folders stay on disk — deleting a node only drops its record, which is
 * what keeps this recoverable: nothing the department ever wrote is destroyed.
 *
 * What disappears with the node is broken down by kind. A company takes its
 * departments, and those departments take their teams, so a single "N items"
 * count would hide how far the cascade actually reaches.
 */
export function DeleteDeptPopover({ node, departments, position, onCancel, onConfirm }: DeleteDeptPopoverProps) {
  const t = useT()
  const doomed = descendantIds(departments, node.id)
  const below = departments.filter(d => d.id !== node.id && doomed.has(d.id))
  const deptCount = below.filter(d => kindOf(d) === 'department').length
  const teamCount = below.filter(d => kindOf(d) === 'team').length
  const isCompany = kindOf(node) === 'company'

  return (
    <div
      style={{
        ...POPOVER_CHROME,
        zIndex: 210,
        left: clamp(position.x, window.innerWidth - 280),
        top: clamp(position.y, window.innerHeight - 190),
        width: 268,
        border: '1px solid rgba(248,113,113,0.45)',
        padding: '12px 14px',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', ...ELLIPSIS }}>
          {node.name}
        </span>
        <button
          onClick={onCancel}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {t(isCompany ? 'dept.confirmDeleteCompany' : 'dept.confirmDelete')}
      </div>
      {below.length > 0 && (
        <div style={{ fontSize: 11, color: '#f87171', marginTop: 6, lineHeight: 1.6 }}>
          {isCompany
            ? teamCount > 0
              ? t('dept.deleteCascadeCompanyTeams', { depts: String(deptCount), teams: String(teamCount) })
              : t('dept.deleteCascadeCompany', { depts: String(deptCount) })
            : t('dept.deleteCascade', { count: String(teamCount) })}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        {t('dept.deleteKeepsFolder')}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
            color: '#f87171', fontSize: 10.5, fontWeight: 700,
          }}
        >
          {t('dept.deleteConfirm')}
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg-primary)',
            color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 600,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────

export interface EmptyOrgStateProps {
  onPickPreset: (presetId: string | undefined) => void
}

/**
 * No node at all. The fastest way out is a ready-made company, so the company
 * types are offered right here instead of buried behind the "new department"
 * form.
 */
export function EmptyOrgState({ onPickPreset }: EmptyOrgStateProps) {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 20px', textAlign: 'center' }}>
      <div style={{
        width: 76, height: 76, borderRadius: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)',
      }}>
        <Building2 size={32} style={{ color: ACCENT, opacity: 0.45 }} />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
          {t('dept.presets.emptyTitle')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.8, lineHeight: 1.65, maxWidth: 380 }}>
          {t('dept.presets.emptyHint')}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 620 }}>
        {COMPANY_TEMPLATES.map(p => (
          <button
            key={p.id}
            onClick={() => onPickPreset(p.id)}
            style={{
              padding: '7px 14px', borderRadius: 9, cursor: 'pointer',
              border: '1px solid rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.07)',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.16)'; e.currentTarget.style.color = '#818cf8' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <button
        onClick={() => onPickPreset(undefined)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        {t('dept.presets.browseAll')}
      </button>
    </div>
  )
}