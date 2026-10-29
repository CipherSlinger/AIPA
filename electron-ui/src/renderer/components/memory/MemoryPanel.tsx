/**
 * MemoryPanel — Personal + Project memory management.
 *
 * Iteration 488: Added "Personal" vs "Project" memory tabs.
 * - Personal tab: electron-store backed memories (existing behavior)
 * - Project tab: reads/writes .claude/MEMORY.md in the working directory
 *   (mirrors Claude Code's project memory system)
 *
 * Iteration P1-4: Separated CLAUDE.md instruction files from memdir structured memories.
 * - Instruction Files tab: global ~/.claude/CLAUDE.md, project CLAUDE.md, local CLAUDE.local.md
 * - Structured Memory tab: reads ~/.claude/memory/ memdir files (AI-generated, YAML frontmatter)
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Brain,
  Moon,
  Plus,
  Search,
  Trash2,
  FolderOpen,
  User,
  FileText,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'
import { pushEscapeHandler } from '../ui/escapeStack'
import { CATEGORY_CONFIG, CATEGORIES, MAX_MEMORIES, MEMORY_TYPES, MEMORY_TYPE_CONFIG } from './memoryConstants'
import { useMemoryCrud } from './useMemoryCrud'
import { useMemorySearchIndex } from './useMemorySearchIndex'
import MemoryAddForm from './MemoryAddForm'
import MemoryItemCard from './MemoryItemCard'
import MemorySearchResults from './MemorySearchResults'
import DreamConsolidationTab from './DreamConsolidationTab'
import { HighlightedText, scrollToFirstHighlight } from './MemoryHighlight'
import MemdirTab from './MemdirTab'
import {
  findHighlightRanges,
  flattenMemorySearchGroups,
  groupMemorySearchResults,
  memoryHitCounts,
  type MemoryOpenFocus,
  type MemorySearchHit,
  type MemoryTierState,
} from './memorySearch'

type MemoryTab = 'personal' | 'project' | 'memdir' | 'dream' | 'config'

/** Per-tab focus handed down after a search result row is opened. */
type TabFocus = Pick<MemoryOpenFocus, 'documentId' | 'query' | 'nonce'>

// ─── Project Memory (MEMORY.md) viewer/editor ────────────────────────────────

