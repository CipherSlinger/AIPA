// The small pieces every automation-dialog section is built from: the label
// and hint type, the warning row, the informational note, and the toggle row.
//
// They were inline in `AutomationDialog.tsx`; moving them here is a move, not a
// restyle — every style object below is the one the dialog used, so the rendered
// DOM and computed styles are unchanged.

import React from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { SECONDARY, WARNING } from '../automationStyles'
import Toggle from '../../ui/Toggle'

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
}

/** The muted one-line explanation under a field, before a margin is chosen. */
export const hintTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: SECONDARY,
  lineHeight: 1.5,
}

export function Hint({
  children,
  marginTop = 4,
  style,
}: {
  children: React.ReactNode
  marginTop?: number
  style?: React.CSSProperties
}) {
  return (
    <div style={{ ...hintTextStyle, marginTop, ...style }}>{children}</div>
  )
}

/**
 * A chosen successor that is switched off.
 *
 * The scheduler refuses to start a disabled job from a chain (`planChain`
 * answers `target_disabled`), because the switch is the user's current
 * instruction and a chain must not quietly override it. The dialog says so under
 * the select, before the choice is saved, rather than letting the user find out
 * from a history note later.
 */
export function WarningNote({
  children,
  marginTop = 4,
}: {
  children: React.ReactNode
  marginTop?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 5,
      fontSize: 11, color: WARNING, marginTop, lineHeight: 1.5,
    }}>
      <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

/** The quiet grey box used for the plugin-origin and fresh-session notes. */
export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6,
      marginBottom: 12, padding: '6px 9px', borderRadius: 6,
      background: 'var(--bg-hover)', border: '1px solid var(--border)',
      fontSize: 11, color: SECONDARY, lineHeight: 1.5,
    }}>
      <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

/**
 * A toggle with its label and hint to the right, as the retry, watch-recursive
 * and quiet-on-success fields all render it. `marginTop` is the only difference
 * between the call sites and is applied to the same row.
 */
export function ToggleField({
  value,
  onChange,
  ariaLabel,
  label,
  hint,
  marginTop,
}: {
  value: boolean
  onChange: (value: boolean) => void
  ariaLabel: string
  label: string
  hint: string
  marginTop?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      ...(marginTop !== undefined ? { marginTop } : {}),
    }}>
      <div style={{ paddingTop: 1 }}>
        <Toggle
          value={value}
          onChange={onChange}
          aria-label={ariaLabel}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: SECONDARY, marginTop: 2, lineHeight: 1.5 }}>
          {hint}
        </div>
      </div>
    </div>
  )
}

/**
 * Whether a path looks absolute, as far as the renderer can tell. Main
 * re-validates and its refusal is final; this only stops a save that is
 * certain to be rejected. A leading `/` (POSIX), a drive letter such as
 * `C:\` or `C:/`, and a UNC prefix `\\server\share` all count.
 */
export function isAbsolutePath(path: string): boolean {
  const trimmed = path.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('/') || trimmed.startsWith('\\\\')) return true
  return /^[a-zA-Z]:[\\/]/.test(trimmed)
}
