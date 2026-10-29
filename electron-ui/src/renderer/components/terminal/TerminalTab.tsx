import React, { useCallback, useRef, useState } from 'react'
import { AlertTriangle, FolderOpen } from 'lucide-react'
import type { TerminalTab as TerminalTabModel } from '../../store/terminalTabs'
import { useTerminalStore } from '../../store/terminalStore'
import { useUiStore } from '../../store'
import { getT, useT } from '../../i18n'
import { grantOutcome, pickFolderToGrant } from '../../lib/grantFolder'
import { planTerminalRestart, terminalGrantOffer, terminalGrantSeed } from './terminalGrant'
import { useTerminalSession } from './useTerminalSession'

interface TerminalTabProps {
  tab: TerminalTabModel
  active: boolean
  /** False while the whole dock is hidden; the tab stays mounted but unmeasured. */
  visible: boolean
}

/**
 * One tab's terminal surface. Every tab stays mounted while the dock is open —
 * inactive ones are `display:none` — so switching tabs never recreates an xterm
 * or loses its scrollback. An exited tab keeps its output and its place.
 */
export default function TerminalTab({ tab, active, visible }: TerminalTabProps) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const containerRef = useTerminalSession(tab, active, visible)
  const [granting, setGranting] = useState(false)
  // A dialog that takes a minute must not be opened a second time by a second
  // click while the first is still up.
  const grantingRef = useRef(false)
  const offersGrant = terminalGrantOffer(tab)

  // The only way this tab's folder becomes readable: the user confirms the OS
  // dialog, which is the one place main records a grant. Cancelling changes
  // nothing at all — no toast, no restart, no folder write.
  const grantFolder = useCallback(async () => {
    if (grantingRef.current) return
    grantingRef.current = true
    setGranting(true)
    try {
      const seed = terminalGrantSeed(tab)
      let picked: string | null
      try {
        picked = await pickFolderToGrant(seed)
      } catch {
        return
      }
      const outcome = grantOutcome(seed, picked)
      if (outcome === 'cancelled') return

      // The dialog is a long pause. Act on the record that is on screen now,
      // and only if it is still this exact record: tab ids are reused after a
      // close, and silently restarting a different tab would be a restart the
      // user never asked for.
      const store = useTerminalStore.getState()
      const current = store.tabs.find(candidate => candidate.id === tab.id)
      if (current !== tab) return

      const plan = planTerminalRestart(current, outcome, picked)
      // Read the locale at click time: the dialog may have outlived a language
      // switch, and the sentence should speak the language the user now sees.
      const say = getT()
      if (plan.kind === 'retry') {
        store.retryTab(current.id)
        addToast('info', say('terminal.grant.retried'))
      } else if (plan.kind === 'move') {
        store.retryTab(current.id, plan.cwd)
        addToast('info', say('terminal.grant.moved', { path: plan.cwd }))
      } else if (plan.kind === 'new-tab') {
        store.addTab({ cwd: plan.cwd })
        addToast('info', say('terminal.grant.newTab', {
          folder: current.cwd,
          path: plan.cwd,
        }))
      }
    } finally {
      grantingRef.current = false
      setGranting(false)
    }
  }, [tab, addToast])

  return (
    <div
      role="tabpanel"
      aria-label={tab.title}
      style={{
        flex: 1,
        minHeight: 0,
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'var(--bg-chat)',
      }}
    >
      {tab.failure && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--error)',
            fontSize: 12,
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ minWidth: 0, flex: '1 1 240px' }}>{tab.failure}</span>
          {offersGrant && (
            <button
              type="button"
              onClick={() => { void grantFolder() }}
              disabled={granting}
              title={t('terminal.grant.action')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.28)',
                background: 'var(--bg-hover)',
                color: granting ? 'var(--text-subtle)' : 'var(--text-secondary)',
                cursor: granting ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              <FolderOpen size={11} />
              {t('terminal.grant.action')}
            </button>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        data-terminal-tab={tab.id}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 6,
        }}
      />
    </div>
  )
}
