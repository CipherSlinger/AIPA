// AllowedFoldersSection — the folders AIPA has been given, and how to take one
// back (wave 90B).
//
// The file-system gate lives in the main process; the renderer only sees the
// list through `foldersAllowed()`. Nothing here is mirrored into a store, on
// purpose: a cached copy could keep claiming access after the grant was
// withdrawn, or hide a grant the user made in another window. The list is read
// when the section mounts and again after every mutation, from main.
//
// A grant is recorded in main when the user confirms an OS folder dialog. This
// section cannot add one by name — `fsShowOpenDialog` is the only door, and it
// is the dialog's answer that main records. Withdrawal is the one operation
// the renderer may perform on its own, and it is confirmed inline first: the
// confirmation says what stops working and that no file is deleted.

import React, { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Info, Plus, X } from 'lucide-react'
import { useT } from '../../i18n'
import { useSessionStore } from '../../store'
import { workingDirLabel } from '../../lib/workingDir'

const cardStyle: React.CSSProperties = {
  background: 'var(--glass-bg-low)',
  border: '1px solid var(--glass-border)',
  borderRadius: 12,
  padding: '14px 16px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'rgba(99,102,241,0.07)',
  border: '1px solid rgba(99,102,241,0.18)',
  borderRadius: 7,
  padding: '7px 10px',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const pathStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: 'var(--text-faint)',
  lineHeight: 1.5,
  marginTop: 1,
  wordBreak: 'break-all',
}

const quietButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--bg-input)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
}

/** What the section is saying between reads, when it is not just showing a list. */
type Notice = { key: string; params?: Record<string, string> }

export default function AllowedFoldersSection() {
  const t = useT()
  const homeDir = useSessionStore(s => s.homeDir)

  // `null` means "not read yet" (or the last read failed) — never an empty list.
  // An empty list is a claim that nothing is granted, and that must be backed by
  // an answer from main.
  const [folders, setFolders] = useState<string[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await window.electronAPI.foldersAllowed()
      if (!Array.isArray(list)) throw new Error('malformed folders answer')
      setFolders(list)
      setLoadError(false)
    } catch {
      // A failed read is not "nothing granted". Drop the old list so it cannot
      // stand in for an answer this read did not give.
      setFolders(null)
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const addFolder = useCallback(async () => {
    if (adding) return
    setAdding(true)
    setNotice(null)
    try {
      // The dialog's answer is the grant; main records it. This call does not
      // pass the path anywhere — there is no renderer channel that adds a root.
      await window.electronAPI.fsShowOpenDialog()
    } catch {
      setNotice({ key: 'allowedFolders.addFailed' })
    }
    // Re-read even when the dialog was cancelled: the list is main's answer,
    // not a guess from the dialog result.
    await reload()
    setAdding(false)
  }, [adding, reload])

  const removeFolder = useCallback(async (dir: string) => {
    if (removing) return
    setRemoving(dir)
    setNotice(null)
    try {
      const result = await window.electronAPI.foldersForget(dir)
      if (Array.isArray(result?.folders)) {
        // The withdrawal answer is the freshest list main has; prefer it to a
        // second round trip.
        setFolders(result.folders)
        setLoadError(false)
      } else {
        await reload()
      }
      if (!result?.forgotten) {
        // Saying "removed" here would claim an action that did not happen.
        setNotice({ key: 'allowedFolders.notInList', params: { folder: dir } })
      }
    } catch {
      setNotice({ key: 'allowedFolders.removeFailed', params: { folder: dir } })
      await reload()
    } finally {
      setRemoving(null)
      setConfirming(null)
    }
  }, [removing, reload])

  const count = folders?.length ?? 0
  const reading = folders === null && !loadError

  return (
    <div style={cardStyle} role="region" aria-label={t('allowedFolders.title')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <FolderOpen size={13} color="var(--text-faint)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('allowedFolders.title')}
        </span>
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: 'var(--accent-text)',
              borderRadius: 20,
              padding: '1px 8px',
              fontSize: 10,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void addFolder() }}
          disabled={adding}
          onMouseEnter={e => {
            if (adding) return
            e.currentTarget.style.background = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-input)'
            e.currentTarget.style.color = adding ? 'var(--text-faint)' : 'var(--text-secondary)'
          }}
          style={{
            ...quietButtonStyle,
            marginLeft: 'auto',
            color: adding ? 'var(--text-faint)' : 'var(--text-secondary)',
            cursor: adding ? 'default' : 'pointer',
          }}
        >
          <Plus size={12} />
          {t('allowedFolders.add')}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 10 }}>
        {t('allowedFolders.description')}
      </div>

      {notice && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          background: 'var(--bg-hover)',
          border: '1px solid var(--glass-border)',
          borderRadius: 7,
          padding: '7px 10px',
          marginBottom: 10,
        }}>
          <Info size={12} color="var(--text-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>
            {t(notice.key, notice.params)}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text-faint)',
              display: 'inline-flex',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {reading ? (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', padding: '4px 0' }}>
          {t('common.loadingEllipsis')}
        </div>
      ) : loadError ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 7,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, color: 'var(--danger-text)', lineHeight: 1.5, flex: 1 }}>
            {t('allowedFolders.loadFailed')}
          </span>
          <button
            type="button"
            onClick={() => { void reload() }}
            style={quietButtonStyle}
          >
            {t('allowedFolders.retry')}
          </button>
        </div>
      ) : folders && folders.length === 0 ? (
        <div style={{
          border: '1px dashed var(--glass-border-md)',
          borderRadius: 10,
          padding: '16px 14px',
          textAlign: 'center',
        }}>
          <FolderOpen size={22} color="var(--text-muted)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>
            {t('allowedFolders.emptyTitle')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {t('allowedFolders.emptyHint')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(folders ?? []).map(dir => {
            const label = workingDirLabel(dir, homeDir) || dir
            const isConfirming = confirming === dir
            const isRemoving = removing === dir
            return (
              <div
                key={dir}
                style={{
                  ...rowStyle,
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: isConfirming ? 8 : 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={labelStyle} title={dir}>{label}</div>
                    {/* The full path stays visible: a short label alone cannot
                        tell two folders with the same name apart. */}
                    <div style={pathStyle} title={dir}>{dir}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null)
                      setConfirming(isConfirming ? null : dir)
                    }}
                    disabled={removing !== null}
                    aria-label={t('allowedFolders.removeAria', { folder: dir })}
                    title={t('allowedFolders.removeAria', { folder: dir })}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: removing !== null ? 'default' : 'pointer',
                      padding: 2,
                      display: 'inline-flex',
                      flexShrink: 0,
                      color: removing !== null ? 'var(--text-faint)' : 'var(--text-muted)',
                      opacity: 0.6,
                      transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
                  >
                    <X size={12} />
                  </button>
                </div>

                {isConfirming && (
                  <div style={{
                    borderTop: '1px solid rgba(99,102,241,0.18)',
                    paddingTop: 8,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, wordBreak: 'break-word' }}>
                      {t('allowedFolders.confirmTitle', { folder: label })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 8, wordBreak: 'break-word' }}>
                      {t('allowedFolders.confirmBody', { path: dir })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={isRemoving}
                        style={{
                          ...quietButtonStyle,
                          color: 'var(--text-muted)',
                          background: 'none',
                          cursor: isRemoving ? 'default' : 'pointer',
                        }}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void removeFolder(dir) }}
                        disabled={isRemoving}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.35)',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--danger-text)',
                          cursor: isRemoving ? 'default' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t('allowedFolders.confirmRemove')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
