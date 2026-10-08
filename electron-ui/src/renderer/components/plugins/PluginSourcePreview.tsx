// PluginSourcePreview — read-only source browser for an installed plugin.
//
// Opened from the plugin toolbar's "Source" button: walks `plugin.dirPath`
// through the fs IPC (both ~/.aipa/plugins and <workingDir>/.aipa/plugins are
// inside the allowed fs roots) and shows file contents as text.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode,
  Folder,
  FolderOpen,
  X,
} from 'lucide-react'
import { useT } from '../../i18n'
import { getFileIcon } from '../filebrowser/fileIcons'
import type { FileEntry } from '../../types/app.types'
import type { NavPlugin } from '../../../preload/index'

interface TreeNode extends FileEntry {
  depth: number
}

/** Load state for the selected file — one field instead of four parallel ones. */
type FileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; error: string }

const SKIP_DIRS = new Set(['node_modules', '.git'])

const MAX_PREVIEW_CHARS = 400_000

const HEADER_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', borderRadius: 6, fontSize: 11,
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', cursor: 'pointer',
}

const CODE_STYLE: React.CSSProperties = {
  margin: 0, fontFamily: 'monospace', fontSize: 11.5,
  lineHeight: 1.55, whiteSpace: 'pre',
}

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name)
}

/**
 * One row in the flattened file tree. Directories load their children on first
 * expand; the flattened `visible` list is built here so indentation stays a
 * single pass rather than nested DOM.
 */
function useFileTree(rootPath: string) {
  const [entriesByDir, setEntriesByDir] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())
  // Directories with a read in flight — a Set state can't guard against a
  // second click landing before the first read resolves.
  const inFlight = useRef<Set<string>>(new Set())

  const loadDir = useCallback(async (dirPath: string) => {
    if (inFlight.current.has(dirPath)) return
    inFlight.current.add(dirPath)
    setLoadingDirs(prev => new Set(prev).add(dirPath))
    try {
      const list = await window.electronAPI.fsListDir(dirPath)
      const cleaned = (list || [])
        .filter(e => !(e.isDirectory && SKIP_DIRS.has(e.name)))
        .sort(compareEntries)
      setEntriesByDir(prev => ({ ...prev, [dirPath]: cleaned }))
    } catch {
      setEntriesByDir(prev => ({ ...prev, [dirPath]: [] }))
    } finally {
      inFlight.current.delete(dirPath)
      setLoadingDirs(prev => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }, [])

  // Reset and load the root whenever the plugin changes
  useEffect(() => {
    setEntriesByDir({})
    setExpanded(new Set())
    if (rootPath) loadDir(rootPath)
  }, [rootPath, loadDir])

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(dirPath)) {
        next.delete(dirPath)
      } else {
        next.add(dirPath)
        if (!entriesByDir[dirPath]) loadDir(dirPath)
      }
      return next
    })
  }, [entriesByDir, loadDir])

  // Flatten the tree into the rows that are currently visible
  const visibleRows = useMemo<TreeNode[]>(() => {
    if (!rootPath) return []
    const rows: TreeNode[] = []
    const walk = (dirPath: string, depth: number) => {
      for (const entry of entriesByDir[dirPath] ?? []) {
        rows.push({ ...entry, depth })
        if (entry.isDirectory && expanded.has(entry.path)) walk(entry.path, depth + 1)
      }
    }
    walk(rootPath, 0)
    return rows
  }, [entriesByDir, expanded, rootPath])

  return { visibleRows, expanded, loadingDirs, toggleDir }
}

