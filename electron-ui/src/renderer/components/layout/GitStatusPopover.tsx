// GitStatusPopover — the list behind the working-tree chip (wave 85B).
//
// This panel answers one question: what is uncommitted in the folder this
// conversation is using right now? It is a snapshot of `git status`, re-read
// when the panel opens and when the window regains focus; it is not a live
// index, and nothing here watches files on its own.
//
// Rows carry the porcelain letters they were read with, grouped the way git
// itself groups them. A file staged and then edited again belongs to two
// groups, because it genuinely has two kinds of change.
//
// Diffs reuse the sidebar's DiffViewer, fed by the existing `fs:gitDiff`
// channel. That channel is bound to the app-wide working folder, so the chip
// tells this panel whether it can speak for this repository; when it cannot,
// clicking a row reveals the file instead of showing a diff from the wrong
// checkout.

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, ExternalLink, GitBranch } from 'lucide-react'
import { useT } from '../../i18n'
import DiffViewer from '../sidebar/DiffViewer'
import type { GitStatusFileData, GitStatusOkData } from '../../../preload'

interface GitStatusPopoverProps {
  /** The folder the conversation is using. */
  cwd: string
  status: GitStatusOkData
  /**
   * False when `fs:gitDiff` would run in a different checkout. The row then
   * opens the file's folder; it never renders a diff that belongs to another
   * repository.
   */
  diffInThisFolder: boolean
  refreshing: boolean
  onClose: () => void
}

interface DiffState {
  loading: boolean
  content: string | null
  error: string | null
}

type GroupKey = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

const GROUPS: { key: GroupKey; labelKey: string }[] = [
  { key: 'staged', labelKey: 'gitStatus.staged' },
  { key: 'unstaged', labelKey: 'gitStatus.unstaged' },
  { key: 'untracked', labelKey: 'gitStatus.untracked' },
  { key: 'conflicted', labelKey: 'gitStatus.conflicted' },
]

// Mirrors src/main/fs/git-status.ts. Kept local because the renderer must not
// import main-process modules; the harness pins the main copy.
const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

function joinPath(root: string, filePath: string): string {
  return `${root.replace(/[\\/]+$/, '')}/${filePath}`
}

function basename(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).pop() || p
}

/** `M ` reads as a badge; a space is the difference between columns, so show it. */
function lettersOf(file: GitStatusFileData): string {
  return `${file.index}${file.worktree}`.replace(/ /g, '·')
}

