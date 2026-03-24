import React, { useState, useEffect } from 'react'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react'
import { FileEntry } from '../../types/app.types'
import { useChatStore } from '../../store'

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  onSetCwd: (path: string) => void
}

function TreeNode({ entry, depth, onSetCwd }: TreeNodeProps) {
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
        title={entry.isDirectory ? '双击设为工作目录' : entry.name}
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
        <TreeNode key={child.path} entry={child} depth={depth + 1} onSetCwd={onSetCwd} />
      ))}
    </>
  )
}

export default function FileBrowser() {
  const { workingDir, setWorkingDir } = useChatStore()
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [currentDir, setCurrentDir] = useState(workingDir || '')

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
          {shortDir || '选择目录'}
        </span>
        <button
          onClick={openDialog}
          title="选择工作目录"
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
          <TreeNode key={entry.path} entry={entry} depth={0} onSetCwd={setCwd} />
        ))}
        {rootEntries.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            点击右上角选择工作目录
          </div>
        )}
      </div>
    </div>
  )
}