function ProjectMemoryTab({ focus }: { focus?: TabFocus }) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLPreElement>(null)

  const focusRanges = useMemo(
    () => focus?.query ? findHighlightRanges(content, focus.query) : [],
    [content, focus?.query],
  )

  // Opening a search hit on this tab should show the matching line, not just
  // the top of a possibly long file.
  useEffect(() => {
    if (!focus?.query || loading || editing) return
    const frame = requestAnimationFrame(() => scrollToFirstHighlight(contentRef.current))
    return () => cancelAnimationFrame(frame)
  }, [focus?.nonce, focus?.query, loading, editing, content])

  const getMemoryPath = useCallback(async (): Promise<string> => {
    const workingDir = prefs.workingDir || await window.electronAPI.fsGetHome()
    return `${workingDir}/.claude/MEMORY.md`
  }, [prefs.workingDir])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const memPath = await getMemoryPath()
      const result = await window.electronAPI.fsReadFile(memPath)
      if (result && 'content' in result) {
        setContent(result.content as string)
      } else {
        setContent('')  // file doesn't exist yet
      }
    } catch {
      setContent('')
    }
    setLoading(false)
  }, [getMemoryPath])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    setEditValue(content)
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditValue('')
  }

  const save = async () => {
    setSaving(true)
    try {
      const memPath = await getMemoryPath()
      // Ensure .claude dir exists
      const dir = memPath.substring(0, memPath.lastIndexOf('/'))
      await window.electronAPI.fsEnsureDir(dir)
      await window.electronAPI.fsWriteFile(memPath, editValue)
      setContent(editValue)
      setEditing(false)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      setError(String(err))
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
        <RefreshCw size={14} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
        {t('common.loading')}
      </div>
    )
  }

  const workingDir = prefs.workingDir || '~'
  const displayPath = `${workingDir}/.claude/MEMORY.md`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Path + actions bar */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayPath}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={load}
            title={t('memory.projectRefresh')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={12} />
          </button>
          {!editing && (
            <button
              onClick={startEdit}
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4,
                color: 'var(--accent-text)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
              }}
            >
              <FileText size={10} />
              {t('common.edit')}
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={cancelEdit}
                style={{
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 4,
                  color: 'var(--text-primary)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                  display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                  transition: 'box-shadow 0.15s ease, opacity 0.15s ease',
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.boxShadow = '0 0 10px rgba(99,102,241,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
              >
                <Save size={10} />
                {saving ? t('notes.saving') : (savedMsg ? t('notes.saved') : t('common.save'))}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--danger-text)', background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {editing ? (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 300,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'monospace',
              lineHeight: 1.6,
              padding: '8px 10px',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        ) : content ? (
          <pre ref={contentRef} style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
          }}>
            <HighlightedText text={content} ranges={focusRanges} />
          </pre>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '60%', color: 'var(--text-muted)', gap: 8, textAlign: 'center',
          }}>
            <FolderOpen size={28} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12 }}>{t('memory.projectNoFile')}</span>
            <span style={{ fontSize: 10, opacity: 0.7, padding: '0 20px' }}>
              {t('memory.projectNoFileHint')}
            </span>
            <button
              onClick={startEdit}
              style={{
                marginTop: 4,
                background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
              }}
            >
              {t('memory.projectCreate')}
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!editing && (
        <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {t('memory.projectFooter')}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── Instruction Files Tab (CLAUDE.md viewer) ───────────────────────────────

// LoadedPathsPanel — Shows all CLAUDE.md paths and their existence status
interface PathStatus {
  scope: InstructionScope
  label: string
  path: string
  displayPath: string
  exists: boolean
  loading: boolean
}

interface LoadedPathsPanelProps {
  homeDir: string
  workingDir: string
  onSwitchScope: (scope: InstructionScope) => void
  onCreateFile: (scope: InstructionScope) => void
}

function LoadedPathsPanel({ homeDir, workingDir, onSwitchScope, onCreateFile }: LoadedPathsPanelProps) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [statuses, setStatuses] = useState<PathStatus[]>([])

  useEffect(() => {
    const paths: Array<{ scope: InstructionScope; label: string; path: string; displayPath: string }> = [
      {
        scope: 'global',
        label: '~/.claude/CLAUDE.md',
        path: `${homeDir}/.claude/CLAUDE.md`,
        displayPath: '~/.claude/CLAUDE.md',
      },
      {
        scope: 'project',
        label: 'CLAUDE.md',
        path: `${workingDir}/CLAUDE.md`,
        displayPath: `${workingDir}/CLAUDE.md`,
      },
      {
        scope: 'local',
        label: '.claude/CLAUDE.local.md',
        path: `${workingDir}/.claude/CLAUDE.local.md`,
        displayPath: `${workingDir}/.claude/CLAUDE.local.md`,
      },
    ]

    // Initialize with loading state
    setStatuses(paths.map(p => ({ ...p, exists: false, loading: true })))

    // Check each file existence
    Promise.all(
      paths.map(async (p) => {
        try {
          const result = await window.electronAPI.fsReadFile(p.path)
          return { ...p, exists: !!(result && 'content' in result), loading: false }
        } catch {
          return { ...p, exists: false, loading: false }
        }
      })
    ).then(setStatuses)
  }, [homeDir, workingDir])

  const existingCount = statuses.filter(s => s.exists).length
  const totalCount = statuses.length

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      background: 'rgba(99,102,241,0.04)',
    }}>
      {/* Collapse header */}
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('memory.instructionFilesLoaded')}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600,
            background: existingCount > 0 ? 'rgba(74,222,128,0.15)' : 'var(--border)',
            color: existingCount > 0 ? 'var(--success-text)' : 'var(--text-muted)',
            borderRadius: 8, padding: '1px 6px',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {t('memory.instructionFilesCount', { existing: existingCount, total: totalCount })}
          </span>
        </div>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          transition: 'transform 0.15s ease',
        }}>��</span>
      </div>

      {/* Path list */}
      {!collapsed && (
        <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {statuses.map(s => (
            <div key={s.scope} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
              background: s.exists ? 'rgba(74,222,128,0.05)' : 'var(--bg-hover)',
              border: `1px solid ${s.exists ? 'rgba(74,222,128,0.2)' : 'var(--border)'}`,
            }}>
              {/* Status indicator */}
              {s.loading ? (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, width: 14, textAlign: 'center' }}>…</span>
              ) : s.exists ? (
                <span style={{ fontSize: 11, color: 'var(--success-text)', flexShrink: 0, width: 14, textAlign: 'center' }}>✓</span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 14, textAlign: 'center', opacity: 0.4 }}>○</span>
              )}

              {/* Path */}
              <span
                onClick={() => onSwitchScope(s.scope)}
                style={{
                  flex: 1,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: s.exists ? 'var(--text-secondary)' : 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  opacity: s.exists ? 1 : 0.6,
                }}
                title={s.path}
              >
                {s.displayPath}
              </span>

              {/* Scope badge */}
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                color: 'var(--text-primary)', background: `${SCOPE_COLORS[s.scope]}1a`,
                borderRadius: 6, padding: '1px 5px', flexShrink: 0,
              }}>
                {t(SCOPE_LABEL_KEYS[s.scope])}
              </span>

              {/* Create button for non-existing files */}
              {!s.loading && !s.exists && (
                <button
                  onClick={() => onCreateFile(s.scope)}
                  style={{
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: 4,
                    color: 'var(--accent-text)',
                    fontSize: 9,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    flexShrink: 0,
                    fontWeight: 600,
                    whiteSpace: 'nowrap' as const,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                >
                  {t('common.create')}
                </button>
              )}
            </div>
          ))}
          <div style={{ fontSize: 9, color: 'var(--text-muted)', paddingTop: 2, paddingLeft: 2 }}>
            {t('memory.instructionPrecedence')}
          </div>
        </div>
      )}
    </div>
  )
}

