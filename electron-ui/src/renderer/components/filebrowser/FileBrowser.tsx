import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, FolderPlus, ArrowUp,
  Search, RefreshCw, X, Eye, EyeOff
} from 'lucide-react'
import { FileEntry } from '../../types/app.types'
import type { FsWatchStateData } from '../../../preload'
import { getFileIcon } from './fileIcons'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'
import {
  affectedDirectories,
  canonicalWatchPath,
  collectWatchedDirectories,
  watchIndicator,
} from './watchModel'

/** Collapse watch events that arrive between two renderer frames. */
const REFRESH_COALESCE_MS = 150

function keyOf(filePath: string): string {
  return canonicalWatchPath(filePath) ?? filePath
}

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  expanded: ReadonlySet<string>
  childrenByDir: Readonly<Record<string, FileEntry[]>>
  onToggle: (entry: FileEntry) => void
  onSetCwd: (path: string) => void
  t: (key: string, params?: Record<string, string>) => string
  filter?: string
}

function TreeNode({ entry, depth, expanded, childrenByDir, onToggle, onSetCwd, t, filter }: TreeNodeProps) {
  const isExpanded = entry.isDirectory && expanded.has(keyOf(entry.path))
  const children = childrenByDir[keyOf(entry.path)] ?? []

  const handleClick = () => {
    if (!entry.isDirectory) {
      // Click on a file: insert @path into chat input
      window.dispatchEvent(new CustomEvent('aipa:insertText', { detail: `@${entry.path} ` }))
      return
    }
    onToggle(entry)
  }

  const handleDoubleClick = () => {
    if (entry.isDirectory) onSetCwd(entry.path)
  }

  return (
    <>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={entry.isDirectory ? t('fileBrowser.doubleClickSetDir') : t('fileBrowser.clickToMention')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: 12,
          userSelect: 'none',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {entry.isDirectory
          ? (isExpanded
            ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            : <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />)
          : <span style={{ width: 11, flexShrink: 0 }} />}

        {entry.isDirectory
          ? (isExpanded
            ? <FolderOpen size={13} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
            : <Folder size={13} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />)
          : (() => {
              const { Icon, color } = getFileIcon(entry.name)
              return <Icon size={13} style={{ color, flexShrink: 0 }} />
            })()}

        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
      </div>
      {isExpanded && children
        .filter(child => !filter || child.name.toLowerCase().includes(filter.toLowerCase()) || child.isDirectory)
        .map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          expanded={expanded}
          childrenByDir={childrenByDir}
          onToggle={onToggle}
          onSetCwd={onSetCwd}
          t={t}
          filter={filter}
        />
      ))}
    </>
  )
}

