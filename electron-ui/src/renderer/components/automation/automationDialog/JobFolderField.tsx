// Where a prompt job runs: the app-wide folder, or one this job names.
//
// The field has two doors, the same two the chat header offers: up to five
// folders conversations actually ran in, and the OS folder dialog. The default
// is the app-wide working folder and is shown as that, never as today's path —
// the global preference can change after this job is saved, and a job that never
// chose must keep following it.
//
// Picking a folder writes `action.cwd` through `promptActionWithFolder`; the
// app-wide row clears it by omitting the field. This component owns only the
// picker's open state and the two async doors.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { useI18n } from '../../../i18n'
import { useSessionStore } from '../../../store'
import { INPUT_STYLE } from '../../settings/settingsConstants'
import { SECONDARY, smallButtonStyle } from '../automationStyles'
import { Hint, labelStyle } from './shared'
import { pushEscapeHandler } from '../../ui/escapeStack'
import {
  APP_WIDE_JOB_FOLDER,
  jobFolderLabel,
  jobFolderRows,
} from '../jobFolder'

export interface JobFolderFieldProps {
  /** '' means the app-wide working folder, never a path named ''. */
  folder: string
  onFolderChange: (folder: string) => void
  /**
   * One sentence about a folder the grant dialog returned that is not the one
   * the form had. It stays beside the field because that is where the value
   * the user must now confirm is shown.
   */
  notice?: string | null
}

export function JobFolderField({ folder, onFolderChange, notice }: JobFolderFieldProps) {
  const { t } = useI18n()
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Newest-first, at most five, with the current pick left out. An empty list
  // means the sidebar's index has no cwd yet, so the popover offers Browse
  // alone rather than substituting home for a memory it does not have.
  const recentRows = useMemo(
    () => jobFolderRows({ sessions, currentFolder: folder, homeDir }),
    [sessions, folder, homeDir],
  )

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // The dialog itself registers Escape for Cancel; while this list is open the
  // innermost layer must win, so Escape closes the picker, not the whole form.
  useEffect(() => {
    if (!open) return
    return pushEscapeHandler(() => setOpen(false))
  }, [open])

  const choose = (next: string) => {
    onFolderChange(next)
    setOpen(false)
  }

  const browse = async () => {
    try {
      const picked = await window.electronAPI.fsShowOpenDialog()
      // Cancelling returns null and must leave the current choice in place.
      if (picked) choose(picked)
    } catch {
      /* the dialog is unavailable; the field keeps what it had */
    }
  }

  const buttonTitle = folder || t('automation.folder.appWideHint')
  const rowStyle: React.CSSProperties = {
    ...smallButtonStyle,
    display: 'flex',
    width: '100%',
    minWidth: 0,
    padding: '5px 7px',
    border: 'none',
    borderRadius: 5,
    textAlign: 'left',
  }

  return (
    <div ref={rootRef} style={{ marginBottom: 12, position: 'relative' }}>
      <label style={labelStyle}>{t('automation.folder.label')}</label>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        title={buttonTitle}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          ...INPUT_STYLE,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <Folder size={12} style={{ flexShrink: 0, opacity: 0.75 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder ? jobFolderLabel(folder, homeDir) : t('automation.folder.appWide')}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, color: SECONDARY }} />
      </button>
      <Hint>
        {folder ? folder : t('automation.folder.appWideHint')}
      </Hint>
      {notice && (
        <Hint style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{notice}</Hint>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={t('automation.folder.label')}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 8,
            zIndex: 210,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
          }}
        >
          {/* The default lives in the same list as the picks, so "back to the
              app-wide folder" is one visible row rather than a clearance the
              user has to guess at. */}
          <button
            type="button"
            onClick={() => choose(APP_WIDE_JOB_FOLDER)}
            title={t('automation.folder.appWideHint')}
            style={{ ...rowStyle, color: folder ? SECONDARY : 'var(--text-primary)' }}
          >
            <Folder size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('automation.folder.appWide')}
            </span>
            {!folder && <Check size={11} style={{ flexShrink: 0 }} />}
          </button>

          {recentRows.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                padding: '2px 7px 3px',
              }}>
                {t('automation.folder.recentHeading')}
              </div>
              {recentRows.map(row => (
                <button
                  key={row.dir}
                  type="button"
                  onClick={() => choose(row.dir)}
                  title={row.dir}
                  style={rowStyle}
                >
                  <Folder size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
            <button
              type="button"
              onClick={() => { void browse() }}
              style={rowStyle}
            >
              <FolderOpen size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span>{t('automation.folder.browse')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
