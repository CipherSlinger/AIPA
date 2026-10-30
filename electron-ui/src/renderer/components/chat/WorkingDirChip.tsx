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
//
// Wave 88C: every click now opens a popover, drafts included, and the popover's
// first rows are the folders conversations actually ran in. The OS dialog is
// still there, one row down — but walking it is no longer the only way to name
// a folder the app already remembers.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Folder, FolderOpen } from 'lucide-react'
import { useChatStore, usePrefsStore, useSessionStore } from '../../store'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { selectWorkingDirGone, workingDirGoneStore } from './workingDirNotice'
import { workingDirChipModel, type WorkingDirChipSource } from './workingDirChipModel'
import { RECENT_FOLDER_ROW_LIMIT, workingDirRecentRows } from './workingDirRecentRows'

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
    case 'task': return 'chat.workingDir.sourceTask'
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
  // null = not a task tab, so the ordinary recorded-folder precedence below
  // still applies to ad-hoc conversations. The task folder is the folder the
  // send path uses even after the conversation has a transcript, so the line
  // must name it rather than the folder the rollout happened to record.
  const taskTabCwd = useChatStore(s => {
    const tab = s.tabs.find(item => item.id === s.activeTabId)
    return tab?.task ? (tab.cwd ?? '') : null
  })
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

  const view = workingDirChipModel({
    tabCwd: taskTabCwd ?? tabCwd,
    globalDir,
    homeDir,
    recordedCwd,
    goneDir,
    taskFolder: taskTabCwd !== null,
  })
  // The transcript is the authority on where a recorded conversation runs; the
  // tab's folder only describes what a *new* conversation would inherit.
  const recordedFolder = goneDir || recordedCwd || ''
  const currentDir = view.dir

  const sessions = useSessionStore(s => s.sessions)

  const [popover, setPopover] = useState<'draft' | 'recorded' | 'gone' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useFocusTrap(popover !== null)

  // Rows are derived, never stored: the session list is the authority, and the
  // folder on the line is left out so no row offers a pick that changes nothing.
  // No recorded cwd anywhere means no rows — the popover then shows Browse
  // alone rather than a heading over an empty list it cannot explain.
  const recentRows = useMemo(
    () => workingDirRecentRows({
      sessions,
      currentDir,
      homeDir,
      limit: RECENT_FOLDER_ROW_LIMIT,
    }),
    [sessions, currentDir, homeDir],
  )

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

  /**
   * The one place a folder is written. A tab carries an override the send path
   * reads; with no tab open, the global preference is the only folder a
   * conversation started from here could inherit. Both the Browse path and a
   * recent row end here, so the two can never disagree about where a pick goes.
   */
  const writeFolder = useCallback((dir: string) => {
    if (activeTabId) {
      useChatStore.getState().setTabCwd(activeTabId, dir)
      return
    }
    usePrefsStore.getState().setPrefs({ workingDir: dir })
    window.electronAPI.prefsSet('workingDir', dir)
  }, [activeTabId])

  /**
   * A draft really can move: write the pick where the send path reads it, then
   * retire the gone warning — the user has answered it, and the old record no
   * longer describes what this conversation is doing.
   */
  const moveThisConversation = useCallback((dir: string) => {
    writeFolder(dir)
    workingDirGoneStore.clearFor(sessionId)
    setPopover(null)
  }, [writeFolder, sessionId])

  const browseForThisConversation = useCallback(async () => {
    const picked = await window.electronAPI.fsShowOpenDialog()
    if (!picked) return
    moveThisConversation(picked)
  }, [moveThisConversation])

  /**
   * A recorded conversation cannot be moved, so the only honest reading of a
   * pick is a new conversation in that folder. The transcript goes first: a
   * leftover view whose id still resolves would resume the old thread in the
   * old folder on its next turn.
   */
  const startNewConversationIn = useCallback((dir: string) => {
    const previousSessionId = sessionId
    useChatStore.getState().clearMessages()
    writeFolder(dir)
    workingDirGoneStore.clearFor(previousSessionId)
    setPopover(null)
  }, [writeFolder, sessionId])

  const browseForNewConversation = useCallback(async () => {
    const picked = await window.electronAPI.fsShowOpenDialog()
    if (!picked) return
    startNewConversationIn(picked)
  }, [startNewConversationIn])

  if (!view.visible) return null

  const isGone = view.state === 'gone'
  const sourceKey = sourceLabelKey(view.source)
  const title = view.locked
    ? `${view.dir}\n${t('chat.workingDir.taskFolderHint')}`
    : isGone
      ? `${view.dir}\n${t('chat.workingDir.goneHint')}`
      : [view.dir, sourceKey ? t(sourceKey) : '', t('chat.workingDir.clickHint')].filter(Boolean).join('\n')

  // Every click opens the popover, drafts included: the OS dialog is a long walk
  // to a path the app may already have, so it moves behind a Browse row instead
  // of being the first and only thing a click can do. A task's folder is the
  // exception: the task owns it, so there is no honest pick to offer.
  const openOnClick = () => {
    if (view.locked) return
    const next = isGone ? 'gone' : view.target === 'new_conversation' ? 'recorded' : 'draft'
    setPopover(open => (open ? null : next))
  }

  // One row style for both the remembered folders and the Browse row: the
  // dialog is an option in the same list, not a separate class of thing.
  const recentRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    minWidth: 0,
    padding: '4px 6px',
    background: 'none',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 0.12s ease, color 0.12s ease',
  }
  const hoverRow = (on: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = on ? 'var(--bg-hover)' : 'none'
    e.currentTarget.style.color = on ? 'var(--text-primary)' : 'var(--text-secondary)'
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex', minWidth: 0, maxWidth: '100%' }}>
      <button
        type="button"
        onClick={openOnClick}
        title={title}
        aria-label={title}
        aria-disabled={view.locked || undefined}
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
          cursor: view.locked ? 'default' : 'pointer',
          textAlign: 'left',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (view.locked) return
          e.currentTarget.style.color = isGone ? '#fbbf24' : 'var(--text-secondary)'
        }}
        onMouseLeave={(e) => {
          if (view.locked) return
          e.currentTarget.style.color = isGone ? 'rgba(251,191,36,0.92)' : 'var(--text-muted)'
        }}
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
            : popover === 'draft'
              ? t('chat.workingDir.popoverDraftTitle')
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
              : popover === 'draft'
                ? t('chat.workingDir.popoverDraftTitle')
                : t('chat.workingDir.popoverRecordedTitle', { path: recordedFolder })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            {popover === 'gone'
              ? t('chat.workingDir.popoverGoneBody', { path: recordedFolder })
              : popover === 'draft'
                ? t('chat.workingDir.popoverDraftBody')
                : t('chat.workingDir.popoverRecordedBody')}
          </div>

          {/* The folders your conversations already ran in. Nothing is rendered
              when there are none: a heading over an empty list would invite the
              user to wonder what went missing, and the popover does not know. */}
          {recentRows.length > 0 && (
            <div style={{ marginBottom: popover === 'draft' ? 8 : 10 }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 4,
              }}>
                {t('chat.workingDir.recentHeading')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {recentRows.map(row => (
                  <button
                    key={row.dir}
                    type="button"
                    // The label is short; the row still has to say where it goes.
                    title={row.dir}
                    aria-label={t(popover === 'draft'
                      ? 'chat.workingDir.recentRowUseForDraft'
                      : 'chat.workingDir.recentRowNewConversation', { label: row.label })}
                    onClick={() => (popover === 'draft'
                      ? moveThisConversation(row.dir)
                      : startNewConversationIn(row.dir))}
                    style={recentRowStyle}
                    onMouseEnter={hoverRow(true)}
                    onMouseLeave={hoverRow(false)}
                  >
                    <Folder size={10} style={{ flexShrink: 0, opacity: 0.65 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {popover === 'draft' ? (
            // The OS dialog is still a row, just no longer the only door.
            <div style={{
              borderTop: recentRows.length > 0 ? '1px solid var(--border)' : 'none',
              paddingTop: recentRows.length > 0 ? 6 : 0,
            }}>
              <button
                type="button"
                onClick={() => { void browseForThisConversation() }}
                style={recentRowStyle}
                onMouseEnter={hoverRow(true)}
                onMouseLeave={hoverRow(false)}
              >
                <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.65 }} />
                <span>{t('chat.workingDir.browse')}</span>
              </button>
            </div>
          ) : (
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
                onClick={() => { void browseForNewConversation() }}
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
          )}
        </div>
      )}
    </div>
  )
}
