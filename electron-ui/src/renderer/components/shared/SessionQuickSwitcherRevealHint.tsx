// The "Ctrl+Enter opens this conversation's folder" cue, in its two positions.
//
// It lives beside the quick switcher rather than inside it so the overlay stays
// under its size ceiling; the rules it renders are not here but in
// `lib/deptQuickSwitch.ts` (`showsFolderRevealHint` is the single answer the
// key handler also asks, so a hint can never advertise a reveal its own key
// refuses).
//
// Two placements, one rule:
//   - on the highlighted row's folder line, so the cue sits on the path it
//     acts on and moving with the arrows moves the cue;
//   - in the footer, only while the highlighted row records a folder — the
//     same condition, asked once by the caller.
//
// A conversation with no recorded folder gets neither: pointing at another
// folder would be a claim about a place this conversation never ran.

import React from 'react'
import { useT } from '../../i18n'

/** The chord, drawn as a key. Small because the row's own line is 10px. */
const KBD: React.CSSProperties = {
  background: 'var(--border)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '1px 5px',
  fontSize: 9,
  fontFamily: 'monospace',
}

/** The row hint: shown only on the highlighted row, by the caller's decision. */
export function RowRevealHint() {
  const t = useT()
  return (
    <span
      title={t('quickSwitcher.revealFolderHintTitle')}
      style={{
        marginLeft: 'auto',
        paddingLeft: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        color: 'var(--text-muted)',
      }}
    >
      <kbd style={{ ...KBD, borderRadius: 4, padding: '0 4px', lineHeight: '13px' }}>Ctrl+↵</kbd>
      <span>{t('quickSwitcher.revealFolderHint')}</span>
    </span>
  )
}

/** The footer hint: rendered only while the highlighted row records a folder. */
export function FooterRevealHint() {
  const t = useT()
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <kbd style={KBD}>Ctrl+↵</kbd>
      {t('quickSwitcher.revealFolderFooter')}
    </span>
  )
}
