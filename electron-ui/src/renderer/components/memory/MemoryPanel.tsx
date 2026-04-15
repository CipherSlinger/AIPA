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
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Brain,
  Plus,
  Search,
  Trash2,
  FolderOpen,
  User,
  FileText,
  RefreshCw,
  Save,
  Settings,
} from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'
import { CATEGORY_CONFIG, CATEGORIES, MAX_MEMORIES, MEMORY_TYPES, MEMORY_TYPE_CONFIG } from './memoryConstants'
import { useMemoryCrud } from './useMemoryCrud'
import MemoryAddForm from './MemoryAddForm'
import MemoryItemCard from './MemoryItemCard'

type MemoryTab = 'personal' | 'project' | 'memdir' | 'config'

// ─── Project Memory (MEMORY.md) viewer/editor ────────────────────────────────

function ProjectMemoryTab() {
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
                color: '#a5b4fc', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
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
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#fca5a5', background: 'rgba(239,68,68,0.08)' }}>
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
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
          }}>
            {content}
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

// ─── Memdir (Structured Memory) viewer ───────────────────────────────────────

interface MemdirFile {
  filePath: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'unknown'
  content: string
  scope: 'global' | 'project'
  projectHash?: string
}

const MEMDIR_TYPE_COLORS: Record<string, string> = {
  user: '#6366f1',
  feedback: '#fbbf24',
  project: '#4ade80',
  reference: '#a78bfa',
  unknown: 'var(--text-muted)',
}

function MemdirTab() {
  const t = useT()
  const [files, setFiles] = useState<MemdirFile[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.memoryList('all')
      setFiles(result as MemdirFile[])
    } catch {
      setFiles([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
        <RefreshCw size={14} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
        {t('common.loading')}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>~/.claude/memory/</span>
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={12} />
          </button>
        </div>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', gap: 8, textAlign: 'center', padding: '0 24px',
        }}>
          <Brain size={28} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 12 }}>{t('memory.memdirEmpty')}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>{t('memory.memdirEmptyHint')}</span>
        </div>
        <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', flex: 1 }}>
          {'~/.claude/memory/ \u00b7 '}{files.length}{' '}{files.length === 1 ? 'file' : 'files'}
        </span>
        <button onClick={load} title={t('memory.projectRefresh')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        {files.map(f => {
          const typeColor = MEMDIR_TYPE_COLORS[f.type] || MEMDIR_TYPE_COLORS.unknown
          const isOpen = expanded === f.filePath
          return (
            <div key={f.filePath} style={{
              background: 'rgba(15,15,25,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--border)', borderRadius: 10, marginBottom: 6,
              overflow: 'hidden', transition: 'all 0.15s ease',
            }}>
              {/* File header row */}
              <div
                onClick={() => setExpanded(isOpen ? null : f.filePath)}
                style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeColor, flexShrink: 0, boxShadow: `0 0 6px ${typeColor}80` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </div>
                  {f.description && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.description}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: typeColor, background: `${typeColor}1e`, borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>
                  {f.type}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--border)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
                  {f.scope === 'global' ? t('memory.memdirGlobal') : t('memory.memdirProject')}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>{'\u25be'}</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border)' }}>
                  <pre style={{
                    margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.6,
                    color: 'var(--text-secondary)', fontFamily: 'monospace',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 10px',
                    border: '1px solid var(--border)',
                  }}>
                    {f.content || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>}
                  </pre>
                  <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {f.filePath}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {t('memory.memdirFooter')}
      </div>

      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}

// ─── Instruction Files Tab (CLAUDE.md viewer) ───────────────────────────────

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

function InstructionFilesTab() {
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

  const currentFile = INSTRUCTION_FILES.find(f => f.scope === activeScope)!

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
        <FileText size={10} style={{ color: '#a5b4fc', flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {t('memory.instructionHint')}
        </span>
      </div>

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
            color: pathCopied ? '#a5b4fc' : 'var(--text-muted)',
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
                color: '#a5b4fc', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
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
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#fca5a5', background: 'rgba(239,68,68,0.08)' }}>
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
                background: 'rgba(8,8,16,0.8)',
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
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
          }}>
            {content}
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
                    color: '#a5b4fc', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
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

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: '5px 0',
    background: 'transparent',
    color: active ? '#818cf8' : 'var(--text-muted)',
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
            <Brain size={16} style={{ color: '#818cf8' }} />
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
          {activeTab === 'personal' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => crud.setShowAddForm(!crud.showAddForm)}
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
                  onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border)',
          marginBottom: activeTab === 'personal' ? 8 : 0,
          marginTop: 4,
        }}>
          <button style={tabStyle(activeTab === 'personal')} onClick={() => setActiveTab('personal')}>
            <User size={11} />
            {t('memory.globalMemory')}
          </button>
          <button style={tabStyle(activeTab === 'project')} onClick={() => setActiveTab('project')}>
            <FolderOpen size={11} />
            {t('memory.projectMemory')}
          </button>
          <button style={tabStyle(activeTab === 'memdir')} onClick={() => setActiveTab('memdir')}>
            <Brain size={11} />
            {t('memory.memdirTab')}
          </button>
          <button style={tabStyle(activeTab === 'config')} onClick={() => setActiveTab('config')}>
            <FileText size={11} />
            {t('memory.instructionTab')}
          </button>
        </div>

        {/* Personal tab: search + category filter */}
        {activeTab === 'personal' && (
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
                  color: crud.filteredMemories.length > 0 ? '#a5b4fc' : 'var(--text-muted)',
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
                  color: crud.filterCategory === 'all' ? '#a5b4fc' : 'var(--text-muted)',
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
                      color: isActive ? cfg.color : 'var(--text-muted)',
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
              {/* "全部" chip */}
              <button
                onClick={() => crud.setFilterMemoryType('all')}
                style={{
                  background: crud.filterMemoryType === 'all'
                    ? 'rgba(99,102,241,0.20)'
                    : 'var(--bg-hover)',
                  color: crud.filterMemoryType === 'all'
                    ? 'rgba(165,180,252,0.82)'
                    : 'var(--text-muted)',
                  border: crud.filterMemoryType === 'all'
                    ? '1px solid rgba(99,102,241,0.40)'
                    : '1px solid var(--border)',
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                全部
              </button>
              {/* Type chips */}
              {MEMORY_TYPES.map(type => {
                const tc = MEMORY_TYPE_CONFIG[type]
                const isActive = crud.filterMemoryType === type
                // Map type to Chinese label and dot color
                const typeLabels: Record<string, { label: string; dot: string }> = {
                  user:      { label: '用户', dot: 'rgba(251,191,36,0.82)' },
                  feedback:  { label: '反馈', dot: 'rgba(134,239,172,0.82)' },
                  project:   { label: '项目', dot: 'rgba(96,165,250,0.82)' },
                  reference: { label: '参考', dot: 'rgba(192,132,252,0.82)' },
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
                        ? 'rgba(165,180,252,0.82)'
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

      {/* Personal tab body */}
      {activeTab === 'personal' && (
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
                  <Brain size={22} style={{ color: '#818cf8' }} />
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
                <MemoryItemCard
                  key={mem.id}
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
      {activeTab === 'project' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ProjectMemoryTab />
        </div>
      )}

      {/* Structured Memory tab body */}
      {activeTab === 'memdir' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <MemdirTab />
        </div>
      )}

      {/* Instruction Files tab body — multi-scope CLAUDE.md editor */}
      {activeTab === 'config' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <InstructionFilesTab />
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
