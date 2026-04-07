import React from 'react'
import {
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Check,
  X,
} from 'lucide-react'
import { MemoryItem, MemoryCategory, MemoryType } from '../../types/app.types'
import { CATEGORY_CONFIG, CATEGORIES, MAX_CONTENT_LENGTH, MEMORY_TYPE_CONFIG, MEMORY_TYPES } from './memoryConstants'
import { highlightText, formatRelativeTime } from './memoryConstants'

interface MemoryItemCardProps {
  mem: MemoryItem
  t: (key: string) => string
  searchQuery: string
  // Edit state
  isEditing: boolean
  editContent: string
  editCategory: MemoryCategory
  editMemoryType?: MemoryType
  onEditContentChange: (v: string) => void
  onEditCategoryChange: (cat: MemoryCategory) => void
  onEditMemoryTypeChange?: (type: MemoryType) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  // Actions
  onTogglePin: () => void
  onDelete: () => void
}

export default function MemoryItemCard({
  mem, t, searchQuery,
  isEditing, editContent, editCategory, editMemoryType,
  onEditContentChange, onEditCategoryChange, onEditMemoryTypeChange,
  onStartEdit, onSaveEdit, onCancelEdit,
  onTogglePin, onDelete,
}: MemoryItemCardProps) {
  // Defensive guard: if category is not in CATEGORY_CONFIG (corrupted data),
  // fall back to 'fact' to prevent crash (Iteration 309 -- MemoryPanel crash fix)
  const cfg = CATEGORY_CONFIG[mem.category] || CATEGORY_CONFIG.fact
  const typeCfg = mem.memoryType ? MEMORY_TYPE_CONFIG[mem.memoryType] : null

  return (
    <div
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
            onChange={e => onEditContentChange(e.target.value)}
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
                onSaveEdit()
              }
              if (e.key === 'Escape') onCancelEdit()
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Category selector */}
              <div style={{ display: 'flex', gap: 2 }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => onEditCategoryChange(cat)}
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
              {/* Memory type selector (Iteration 480) */}
              {onEditMemoryTypeChange && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {MEMORY_TYPES.map(type => {
                    const tc = MEMORY_TYPE_CONFIG[type]
                    const isActive = editMemoryType === type
                    return (
                      <button
                        key={type}
                        onClick={() => onEditMemoryTypeChange(type)}
                        title={tc.description}
                        style={{
                          background: isActive ? `${tc.color}20` : 'transparent',
                          border: isActive ? `1px solid ${tc.color}40` : '1px solid transparent',
                          borderRadius: 4,
                          padding: '1px 5px',
                          cursor: 'pointer',
                          color: isActive ? tc.color : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 9,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {tc.icon}
                        {type}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={onCancelEdit}
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
                onClick={onSaveEdit}
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
                {/* Memory type badge (Iteration 480) */}
                {typeCfg && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    fontSize: 9,
                    color: typeCfg.color,
                    background: `${typeCfg.color}10`,
                    borderRadius: 6,
                    padding: '0 5px',
                    fontWeight: 500,
                  }}
                  title={typeCfg.description}
                  >
                    {typeCfg.icon}
                    {mem.memoryType}
                  </span>
                )}
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {formatRelativeTime(mem.updatedAt, t)}
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
              onClick={onTogglePin}
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
              onClick={onStartEdit}
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
              onClick={onDelete}
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
}
