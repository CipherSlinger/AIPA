// GitStatusChip — the status bar's working-tree segment (wave 85B).
//
// It answers "what is uncommitted in the folder this conversation is using?"
// without a terminal. The underlying call is `git status --porcelain=v1 -b`,
// which is a snapshot, not a live index: it is read once on mount, then on
// window focus, on a click, and on `fs:changed` events (throttled to one read
// per two seconds). There is no timer polling the repository.
//
// Absence is not cleanliness. A folder that is not a repository, a machine
// without git, or no usable folder at all renders nothing. A repository that is
// clean still renders — the branch is a fact worth seeing — and the panel says
// plainly that nothing is uncommitted.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GitBranch } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore, usePrefsStore, useSessionStore, useUiStore } from '../../store'
import { pushEscapeHandler } from '../ui/escapeStack'
import type { GitStatusData, GitStatusOkData } from '../../../preload'
import GitStatusPopover from './GitStatusPopover'
import {
  GIT_STATUS_OPEN_EVENT,
  consumeGitStatusRequest,
  gitFolderKey,
  gitStatusErrorText,
  rememberGitStatus,
  sameGitFolder,
} from './gitStatusPanel'

/** A burst of watcher events must not become a burst of git processes. */
const FS_REFRESH_MIN_MS = 2000

function isInside(folder: string, root: string): boolean {
  if (!folder || !root) return false
  const f = gitFolderKey(folder)
  const r = gitFolderKey(root)
  return r !== '' && f.startsWith(`${r}/`)
}