const CLAUDE_MD_TEMPLATE = `# CLAUDE.md

## Rules
- Be concise and direct in responses
- Prefer editing existing files over creating new ones

## Project Overview
<!-- Describe your project here -->

## Commands
\`\`\`bash
# Add common commands here
\`\`\`

## Architecture
<!-- Describe key architectural decisions -->
`

type InstructionScope = 'global' | 'project' | 'local'

interface InstructionFile {
  scope: InstructionScope
  label: string
  descKey: string
  getPath: (workingDir: string, home: string) => string
  gitTracked: boolean
}

const INSTRUCTION_FILES: InstructionFile[] = [
  {
    scope: 'global',
    label: '~/.claude/CLAUDE.md',
    descKey: 'memory.instructionGlobalDesc',
    getPath: (_wd, home) => `${home}/.claude/CLAUDE.md`,
    gitTracked: false,
  },
  {
    scope: 'project',
    label: 'CLAUDE.md',
    descKey: 'memory.instructionProjectDesc',
    getPath: (wd) => `${wd}/CLAUDE.md`,
    gitTracked: true,
  },
  {
    scope: 'local',
    label: '.claude/CLAUDE.local.md',
    descKey: 'memory.instructionLocalDesc',
    getPath: (wd) => `${wd}/.claude/CLAUDE.local.md`,
    gitTracked: false,
  },
]

const SCOPE_COLORS: Record<InstructionScope, string> = {
  global: '#a78bfa',
  project: '#6366f1',
  local: '#4ade80',
}

const SCOPE_LABEL_KEYS: Record<InstructionScope, string> = {
  global: 'memory.instructionGlobal',
  project: 'memory.instructionProject',
  local: 'memory.instructionLocal',
}