export default function GitStatusPopover({
  cwd,
  status,
  diffInThisFolder,
  refreshing,
  onClose,
}: GitStatusPopoverProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, DiffState>>({})
  // The row whose folder was opened by the no-diff fallback. `ok` is what the
  // shell reported: a deleted file has no folder to open, and the note must not
  // claim otherwise.
  const [revealed, setRevealed] = useState<{ key: string; ok: boolean } | null>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const groups = useMemo(() => {
    const out: Record<GroupKey, GitStatusFileData[]> = {
      staged: [], unstaged: [], untracked: [], conflicted: [],
    }
    for (const file of status.files) {
      const pair = `${file.index}${file.worktree}`
      if (CONFLICT_PAIRS.has(pair)) {
        out.conflicted.push(file)
        continue
      }
      if (file.index === '?' && file.worktree === '?') {
        out.untracked.push(file)
        continue
      }
      if (file.index !== ' ') out.staged.push(file)
      if (file.worktree !== ' ') out.unstaged.push(file)
    }
    return out
  }, [status.files])

  const root = status.root || cwd

  const loadDiff = useCallback(async (file: GitStatusFileData) => {
    setDiffs(prev => ({ ...prev, [file.path]: { loading: true, content: null, error: null } }))
    try {
      // The existing channel runs `git diff HEAD -- <path>` in the app-wide
      // working folder. `diffInThisFolder` is the guard that this folder is
      // that checkout (or inside it).
      const result = await window.electronAPI.fsGitDiff(joinPath(root, file.path))
      if (typeof result === 'string') {
        setDiffs(prev => ({ ...prev, [file.path]: { loading: false, content: result, error: null } }))
      } else {
        setDiffs(prev => ({ ...prev, [file.path]: { loading: false, content: null, error: result.error } }))
      }
    } catch (err) {
      setDiffs(prev => ({ ...prev, [file.path]: { loading: false, content: null, error: String(err) } }))
    }
  }, [root])

  const onRow = useCallback((file: GitStatusFileData, group: GroupKey) => {
    const key = `${group}:${file.path}`
    setRevealed(null)
    if (group === 'untracked') {
      setExpanded(prev => (prev === key ? null : key))
      return
    }
    if (!diffInThisFolder) {
      // No diff is available for this checkout, so open the file's folder.
      // This is the documented fallback, not a second best diff. The note
      // repeats what the shell actually answered.
      setExpanded(null)
      setRevealed(null)
      void window.electronAPI.shellShowItemInFolder(joinPath(root, file.path))
        .then(result => setRevealed({ key, ok: result?.success !== false }))
        .catch(() => setRevealed({ key, ok: false }))
      return
    }
    const wasOpen = expanded === key
    setExpanded(wasOpen ? null : key)
    if (!wasOpen && !diffs[file.path]) void loadDiff(file)
  }, [diffInThisFolder, diffs, expanded, loadDiff, root])

  const title = status.detached
    ? (status.headSha
      ? t('gitStatus.headerDetached', { sha: status.headSha })
      : t('gitStatus.headerDetachedUnknown'))
    : t('gitStatus.headerBranch', { branch: status.branch ?? t('gitStatus.unknownBranch') })

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('gitStatus.title')}
      tabIndex={-1}
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        // The chip sits at the right end of the flexible centre zone, so the
        // panel grows leftwards instead of off the window.
        right: 0,
        marginBottom: 6,
        width: 460,
        maxWidth: 'calc(100vw - 24px)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
        borderRadius: 10,
        padding: 8,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        outline: 'none',
        maxHeight: '70vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px 0' }}>
        <GitBranch size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {t('gitStatus.title')}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
          {refreshing ? t('gitStatus.refreshing') : t('gitStatus.snapshot')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('gitStatus.close')}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-primary)', padding: '0 4px' }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1.45 }}>
        {t('gitStatus.subtitle', { folder: basename(cwd) })}
      </div>
      {status.upstream && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', padding: '0 4px' }}>
          <span>{t('gitStatus.tracking', { upstream: status.upstream })}</span>
          {status.ahead > 0 && (
            <span title={t('gitStatus.aheadTitle', { count: String(status.ahead), upstream: status.upstream })} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ArrowUp size={9} />{status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span title={t('gitStatus.behindTitle', { count: String(status.behind), upstream: status.upstream })} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ArrowDown size={9} />{status.behind}
            </span>
          )}
        </div>
      )}

      {status.truncated && (
        <div style={{ fontSize: 10, color: 'var(--warning-text)', padding: '2px 4px' }}>
          {t('gitStatus.moreFiles', { shown: String(status.files.length), total: String(status.total) })}
        </div>
      )}

      {status.files.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 4px' }}>
          {t('gitStatus.noFiles')}
        </div>
      ) : (
        GROUPS.map(group => {
          const rows = groups[group.key]
          if (rows.length === 0) return null
          return (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 4px 2px', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                <span>{t(group.labelKey)}</span>
                <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{rows.length}</span>
              </div>
              {rows.map(file => {
                const key = `${group.key}:${file.path}`
                const isOpen = expanded === key
                const diff = diffs[file.path]
                const display = file.origPath ? `${file.origPath} → ${file.path}` : file.path
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => onRow(file, group.key)}
                      aria-label={group.key === 'untracked'
                        ? t('gitStatus.untrackedRow', { path: display })
                        : t('gitStatus.openDiff', { path: display })}
                      aria-expanded={isOpen}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', border: 'none', borderRadius: 6,
                        background: isOpen ? 'var(--bg-hover)' : 'transparent',
                        cursor: 'pointer', textAlign: 'left', fontSize: 11,
                      }}
                      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span
                        title={t('gitStatus.lettersTitle', { index: file.index, worktree: file.worktree })}
                        style={{
                          flexShrink: 0, fontFamily: 'monospace', fontSize: 10,
                          padding: '0 4px', borderRadius: 4, minWidth: 22,
                          textAlign: 'center', color: 'var(--text-secondary)',
                          background: 'var(--glass-shimmer)',
                          border: '1px solid var(--border)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {lettersOf(file)}
                      </span>
                      <span style={{
                        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', color: 'var(--text-primary)',
                      }} title={joinPath(root, file.path)}>
                        {display}
                      </span>
                    </button>

                    {revealed?.key === key && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 8px 6px 34px', lineHeight: 1.45 }}>
                        {t(revealed.ok ? 'gitStatus.revealOnly' : 'gitStatus.revealFailed')}
                      </div>
                    )}

                    {isOpen && (
                      <div style={{ padding: '2px 6px 6px 34px' }}>
                        {group.key === 'untracked' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {t('gitStatus.untrackedNoDiff')}
                            </span>
                            <button
                              type="button"
                              onClick={() => { void window.electronAPI.shellShowItemInFolder(joinPath(root, file.path)) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                                border: '1px solid var(--border)', borderRadius: 6, background: 'var(--glass-shimmer)',
                                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, padding: '2px 6px',
                              }}
                            >
                              <ExternalLink size={10} />
                              {t('gitStatus.showInFolder')}
                            </button>
                          </div>
                        ) : diff?.loading ? (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('changes.diffLoading')}</div>
                        ) : diff?.error ? (
                          <div style={{ fontSize: 10, color: '#f87171' }}>{t('changes.diffError')}: {diff.error}</div>
                        ) : diff?.content != null ? (
                          diff.content.trim()
                            ? <DiffViewer diff={diff.content} />
                            : <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('changes.noDiff')}</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}

      {/* The panel is a snapshot, and says so, so a stale row is never read as
          a live claim about the folder. Closing is also what the × does. */}
      <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '4px 4px 0', lineHeight: 1.4 }}>
        {t('gitStatus.footnote')}
      </div>
    </div>
  )
}
