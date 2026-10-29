// Small pieces every part of the overlay shares.
//
// The overlay used to be one file, so these lived beside the component. They
// are not stateful and they render nothing; they are here so the extracted
// views and the coordinator agree on the same labels, the same key handling
// and the same ghost-button geometry.

import type { CSSProperties, KeyboardEvent } from 'react'

/**
 * The last path segment of a project folder, or the fallback when the session
 * was not filed under one. Used for transcript group headers and for each
 * answer source's project column.
 */
export function projectLabel(project: string, fallback: string): string {
  if (!project) return fallback
  const parts = project.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || project
}

/**
 * A plain Enter on a focused pill activates the pill; without this it also
 * bubbles to the dialog and opens the highlighted hit. Ctrl/Cmd+Enter still
 * reaches the dialog's ask shortcut.
 */
export function stopPillActivation(e: KeyboardEvent) {
  if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === ' ') e.stopPropagation()
}

/** Bordered, muted, text-sized button used for Stop, Clear and retry actions. */
export const GHOST_BUTTON_STYLE: CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 10px',
  fontFamily: 'inherit',
}

/** The centred padded box every empty state (and the reading state) sits in. */
export const EMPTY_STYLE: CSSProperties = {
  padding: '28px 20px',
  textAlign: 'center',
}

export const CHIP_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 4px',
  margin: '0 1px',
  borderRadius: 4,
  border: '1px solid rgba(99,102,241,0.35)',
  background: 'rgba(99,102,241,0.18)',
  color: 'var(--accent-text)',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
}
