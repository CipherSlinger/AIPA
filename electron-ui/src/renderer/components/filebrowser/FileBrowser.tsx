import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, FolderPlus, ArrowUp,
  Search, RefreshCw, X
} from 'lucide-react'
import { FileEntry } from '../../types/app.types'
import { getFileIcon } from './fileIcons'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  onSetCwd: (path: string) => void
  t: (key: string, params?: Record<string, string>) => string
  filter?: string
}

function TreeNode({ entry, depth, onSetCwd, t, filter }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (!entry.isDirectory) {
      // Click on a file: insert @path into chat input
      window.dispatchEvent(new CustomEvent('aipa:insertText', { detail: `@${entry.path} ` }))
      return
    }
    if (!expanded && children.length === 0) {
      setLoading(true)
      const entries = await window.electronAPI.fsListDir(entry.path)
      setChildren(entries || [])
      setLoading(false)
    }
    setExpanded(!expanded)
  }

  const handleDoubleClick = () => {
    if (entry.isDirectory) onSetCwd(entry.path)
  }

  return (
    <>
      <div
        onClick={toggle}
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
          ? (expanded
            ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            : <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />)
          : <span style={{ width: 11, flexShrink: 0 }} />}

        {entry.isDirectory
          ? (expanded
            ? <FolderOpen size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
            : <Folder size={13} style={{ color: '#818cf8', flexShrink: 0 }} />)
          : (() => {
              const { Icon, color } = getFileIcon(entry.name)
              return <Icon size={13} style={{ color, flexShrink: 0 }} />
            })()}

        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
      </div>
      {expanded && children
        .filter(child => !filter || child.name.toLowerCase().includes(filter.toLowerCase()) || child.isDirectory)
        .map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1} onSetCwd={onSetCwd} t={t} filter={filter} />
      ))}
    </>
  )
}

export default function FileBrowser() {
  const { workingDir, setWorkingDir } = useChatStore()
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [currentDir, setCurrentDir] = useState(workingDir || '')
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const t = useT()

  useEffect(() => {
    const init = async () => {
      const home = await window.electronAPI.fsGetHome()
      const dir = workingDir || home
      setCurrentDir(dir)
      loadDir(dir)
    }
    init()
  }, [workingDir])

  const loadDir = async (dir: string) => {
    const entries = await window.electronAPI.fsListDir(dir)
    setRootEntries(entries || [])
    setCurrentDir(dir)
  }

  const handleRefresh = useCallback(() => {
    if (currentDir) loadDir(currentDir)
  }, [currentDir])

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
      loadDir(selected)
      window.electronAPI.prefsSet('workingDir', selected)
    }
  }

  const setCwd = (path: string) => {
    setWorkingDir(path)
    loadDir(path)
    window.electronAPI.prefsSet('workingDir', path)
  }

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
      ? parts.join('\\') + (parts.length === 1 && /^[A-Z]:$/i.test(parts[0]) ? '\\' : '')
      : '/' + parts.join('/')
    setCwd(parent)
  }

  // Determine if we can go up
  const canGoUp = (() => {
    if (!currentDir) return false
    const sep = currentDir.includes('\\') ? '\\' : '/'
    const parts = currentDir.split(sep).filter(Boolean)
    // Can't go up from root (/ or C:\)
    if (parts.length <= 1 && (currentDir === '/' || /^[A-Z]:\\?$/i.test(currentDir))) return false
    return true
  })()

  const shortDir = currentDir.length > 30
    ? '...' + currentDir.slice(-27)
    : currentDir

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
          onClick={handleRefresh}
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
          <TreeNode key={entry.path} entry={entry} depth={0} onSetCwd={setCwd} t={t} filter={filter} />
        ))}
        {rootEntries.length === 0 && (
          <div style={{ padding: '24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderPlus size={18} style={{ color: '#818cf8' }} />
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
