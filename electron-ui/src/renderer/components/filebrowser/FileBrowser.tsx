import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Folder, FolderOpen, File, ChevronRight, ChevronDown, FolderPlus, ArrowUp,
  FileText, FileCode, FileImage, FileVideo, FileAudio, FileArchive, FileSpreadsheet, FileJson, Settings, Database,
  Search, RefreshCw, X
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
  c: { icon: FileCode, color: 'rgba(255,255,255,0.45)' },
  cpp: { icon: FileCode, color: '#6295cb' },
  h: { icon: FileCode, color: 'rgba(255,255,255,0.45)' },
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
  txt: { icon: FileText, color: 'rgba(255,255,255,0.45)' },
  pdf: { icon: FileText, color: '#e5252a' },
  doc: { icon: FileText, color: '#2b579a' },
  docx: { icon: FileText, color: '#2b579a' },
  rtf: { icon: FileText, color: 'rgba(255,255,255,0.45)' },
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
  mp4: { icon: FileVideo, color: '#f87171' },
  mkv: { icon: FileVideo, color: '#f87171' },
  avi: { icon: FileVideo, color: '#f87171' },
  mov: { icon: FileVideo, color: '#f87171' },
  webm: { icon: FileVideo, color: '#f87171' },
  // Audio
  mp3: { icon: FileAudio, color: '#f97316' },
  wav: { icon: FileAudio, color: '#f97316' },
  ogg: { icon: FileAudio, color: '#f97316' },
  flac: { icon: FileAudio, color: '#f97316' },
  // Archives
  zip: { icon: FileArchive, color: '#fbbf24' },
  tar: { icon: FileArchive, color: '#fbbf24' },
  gz: { icon: FileArchive, color: '#fbbf24' },
  rar: { icon: FileArchive, color: '#fbbf24' },
  '7z': { icon: FileArchive, color: '#fbbf24' },
}

function getFileIcon(name: string): { Icon: React.ElementType; color: string } {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  const match = EXT_ICONS[ext]
  if (match) return { Icon: match.icon, color: match.color }
  return { Icon: File, color: 'rgba(255,255,255,0.45)' }
}

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
          color: 'rgba(255,255,255,0.60)',
          fontSize: 12,
          userSelect: 'none',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {entry.isDirectory
          ? (expanded
            ? <ChevronDown size={11} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
            : <ChevronRight size={11} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />)
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(15,15,25,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          background: 'rgba(15,15,25,0.95)',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.60)',
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
              color: 'rgba(255,255,255,0.38)',
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
            color: showFilter ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
            padding: 2,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (!showFilter) e.currentTarget.style.color = '#818cf8' }}
          onMouseLeave={e => { if (!showFilter) e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
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
            color: 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#818cf8'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
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
            color: canGoUp ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.45)',
            cursor: canGoUp ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            opacity: canGoUp ? 1 : 0.3,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (canGoUp) e.currentTarget.style.color = '#818cf8' }}
          onMouseLeave={e => { if (canGoUp) e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={openDialog}
          title={t('fileBrowser.chooseDir')}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.45)',
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
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}>
          <Search size={11} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
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
              color: 'rgba(255,255,255,0.82)',
              fontSize: 11,
              fontFamily: 'inherit',
              minWidth: 0,
            }}
            onFocus={e => { e.currentTarget.style.boxShadow = 'none' }}
          />
          {filter && (
            <>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>
                {filteredEntries.length}/{rootEntries.length}
              </span>
              <button
                onClick={() => setFilter('')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.38)', cursor: 'pointer', display: 'flex', padding: 0 }}
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
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{t('fileBrowser.chooseHint')}</span>
          </div>
        )}
        {rootEntries.length > 0 && filteredEntries.length === 0 && filter && (
          <div style={{ padding: '20px 12px', color: 'rgba(255,255,255,0.38)', fontSize: 12, textAlign: 'center' }}>
            {t('fileBrowser.noFilterResults')}
          </div>
        )}
      </div>
    </div>
  )
}
