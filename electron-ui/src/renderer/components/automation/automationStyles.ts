// Shared styles for the automations list and its create/edit dialog, which now
// live in different files (Settings page and workflow page both mount it).

import React from 'react'

export const SECONDARY = 'var(--text-muted)'
export const WARNING = 'var(--warning-text)'

export const smallButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '3px 8px',
  fontSize: 11,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

// Same fill as the settings Save button, so the list and the dialog share one
// primary action colour rather than two shades that read as washed out in the
// light theme.
export const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}
