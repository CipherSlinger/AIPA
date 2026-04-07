/**
 * MemoryPanel — Personal + Project memory management.
 *
 * Iteration 488: Added "Personal" vs "Project" memory tabs.
 * - Personal tab: electron-store backed memories (existing behavior)
 * - Project tab: reads/writes .claude/MEMORY.md in the working directory
 *   (mirrors Claude Code's project memory system)
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
} from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'
import { CATEGORY_CONFIG, CATEGORIES, MAX_MEMORIES } from './memoryConstants'
import { useMemoryCrud } from './useMemoryCrud'
import MemoryAddForm from './MemoryAddForm'
import MemoryItemCard from './MemoryItemCard'

type MemoryTab = 'personal' | 'project'

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
            title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={12} />
          </button>
          {!editing && (
            <button
              onClick={startEdit}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: 4,
                color: '#fff', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                display: 'flex', alignItems: 'center', gap: 3,
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
                  background: 'var(--input-field-bg)', border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 4,
                  color: '#fff', fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                  display: 'flex', alignItems: 'center', gap: 3,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Save size={10} />
                {saving ? t('notes.saving') : (savedMsg ? t('notes.saved') : t('common.save'))}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--error)', background: 'rgba(239,68,68,0.08)' }}>
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
              background: 'var(--input-field-bg)',
              border: '1px solid var(--input-field-border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              lineHeight: 1.6,
              padding: '8px 10px',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--input-field-border)' }}
          />
        ) : content ? (
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            {content}
          </pre>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '60%', color: 'var(--text-muted)', gap: 8, textAlign: 'center',
          }}>
            <FolderOpen size={28} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12 }}>No MEMORY.md found</span>
            <span style={{ fontSize: 10, opacity: 0.7, padding: '0 20px' }}>
              Click Edit to create project-level memory that Claude uses in this working directory.
            </span>
            <button
              onClick={startEdit}
              style={{
                marginTop: 4,
                background: 'var(--accent)', border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 11, cursor: 'pointer', padding: '5px 14px',
              }}
            >
              Create MEMORY.md
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!editing && (
        <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          Loaded by Claude Code on every conversation in this project
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
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    border: 'none',
    borderRadius: 6,
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
      background: 'var(--bg-sessionpanel)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 12px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.06) 0%, transparent 100%)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Brain size={16} style={{ color: 'var(--accent)' }} />
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              {t('memory.title')}
            </span>
            {activeTab === 'personal' && (
              <span style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                background: 'var(--input-field-bg)',
                borderRadius: 8,
                padding: '1px 6px',
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
                  background: crud.showAddForm ? 'var(--accent)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  padding: 4,
                  cursor: 'pointer',
                  color: crud.showAddForm ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <Plus size={14} />
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
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
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
          gap: 4,
          background: 'var(--input-field-bg)',
          borderRadius: 8,
          padding: 3,
          marginBottom: activeTab === 'personal' ? 8 : 0,
        }}>
          <button style={tabStyle(activeTab === 'personal')} onClick={() => setActiveTab('personal')}>
            <User size={11} />
            Personal
          </button>
          <button style={tabStyle(activeTab === 'project')} onClick={() => setActiveTab('project')}>
            <FolderOpen size={11} />
            Project
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
                  background: 'var(--input-field-bg)',
                  border: '1px solid var(--input-field-border)',
                  borderRadius: 6,
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-field-border)')}
              />
              {crud.searchQuery.trim() && (
                <span style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 9,
                  color: crud.filteredMemories.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: 500,
                  pointerEvents: 'none',
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
                  background: crud.filterCategory === 'all' ? 'var(--accent)' : 'var(--input-field-bg)',
                  color: crud.filterCategory === 'all' ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t('memory.all')} ({crud.categoryCounts.all})
              </button>
              {CATEGORIES.map(cat => {
                const cfg = CATEGORY_CONFIG[cat]
                return (
                  <button
                    key={cat}
                    onClick={() => crud.setFilterCategory(crud.filterCategory === cat ? 'all' : cat)}
                    style={{
                      background: crud.filterCategory === cat ? `${cfg.color}20` : 'var(--input-field-bg)',
                      color: crud.filterCategory === cat ? cfg.color : 'var(--text-muted)',
                      border: crud.filterCategory === cat ? `1px solid ${cfg.color}40` : '1px solid transparent',
                      borderRadius: 10,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 500,
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {crud.filteredMemories.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '60%',
                color: 'var(--text-muted)',
                gap: 8,
              }}>
                <Brain size={32} style={{ opacity: 0.3, animation: 'pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize: 12 }}>
                  {crud.memories.length === 0
                    ? t('memory.emptyState')
                    : t('memory.noResults')
                  }
                </span>
                {crud.memories.length === 0 && (
                  <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center', padding: '0 20px' }}>
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
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {t('memory.footer', { count: String(crud.memories.length), max: String(MAX_MEMORIES) })}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
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

      {/* CSS */}
      <style>{`
        div:hover > .memory-item-actions {
          display: flex !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
