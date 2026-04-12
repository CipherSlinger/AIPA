/**
 * MemoryPanel — Personal + Project memory management.
 *
 * Iteration 488: Added "Personal" vs "Project" memory tabs.
 * - Personal tab: electron-store backed memories (existing behavior)
 * - Project tab: reads/writes .claude/MEMORY.md in the working directory
 *   (mirrors Claude Code's project memory system)
 *
 * Iteration P1-4: Added "Config" tab for CLAUDE.md editing.
 * - Config tab: reads/writes CLAUDE.md in the working directory root
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
import { CATEGORY_CONFIG, CATEGORIES, MAX_MEMORIES } from './memoryConstants'
import { useMemoryCrud } from './useMemoryCrud'
import MemoryAddForm from './MemoryAddForm'
import MemoryItemCard from './MemoryItemCard'

type MemoryTab = 'personal' | 'project' | 'config'

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>
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
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayPath}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={load}
            title={t('memory.projectRefresh')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 2, display: 'flex', alignItems: 'center' }}
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
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4,
                  color: 'rgba(255,255,255,0.55)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 4,
                  color: 'rgba(255,255,255,0.95)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
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
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.82)',
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
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
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
            color: 'rgba(255,255,255,0.82)',
            fontFamily: 'monospace',
          }}>
            {content}
          </pre>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '60%', color: 'rgba(255,255,255,0.38)', gap: 8, textAlign: 'center',
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
                color: 'rgba(255,255,255,0.95)', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
              }}
            >
              {t('memory.projectCreate')}
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!editing && (
        <div style={{ padding: '4px 12px', fontSize: 9, color: 'rgba(255,255,255,0.38)', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {t('memory.projectFooter')}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── CLAUDE.md Config Editor ─────────────────────────────────────────────────

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

function ClaudeConfigTab() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const getConfigPath = useCallback(async (): Promise<string> => {
    const workingDir = prefs.workingDir || await window.electronAPI.fsGetHome()
    return `${workingDir}/CLAUDE.md`
  }, [prefs.workingDir])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const configPath = await getConfigPath()
      const result = await window.electronAPI.fsReadFile(configPath)
      if (result && 'content' in result) {
        setContent(result.content as string)
      } else {
        setContent('')
      }
    } catch {
      setContent('')
    }
    setLoading(false)
  }, [getConfigPath])

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
      const configPath = await getConfigPath()
      await window.electronAPI.fsWriteFile(configPath, editValue)
      setContent(editValue)
      setEditing(false)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      setError(String(err))
    }
    setSaving(false)
  }

  const openInEditor = async () => {
    try {
      const configPath = await getConfigPath()
      await window.electronAPI.shellOpenExternal(`file://${configPath}`)
    } catch { /* ignore */ }
  }

  const copyPath = async () => {
    try {
      const configPath = await getConfigPath()
      await navigator.clipboard.writeText(configPath)
      setPathCopied(true)
      setTimeout(() => setPathCopied(false), 1500)
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>
        <RefreshCw size={14} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
        {t('common.loading')}
      </div>
    )
  }

  const workingDir = prefs.workingDir || '~'
  const displayPath = `${workingDir}/CLAUDE.md`
  const hasUnsavedChanges = editing && editValue !== content

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Description bar */}
      <div style={{
        padding: '6px 12px 4px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
          CLAUDE.md 包含项目级别的 Claude Code 配置 — 自定义指令、规则和上下文，每次对话时自动加载。
        </div>
      </div>

      {/* Path + actions bar */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        flexShrink: 0,
      }}>
        {/* Clickable path — copies to clipboard */}
        <span
          onClick={copyPath}
          title={pathCopied ? 'Copied!' : 'Click to copy path'}
          style={{
            fontSize: 11,
            color: pathCopied ? '#a5b4fc' : 'rgba(255,255,255,0.38)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            cursor: 'pointer',
            transition: 'color 0.15s ease',
            userSelect: 'none',
          }}
          onMouseEnter={e => { if (!pathCopied) e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
          onMouseLeave={e => { if (!pathCopied) e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
        >
          {pathCopied ? '✓ Copied' : displayPath}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {/* Unsaved changes dot indicator */}
          {hasUnsavedChanges && (
            <span
              title="Unsaved changes"
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(165,180,252,0.8)',
                fontSize: 8,
                flexShrink: 0,
              }}
            />
          )}
          <button
            onClick={load}
            title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 2, display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={openInEditor}
            title="在编辑器中打开"
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4,
              color: 'rgba(255,255,255,0.55)', fontSize: 10, cursor: 'pointer', padding: '2px 7px',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <FolderOpen size={10} />
            在编辑器中打开
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
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4,
                  color: 'rgba(255,255,255,0.55)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 4,
                  color: 'rgba(255,255,255,0.95)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
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
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', position: 'relative' }}>
        {editing ? (
          <>
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              placeholder="# CLAUDE.md&#10;&#10;Add project instructions, rules, and context here..."
              style={{
                width: '100%',
                height: '100%',
                minHeight: 300,
                background: 'rgba(8,8,16,0.8)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.82)',
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
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            {/* Char counter — bottom-right of content area */}
            <div style={{
              position: 'absolute',
              bottom: 18,
              right: 22,
              fontSize: 11,
              color: 'rgba(255,255,255,0.38)',
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
            color: 'rgba(255,255,255,0.82)',
            fontFamily: 'monospace',
          }}>
            {content}
          </pre>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '60%', color: 'rgba(255,255,255,0.38)', gap: 8, textAlign: 'center',
          }}>
            <Settings size={28} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12 }}>尚未创建 CLAUDE.md</span>
            <span style={{ fontSize: 10, opacity: 0.7, padding: '0 20px' }}>
              CLAUDE.md 包含项目级配置，每次 Claude Code 会话时自动读取。
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => startEdit()}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)', border: 'none', borderRadius: 6,
                  color: 'rgba(255,255,255,0.95)', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
                }}
              >
                创建 CLAUDE.md
              </button>
              {/* Template button — prefills common CLAUDE.md structure */}
              <button
                onClick={() => startEdit(CLAUDE_MD_TEMPLATE)}
                title="使用模板创建"
                style={{
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 6,
                  color: '#a5b4fc', fontSize: 11, cursor: 'pointer', padding: '5px 14px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
              >
                <FileText size={12} />
                使用模板
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!editing && (
        <div style={{ padding: '4px 12px', fontSize: 9, color: 'rgba(255,255,255,0.38)', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          CLAUDE.md · 项目级 Claude Code 配置 · 自动加载
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
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
    color: active ? '#818cf8' : 'rgba(255,255,255,0.45)',
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
    transition: 'color 0.15s ease, border-color 0.15s ease',
  } as React.CSSProperties)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'rgba(15,15,25,0.90)',
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
        borderBottom: '1px solid rgba(255,255,255,0.07)',
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
              color: 'rgba(255,255,255,0.88)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}>
              {t('memory.title')}
            </span>
            {activeTab === 'personal' && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.45)',
                background: 'rgba(255,255,255,0.08)',
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
                  color: 'rgba(255,255,255,0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'box-shadow 0.15s ease, opacity 0.15s ease',
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
                    color: 'rgba(255,255,255,0.38)',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.38)')}
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
          borderBottom: '1px solid rgba(255,255,255,0.07)',
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
          <button style={tabStyle(activeTab === 'config')} onClick={() => setActiveTab('config')}>
            <Settings size={11} />
            CLAUDE.md
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
                color: 'rgba(255,255,255,0.38)',
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
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 7,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.82)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
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
                  color: crud.filteredMemories.length > 0 ? '#a5b4fc' : 'rgba(255,255,255,0.38)',
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
                    : 'rgba(255,255,255,0.06)',
                  color: crud.filterCategory === 'all' ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
                  border: crud.filterCategory === 'all'
                    ? '1px solid rgba(99,102,241,0.3)'
                    : '1px solid rgba(255,255,255,0.07)',
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
                      background: isActive ? `${cfg.color}20` : 'rgba(255,255,255,0.06)',
                      color: isActive ? cfg.color : 'rgba(255,255,255,0.45)',
                      border: isActive
                        ? `1px solid ${cfg.color}40`
                        : '1px solid rgba(255,255,255,0.07)',
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
            scrollbarColor: 'rgba(255,255,255,0.10) transparent',
          }}>
            {crud.filteredMemories.length === 0 ? (
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.45)',
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
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textAlign: 'center', padding: '0 20px' }}>
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
            borderTop: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums' }}>
              {t('memory.footer', { count: String(crud.memories.length), max: String(MAX_MEMORIES) })}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)' }}>
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

      {/* Config tab body — CLAUDE.md editor */}
      {activeTab === 'config' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ClaudeConfigTab />
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
