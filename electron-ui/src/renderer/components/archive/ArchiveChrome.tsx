// Presentational chrome for the Archive ledger: the filter pills, the empty
// states, and the command-only notice. Kept out of ArchivePanel so that file
// stays focused on filtering, grouping, and the scroll window.

import React, { useState } from 'react'
import { useT } from '../../i18n'

export function Pill({
  active, onClick, title, ariaPressed, children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  /** Set on toggles whose on/off state is not obvious from the label alone. */
  ariaPressed?: boolean
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={ariaPressed}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
        // Fixed height matches the select and the search box on the same row;
        // 3px padding left the chips a couple of pixels shorter than the
        // fields beside them.
        height: 24, boxSizing: 'border-box',
        padding: '0 10px', borderRadius: 999, fontSize: 11, lineHeight: '16px',
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
        background: active ? 'var(--accent-bg)' : hovered ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-muted)',
        fontWeight: active ? 600 : 400,
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/**
 * The ledger's admission that it is incomplete. Command-only runs are clutter,
 * but silently dropping records is worse than saying how many are missing. The
 * line sits below the scroller, outside the windowed card bodies, so it can
 * never shift the analytic row offsets the virtualization relies on.
 */
export function CommandOnlyNotice({
  count, shown, onToggle, t,
}: {
  count: number
  shown: boolean
  onToggle: () => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 16px', borderTop: '1px solid var(--border)',
      fontSize: 10, color: 'var(--text-subtle)',
    }}>
      <span>
        {t(shown ? 'archive.commandOnlyShown' : 'archive.commandOnlyHidden', { count: String(count) })}
      </span>
      <button
        onClick={onToggle}
        className="archive-hover-link"
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 10,
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        {t(shown ? 'archive.hide' : 'archive.show')}
      </button>
    </div>
  )
}

export function EmptyState({
  icon, title, hint, onClear, clearLabel,
}: { icon: React.ReactNode; title: string; hint: string; onClear?: () => void; clearLabel?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 20px', textAlign: 'center' }}>
      <div style={{
        // 64px / 16px radius is the empty-state tile shared with the sidebar;
        // the old 68px / 20px tile was a one-off.
        width: 64, height: 64, borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 340 }}>{hint}</div>
      {onClear && (
        <button
          onClick={onClear}
          className="archive-hover-btn"
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)',
            transition: 'background 0.15s ease',
          }}
        >
          {clearLabel}
        </button>
      )}
    </div>
  )
}
