// SettingsMemory — view and manage Claude Code memory files (~/.claude/memory/)
import React, { useState, useEffect, useCallback } from 'react'
import { Brain, Trash2, Plus, Edit3, Check, X, RefreshCw, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useI18n } from '../../i18n'

interface MemoryFile {
  filePath: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'unknown'
  content: string
  scope: 'global' | 'project'
  projectHash?: string
}

type Scope = 'global' | 'project' | 'all'

const TYPE_COLORS: Record<string, string> = {
  user: '#6366f1',
  feedback: '#fbbf24',
  project: '#4ade80',
  reference: '#a78bfa',
  unknown: 'rgba(255,255,255,0.38)',
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  user: 'settingsMemory.typeUser',
  feedback: 'settingsMemory.typeFeedback',
  project: 'settingsMemory.typeProject',
  reference: 'settingsMemory.typeReference',
  unknown: 'settingsMemory.typeUnknown',
}

interface NewMemoryState {
  name: string
  description: string
  type: string
  body: string
  scope: 'global' | 'project'
}

function freshNew(): NewMemoryState {
  return { name: '', description: '', type: 'user', body: '', scope: 'global' }
}

const glassInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  color: 'rgba(255,255,255,0.82)',
  outline: 'none',
  transition: 'all 0.15s ease',
}