export default function PluginSourcePreview({
  plugin,
  onClose,
  onOpenFolder,
}: {
  plugin: NavPlugin
  onClose: () => void
  onOpenFolder: () => void
}) {
  const t = useT()
  const rootPath = plugin.dirPath
  const { visibleRows, expanded, loadingDirs, toggleDir } = useFileTree(rootPath)

  // Start on the plugin entry file so the pane is never empty on open
  const [selectedPath, setSelectedPath] = useState<string | null>(plugin.entryPath || null)
  const [file, setFile] = useState<FileState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!selectedPath) { setFile({ status: 'idle' }); return }
    let cancelled = false
    setFile({ status: 'loading' })
    window.electronAPI.fsReadFile(selectedPath)
      .then(result => {
        if (cancelled) return
        if (typeof result?.content !== 'string') {
          // Raw message only — the localized prefix is added at render time
          setFile({ status: 'error', error: result?.error ?? '' })
          return
        }
        const { content } = result
        setFile({
          status: 'ready',
          content: content.length > MAX_PREVIEW_CHARS ? content.slice(0, MAX_PREVIEW_CHARS) : content,
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) setFile({ status: 'error', error: String(err) })
      })
    return () => { cancelled = true }
  }, [selectedPath])

  const content = file.status === 'ready' ? file.content : null

  const relativePath = useMemo(() => {
    if (!selectedPath || !rootPath) return ''
    const normalized = selectedPath.replace(/\\/g, '/')
    const root = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
    return normalized.startsWith(root + '/') ? normalized.slice(root.length + 1) : normalized
  }, [selectedPath, rootPath])

  const lineNumbers = useMemo(() => {
    if (content === null) return ''
    const count = content.split('\n').length
    return Array.from({ length: count }, (_, i) => i + 1).join('\n')
  }, [content])

  const handleCopy = useCallback(async () => {
    if (content === null) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }, [content])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Preview header */}
      <div style={{
        height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--glass-shimmer)',
      }}>
        <FileCode size={13} color="#818cf8" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>
          {t('pluginHost.sourcePreview')}
        </span>
        {relativePath && (
          <code style={{
            fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {relativePath}
          </code>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleCopy}
            disabled={content === null}
            title={t('common.copy')}
            style={{
              ...HEADER_BTN,
              color: copied ? '#22c55e' : 'var(--text-secondary)',
              cursor: content === null ? 'not-allowed' : 'pointer',
              opacity: content === null ? 0.5 : 1,
            }}
          >
            <Copy size={11} />
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button onClick={onOpenFolder} title={t('pluginHost.openFolderTitle')} style={HEADER_BTN}>
            <FolderOpen size={11} />
            {t('pluginHost.openFolder')}
          </button>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            style={{
              width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* File tree */}
        <div style={{
          width: 240, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-nav)',
          overflowY: 'auto', overflowX: 'hidden',
          padding: '6px 0',
        }}>
          {visibleRows.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-faint)' }}>
              {t('pluginHost.sourceEmpty')}
            </div>
          )}
          {visibleRows.map(entry => {
            const isSelected = selectedPath === entry.path
            return (
              <button
                key={entry.path}
                onClick={() => (entry.isDirectory ? toggleDir(entry.path) : setSelectedPath(entry.path))}
                title={entry.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  width: '100%', border: 'none', textAlign: 'left',
                  padding: `3px 10px 3px ${10 + entry.depth * 12}px`,
                  background: isSelected ? 'rgba(99,102,241,0.14)' : 'transparent',
                  color: isSelected ? '#818cf8' : 'var(--text-secondary)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: entry.isDirectory ? '#fbbf24' : 'var(--text-faint)' }}>
                  {entry.isDirectory
                    ? (expanded.has(entry.path) ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
                    : (() => {
                        const { Icon, color } = getFileIcon(entry.name)
                        return <Icon size={11} style={{ color }} />
                      })()}
                </span>
                {entry.isDirectory && (
                  <Folder size={11} style={{ flexShrink: 0, color: '#fbbf24' }} />
                )}
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  opacity: loadingDirs.has(entry.path) ? 0.5 : 1,
                }}>
                  {entry.name}
                </span>
              </button>
            )
          })}
        </div>

        {/* File content */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--bg-primary)' }}>
          {file.status === 'loading' ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text-faint)' }}>
              {t('common.loadingEllipsis')}
            </div>
          ) : file.status === 'error' ? (
            <div style={{ padding: 16, fontSize: 12, color: '#f87171', lineHeight: 1.6 }}>
              {t('pluginHost.sourceLoadFailed')}
              {file.error && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  {file.error}
                </div>
              )}
            </div>
          ) : content === null ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text-faint)' }}>
              {t('pluginHost.sourcePickFile')}
            </div>
          ) : (
            <div style={{ display: 'flex', minHeight: '100%' }}>
              <pre style={{
                ...CODE_STYLE,
                padding: '10px 8px 10px 12px',
                textAlign: 'right', userSelect: 'none',
                color: 'var(--text-faint)',
              }}>
                {lineNumbers}
              </pre>
              <pre style={{
                ...CODE_STYLE,
                padding: '10px 16px 10px 4px',
                color: 'var(--text-primary)',
              }}>
                {content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