export default function FileBrowser() {
  const workingDir = useChatStore(s => s.workingDir)
  const setWorkingDir = useChatStore(s => s.setWorkingDir)
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [currentDir, setCurrentDir] = useState(workingDir || '')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [childrenByDir, setChildrenByDir] = useState<Record<string, FileEntry[]>>({})
  const [watchState, setWatchState] = useState<FsWatchStateData | null>(null)
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const t = useT()

  // Expansion lives in one place so a directory refresh can replace only that
  // node's children: the tree keeps its keys, expanded rows stay open and the
  // scroll container is never remounted.
  const rootKeyRef = useRef<string | null>(null)
  const rootEntriesRef = useRef<FileEntry[]>([])
  const expandedRef = useRef<Set<string>>(new Set())
  const childrenRef = useRef<Record<string, FileEntry[]>>({})
  const loadedRef = useRef<Set<string>>(new Set())
  const requestSeqRef = useRef<Map<string, number>>(new Map())
  const navigationSeqRef = useRef(0)
  const currentDirRef = useRef(currentDir)
  const mountedRef = useRef(true)
  // Each mounted browser owns a subscription; two browsers in one window (the
  // sidebar and the shell) must not overwrite each other's watched set.
  const subscriberIdRef = useRef(`fb-${Math.random().toString(36).slice(2, 10)}`)
  const pendingRef = useRef<{ dirs: Map<string, string>; timer: ReturnType<typeof setTimeout> | null }>({
    dirs: new Map(),
    timer: null,
  })

  const applyExpanded = useCallback((next: Set<string>) => {
    expandedRef.current = next
    setExpanded(next)
  }, [])

  // A folder that disappeared from its parent must stop being an expanded
  // subscription too; otherwise its dead watcher would keep reporting "not
  // watching" for a row the user can no longer see.
  const pruneRemovedChildren = useCallback((previous: FileEntry[], next: FileEntry[]) => {
    const nextKeys = new Set(next.filter(e => e.isDirectory).map(e => keyOf(e.path)))
    const removed = previous
      .filter(e => e.isDirectory && !nextKeys.has(keyOf(e.path)))
      .map(e => keyOf(e.path))
    if (removed.length === 0) return

    const current = expandedRef.current
    const nextExpanded = new Set(current)
    let changed = false
    for (const key of removed) {
      if (nextExpanded.delete(key)) changed = true
      delete childrenRef.current[key]
      const prefix = key.endsWith('/') ? key : key + '/'
      for (const expandedKey of [...nextExpanded]) {
        if (expandedKey.startsWith(prefix)) {
          nextExpanded.delete(expandedKey)
          changed = true
        }
      }
    }
    if (changed) applyExpanded(nextExpanded)
  }, [applyExpanded])

  const refreshNode = useCallback(async (directory: string) => {
    const key = canonicalWatchPath(directory)
    if (!key) return
    const sequence = (requestSeqRef.current.get(key) ?? 0) + 1
    requestSeqRef.current.set(key, sequence)
    const entries = await window.electronAPI.fsListDir(directory)
    // A newer request (navigation, another watch event) owns this node now.
    if (!mountedRef.current || requestSeqRef.current.get(key) !== sequence) return
    const loaded = entries || []
    if (rootKeyRef.current === key) {
      pruneRemovedChildren(rootEntriesRef.current, loaded)
      rootEntriesRef.current = loaded
      setRootEntries(loaded)
      return
    }
    // The user collapsed it while the listing was in flight; keep the cache
    // cold so expanding again fetches the current truth.
    if (!expandedRef.current.has(key)) return
    loadedRef.current.add(key)
    pruneRemovedChildren(childrenRef.current[key] ?? [], loaded)
    childrenRef.current = { ...childrenRef.current, [key]: loaded }
    setChildrenByDir(childrenRef.current)
  }, [pruneRemovedChildren])

  const navigateTo = useCallback(async (dir: string) => {
    const key = canonicalWatchPath(dir)
    if (!key) return
    const sequence = ++navigationSeqRef.current
    currentDirRef.current = dir
    rootKeyRef.current = key
    const entries = await window.electronAPI.fsListDir(dir)
    if (!mountedRef.current || navigationSeqRef.current !== sequence) return
    const loaded = entries || []
    rootEntriesRef.current = loaded
    setRootEntries(loaded)
    setCurrentDir(dir)
    currentDirRef.current = dir
    rootKeyRef.current = key
    requestSeqRef.current.clear()
    loadedRef.current.clear()
    childrenRef.current = {}
    setChildrenByDir({})
    applyExpanded(new Set())
  }, [applyExpanded])

  useEffect(() => {
    const init = async () => {
      const home = await window.electronAPI.fsGetHome()
      const dir = workingDir || home
      await navigateTo(dir)
    }
    init()
  }, [workingDir, navigateTo])

  const refreshRoot = useCallback(() => {
    const dir = currentDirRef.current
    if (dir) void refreshNode(dir)
  }, [refreshNode])

  const toggleDir = useCallback((entry: FileEntry) => {
    const key = keyOf(entry.path)
    const next = new Set(expandedRef.current)
    if (next.has(key)) {
      next.delete(key)
      applyExpanded(next)
      return
    }
    next.add(key)
    applyExpanded(next)
    if (!loadedRef.current.has(key)) void refreshNode(entry.path)
  }, [applyExpanded, refreshNode])

  const watchedDirs = useMemo(
    () => collectWatchedDirectories(currentDir, expanded),
    [currentDir, expanded],
  )

  const scheduleRefresh = useCallback((directories: string[]) => {
    const pending = pendingRef.current
    for (const directory of directories) {
      const key = canonicalWatchPath(directory)
      if (key) pending.dirs.set(key, directory)
    }
    if (pending.timer) return
    pending.timer = setTimeout(() => {
      pending.timer = null
      const batch = [...pending.dirs.values()]
      pending.dirs.clear()
      for (const directory of batch) void refreshNode(directory)
    }, REFRESH_COALESCE_MS)
  }, [refreshNode])

  // Subscribe to exactly what this tree displays. The effect is re-run as rows
  // expand or collapse; main replaces this subscriber's set atomically, so the
  // gap between two calls never closes the handles another browser still uses.
  useEffect(() => {
    if (!currentDir) {
      setWatchState(null)
      // Release what an earlier render may have subscribed; an empty tree has
      // nothing that can go stale.
      void window.electronAPI.fsWatchDirectories([], subscriberIdRef.current)
      return
    }
    let cancelled = false
    const off = window.electronAPI.onFsChanged((payload) => {
      if (cancelled) return
      // Present only when a watch died after it was reported running.
      if (payload?.state) setWatchState(payload.state)
      const affected = affectedDirectories(watchedDirs, payload?.changes)
      if (affected.length > 0) scheduleRefresh(affected)
    })
    window.electronAPI.fsWatchDirectories(watchedDirs, subscriberIdRef.current)
      .then(state => { if (!cancelled) setWatchState(state) })
      .catch(() => {
        // The call itself failed; say "not watching" rather than showing a
        // badge for a subscription main never accepted.
        if (!cancelled) {
          setWatchState({ watching: [], failed: [{ directory: currentDir, error: 'ipc' }] })
        }
      })
    return () => {
      cancelled = true
      off()
    }
  }, [currentDir, watchedDirs, scheduleRefresh])

  // Unmounting the browser stops its watches. Dependency changes above only
  // replace the set; a full stop is the unmount path.
  useEffect(() => {
    mountedRef.current = true
    // Copy the stable ref values now: the cleanup runs long after this render,
    // and reading `.current` inside it is exactly the stale-ref trap the lint
    // rule warns about.
    const pending = pendingRef.current
    const subscriberId = subscriberIdRef.current
    return () => {
      mountedRef.current = false
      if (pending.timer) {
        clearTimeout(pending.timer)
        pending.timer = null
      }
      pending.dirs.clear()
      void window.electronAPI.fsWatchDirectories([], subscriberId)
    }
  }, [])

  const filteredEntries = useMemo(() => {
    if (!filter) return rootEntries
    const q = filter.toLowerCase()
    return rootEntries.filter(e => e.name.toLowerCase().includes(q) || e.isDirectory)
  }, [rootEntries, filter])

  const fileCount = rootEntries.filter(e => !e.isDirectory).length
  const dirCount = rootEntries.filter(e => e.isDirectory).length

  const openDialog = async () => {
    const selected = await window.electronAPI.fsShowOpenDialog()
    if (selected) {
      setWorkingDir(selected)
      void navigateTo(selected)
      void window.electronAPI.prefsSet('workingDir', selected)
    }
  }

  const setCwd = useCallback((path: string) => {
    setWorkingDir(path)
    void navigateTo(path)
    void window.electronAPI.prefsSet('workingDir', path)
  }, [navigateTo, setWorkingDir])

  const goToParent = () => {
    if (!currentDir) return
    // Cross-platform parent: handle both / and \ separators
    const sep = currentDir.includes('\\') ? '\\' : '/'
    const parts = currentDir.split(sep).filter(Boolean)
    if (parts.length <= 1) {
      // Already at root (e.g., "C:\" or "/")
      const root = currentDir.includes('\\') ? parts[0] + '\\' : '/'
      if (root !== currentDir) setCwd(root)
      return
    }
    parts.pop()
    const parent = currentDir.includes('\\')
      ? parts.join('\\') + (parts.length === 1 && /^[A-Za-z]:$/i.test(parts[0]) ? '\\' : '')
      : '/' + parts.join('/')
    setCwd(parent)
  }

  // Determine if we can go up
  const canGoUp = (() => {
    if (!currentDir) return false
    const sep = currentDir.includes('\\') ? '\\' : '/'
    const parts = currentDir.split(sep).filter(Boolean)
    // Can't go up from root (/ or C:\)
    if (parts.length <= 1 && (currentDir === '/' || /^[A-Za-z]:\\?$/i.test(currentDir))) return false
    return true
  })()

  const shortDir = currentDir.length > 30
    ? '...' + currentDir.slice(-27)
    : currentDir

  const watchMode = watchIndicator(watchState)
  const watchTitle = watchMode === 'failed'
    ? t('fileBrowser.watchFailed', { path: watchState?.failed[0]?.directory || currentDir })
    : watchMode === 'on'
      ? t('fileBrowser.watchLive')
      : t('fileBrowser.watchOff')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--popup-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          background: 'var(--popup-bg)',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={currentDir}
        >
          {shortDir || t('fileBrowser.selectDir')}
        </span>
        {/* File count badge */}
        {rootEntries.length > 0 && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
            title={t('fileBrowser.itemCount', { dirs: String(dirCount), files: String(fileCount) })}
          >
            {rootEntries.length}
          </span>
        )}
        {/* Live-refresh status: never a silent claim that a failed watch works */}
        {currentDir && watchState && (
          <span
            title={watchTitle}
            aria-label={watchTitle}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              color: watchMode === 'failed' ? '#f59e0b' : 'var(--text-muted)',
            }}
          >
            {watchMode === 'failed' ? <EyeOff size={11} /> : <Eye size={11} />}
          </span>
        )}
        {/* Search toggle */}
        <button
          onClick={() => { setShowFilter(!showFilter); if (showFilter) setFilter('') }}
          title={t('fileBrowser.filterFiles')}
          style={{
            background: showFilter ? 'rgba(99,102,241,0.6)' : 'none',
            border: 'none',
            color: showFilter ? 'rgba(255,255,255,0.95)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
            padding: 2,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (!showFilter) e.currentTarget.style.color = '#818cf8' }}
          onMouseLeave={e => { if (!showFilter) e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Search size={13} />
        </button>
        {/* Refresh */}
        <button
          onClick={refreshRoot}
          title={t('fileBrowser.refresh')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#818cf8'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={goToParent}
          title={t('fileBrowser.parentDir')}
          disabled={!canGoUp}
          style={{
            background: 'none',
            border: 'none',
            color: canGoUp ? 'var(--text-muted)' : 'var(--text-muted)',
            cursor: canGoUp ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            opacity: canGoUp ? 1 : 0.3,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (canGoUp) e.currentTarget.style.color = '#818cf8' }}
          onMouseLeave={e => { if (canGoUp) e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={openDialog}
          title={t('fileBrowser.chooseDir')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <FolderPlus size={14} />
        </button>
      </div>

      {/* Filter input */}
      {showFilter && (
        <div style={{
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}>
          <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            autoFocus
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setShowFilter(false); setFilter('') } }}
            placeholder={t('fileBrowser.filterPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'inherit',
              minWidth: 0,
            }}
            onFocus={e => { e.currentTarget.style.boxShadow = 'none' }}
          />
          {filter && (
            <>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                {filteredEntries.length}/{rootEntries.length}
              </span>
              <button
                onClick={() => setFilter('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
              >
                <X size={11} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredEntries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expanded}
            childrenByDir={childrenByDir}
            onToggle={toggleDir}
            onSetCwd={setCwd}
            t={t}
            filter={filter}
          />
        ))}
        {rootEntries.length === 0 && (
          <div style={{ padding: '24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderPlus size={18} style={{ color: 'var(--accent-text)' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('fileBrowser.chooseHint')}</span>
          </div>
        )}
        {rootEntries.length > 0 && filteredEntries.length === 0 && filter && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            {t('fileBrowser.noFilterResults')}
          </div>
        )}
      </div>
    </div>
  )
}
