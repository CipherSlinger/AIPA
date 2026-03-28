import React, { useState, useEffect } from 'react'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderPlus, ArrowUp } from 'lucide-react'
import { FileEntry } from '../../types/app.types'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  onSetCwd: (path: string) => void
  t: (key: string, params?: Record<string, string>) => string
}

function TreeNode({ entry, depth, onSetCwd, t }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (!entry.isDirectory) return
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
        title={entry.isDirectory ? t('fileBrowser.doubleClickSetDir') : entry.name}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          color: 'var(--text-primary)',
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
            ? <FolderOpen size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            : <Folder size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />)
          : <File size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}

        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
      </div>
      {expanded && children.map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1} onSetCwd={onSetCwd} t={t} />
      ))}
    </>
  )
}

export default function FileBrowser() {
  const { workingDir, setWorkingDir } = useChatStore()
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [currentDir, setCurrentDir] = useState(workingDir || '')
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={currentDir}
        >
          {shortDir || t('fileBrowser.selectDir')}
        </span>
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
            transition: 'opacity 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { if (canGoUp) e.currentTarget.style.color = 'var(--accent)' }}
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

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rootEntries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} onSetCwd={setCwd} t={t} />
        ))}
        {rootEntries.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            {t('fileBrowser.chooseHint')}
          </div>
        )}
      </div>
    </div>
  )
}
