// The terminal dock's "you left something running" chip.
//
// Hiding the dock keeps its shells alive, so the dock must not vanish without
// a trace: a build started there would otherwise run with nothing on screen
// saying so. This chip appears only while the dock is hidden and still holds
// tabs, names how many are actually running, and brings the dock back on
// click. It renders nothing in the default state, so its absence is not a
// claim about anything.

import { Terminal } from 'lucide-react'
import { useT } from '../../i18n'
import { useTerminalStore } from '../../store/terminalStore'

export default function TerminalIndicator() {
  const t = useT()
  const open = useTerminalStore(s => s.open)
  const tabs = useTerminalStore(s => s.tabs)
  if (open || tabs.length === 0) return null

  const running = tabs.filter(tab => tab.status === 'running' || tab.status === 'starting').length
  const label = running > 0
    ? (running === 1
        ? t('statusBar.terminal.hiddenOne')
        : t('statusBar.terminal.hidden', { count: running }))
    : t('statusBar.terminal.exited')

  return (
    <button
      type="button"
      onClick={() => useTerminalStore.getState().setOpen(true)}
      title={t('statusBar.terminal.hint')}
      aria-label={`${t('statusBar.terminal.hint')} — ${label}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: running > 0 ? 'rgba(99,102,241,0.10)' : 'transparent',
        color: running > 0 ? 'var(--accent-text)' : 'var(--text-muted)',
        fontSize: 11,
        lineHeight: 1.4,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Terminal size={12} aria-hidden />
      <span>{label}</span>
    </button>
  )
}
