import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Terminal as TerminalIcon, Trash2, X } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore } from '../../store/chatStore'
import { usePrefsStore, useSessionStore } from '../../store'
import { useTerminalStore } from '../../store/terminalStore'
import {
  clampDockHeight,
  shortCwd,
  type TerminalTab as TerminalTabModel,
} from '../../store/terminalTabs'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import TerminalTab from './TerminalTab'
import { clearTerminal } from './terminalRegistry'

function TabStatusChip({ tab }: { tab: TerminalTabModel }) {
  const t = useT()
  if (tab.status === 'starting') {
    return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('terminal.dock.starting')}</span>
  }
  if (tab.status !== 'exited') return null
  if (tab.failure) {
    return (
      <span
        title={tab.failure}
        style={{
          fontSize: 10,
          color: 'var(--error)',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: 999,
          padding: '1px 7px',
          whiteSpace: 'nowrap',
        }}
      >
        {t('terminal.dock.failedChip')}
      </span>
    )
  }
  const label = typeof tab.exitCode === 'number'
    ? t('terminal.dock.exited', { code: tab.exitCode })
    : t('terminal.dock.exitedUnknown')
  return (
    <span
      style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        background: 'var(--bg-hover)',
        borderRadius: 999,
        padding: '1px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

/**
 * The dock stays mounted once it has been opened, and hides with
 * `display:none` when toggled off. Unmounting it would dispose every xterm and
 * with it every PTY, which would turn the toggle — a view action — into a kill
 * switch for whatever the user is running. A shell that is no longer visible
 * is announced by the status bar instead.
 */
export default function TerminalDock({ visible }: { visible: boolean }) {
  const t = useT()
  const tabs = useTerminalStore(s => s.tabs)
  const activeId = useTerminalStore(s => s.activeId)
  const height = useTerminalStore(s => s.height)
  const chatWorkingDir = useChatStore(s => s.workingDir)
  const prefsWorkingDir = usePrefsStore(s => s.prefs.workingDir)
  const homeDir = useSessionStore(s => s.homeDir)
  const cwd = chatWorkingDir || prefsWorkingDir || homeDir || ''
  const activeTab = tabs.find(tab => tab.id === activeId) || null

  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)
  const autoStartedRef = useRef(false)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const dialogRef = useFocusTrap(confirmCloseAll)

  useEffect(() => {
    const onWindowResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

  // The dock is unmounted only when the app tears down; this reset keeps a
  // reload from reviving dead tab ids. Hiding does not run it — see the
  // component comment above.
  useEffect(() => {
    return () => { useTerminalStore.getState().resetTabs() }
  }, [])

  // Open with one shell. Closing the last tab by hand leaves the dock empty on
  // purpose — `autoStartedRef` stops this from immediately resurrecting it.
  useEffect(() => {
    if (tabs.length > 0) {
      autoStartedRef.current = true
      return
    }
    if (autoStartedRef.current || !cwd) return
    autoStartedRef.current = true
    useTerminalStore.getState().addTab({ cwd })
  }, [tabs.length, cwd])

  const runningCount = tabs.filter(tab => tab.status === 'running' || tab.status === 'starting').length
  const dockHeight = clampDockHeight(height, viewportHeight)
  const modKey = window.electronAPI?.versions?.platform === 'darwin' ? '⌘' : 'Ctrl'

  const newTab = () => {
    if (!cwd) return
    useTerminalStore.getState().addTab({ cwd })
  }

  // Close all destroys the shells; hiding does not. So this always asks while
  // anything is running, then empties the list — each tab's unmount is what
  // calls ptyDestroy — and leaves the dock open on its empty state.
  const requestCloseAll = () => {
    if (tabs.length === 0) return
    if (runningCount > 0) {
      setConfirmCloseAll(true)
      return
    }
    useTerminalStore.getState().closeAll()
  }

  const closeAllConfirmed = () => {
    setConfirmCloseAll(false)
    useTerminalStore.getState().closeAll()
  }

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startY: event.clientY, startHeight: dockHeight }
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    useTerminalStore.getState().setHeight(
      clampDockHeight(drag.startHeight + drag.startY - event.clientY, window.innerHeight),
    )
  }

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already released */ }
  }

  // An unopened dock renders nothing at all; a hidden one keeps its DOM (and
  // its PTYs) and takes no layout space.
  if (!visible && tabs.length === 0) return null

  return (
    <section
      aria-label={t('terminal.dock.title')}
      aria-hidden={!visible}
      style={{
        height: dockHeight,
        flexShrink: 0,
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'var(--bg-nav)',
        borderTop: '1px solid var(--border)',
        minHeight: 0,
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('terminal.dock.resizeHandle')}
        title={t('terminal.dock.resizeHandle')}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        style={{
          height: 5,
          flexShrink: 0,
          cursor: 'ns-resize',
          background: 'transparent',
          touchAction: 'none',
          marginTop: -3,
        }}
      />

      {/* Header: current folder, clear, close-all and the toggle hint */}
      <div
        style={{
          height: 34,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-sidebar)',
        }}
      >
        <TerminalIcon size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
          {t('terminal.dock.title')}
        </span>
        <span
          title={cwd || t('terminal.dock.noCwd')}
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {shortCwd(cwd, homeDir) || '—'}
        </span>
        <span
          title={t('terminal.dock.toggleHint', { key: `${modKey}+\`` })}
          style={{ fontSize: 10.5, color: 'var(--text-subtle)', flexShrink: 0 }}
        >
          {t('terminal.dock.toggleHint', { key: `${modKey}+\`` })}
        </span>
        <button
          type="button"
          onClick={() => { if (activeTab) clearTerminal(activeTab.id) }}
          disabled={!activeTab}
          aria-label={t('terminal.dock.clear')}
          title={t('terminal.dock.clear')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            fontSize: 11,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-hover)',
            color: activeTab ? 'var(--text-secondary)' : 'var(--text-subtle)',
            cursor: activeTab ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <Trash2 size={11} />
          {t('terminal.dock.clear')}
        </button>
        <button
          type="button"
          onClick={requestCloseAll}
          disabled={tabs.length === 0}
          aria-label={t('terminal.dock.closeAll')}
          title={t('terminal.dock.closeAll')}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 4,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: tabs.length > 0 ? 'var(--text-muted)' : 'var(--text-subtle)',
            cursor: tabs.length > 0 ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label={t('terminal.dock.title')}
        style={{
          height: 32,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 2,
          padding: '0 6px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-nav)',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeId
          return (
            <div
              key={tab.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: '0 2px 0 8px',
                borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                background: isActive ? 'var(--bg-active)' : 'transparent',
                borderRadius: '6px 6px 0 0',
                minWidth: 90,
                maxWidth: 240,
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => useTerminalStore.getState().activateTab(tab.id)}
                title={tab.cwd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  padding: '4px 0',
                  textAlign: 'left',
                }}
              >
                <TerminalIcon size={11} style={{ flexShrink: 0, color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.title}
                </span>
                <TabStatusChip tab={tab} />
              </button>
              <button
                type="button"
                onClick={() => useTerminalStore.getState().closeTab(tab.id)}
                aria-label={t('terminal.dock.closeTab', { title: tab.title })}
                title={t('terminal.dock.closeTab', { title: tab.title })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={newTab}
          disabled={!cwd}
          aria-label={t('terminal.dock.newTab')}
          title={cwd ? t('terminal.dock.newTab') : t('terminal.dock.noCwd')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            width: 24,
            height: 22,
            marginLeft: 2,
            borderRadius: 5,
            border: 'none',
            background: 'transparent',
            color: cwd ? 'var(--text-muted)' : 'var(--text-subtle)',
            cursor: cwd ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Terminal bodies. Inactive tabs stay mounted so their scrollback and
          PTY survive tab switches. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tabs.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            {t('terminal.dock.empty')}
          </div>
        ) : tabs.map(tab => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            visible={visible}
          />
        ))}
      </div>

      {confirmCloseAll && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--glass-overlay)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={() => setConfirmCloseAll(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('terminal.dock.closeAllTitle')}
            onClick={event => event.stopPropagation()}
            style={{
              width: '90%',
              maxWidth: 420,
              background: 'var(--popup-bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--dialog-shadow)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('terminal.dock.closeAllTitle')}
            </span>
            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {t('terminal.dock.closeAllBody', { count: runningCount })}
            </span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmCloseAll(false)}
                style={{
                  padding: '6px 14px', fontSize: 12, borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                {t('terminal.dock.closeAllCancel')}
              </button>
              <button
                type="button"
                onClick={closeAllConfirmed}
                style={{
                  padding: '6px 14px', fontSize: 12, borderRadius: 7,
                  border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(239,68,68,0.15)',
                  color: 'var(--error)', cursor: 'pointer', fontWeight: 600,
                }}
              >
                {t('terminal.dock.closeAllConfirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