function InstructionFilesTab({ focus }: { focus?: TabFocus }) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const [activeScope, setActiveScope] = useState<InstructionScope>('project')
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [homeDir, setHomeDir] = useState<string>('~')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLPreElement>(null)

  const currentFile = INSTRUCTION_FILES.find(f => f.scope === activeScope)!

  const focusRanges = useMemo(
    () => focus?.query ? findHighlightRanges(content, focus.query) : [],
    [content, focus?.query],
  )

  // A result row carries the instruction file's scope in `documentId`.
  useEffect(() => {
    const scope = focus?.documentId
    if (scope === 'global' || scope === 'project' || scope === 'local') {
      setActiveScope(scope)
    }
  }, [focus?.documentId, focus?.nonce])

  useEffect(() => {
    if (!focus?.query || loading || editing) return
    const frame = requestAnimationFrame(() => scrollToFirstHighlight(contentRef.current))
    return () => cancelAnimationFrame(frame)
  }, [focus?.nonce, focus?.query, loading, editing, content])

  useEffect(() => {
    window.electronAPI.fsGetHome().then((h: string) => setHomeDir(h)).catch(() => {})
  }, [])

  const workingDir = prefs.workingDir || homeDir
  const filePath = currentFile.getPath(workingDir, homeDir)
  const displayPath = currentFile.scope === 'global'
    ? `~/.claude/CLAUDE.md`
    : currentFile.scope === 'project'
      ? `${workingDir}/CLAUDE.md`
      : `${workingDir}/.claude/CLAUDE.local.md`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setEditing(false)
    setEditValue('')
    try {
      const result = await window.electronAPI.fsReadFile(filePath)
      if (result && 'content' in result) {
        setContent(result.content as string)
      } else {
        setContent('')
      }
    } catch {
      setContent('')
    }
    setLoading(false)
  }, [filePath])

  useEffect(() => { load() }, [load])

  const startEdit = (prefill?: string) => {
    setEditValue(prefill !== undefined ? prefill : content)
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditValue('')
  }

  const save = async () => {
    setSaving(true)
    try {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'))
      await window.electronAPI.fsEnsureDir(dir)
      await window.electronAPI.fsWriteFile(filePath, editValue)
      setContent(editValue)
      setEditing(false)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      setError(String(err))
    }
    setSaving(false)
  }

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(filePath)
      setPathCopied(true)
      setTimeout(() => setPathCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const openInEditor = async () => {
    try {
      await window.electronAPI.shellOpenExternal(`file://${filePath}`)
    } catch { /* ignore */ }
  }

  const scopeTabStyle = (active: boolean, scope: InstructionScope): React.CSSProperties => ({
    padding: '4px 10px',
    background: active ? `rgba(99,102,241,0.15)` : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    border: 'none',
    borderBottom: active ? `2px solid ${SCOPE_COLORS[scope]}` : '2px solid transparent',
    borderRadius: 0,
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
  })

  const hasUnsavedChanges = editing && editValue !== content

  // Handle "create" from LoadedPathsPanel — switch to scope and open editor with template
  const handleCreateFromPanel = (scope: InstructionScope) => {
    setActiveScope(scope)
    // startEdit will be triggered after load completes (content will be empty)
    // We schedule it after the scope switch causes a reload
    setTimeout(() => {
      setEditing(true)
      setEditValue(scope === 'project' ? CLAUDE_MD_TEMPLATE : '')
      setTimeout(() => textareaRef.current?.focus(), 50)
    }, 300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Hint bar */}
      <div style={{
        padding: '5px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <FileText size={10} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {t('memory.instructionHint')}
        </span>
      </div>

      {/* Loaded paths panel — P2-6 nested CLAUDE.md visualization */}
      <LoadedPathsPanel
        homeDir={homeDir}
        workingDir={workingDir}
        onSwitchScope={setActiveScope}
        onCreateFile={handleCreateFromPanel}
      />

      {/* Scope sub-tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        padding: '0 12px',
      }}>
        {INSTRUCTION_FILES.map(f => (
          <button
            key={f.scope}
            style={scopeTabStyle(activeScope === f.scope, f.scope)}
            onClick={() => setActiveScope(f.scope)}
          >
            <span style={{
              display: 'inline-block',
              width: 6, height: 6, borderRadius: '50%',
              background: SCOPE_COLORS[f.scope],
              flexShrink: 0,
            }} />
            {t(SCOPE_LABEL_KEYS[f.scope])}
            {f.gitTracked && (
              <span style={{ fontSize: 8, color: 'var(--text-muted)', fontStyle: 'italic' }}>git</span>
            )}
          </button>
        ))}
      </div>

      {/* Description row */}
      <div style={{
        padding: '4px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {t(currentFile.descKey)}
        </span>
      </div>

      {/* Path + action bar */}
      <div style={{
        padding: '5px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        flexShrink: 0,
      }}>
        <span
          onClick={copyPath}
          title={pathCopied ? 'Copied!' : 'Click to copy path'}
          style={{
            fontSize: 10,
            color: pathCopied ? 'var(--accent-text)' : 'var(--text-muted)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            userSelect: 'none',
          }}
          onMouseEnter={e => { if (!pathCopied) e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { if (!pathCopied) e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {pathCopied ? '\u2713 Copied' : displayPath}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {hasUnsavedChanges && (
            <span title="Unsaved changes" style={{
              display: 'inline-block', width: 6, height: 6,
              borderRadius: '50%', background: 'rgba(165,180,252,0.8)', flexShrink: 0,
            }} />
          )}
          {loading && <RefreshCw size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
          {!loading && (
            <button
              onClick={load}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}
            >
              <RefreshCw size={12} />
            </button>
          )}
          <button
            onClick={openInEditor}
            title="\u5728\u7f16\u8f91\u5668\u4e2d\u6253\u5f00"
            style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer', padding: '2px 7px',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <FolderOpen size={10} />
            \u5728\u7f16\u8f91\u5668\u4e2d\u6253\u5f00
          </button>
          {!editing && (
            <button
              onClick={() => startEdit()}
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4,
                color: 'var(--accent-text)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
              }}
            >
              <FileText size={10} />
              {t('common.edit')}
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={cancelEdit}
                style={{
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 4,
                  color: 'var(--text-primary)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                  display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.boxShadow = '0 0 10px rgba(99,102,241,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
              >
                <Save size={10} />
                {saving ? t('notes.saving') : (savedMsg ? t('notes.saved') : t('common.save'))}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--danger-text)', background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', position: 'relative' }}>
        {editing ? (
          <>
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              placeholder={'# CLAUDE.md\n\nAdd project instructions, rules, and context here...'}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 300,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 11,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                padding: '8px 10px',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <div style={{
              position: 'absolute',
              bottom: 18,
              right: 22,
              fontSize: 11,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              {editValue.length.toLocaleString()} chars
            </div>
          </>
        ) : content ? (
          <pre ref={contentRef} style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
          }}>
            <HighlightedText text={content} ranges={focusRanges} />
          </pre>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '60%', color: 'var(--text-muted)', gap: 8, textAlign: 'center',
          }}>
            <FileText size={28} style={{ color: SCOPE_COLORS[activeScope], opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>{'\u5c1a\u672a\u521b\u5efa '}{currentFile.label}</span>
            <span style={{ fontSize: 10, opacity: 0.7, padding: '0 20px' }}>
              {t(currentFile.descKey)}
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => startEdit()}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
                }}
              >
                {'\u521b\u5efa '}{currentFile.label}
              </button>
              {activeScope === 'project' && (
                <button
                  onClick={() => startEdit(CLAUDE_MD_TEMPLATE)}
                  title="\u4f7f\u7528\u6a21\u677f\u521b\u5efa"
                  style={{
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 6,
                    color: 'var(--accent-text)', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                >
                  <FileText size={12} />
                  \u4f7f\u7528\u6a21\u677f
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {!editing && (
        <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {t('memory.instructionBadge')} \u00b7 {displayPath} \u00b7 \u81ea\u52a8\u52a0\u8f7d
        </div>
      )}

      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}

// ─── Main MemoryPanel ─────────────────────────────────────────────────────────

export default function MemoryPanel() {
  const t = useT()
  const crud = useMemoryCrud()
  const [activeTab, setActiveTab] = useState<MemoryTab>('personal')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedHit, setSelectedHit] = useState(0)
  const [focusTarget, setFocusTarget] = useState<MemoryOpenFocus | null>(null)
  const [flashMemoryId, setFlashMemoryId] = useState<string | null>(null)

  const trimmedQuery = searchQuery.trim()
  const searchActive = trimmedQuery.length > 0
  // Personal facts are already in the store. The hook loads the other four
  // tiers once, on the first non-empty query, then filters them locally.
  const searchTiers = useMemorySearchIndex(searchActive, crud.memories)
  const searchGroups = useMemo(
    () => groupMemorySearchResults(searchTiers, trimmedQuery),
    [searchTiers, trimmedQuery],
  )
  const searchHits = useMemo(() => flattenMemorySearchGroups(searchGroups), [searchGroups])
  const hitCounts = useMemo(() => memoryHitCounts(searchGroups), [searchGroups])
  const tierStates = useMemo(() => {
    const states: Record<MemoryTab, MemoryTierState> = {
      personal: 'ready',
      project: 'loading',
      memdir: 'loading',
      dream: 'loading',
      config: 'loading',
    }
    for (const group of searchGroups) states[group.tier] = group.state
    return states
  }, [searchGroups])

  // A new query starts from its first result; typing moves the target.
  useEffect(() => { setSelectedHit(0) }, [trimmedQuery])
  useEffect(() => {
    setSelectedHit(current => {
      if (searchHits.length === 0) return 0
      return Math.min(current, searchHits.length - 1)
    })
  }, [searchHits.length])

  // Escape peels the query off first. AppShell handles Escape in the capture
  // phase, so the handler has to be on its stack to run before "close Settings";
  // once the query is empty this handler is gone and the console closes.
  useEffect(() => {
    if (!searchActive) return
    return pushEscapeHandler(() => setSearchQuery(''))
  }, [searchActive])

  // Pull the personal tab's setters out so the callback below depends on
  // stable functions rather than the whole hook object.
  const setCrudFilterCategory = crud.setFilterCategory
  const setCrudFilterMemoryType = crud.setFilterMemoryType
  const setCrudSearchQuery = crud.setSearchQuery

  const openSearchHit = useCallback((hit: MemorySearchHit) => {
    setSearchQuery('')
    setActiveTab(hit.tier)
    if (hit.tier === 'personal') {
      // The tab's local filters may have hidden this fact. Clearing them is
      // what makes the scroll target exist on the next render.
      setCrudFilterCategory('all')
      setCrudFilterMemoryType('all')
      setCrudSearchQuery('')
    }
    setFocusTarget({
      tier: hit.tier,
      documentId: hit.documentId,
      query: trimmedQuery,
      nonce: Date.now(),
    })
  }, [trimmedQuery, setCrudFilterCategory, setCrudFilterMemoryType, setCrudSearchQuery])

  // Personal facts open in place; flash the card so the landing spot is clear.
  useEffect(() => {
    if (!focusTarget || focusTarget.tier !== 'personal') return
    setFlashMemoryId(focusTarget.documentId)
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`memory-item-${focusTarget.documentId}`)
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    const timer = window.setTimeout(() => setFlashMemoryId(null), 1800)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [focusTarget])

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // The escape-stack handler clears the query; this only keeps the key
      // from also reaching other input behaviours.
      if (searchActive) event.preventDefault()
      return
    }
    if (!searchActive) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (searchHits.length === 0) return
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setSelectedHit(current => (current + step + searchHits.length) % searchHits.length)
      return
    }
    if (event.key === 'Enter') {
      // The selection defaults to the first hit, and hover/arrows move it.
      const hit = searchHits[selectedHit] ?? searchHits[0]
      if (hit) {
        event.preventDefault()
        openSearchHit(hit)
      }
    }
  }

  const selectTab = (tab: MemoryTab) => {
    setActiveTab(tab)
    // A manual tab choice ends the previous search's landing highlight.
    setFocusTarget(null)
    // While results replace the body, a tab is a way to leave the results and
    // land on that tier; keeping the query would contradict the tab you chose.
    if (searchActive) setSearchQuery('')
  }

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: '5px 0',
    background: 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
    border: 'none',
    borderBottom: active ? '2px solid rgba(99,102,241,0.6)' : '2px solid transparent',
    borderRadius: 0,
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'all 0.15s ease',
  } as React.CSSProperties)

  // While results replace the body, the tabs keep reporting which tier holds
  // what. A tier still loading or failing says so instead of showing "0".
  const tabCountBadge = (tab: MemoryTab) => {
    if (!searchActive) return null
    const state = tierStates[tab]
    return (
      <span
        title={state === 'ready' ? t('memory.searchResults', { count: String(hitCounts[tab]) }) : undefined}
        style={{
          fontSize: 9,
          fontWeight: 700,
          padding: '0 5px',
          borderRadius: 8,
          fontVariantNumeric: 'tabular-nums',
          color: state === 'error'
            ? 'var(--danger-text)'
            : state === 'loading' ? 'var(--text-muted)' : 'var(--accent-text)',
          background: state === 'error'
            ? 'rgba(239,68,68,0.12)'
            : state === 'loading' ? 'var(--border)' : 'rgba(99,102,241,0.14)',
        }}
      >
        {state === 'loading' ? '…' : state === 'error' ? '!' : hitCounts[tab]}
      </span>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--popup-bg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 14px',
        minHeight: 48,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingTop: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Brain size={16} style={{ color: 'var(--accent-text)' }} />
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}>
              {t('memory.title')}
            </span>
            {activeTab === 'personal' && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                background: 'var(--border)',
                borderRadius: 10,
                padding: '1px 7px',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {crud.memories.length}
              </span>
            )}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: '0 1 auto',
            minWidth: 0,
          }}>
            {/* Cross-tier search. Compact enough to sit beside the add/clear
                actions without taking a row away from them. */}
            <div style={{ position: 'relative', flex: '1 1 150px', minWidth: 110, maxWidth: 240 }}>
              <Search size={11} style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('memory.searchAllPlaceholder')}
                aria-label={t('memory.searchAllPlaceholder')}
                style={{
                  width: '100%',
                  height: 24,
                  paddingLeft: 23,
                  paddingRight: searchQuery ? 22 : 7,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s ease',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label={t('memory.searchClear')}
                  title={t('memory.searchClear')}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: 2,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          {activeTab === 'personal' && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => {
                  // The add form lives in the personal body, which results are
                  // currently replacing; leave search so the form is visible.
                  if (searchActive) setSearchQuery('')
                  crud.setShowAddForm(!crud.showAddForm)
                }}
                aria-label={t('memory.addNew')}
                title={t('memory.addNew')}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'all 0.15s ease',
                  boxShadow: crud.showAddForm ? '0 0 12px rgba(99,102,241,0.45)' : 'none',
                  opacity: crud.showAddForm ? 0.85 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 14px rgba(99,102,241,0.5)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = crud.showAddForm ? '0 0 12px rgba(99,102,241,0.45)' : 'none' }}
              >
                <Plus size={12} />
                {t('memory.addNew')}
              </button>
              {crud.memories.length > 0 && (
                <button
                  onClick={() => crud.clearAllMemories(t)}
                  aria-label={t('memory.clearAll')}
                  title={t('memory.clearAll')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger-text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border)',
          marginBottom: activeTab === 'personal' ? 8 : 0,
          marginTop: 4,
        }}>
          <button style={tabStyle(activeTab === 'personal')} onClick={() => selectTab('personal')}>
            <User size={11} />
            {t('memory.globalMemory')}
            {tabCountBadge('personal')}
          </button>
          <button style={tabStyle(activeTab === 'project')} onClick={() => selectTab('project')}>
            <FolderOpen size={11} />
            {t('memory.projectMemory')}
            {tabCountBadge('project')}
          </button>
          <button style={tabStyle(activeTab === 'memdir')} onClick={() => selectTab('memdir')}>
            <Brain size={11} />
            {t('memory.memdirTab')}
            {tabCountBadge('memdir')}
          </button>
          <button style={tabStyle(activeTab === 'dream')} onClick={() => selectTab('dream')}>
            <Moon size={11} />
            {t('dream.tabLabel')}
            {tabCountBadge('dream')}
          </button>
          <button style={tabStyle(activeTab === 'config')} onClick={() => selectTab('config')}>
            <FileText size={11} />
            {t('memory.instructionTab')}
            {tabCountBadge('config')}
          </button>
        </div>

        {/* Section concept banner — P1-5: clearly distinguish CLAUDE.md vs memdir */}
        {!searchActive && (activeTab === 'memdir' || activeTab === 'config') && (
          <div style={{
            padding: '5px 12px 4px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            background: activeTab === 'config'
              ? 'linear-gradient(90deg, rgba(165,180,252,0.06) 0%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(74,222,128,0.05) 0%, transparent 100%)',
            borderBottom: '1px solid var(--border)',
          }}>
            {activeTab === 'config' ? (
              <>
                <FileText size={10} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{t('memory.instructionBannerTitle')}</span>
                  {' '}— {t('memory.instructionBannerDesc')}
                </span>
              </>
            ) : (
              <>
                <Brain size={10} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{t('memory.memdirBannerTitle')}</span>
                  {' '}— {t('memory.memdirBannerDesc')}
                </span>
              </>
            )}
          </div>
        )}

        {/* Personal tab: search + category filter */}
        {!searchActive && activeTab === 'personal' && (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search size={12} style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }} />
              <input
                type="text"
                value={crud.searchQuery}
                onChange={e => crud.setSearchQuery(e.target.value)}
                placeholder={t('memory.searchPlaceholder')}
                style={{
                  width: '100%',
                  height: 28,
                  paddingLeft: 26,
                  paddingRight: crud.searchQuery.trim() ? 56 : 8,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s ease',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              {crud.searchQuery.trim() && (
                <span style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 9,
                  color: crud.filteredMemories.length > 0 ? 'var(--accent-text)' : 'var(--text-muted)',
                  fontWeight: 500,
                  pointerEvents: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {t('memory.searchResults', { count: String(crud.filteredMemories.length) })}
                </span>
              )}
            </div>

            {/* Category filter pills */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => crud.setFilterCategory('all')}
                style={{
                  background: crud.filterCategory === 'all'
                    ? 'rgba(99,102,241,0.15)'
                    : 'var(--bg-hover)',
                  color: crud.filterCategory === 'all' ? 'var(--accent-text)' : 'var(--text-muted)',
                  border: crud.filterCategory === 'all'
                    ? '1px solid rgba(99,102,241,0.3)'
                    : '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t('memory.all')} ({crud.categoryCounts.all})
              </button>
              {CATEGORIES.map(cat => {
                const cfg = CATEGORY_CONFIG[cat]
                const isActive = crud.filterCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => crud.setFilterCategory(isActive ? 'all' : cat)}
                    style={{
                      background: isActive ? `${cfg.color}20` : 'var(--bg-hover)',
                      color: isActive ? cfg.textColor : 'var(--text-muted)',
                      border: isActive
                        ? `1px solid ${cfg.color}40`
                        : '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {cfg.icon}
                    {t(cfg.labelKey)} ({crud.categoryCounts[cat] || 0})
                  </button>
                )
              })}
            </div>

            {/* Memory type filter chips */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
              {/* "All" chip */}
              <button
                onClick={() => crud.setFilterMemoryType('all')}
                style={{
                  background: crud.filterMemoryType === 'all'
                    ? 'rgba(99,102,241,0.20)'
                    : 'var(--bg-hover)',
                  color: crud.filterMemoryType === 'all'
                    ? 'var(--accent-text)'
                    : 'var(--text-muted)',
                  border: crud.filterMemoryType === 'all'
                    ? '1px solid rgba(99,102,241,0.40)'
                    : '1px solid var(--border)',
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                {t('memory.all')}
                {crud.memoryTypeCounts.all > 0 && (
                  <span style={{ fontSize: 9, opacity: 0.7, fontVariantNumeric: 'tabular-nums', marginLeft: 3 }}>
                    {crud.memoryTypeCounts.all}
                  </span>
                )}
              </button>
              {/* Type chips */}
              {MEMORY_TYPES.map(type => {
                const tc = MEMORY_TYPE_CONFIG[type]
                const isActive = crud.filterMemoryType === type
                // Map type to Chinese label and dot color
                const typeLabels: Record<string, { label: string; dot: string }> = {
                  user:      { label: t('memory.typeUser'), dot: 'rgba(251,191,36,0.82)' },
                  feedback:  { label: t('memory.typeFeedback'), dot: 'rgba(134,239,172,0.82)' },
                  project:   { label: t('memory.typeProject'), dot: 'rgba(96,165,250,0.82)' },
                  reference: { label: t('memory.typeReference'), dot: 'rgba(192,132,252,0.82)' },
                }
                const info = typeLabels[type] || { label: type, dot: tc.color }
                return (
                  <button
                    key={type}
                    onClick={() => crud.setFilterMemoryType(isActive ? 'all' : type)}
                    style={{
                      background: isActive
                        ? 'rgba(99,102,241,0.20)'
                        : 'var(--bg-hover)',
                      color: isActive
                        ? 'var(--accent-text)'
                        : 'var(--text-muted)',
                      border: isActive
                        ? '1px solid rgba(99,102,241,0.40)'
                        : '1px solid var(--border)',
                      borderRadius: 20,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Colored dot indicator */}
                    <span style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: info.dot,
                      flexShrink: 0,
                    }} />
                    {info.label}
                    <span style={{
                      fontSize: 9,
                      opacity: 0.7,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {crud.memoryTypeCounts[type] || 0}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Cross-tier results replace the tab bodies; the tab strip stays. */}
      {searchActive && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <MemorySearchResults
            query={trimmedQuery}
            groups={searchGroups}
            selectedIndex={selectedHit}
            onSelect={setSelectedHit}
            onOpen={openSearchHit}
            t={t}
          />
        </div>
      )}

      {/* Personal tab body */}
      {!searchActive && activeTab === 'personal' && (
        <>
          {/* Add form */}
          {crud.showAddForm && (
            <MemoryAddForm
              t={t}
              newContent={crud.newContent}
              newCategory={crud.newCategory}
              autoSuggested={crud.autoSuggested}
              onContentChange={crud.handleNewContentChange}
              onCategoryChange={crud.setNewCategory}
              onAutoSuggestedChange={crud.setAutoSuggested}
              onSave={() => crud.addMemory(t)}
              onClose={() => { crud.setShowAddForm(false); crud.handleNewContentChange(''); crud.setAutoSuggested(false) }}
            />
          )}

          {/* Memory list */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '6px 8px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
          }}>
            {crud.filteredMemories.length === 0 ? (
              <div style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '32px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.20)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Brain size={22} style={{ color: 'var(--accent-text)' }} />
                </div>
                <span>
                  {crud.memories.length === 0
                    ? t('memory.emptyState')
                    : t('memory.noResults')
                  }
                </span>
                {crud.memories.length === 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '0 20px' }}>
                    {t('memory.emptyHint')}
                  </span>
                )}
              </div>
            ) : (
              crud.filteredMemories.map(mem => (
                <div
                  key={mem.id}
                  id={`memory-item-${mem.id}`}
                  style={flashMemoryId === mem.id
                    ? {
                        outline: '2px solid rgba(99,102,241,0.7)',
                        outlineOffset: 2,
                        borderRadius: 12,
                      }
                    : undefined}
                >
                  <MemoryItemCard
                    mem={mem}
                    t={t}
                    searchQuery={crud.searchQuery}
                    isEditing={crud.editingId === mem.id}
                    editContent={crud.editContent}
                    editCategory={crud.editCategory}
                    editMemoryType={crud.editMemoryType}
                    onEditContentChange={crud.setEditContent}
                    onEditCategoryChange={crud.setEditCategory}
                    onEditMemoryTypeChange={crud.setEditMemoryType}
                    onStartEdit={() => crud.startEdit(mem)}
                    onSaveEdit={() => crud.saveEdit(t)}
                    onCancelEdit={crud.cancelEdit}
                    onTogglePin={() => crud.togglePin(mem.id)}
                    onDelete={() => crud.deleteMemory(mem.id, t)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {t('memory.footer', { count: String(crud.memories.length), max: String(MAX_MEMORIES) })}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {t('memory.inspired')}
            </span>
          </div>
        </>
      )}

      {/* Project tab body */}
      {!searchActive && activeTab === 'project' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ProjectMemoryTab focus={focusTarget?.tier === 'project' ? focusTarget : undefined} />
        </div>
      )}

      {/* Structured Memory tab body */}
      {!searchActive && activeTab === 'memdir' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <MemdirTab focus={focusTarget?.tier === 'memdir' ? focusTarget : undefined} />
        </div>
      )}

      {/* Dream consolidation tab body */}
      {!searchActive && activeTab === 'dream' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <DreamConsolidationTab focus={focusTarget?.tier === 'dream' ? focusTarget : undefined} />
        </div>
      )}

      {/* Instruction Files tab body — multi-scope CLAUDE.md editor */}
      {!searchActive && activeTab === 'config' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <InstructionFilesTab focus={focusTarget?.tier === 'config' ? focusTarget : undefined} />
        </div>
      )}

      {/* CSS */}
      <style>{`
        div:hover > .memory-item-actions {
          display: flex !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.04); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
