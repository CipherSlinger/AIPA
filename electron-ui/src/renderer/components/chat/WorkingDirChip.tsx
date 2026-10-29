// The chat header's working-directory line (wave 87B).
//
// The column in ChatHeader has said "Title + working dir column" since the line
// was removed, so the folder a turn will run in was invisible in the chat — the
// only way to change it was a menu item that writes the global preference. This
// puts it back, small and muted, and makes the click mean the one thing a pick
// can mean for the conversation that is actually open:
//
//   - a draft has no record yet, so a pick moves this conversation;
//   - a recorded Codex conversation is resumed with `thread/resume` and runs in
//     the folder in its rollout, which a pick cannot rewrite. The pick can only
//     start a new conversation, and the popover says so before it happens;
//   - a recorded folder the open path proved missing is marked as a problem and
//     offers the same new-conversation exit.
//
// The gone verdict is read from the store the open path writes. Nothing here
// stats the disk: a second opinion could disagree with the answer already given
// and would let the line warn about a folder nobody checked.

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Folder } from 'lucide-react'
import { useChatStore, usePrefsStore, useSessionStore } from '../../store'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { selectWorkingDirGone, workingDirGoneStore } from './workingDirNotice'
import { workingDirChipModel, type WorkingDirChipSource } from './workingDirChipModel'

interface Props {
  /** The conversation on screen; null for a draft. */
  sessionId: string | null
}

/** The sentence that says why this folder, not just which. */
function sourceLabelKey(source: WorkingDirChipSource): string | null {
  switch (source) {
    case 'tab': return 'chat.workingDir.sourceTab'
    case 'global': return 'chat.workingDir.sourceGlobal'
    case 'home': return 'chat.workingDir.sourceHome'
    case 'recorded': return 'chat.workingDir.sourceRecorded'
    case 'none': return null
  }
}

export default function WorkingDirChip({ sessionId }: Props) {
  const t = useT()
  const globalDir = usePrefsStore(s => s.prefs.workingDir)
  const homeDir = useSessionStore(s => s.homeDir)
  // Primitive selectors: a tab's title or snapshot changing must not re-render
  // a line that only cares about its folder.
  const tabCwd = useChatStore(s => s.tabs.find(tab => tab.id === s.activeTabId)?.cwd ?? '')
  const activeTabId = useChatStore(s => s.activeTabId)
  const recordedCwd = useSessionStore(s =>
    (sessionId ? s.sessions.find(item => item.sessionId === sessionId)?.cwd : '') ?? '',
  )

  // Read the open path's verdict; never produce a new one.
  const goneDir = useSyncExternalStore(
    workingDirGoneStore.subscribe,
    () => selectWorkingDirGone(workingDirGoneStore.getSnapshot(), sessionId),
    () => null,
  )

  const view = workingDirChipModel({ tabCwd, globalDir, homeDir, recordedCwd, goneDir })
  // The transcript is the authority on where a recorded conversation runs; the
  // tab's folder only describes what a *new* conversation would inherit.
  const recordedFolder = goneDir || recordedCwd || ''

  const [popover, setPopover] = useState<'recorded' | 'gone' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useFocusTrap(popover !== null)

  // A newer pick or a session change retires an open explanation rather than
  // leaving it describing a conversation that is no longer on screen.
  useEffect(() => { setPopover(null) }, [sessionId])

  // The open path answers asynchronously. If its verdict lands while the
  // "recorded folder" explanation is open, replace it: the same conversation
  // now has a stronger fact to state, and two versions of the folder must not
  // be offered at once.
  useEffect(() => {
    if (goneDir && popover === 'recorded') setPopover('gone')
  }, [goneDir, popover])

  useEffect(() => {
    if (!popover) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popover])

  /** A draft really can move: write the pick where the send path reads it. */
  const pickForThisConversation = useCallback(async () => {
    const picked = await window.electronAPI.fsShowOpenDialog()
    if (!picked) return
    if (activeTabId) {
      useChatStore.getState().setTabCwd(activeTabId, picked)
    } else {
      // No tab to carry an override: the global preference is the only folder
      // a conversation started from here could inherit.
      usePrefsStore.getState().setPrefs({ workingDir: picked })
      window.electronAPI.prefsSet('workingDir', picked)
    }
    // The user has answered the "that folder is gone" warning; the old record
    // no longer describes what this conversation is doing.
    workingDirGoneStore.clearFor(sessionId)
  }, [activeTabId, sessionId])

  /**
   * A recorded conversation cannot be moved, so the only honest reading of a
   * pick is a new conversation in that folder. The transcript goes first: a
   * leftover view whose id still resolves would resume the old thread in the
   * old folder on its next turn.
   */
  const startNewConversation = useCallback(async () => {
    const picked = await window.electronAPI.fsShowOpenDialog()
    if (!picked) return
    const previousSessionId = sessionId
    useChatStore.getState().clearMessages()
    if (activeTabId) {
      useChatStore.getState().setTabCwd(activeTabId, picked)
    } else {
      usePrefsStore.getState().setPrefs({ workingDir: picked })
      window.electronAPI.prefsSet('workingDir', picked)
    }
    workingDirGoneStore.clearFor(previousSessionId)
    setPopover(null)
  }, [activeTabId, sessionId])

  if (!view.visible) return null

  const isGone = view.state === 'gone'
  const sourceKey = sourceLabelKey(view.source)
  const title = isGone
    ? `${view.dir}\n${t('chat.workingDir.goneHint')}`
    : [view.dir, sourceKey ? t(sourceKey) : '', t('chat.workingDir.clickHint')].filter(Boolean).join('\n')

  const openOnClick = () => {
    if (isGone) { setPopover(open => (open ? null : 'gone')); return }
    if (view.target === 'new_conversation') { setPopover(open => (open ? null : 'recorded')); return }
    void pickForThisConversation()
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex', minWidth: 0, maxWidth: '100%' }}>
      <button
        type="button"
        onClick={openOnClick}
        title={title}
        aria-label={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
          maxWidth: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          fontSize: 10,
          // 12px keeps title + line inside the header's 44px (28px content box).
          lineHeight: '12px',
          fontFamily: 'inherit',
          color: isGone ? 'rgba(251,191,36,0.92)' : 'var(--text-muted)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = isGone ? '#fbbf24' : 'var(--text-secondary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = isGone ? 'rgba(251,191,36,0.92)' : 'var(--text-muted)' }}
      >
        {isGone
          ? <AlertTriangle size={11} style={{ flexShrink: 0 }} />
          : <Folder size={11} style={{ flexShrink: 0, opacity: 0.8 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view.label}</span>
      </button>

      {popover && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={popover === 'gone'
            ? t('chat.workingDir.popoverGoneTitle')
            : t('chat.workingDir.popoverRecordedTitle', { path: recordedFolder })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setPopover(null)
            }
          }}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            width: 300,
            zIndex: 200,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            marginBottom: 4,
            color: isGone ? 'rgba(251,191,36,0.95)' : 'var(--text-primary)',
          }}>
            {popover === 'gone'
              ? t('chat.workingDir.popoverGoneTitle')
              : t('chat.workingDir.popoverRecordedTitle', { path: recordedFolder })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            {popover === 'gone'
              ? t('chat.workingDir.popoverGoneBody', { path: recordedFolder })
              : t('chat.workingDir.popoverRecordedBody')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              type="button"
              onClick={() => setPopover(null)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('chat.workingDir.cancel')}
            </button>
            <button
              type="button"
              onClick={startNewConversation}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.35)',
                borderRadius: 8,
                color: '#a5b4fc',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('chat.workingDir.startNewHere')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