export default function SettingsMemory() {
  const { t } = useI18n()
  const typeLabel = (type: string) => t(TYPE_LABEL_KEYS[type] ?? 'settingsMemory.typeUnknown')
  const [scope, setScope] = useState<Scope>('all')
  const [memories, setMemories] = useState<MemoryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newState, setNewState] = useState<NewMemoryState>(freshNew())
  const [saving, setSaving] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [hoveredDelete, setHoveredDelete] = useState<string | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.memoryList(scope)
      setMemories(result)
    } catch (e) {
      setError(t('settingsMemory.loadingError', { error: String(e) }))
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { load() }, [load])

  const startEdit = (mem: MemoryFile) => {
    setEditingPath(mem.filePath)
    setEditContent(mem.content)
    setExpandedPaths(prev => new Set([...prev, mem.filePath]))
  }

  const cancelEdit = () => {
    setEditingPath(null)
    setEditContent('')
  }

  const saveEdit = async (filePath: string, mem: MemoryFile) => {
    setSaving(true)
    try {
      // Rebuild full file content with frontmatter
      const fullContent = `---\nname: ${mem.name}\ndescription: ${mem.description}\ntype: ${mem.type}\n---\n${editContent}`
      await window.electronAPI.memoryWrite(filePath, fullContent)
      setEditingPath(null)
      await load()
    } catch (e) {
      setError(t('settingsMemory.saveError', { error: String(e) }))
    } finally {
      setSaving(false)
    }
  }

  const deleteMemory = async (filePath: string) => {
    try {
      await window.electronAPI.memoryDelete(filePath)
      setConfirmDeletePath(null)
      await load()
    } catch (e) {
      setError(t('settingsMemory.deleteError', { error: String(e) }))
    }
  }

  const createMemory = async () => {
    if (!newState.name.trim() || !newState.body.trim()) return
    setSaving(true)
    try {
      await window.electronAPI.memoryCreate({
        name: newState.name.trim(),
        description: newState.description.trim(),
        type: newState.type,
        body: newState.body.trim(),
        scope: newState.scope,
      })
      setShowNew(false)
      setNewState(freshNew())
      await load()
    } catch (e) {
      setError(t('settingsMemory.createError', { error: String(e) }))
    } finally {
      setSaving(false)
    }
  }

  const toggleExpand = (filePath: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 4,
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={15} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
            {t('settingsMemory.title')}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>{t('settingsMemory.path')}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={load} title={t('common.refresh')} style={{ ...btnStyle, color: 'rgba(255,255,255,0.45)' }}>
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setShowNew(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', borderRadius: 8,
              color: 'rgba(255,255,255,0.82)', cursor: 'pointer',
            }}
          >
            <Plus size={11} /> {t('settingsMemory.newBtn')}
          </button>
        </div>
      </div>

      {/* Scope tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['all', 'global', 'project'] as const).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
              background: scope === s ? 'rgba(99,102,241,0.18)' : 'none',
              border: '1px solid ' + (scope === s ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.09)'),
              color: scope === s ? '#818cf8' : 'rgba(255,255,255,0.45)',
              fontWeight: scope === s ? 600 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            {t(`settingsMemory.scope${s.charAt(0).toUpperCase() + s.slice(1)}`)}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.10)', borderRadius: 6, fontSize: 12, color: '#f87171', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* New memory form */}
      {showNew && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: 14, marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginBottom: 8 }}>{t('settingsMemory.newMemory')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input
              placeholder={t('settingsMemory.fieldName')}
              value={newState.name}
              onChange={e => setNewState(s => ({ ...s, name: e.target.value }))}
              style={{ ...glassInputStyle, width: '100%', boxSizing: 'border-box' }}
            />
            <select
              value={newState.type}
              onChange={e => setNewState(s => ({ ...s, type: e.target.value }))}
              style={{ ...glassInputStyle, width: '100%', boxSizing: 'border-box' }}
            >
              {['user', 'feedback', 'project', 'reference'].map(typ => (
                <option key={typ} value={typ}>{typeLabel(typ)}</option>
              ))}
            </select>
          </div>
          <input
            placeholder={t('settingsMemory.fieldDescription')}
            value={newState.description}
            onChange={e => setNewState(s => ({ ...s, description: e.target.value }))}
            style={{ ...glassInputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <textarea
            placeholder={t('settingsMemory.fieldBody')}
            value={newState.body}
            onChange={e => setNewState(s => ({ ...s, body: e.target.value }))}
            rows={4}
            style={{ ...glassInputStyle, width: '100%', marginBottom: 8, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <select
              value={newState.scope}
              onChange={e => setNewState(s => ({ ...s, scope: e.target.value as 'global' | 'project' }))}
              style={{ ...glassInputStyle, fontSize: 11 }}
            >
              <option value="global">{t('settingsMemory.scopeGlobalOption')}</option>
              <option value="project">{t('settingsMemory.scopeProjectOption')}</option>
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setShowNew(false); setNewState(freshNew()) }} style={{ ...btnStyle, color: 'rgba(255,255,255,0.45)', padding: '4px 8px', fontSize: 11 }}>{t('common.cancel')}</button>
              <button
                onClick={createMemory}
                disabled={saving || !newState.name.trim() || !newState.body.trim()}
                style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 600,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                  border: 'none', borderRadius: 8,
                  color: 'rgba(255,255,255,0.82)', cursor: saving ? 'wait' : 'pointer',
                  opacity: (!newState.name.trim() || !newState.body.trim()) ? 0.5 : 1,
                }}
              >
                {saving ? t('common.saving') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory list */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', textAlign: 'center', padding: 24 }}>{t('common.loadingEllipsis')}</div>
      ) : memories.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', textAlign: 'center', padding: 24 }}>
          <Brain size={28} style={{ opacity: 0.2, marginBottom: 8 }} />
          <div>{t('settingsMemory.noMemories')}</div>
          <div style={{ fontSize: 10, marginTop: 4 }}>{t('settingsMemory.noMemoriesHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {memories.map(mem => {
            const isExpanded = expandedPaths.has(mem.filePath)
            const isEditing = editingPath === mem.filePath
            const isConfirmDelete = confirmDeletePath === mem.filePath
            return (
              <div
                key={mem.filePath}
                style={{
                  background: hoveredRow === mem.filePath ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)',
                  border: hoveredRow === mem.filePath ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={() => setHoveredRow(mem.filePath)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {/* Row header */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }}
                  onClick={() => toggleExpand(mem.filePath)}
                >
                  {isExpanded ? <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />}
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                    background: `${TYPE_COLORS[mem.type]}22`,
                    color: TYPE_COLORS[mem.type],
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    {typeLabel(mem.type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mem.name}
                    </div>
                    {mem.description && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, lineHeight: 1.5 }}>
                        {mem.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', flexShrink: 0, marginRight: 4 }}>
                    {mem.scope}
                  </span>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {!isEditing && (
                      <button onClick={() => startEdit(mem)} title={t('settingsMemory.editTitle')} style={{ ...btnStyle, color: 'rgba(255,255,255,0.38)' }}>
                        <Edit3 size={12} />
                      </button>
                    )}
                    {isConfirmDelete ? (
                      <>
                        <button onClick={() => deleteMemory(mem.filePath)} title={t('settingsMemory.confirmDelete')} style={{ ...btnStyle, color: '#f87171' }}>
                          <Check size={12} />
                        </button>
                        <button onClick={() => setConfirmDeletePath(null)} style={{ ...btnStyle, color: 'rgba(255,255,255,0.38)' }}>
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeletePath(mem.filePath)}
                        title={t('settingsMemory.deleteTitle')}
                        onMouseEnter={() => setHoveredDelete(mem.filePath)}
                        onMouseLeave={() => setHoveredDelete(null)}
                        style={{
                          ...btnStyle,
                          color: hoveredDelete === mem.filePath ? '#fca5a5' : 'rgba(255,255,255,0.38)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '8px 12px' }}>
                    {isEditing ? (
                      <>
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={6}
                          style={{
                            width: '100%', padding: '6px 8px', fontSize: 11, lineHeight: 1.5,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(99,102,241,0.5)',
                            borderRadius: 6, color: 'rgba(255,255,255,0.82)',
                            outline: 'none', resize: 'vertical', fontFamily: 'monospace',
                            boxSizing: 'border-box',
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                          <button onClick={cancelEdit} style={{ ...btnStyle, color: 'rgba(255,255,255,0.45)', padding: '4px 8px', fontSize: 11 }}>{t('common.cancel')}</button>
                          <button
                            onClick={() => saveEdit(mem.filePath, mem)}
                            disabled={saving}
                            style={{
                              padding: '4px 10px', fontSize: 11, fontWeight: 600,
                              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                              border: 'none', borderRadius: 6,
                              color: 'rgba(255,255,255,0.82)', cursor: 'pointer',
                            }}
                          >
                            {saving ? t('common.saving') : t('common.save')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <pre style={{
                        margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                        color: 'rgba(255,255,255,0.82)', fontFamily: 'monospace',
                        maxHeight: 200, overflowY: 'auto',
                      }}>
                        {mem.content || <span style={{ color: 'rgba(255,255,255,0.38)', fontStyle: 'italic' }}>{t('settingsMemory.empty')}</span>}
                      </pre>
                    )}
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 6 }}>
                      <FileText size={9} style={{ verticalAlign: 'middle' }} /> {mem.filePath}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
