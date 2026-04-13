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

  // Chinese labels and badge colors for memory type
  const typeDisplayMap: Record<string, { label: string; dot: string; bg: string; border: string }> = {
    user:      { label: '用户',   dot: 'rgba(251,191,36,0.82)',  bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.60)' },
    feedback:  { label: '反馈',   dot: 'rgba(134,239,172,0.82)', bg: 'rgba(134,239,172,0.10)', border: 'rgba(134,239,172,0.45)' },
    project:   { label: '项目',   dot: 'rgba(96,165,250,0.82)',  bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.45)' },
    reference: { label: '参考',   dot: 'rgba(192,132,252,0.82)', bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.45)' },
  }
  const typeDisplay = mem.memoryType ? typeDisplayMap[mem.memoryType] : null

  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: mem.pinned
          ? '1px solid rgba(251,191,36,0.25)'
          : '1px solid rgba(255,255,255,0.07)',
        borderLeft: mem.pinned
          ? '3px solid rgba(251,191,36,0.55)'
          : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        marginBottom: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(20,20,35,0.90)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        if (!mem.pinned) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(15,15,25,0.85)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
        e.currentTarget.style.transform = 'translateY(0)'
        if (!mem.pinned) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
      }}
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
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 6,
              fontSize: 11,
              color: 'rgba(255,255,255,0.82)',
              lineHeight: 1.6,
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.boxShadow = 'none'
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
                      transition: 'all 0.15s ease',
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
                          color: isActive ? tc.color : 'rgba(255,255,255,0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 9,
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all 0.15s ease',
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
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 4,
                  padding: '2px 7px',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              >
                <X size={14} />
              </button>
              <button
                onClick={onSaveEdit}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                  border: 'none',
                  borderRadius: 4,
                  padding: '2px 7px',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.82)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'box-shadow 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 10px rgba(99,102,241,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
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
                fontSize: 13,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.60)',
                lineHeight: 1.6,
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
                {/* Category badge */}
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: cfg.color,
                  background: `${cfg.color}1e`,
                  borderRadius: 10,
                  padding: '1px 6px',
                }}>
                  {t(cfg.labelKey)}
                </span>
                {/* Memory type badge */}
                {typeDisplay && typeCfg && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.60)',
                    background: typeDisplay.bg,
                    border: `1px solid ${typeDisplay.border}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    fontWeight: 500,
                    transition: 'all 0.15s ease',
                  }}
                  title={typeCfg.description}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: typeDisplay.dot,
                      flexShrink: 0,
                    }} />
                    {typeDisplay.label}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {formatRelativeTime(mem.updatedAt, t)}
                </span>
                {mem.pinned && (
                  <Pin size={9} style={{ color: '#fbbf24' }} />
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
              background: 'rgba(10,10,20,0.94)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 6,
              padding: '2px 2px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <button
              onClick={onTogglePin}
              title={mem.pinned ? t('memory.unpin') : t('memory.pin')}
              style={{
                background: 'none',
                border: 'none',
                borderRadius: 4,
                padding: 3,
                cursor: 'pointer',
                color: mem.pinned ? '#fbbf24' : 'rgba(255,255,255,0.38)',
                display: 'flex',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {mem.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            <button
              onClick={onStartEdit}
              title={t('memory.edit')}
              style={{
                background: 'none',
                border: 'none',
                borderRadius: 4,
                padding: 3,
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.38)',
                display: 'flex',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
                e.currentTarget.style.color = '#818cf8'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'rgba(255,255,255,0.38)'
              }}
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={onDelete}
              title={t('memory.delete')}
              style={{
                background: 'none',
                border: 'none',
                borderRadius: 4,
                padding: 3,
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.38)',
                display: 'flex',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                e.currentTarget.style.color = '#f87171'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'rgba(255,255,255,0.38)'
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
