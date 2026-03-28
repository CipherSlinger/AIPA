import React, { useState, useEffect } from 'react'
import {
  Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderPlus, ArrowUp,
  FileText, FileCode, FileImage, FileVideo, FileAudio, FileArchive, FileSpreadsheet, FileJson, Settings, Database
} from 'lucide-react'
import { FileEntry } from '../../types/app.types'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

// File type icon mapping by extension
const EXT_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  // Code files
  ts: { icon: FileCode, color: '#3178c6' },
  tsx: { icon: FileCode, color: '#3178c6' },
  js: { icon: FileCode, color: '#f7df1e' },
  jsx: { icon: FileCode, color: '#f7df1e' },
  py: { icon: FileCode, color: '#3776ab' },
  rs: { icon: FileCode, color: '#dea584' },
  go: { icon: FileCode, color: '#00add8' },
  java: { icon: FileCode, color: '#e76f00' },
  c: { icon: FileCode, color: '#555555' },
  cpp: { icon: FileCode, color: '#6295cb' },
  h: { icon: FileCode, color: '#555555' },
  cs: { icon: FileCode, color: '#68217a' },
  rb: { icon: FileCode, color: '#cc342d' },
  php: { icon: FileCode, color: '#777bb3' },
  swift: { icon: FileCode, color: '#f05138' },
  kt: { icon: FileCode, color: '#7f52ff' },
  vue: { icon: FileCode, color: '#4fc08d' },
  svelte: { icon: FileCode, color: '#ff3e00' },
  html: { icon: FileCode, color: '#e34c26' },
  css: { icon: FileCode, color: '#264de4' },
  scss: { icon: FileCode, color: '#cd6799' },
  less: { icon: FileCode, color: '#1d365d' },
  sh: { icon: FileCode, color: '#4eaa25' },
  bat: { icon: FileCode, color: '#4eaa25' },
  ps1: { icon: FileCode, color: '#012456' },
  // Text / docs
  md: { icon: FileText, color: '#519aba' },
  txt: { icon: FileText, color: '#6b7280' },
  pdf: { icon: FileText, color: '#e5252a' },
  doc: { icon: FileText, color: '#2b579a' },
  docx: { icon: FileText, color: '#2b579a' },
  rtf: { icon: FileText, color: '#6b7280' },
  // Data / config
  json: { icon: FileJson, color: '#f7df1e' },
  yaml: { icon: Settings, color: '#cb171e' },
  yml: { icon: Settings, color: '#cb171e' },
  toml: { icon: Settings, color: '#9c4121' },
  xml: { icon: FileCode, color: '#e37933' },
  csv: { icon: FileSpreadsheet, color: '#217346' },
  xls: { icon: FileSpreadsheet, color: '#217346' },
  xlsx: { icon: FileSpreadsheet, color: '#217346' },
  sql: { icon: Database, color: '#336791' },
  db: { icon: Database, color: '#336791' },
  sqlite: { icon: Database, color: '#336791' },
  // Images
  png: { icon: FileImage, color: '#a855f7' },
  jpg: { icon: FileImage, color: '#a855f7' },
  jpeg: { icon: FileImage, color: '#a855f7' },
  gif: { icon: FileImage, color: '#a855f7' },
  svg: { icon: FileImage, color: '#ffb13b' },
  webp: { icon: FileImage, color: '#a855f7' },
  ico: { icon: FileImage, color: '#a855f7' },
  bmp: { icon: FileImage, color: '#a855f7' },
  // Video
  mp4: { icon: FileVideo, color: '#ef4444' },
  mkv: { icon: FileVideo, color: '#ef4444' },
  avi: { icon: FileVideo, color: '#ef4444' },
  mov: { icon: FileVideo, color: '#ef4444' },
  webm: { icon: FileVideo, color: '#ef4444' },
  // Audio
  mp3: { icon: FileAudio, color: '#f97316' },
  wav: { icon: FileAudio, color: '#f97316' },
  ogg: { icon: FileAudio, color: '#f97316' },
  flac: { icon: FileAudio, color: '#f97316' },
  // Archives
  zip: { icon: FileArchive, color: '#f59e0b' },
  tar: { icon: FileArchive, color: '#f59e0b' },
  gz: { icon: FileArchive, color: '#f59e0b' },
  rar: { icon: FileArchive, color: '#f59e0b' },
  '7z': { icon: FileArchive, color: '#f59e0b' },
}

function getFileIcon(name: string): { Icon: React.ElementType; color: string } {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  const match = EXT_ICONS[ext]
  if (match) return { Icon: match.icon, color: match.color }
  return { Icon: File, color: 'var(--text-muted)' }
}

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
          : (() => {
              const { Icon, color } = getFileIcon(entry.name)
              return <Icon size={13} style={{ color, flexShrink: 0 }} />
            })()}

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
