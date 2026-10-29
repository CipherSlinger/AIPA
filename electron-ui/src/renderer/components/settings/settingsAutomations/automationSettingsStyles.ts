// Styles shared by the automations page shell, its job rows and the run
// history. They were inline in `SettingsAutomations.tsx`; moving them here is a
// move, not a restyle — every object below is the one the page used, so the
// rendered DOM and computed styles are unchanged.

import type { CSSProperties } from 'react'

/** The quiet text control under a run list ("Show all" / "Show fewer"). */
export const QUIET_LINK: CSSProperties = {
  background: 'none', border: 'none', padding: 0, margin: '4px 0 0',
  font: 'inherit', fontSize: 11, color: 'var(--accent-text)', cursor: 'pointer',
}

/**
 * The run-level file disclosure. It sits inline in the existing run row, so it
 * carries no margin or block padding of its own; the expanded panel below the
 * row supplies the quieter treatment.
 */
export const RUN_FILES_LINK: CSSProperties = {
  background: 'none', border: 'none', padding: 0, margin: 0,
  font: 'inherit', fontSize: 11, color: 'var(--accent-text)', cursor: 'pointer',
}

/**
 * The filter row's reset, in the archive's quiet underlined style. It shares
 * the row with 24px fields and chips, so it carries no vertical margin of its
 * own; the empty-state call site adds spacing instead.
 */
export const FILTER_LINK: CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  font: 'inherit', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
  textDecoration: 'underline', textUnderlineOffset: 3,
}
