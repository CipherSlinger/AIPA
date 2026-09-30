// Shared building blocks for the Employees page (Agents + Workflows sections),
// so both sections use the same card, header and toolbar look.
import React, { useState } from 'react'
import { Plus } from 'lucide-react'

export const ACCENT = '#6366f1'

/** Responsive card grid shared by every Employees page section. */
export const EMPLOYEE_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
  gap: 12,
}

/** Base look for every card on the page; hovered/active states lift and tint it. */
export function cardStyle(hovered: boolean, active = false, accent = ACCENT): React.CSSProperties {
  return {
    position: 'relative',
    borderRadius: 12,
    cursor: 'pointer',
    background: active ? `${accent}14` : hovered ? 'var(--bg-hover)' : 'var(--bg-card, rgba(255,255,255,0.03))',
    border: active ? `1.5px solid ${accent}` : `1px solid ${hovered ? 'rgba(99,102,241,0.35)' : 'var(--glass-border)'}`,
    boxShadow: active
      ? `0 0 14px ${accent}35, 0 2px 8px rgba(0,0,0,0.15)`
      : hovered ? '0 6px 16px rgba(0,0,0,0.16)' : '0 1px 3px rgba(0,0,0,0.08)',
    transform: hovered ? 'translateY(-2px)' : 'none',
    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
    userSelect: 'none',
  }
}

export function SectionHeader({ icon, title, subtitle, count, actions }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  count?: number
  actions?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(99,102,241,0.12)', color: '#818cf8', flexShrink: 0,
          }}>
            {icon}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
          {count !== undefined && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.22)', borderRadius: 10, padding: '1px 7px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginLeft: 34, lineHeight: 1.45 }}>{subtitle}</div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{actions}</div>}
    </div>
  )
}

/** Small secondary toolbar button (import/export/sort…). */
export function ToolbarButton({ onClick, title, children, disabled, primary }: {
  onClick: () => void
  title?: string
  children: React.ReactNode
  disabled?: boolean
  primary?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 8,
        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        border: primary ? 'none' : `1px solid ${hovered && !disabled ? 'rgba(99,102,241,0.45)' : 'var(--glass-border)'}`,
        background: primary
          ? `linear-gradient(135deg, rgba(99,102,241,${hovered ? 0.98 : 0.9}), rgba(139,92,246,${hovered ? 0.98 : 0.9}))`
          : hovered && !disabled ? 'rgba(99,102,241,0.07)' : 'transparent',
        color: primary ? '#fff' : hovered && !disabled ? '#818cf8' : 'var(--text-secondary)',
        boxShadow: primary && hovered ? '0 4px 14px rgba(99,102,241,0.35)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

/** Dashed "create new" card that sits at the end of a grid. */
export function AddCard({ label, onClick, disabled, minHeight }: {
  label: string
  onClick: () => void
  disabled?: boolean
  minHeight: number
}) {
  const [hovered, setHovered] = useState(false)
  const on = hovered && !disabled
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        minHeight, borderRadius: 12, border: `1.5px dashed ${on ? 'rgba(99,102,241,0.6)' : 'var(--glass-border-md, var(--border))'}`,
        background: on ? 'rgba(99,102,241,0.06)' : 'transparent', color: on ? '#818cf8' : 'var(--text-muted)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease',
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? 'rgba(99,102,241,0.14)' : 'var(--bg-hover)', transition: 'all 0.15s ease',
      }}>
        <Plus size={16} />
      </span>
      {label}
    </button>
  )
}

/** Compact "install this preset" card, shared by agent and workflow presets. */
export function PresetCard({ icon, title, subtitle, onClick }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={subtitle ? `${title}\n${subtitle}` : title}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, textAlign: 'left', width: '100%',
        border: `1px dashed ${hovered ? 'rgba(99,102,241,0.55)' : 'var(--glass-border-md, var(--border))'}`,
        background: hovered ? 'rgba(99,102,241,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s ease',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {subtitle}
          </span>
        )}
      </span>
      <Plus size={13} style={{ color: hovered ? '#818cf8' : 'var(--text-muted)', flexShrink: 0 }} />
    </button>
  )
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase',
      letterSpacing: '0.07em', margin: '16px 0 8px',
    }}>
      {children}
    </div>
  )
}