export default function GitStatusChip() {
  const t = useT()
  const chatDir = useChatStore(s => s.workingDir)
  const prefDir = usePrefsStore(s => s.prefs.workingDir)
  const homeDir = useSessionStore(s => s.homeDir)
  // Same folder order the terminal dock and the palette use.
  const cwd = chatDir || prefDir || homeDir || ''

  const [status, setStatus] = useState<GitStatusData | null>(null)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cwdRef = useRef(cwd)
  const openRef = useRef(false)
  const seqRef = useRef(0)
  const lastFetchRef = useRef(0)
  // Only a folder already known to be a repository is worth re-reading for
  // every watcher event. A hidden chip has nothing to update.
  const hasRepoRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const tRef = useRef(t)
  // Set when the palette asked for the panel: a failed read then owes the user
  // a sentence, not a click that silently does nothing.
  const announceFailureRef = useRef(false)

  useEffect(() => { cwdRef.current = cwd }, [cwd])
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { tRef.current = t }, [t])

  const load = useCallback(async (): Promise<GitStatusData | null> => {
    const folder = cwdRef.current
    if (!folder) {
      setStatus(null)
      return null
    }
    const request = ++seqRef.current
    lastFetchRef.current = Date.now()
    setRefreshing(true)
    let result: GitStatusData
    try {
      result = await window.electronAPI.fsGitStatus(folder)
    } catch (err) {
      result = { ok: false, code: 'failed', message: String(err) }
    }
    // A newer read or a different folder owns the state now; this answer may
    // not describe it.
    if (request !== seqRef.current || folder !== cwdRef.current) return null
    setRefreshing(false)
    setStatus(result)
    hasRepoRef.current = result.ok
    rememberGitStatus(folder, result)
    if (result.ok) {
      // A palette ask that got its panel owes no failure sentence later.
      announceFailureRef.current = false
    } else {
      if (announceFailureRef.current) {
        announceFailureRef.current = false
        useUiStore.getState().addToast('info', gitStatusErrorText(tRef.current, result, folder))
      }
      // The panel has nothing truthful left to list.
      if (openRef.current) {
        openRef.current = false
        setOpen(false)
      }
    }
    return result
  }, [])

  // A changed folder invalidates everything on screen: the old branch belongs
  // to a folder the conversation is no longer using.
  useEffect(() => {
    seqRef.current += 1
    setStatus(null)
    setOpen(false)
    openRef.current = false
    hasRepoRef.current = false
    announceFailureRef.current = false
    lastFetchRef.current = 0
    if (!cwd) return
    void load()
  }, [cwd, load])

  // Refresh on window focus. No interval: a repository that nobody is looking
  // at costs nothing.
  useEffect(() => {
    const onFocus = () => {
      if (cwdRef.current) void load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // Watcher-driven refresh, throttled. The watcher is shared and refcounted by
  // other panels; this only listens, and coalesces a burst into one read.
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onFsChanged) return
    const off = api.onFsChanged(() => {
      if (!cwdRef.current || !hasRepoRef.current) return
      const elapsed = Date.now() - lastFetchRef.current
      if (elapsed >= FS_REFRESH_MIN_MS) {
        void load()
        return
      }
      if (timerRef.current !== null) return
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void load()
      }, FS_REFRESH_MIN_MS - elapsed)
    })
    return () => {
      off()
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [load])

  // The palette row asks for this panel through a window event. A request made
  // before the chip mounted (the palette may have just revealed a hidden status
  // bar) is also claimed here.
  const openFromPalette = useCallback(() => {
    if (!cwdRef.current) return
    announceFailureRef.current = true
    openRef.current = true
    setOpen(true)
    void load()
  }, [load])

  useEffect(() => {
    const onRequest = () => { openFromPalette() }
    window.addEventListener(GIT_STATUS_OPEN_EVENT, onRequest)
    if (consumeGitStatusRequest()) openFromPalette()
    return () => window.removeEventListener(GIT_STATUS_OPEN_EVENT, onRequest)
  }, [openFromPalette])

  const close = useCallback((refocusTrigger: boolean) => {
    openRef.current = false
    setOpen(false)
    if (refocusTrigger) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close(false)
      }
    }
    // The app shell's own Escape handling does not exist outside the chat view,
    // so this listener keeps Escape working everywhere. The escape-stack entry
    // lets it run before navigation.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    const release = pushEscapeHandler(() => close(true))
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      release()
    }
  }, [open, close])

  const ok: GitStatusOkData | null = status && status.ok ? status : null
  if (!ok) return null

  const branchText = ok.detached
    ? (ok.headSha ?? t('gitStatus.detached'))
    : (ok.branch ?? t('gitStatus.unknownBranch'))
  const dirty = ok.total > 0

  const title = ok.detached
    ? (ok.headSha
      ? t('gitStatus.detachedTitle', { sha: ok.headSha })
      : t('gitStatus.detachedUnknownTitle'))
    : dirty
      ? t('gitStatus.dirtyTitle', { count: String(ok.total), branch: branchText })
      : t('gitStatus.cleanTitle', { branch: branchText })

  const toggle = () => {
    if (open) {
      close(true)
      return
    }
    openRef.current = true
    setOpen(true)
    void load()
  }

  // `fs:gitDiff` runs in the app-wide working folder. It can speak for this
  // repository when that folder is the same one (or inside it); otherwise the
  // panel reveals files instead of showing a diff from another checkout.
  const diffCwd = prefDir || homeDir
  const repoRoot = ok.root || cwd
  const diffInThisFolder = sameGitFolder(repoRoot, diffCwd) || isInside(diffCwd, repoRoot)

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={title}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 6,
          border: 'none', cursor: 'pointer',
          fontSize: 10, whiteSpace: 'nowrap',
          background: hover || open ? 'var(--border)' : 'transparent',
          color: dirty ? 'var(--text-secondary)' : 'var(--text-muted)',
          opacity: hover || open || dirty ? 1 : 0.8,
          transition: 'all 0.15s ease',
        }}
      >
        <GitBranch size={10} style={{ flexShrink: 0 }} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {branchText}
        </span>
        {dirty && (
          <>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span
              aria-hidden
              style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--warning-text)', flexShrink: 0,
              }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
              {ok.total}
            </span>
          </>
        )}
        {ok.upstream && ok.ahead > 0 && (
          <span
            title={t('gitStatus.aheadTitle', { count: String(ok.ahead), upstream: ok.upstream })}
            style={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85 }}
          >
            <ArrowUp size={9} />
            {ok.ahead}
          </span>
        )}
        {ok.upstream && ok.behind > 0 && (
          <span
            title={t('gitStatus.behindTitle', { count: String(ok.behind), upstream: ok.upstream })}
            style={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85 }}
          >
            <ArrowDown size={9} />
            {ok.behind}
          </span>
        )}
      </button>

      {open && (
        <GitStatusPopover
          cwd={cwd}
          status={ok}
          diffInThisFolder={diffInThisFolder}
          refreshing={refreshing}
          onClose={() => close(false)}
        />
      )}
    </div>
  )
}
