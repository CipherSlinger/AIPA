import React, { useState, useMemo, useCallback } from 'react'
import {
  Brain,
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Check,
  X,
  Star,
  BookOpen,
  Lightbulb,
  Info,
  ChevronDown,
} from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { MemoryItem, MemoryCategory } from '../../types/app.types'
import { useT } from '../../i18n'

const CATEGORY_CONFIG: Record<MemoryCategory, { icon: React.ReactNode; color: string; labelKey: string }> = {
  preference: { icon: <Star size={12} />, color: '#f59e0b', labelKey: 'memory.catPreference' },
  fact:       { icon: <BookOpen size={12} />, color: '#3b82f6', labelKey: 'memory.catFact' },
  instruction:{ icon: <Lightbulb size={12} />, color: '#10b981', labelKey: 'memory.catInstruction' },
  context:    { icon: <Info size={12} />, color: '#8b5cf6', labelKey: 'memory.catContext' },
}

const CATEGORIES: MemoryCategory[] = ['preference', 'fact', 'instruction', 'context']
const MAX_MEMORIES = 200
const MAX_CONTENT_LENGTH = 500

export default function MemoryPanel() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToast = useUiStore(s => s.addToast)

  const memories: MemoryItem[] = prefs.memories || []

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | 'all'>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState<MemoryCategory>('fact')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  const saveMemories = useCallback((updated: MemoryItem[]) => {
    setPrefs({ memories: updated })
    window.electronAPI.prefsSet('memories', updated)
  }, [setPrefs])

  const addMemory = useCallback(() => {
    if (!newContent.trim()) return
    if (memories.length >= MAX_MEMORIES) {
      addToast('error', t('memory.limitReached'))
      return
    }
    const item: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: newContent.trim().slice(0, MAX_CONTENT_LENGTH),
      category: newCategory,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    saveMemories([item, ...memories])
    setNewContent('')
    setShowAddForm(false)
    addToast('success', t('memory.added'))
  }, [newContent, newCategory, memories, saveMemories, addToast, t])

  const deleteMemory = useCallback((id: string) => {
    saveMemories(memories.filter(m => m.id !== id))
    addToast('info', t('memory.deleted'))
  }, [memories, saveMemories, addToast, t])

  const togglePin = useCallback((id: string) => {
    saveMemories(memories.map(m =>
      m.id === id ? { ...m, pinned: !m.pinned, updatedAt: Date.now() } : m
    ))
  }, [memories, saveMemories])

  const startEdit = useCallback((mem: MemoryItem) => {
    setEditingId(mem.id)
    setEditContent(mem.content)
    setEditCategory(mem.category)
  }, [])

  const saveEdit = useCallback(() => {
    if (!editContent.trim() || !editingId) return
    saveMemories(memories.map(m =>
      m.id === editingId
        ? { ...m, content: editContent.trim().slice(0, MAX_CONTENT_LENGTH), category: editCategory, updatedAt: Date.now() }
        : m
    ))
    setEditingId(null)
    addToast('success', t('memory.updated'))
  }, [editingId, editContent, editCategory, memories, saveMemories, addToast, t])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const clearAllMemories = useCallback(() => {
    if (memories.length === 0) return
    saveMemories([])
    addToast('info', t('memory.clearedAll'))
  }, [memories, saveMemories, addToast, t])

  // Filtered + sorted memories
  const filteredMemories = useMemo(() => {
    let result = [...memories]
    // Filter by category
    if (filterCategory !== 'all') {
      result = result.filter(m => m.category === filterCategory)
    }
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m => m.content.toLowerCase().includes(q))
    }
    // Sort: pinned first, then by updatedAt desc
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })
    return result
  }, [memories, filterCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: memories.length }
    for (const cat of CATEGORIES) {
      counts[cat] = memories.filter(m => m.category === cat).length
    }
    return counts
  }, [memories])

  const formatRelativeTime = (ts: number): string => {
    const diff = Date.now() - ts
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('memory.justNow')
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d`
    return `${Math.floor(days / 30)}mo`
  }

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
            <span style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              background: 'var(--input-field-bg)',
              borderRadius: 8,
              padding: '1px 6px',
            }}>
              {memories.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              aria-label={t('memory.addNew')}
              title={t('memory.addNew')}
              style={{
                background: showAddForm ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: 4,
                cursor: 'pointer',
                color: showAddForm ? '#fff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} />
            </button>
            {memories.length > 0 && (
              <button
                onClick={clearAllMemories}
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
        </div>

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
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('memory.searchPlaceholder')}
            style={{
              width: '100%',
              height: 28,
              paddingLeft: 26,
              paddingRight: 8,
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
        </div>

        {/* Category filter pills */}
        <div style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setFilterCategory('all')}
            style={{
              background: filterCategory === 'all' ? 'var(--accent)' : 'var(--input-field-bg)',
              color: filterCategory === 'all' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 10,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {t('memory.all')} ({categoryCounts.all})
          </button>
          {CATEGORIES.map(cat => {
            const cfg = CATEGORY_CONFIG[cat]
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
                style={{
                  background: filterCategory === cat ? `${cfg.color}20` : 'var(--input-field-bg)',
                  color: filterCategory === cat ? cfg.color : 'var(--text-muted)',
                  border: filterCategory === cat ? `1px solid ${cfg.color}40` : '1px solid transparent',
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
                {t(cfg.labelKey)} ({categoryCounts[cat] || 0})
              </button>
            )
          })}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.03)',
          flexShrink: 0,
        }}>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder={t('memory.addPlaceholder')}
            maxLength={MAX_CONTENT_LENGTH}
            autoFocus
            style={{
              width: '100%',
              height: 60,
              padding: 8,
              background: 'var(--input-field-bg)',
              border: '1px solid var(--input-field-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-primary)',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-field-border)')}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                addMemory()
              }
              if (e.key === 'Escape') {
                setShowAddForm(false)
                setNewContent('')
              }
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
          }}>
            {/* Category selector */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                style={{
                  background: `${CATEGORY_CONFIG[newCategory].color}15`,
                  border: `1px solid ${CATEGORY_CONFIG[newCategory].color}40`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 10,
                  color: CATEGORY_CONFIG[newCategory].color,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {CATEGORY_CONFIG[newCategory].icon}
                {t(CATEGORY_CONFIG[newCategory].labelKey)}
                <ChevronDown size={10} />
              </button>
              {showFilterDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 2,
                  background: 'var(--popup-bg)',
                  border: '1px solid var(--popup-border)',
                  borderRadius: 6,
                  boxShadow: 'var(--popup-shadow)',
                  zIndex: 50,
                  overflow: 'hidden',
                  minWidth: 120,
                }}>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => {
                        setNewCategory(cat)
                        setShowFilterDropdown(false)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        padding: '6px 10px',
                        background: newCategory === cat ? 'rgba(255,255,255,0.05)' : 'transparent',
                        border: 'none',
                        color: CATEGORY_CONFIG[cat].color,
                        fontSize: 11,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {CATEGORY_CONFIG[cat].icon}
                      {t(CATEGORY_CONFIG[cat].labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{
                fontSize: 9,
                color: newContent.length > MAX_CONTENT_LENGTH * 0.9 ? 'var(--warning)' : 'var(--text-muted)',
                alignSelf: 'center',
                marginRight: 4,
              }}>
                {newContent.length}/{MAX_CONTENT_LENGTH}
              </span>
              <button
                onClick={() => { setShowAddForm(false); setNewContent('') }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {t('memory.cancel')}
              </button>
              <button
                onClick={addMemory}
                disabled={!newContent.trim()}
                style={{
                  background: newContent.trim() ? 'var(--accent)' : 'var(--input-field-bg)',
                  border: 'none',
                  borderRadius: 4,
                  padding: '2px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: newContent.trim() ? '#fff' : 'var(--text-muted)',
                  cursor: newContent.trim() ? 'pointer' : 'default',
                }}
              >
                {t('memory.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
      }}>
        {filteredMemories.length === 0 ? (
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
              {memories.length === 0
                ? t('memory.emptyState')
                : t('memory.noResults')
              }
            </span>
            {memories.length === 0 && (
              <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center', padding: '0 20px' }}>
                {t('memory.emptyHint')}
              </span>
            )}
          </div>
        ) : (
          filteredMemories.map(mem => {
            const cfg = CATEGORY_CONFIG[mem.category]
            const isEditing = editingId === mem.id

            return (
              <div
                key={mem.id}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.15s ease',
                  position: 'relative',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {isEditing ? (
                  /* Edit mode */
                  <div>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      maxLength={MAX_CONTENT_LENGTH}
                      autoFocus
                      style={{
                        width: '100%',
                        height: 50,
                        padding: 6,
                        background: 'var(--input-field-bg)',
                        border: '1px solid var(--accent)',
                        borderRadius: 4,
                        fontSize: 11,
                        color: 'var(--text-primary)',
                        resize: 'none',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault()
                          saveEdit()
                        }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setEditCategory(cat)}
                            style={{
                              background: editCategory === cat ? `${CATEGORY_CONFIG[cat].color}20` : 'transparent',
                              border: editCategory === cat ? `1px solid ${CATEGORY_CONFIG[cat].color}40` : '1px solid transparent',
                              borderRadius: 4,
                              padding: '1px 4px',
                              cursor: 'pointer',
                              color: CATEGORY_CONFIG[cat].color,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {CATEGORY_CONFIG[cat].icon}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={cancelEdit}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 4,
                            padding: 2,
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            display: 'flex',
                          }}
                        >
                          <X size={14} />
                        </button>
                        <button
                          onClick={saveEdit}
                          style={{
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: 4,
                            padding: 2,
                            cursor: 'pointer',
                            color: '#fff',
                            display: 'flex',
                          }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                    }}>
                      {/* Category icon */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: `${cfg.color}15`,
                        color: cfg.color,
                        flexShrink: 0,
                        marginTop: 1,
                      }}>
                        {cfg.icon}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                        }}>
                          {searchQuery ? (
                            highlightText(mem.content, searchQuery)
                          ) : (
                            mem.content
                          )}
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 3,
                        }}>
                          <span style={{
                            fontSize: 9,
                            color: cfg.color,
                            background: `${cfg.color}10`,
                            borderRadius: 6,
                            padding: '0 5px',
                            fontWeight: 500,
                          }}>
                            {t(cfg.labelKey)}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            {formatRelativeTime(mem.updatedAt)}
                          </span>
                          {mem.pinned && (
                            <Pin size={9} style={{ color: 'var(--accent)' }} />
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Action buttons (appear on hover) */}
                    <div
                      className="memory-item-actions"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 8,
                        display: 'none',
                        gap: 2,
                        background: 'var(--popup-bg)',
                        borderRadius: 4,
                        padding: '2px 2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    >
                      <button
                        onClick={() => togglePin(mem.id)}
                        title={mem.pinned ? t('memory.unpin') : t('memory.pin')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 3,
                          padding: 3,
                          cursor: 'pointer',
                          color: mem.pinned ? 'var(--accent)' : 'var(--text-muted)',
                          display: 'flex',
                        }}
                      >
                        {mem.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                      </button>
                      <button
                        onClick={() => startEdit(mem)}
                        title={t('memory.edit')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 3,
                          padding: 3,
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          display: 'flex',
                        }}
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => deleteMemory(mem.id)}
                        title={t('memory.delete')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 3,
                          padding: 3,
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          display: 'flex',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })
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
          {t('memory.footer', { count: String(memories.length), max: String(MAX_MEMORIES) })}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
          {t('memory.inspired')}
        </span>
      </div>

      {/* CSS for hover actions and animations */}
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

/** Highlight matching search terms in text */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} style={{
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 2,
            padding: '0 1px',
          }}>{part}</mark>
        : part
    )
  } catch {
    return text
  }
}
