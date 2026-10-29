// GitStatusRefusalPopover — what the working-tree chip says when main would
// not look (wave 89C).
//
// This is not a working tree with no changes. It is the answer "AIPA could not
// read this folder", and it must never render the ordinary empty list: that
// would read as a clean tree. The cause comes from the same pure reading the
// chip used, which in turn comes from the `reason` main attached to
// `cwd_invalid` — nothing here stats the disk to form a second opinion.
//
// There is no refresh control. A refresh that repeats the same refusal is not
// an action. Since wave 90 an outside-roots refusal has a real one: the user
// can confirm this folder in the OS dialog, which is what makes it readable.
// The grant itself happens in main (`fs:showOpenDialog`); this panel only
// opens the dialog and hands the answer back, and the chip re-reads.
//
// A folder that is gone (or is no longer a folder) gets the chat header's
// honest exit: pick a folder, and let `applyFolderForView` decide what a pick
// means for the conversation that is actually open. This component never
// writes the folder itself.

import { useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, FolderOpen, Lock } from 'lucide-react'
import { useT } from '../../i18n'
import { applyFolderForView } from '../../lib/folderPickAction'
import { grantOutcome, pickFolderToGrant } from '../../lib/grantFolder'
import {
  gitRefusalCopyKeys,
  gitRefusalOffersGrant,
  gitRefusalOffersNewFolder,
  type GitRefusalCause,
} from './gitStatusPanel'

interface GitStatusRefusalPopoverProps {
  /** The folder the conversation is using. Named in full, not guessed. */
  cwd: string
  cause: GitRefusalCause
  /** The user confirmed this same folder in the dialog; the chip re-reads. */
  onGranted: () => void
  onClose: () => void
}

export default function GitStatusRefusalPopover({
  cwd,
  cause,
  onGranted,
  onClose,
}: GitStatusRefusalPopoverProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const copy = gitRefusalCopyKeys(cause)
  const outside = cause === 'outside_allowed_roots'
  const offersFolderPick = gitRefusalOffersNewFolder(cause)
  const offersGrant = gitRefusalOffersGrant(cause)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // The dialog is a long pause; `applyFolderForView` re-reads the conversation
  // after it resolves, so the pick describes the tab the user is looking at
  // now. It also owns what a pick means for a recorded Codex conversation.
  const chooseFolder = useCallback(async () => {
    const picked = await window.electronAPI.fsShowOpenDialog()
    if (!picked) return
    applyFolderForView(picked)
    onClose()
  }, [onClose])

  // Confirm this same folder. Main records the grant as the dialog's answer,
  // so the only honest follow-up is to ask again: the chip re-reads and shows
  // whatever main now says. A different folder is a folder change and goes
  // through the same path as "Choose another folder…" below.
  const grantFolder = useCallback(async () => {
    let picked: string | null
    try {
      picked = await pickFolderToGrant(cwd)
    } catch {
      return
    }
    const outcome = grantOutcome(cwd, picked)
    if (outcome === 'cancelled') return
    if (outcome === 'same_folder') {
      onGranted()
      return
    }
    if (!picked) return
    applyFolderForView(picked)
    onClose()
  }, [cwd, onGranted, onClose])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t(copy.heading)}
      tabIndex={-1}
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        right: 0,
        marginBottom: 6,
        width: 320,
        maxWidth: 'calc(100vw - 24px)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
        borderRadius: 10,
        padding: 10,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {outside
          ? <Lock size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <AlertTriangle size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t(copy.heading)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('gitStatus.refusedClose')}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {t(copy.body, { folder: cwd })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {t('gitStatus.refusedClose')}
        </button>
        {offersGrant && (
          <button
            type="button"
            onClick={() => { void grantFolder() }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '4px 10px',
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 8,
              color: '#a5b4fc',
              cursor: 'pointer',
            }}
          >
            <FolderOpen size={11} />
            {t('gitStatus.refusedGrantFolder')}
          </button>
        )}
        {offersFolderPick && (
          <button
            type="button"
            onClick={() => { void chooseFolder() }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '4px 10px',
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 8,
              color: '#a5b4fc',
              cursor: 'pointer',
            }}
          >
            <FolderOpen size={11} />
            {t('gitStatus.refusedChooseFolder')}
          </button>
        )}
      </div>
    </div>
  )
}
