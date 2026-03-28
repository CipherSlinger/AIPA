import React from 'react'
import { Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { NoteCategory } from '../../types/app.types'
import { MAX_CATEGORIES, MAX_CATEGORY_NAME, CATEGORY_COLORS } from './notesConstants'

interface CategoryManagerProps {
  categories: NoteCategory[]
  categoryCounts: Record<string, number>
  newCategoryName: string
  newCategoryColor: string
  editingCategoryId: string | null
  editingCategoryName: string
  deletingCategoryId: string | null
  onNewCategoryNameChange: (name: string) => void
  onNewCategoryColorChange: (color: string) => void
  onAdd: () => void
  onDelete: (catId: string) => void
  onRenameStart: (cat: NoteCategory) => void
  onRenameSave: () => void
  onEditingCategoryNameChange: (name: string) => void
  onEditingCategoryIdChange: (id: string | null) => void
  onClose: () => void
}

export default function CategoryManager({
  categories,
  categoryCounts,
  newCategoryName,
  newCategoryColor,
  editingCategoryId,
  editingCategoryName,
  deletingCategoryId,
  onNewCategoryNameChange,
  onNewCategoryColorChange,
  onAdd,
  onDelete,
  onRenameStart,
  onRenameSave,
  onEditingCategoryNameChange,
  onEditingCategoryIdChange,
  onClose,
}: CategoryManagerProps) {
  const t = useT()

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--card-bg)',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('notes.manageCategories')}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          {t('notes.closeManage')}
        </button>
      </div>

      {/* Add new category */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input
          type="text"
          value={newCategoryName}
          onChange={e => onNewCategoryNameChange(e.target.value.slice(0, MAX_CATEGORY_NAME))}
          placeholder={t('notes.newCategoryName')}
          maxLength={MAX_CATEGORY_NAME}
          onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 11,
            padding: '4px 8px',
            fontFamily: 'inherit',
          }}
        />
        {/* Color picker circles */}
        <div style={{ display: 'flex', gap: 3 }}>
          {CATEGORY_COLORS.map(color => (
            <button
              key={color}
              role="radio"
              aria-checked={newCategoryColor === color}
              aria-label={color}
              onClick={() => onNewCategoryColorChange(color)}
              style={{
                width: newCategoryColor === color ? 16 : 14,
                height: newCategoryColor === color ? 16 : 14,
                borderRadius: '50%',
                background: color,
                border: newCategoryColor === color ? `2px solid ${color}80` : '1px solid transparent',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.1s, border 0.1s',
                transform: newCategoryColor === color ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        <button
          onClick={onAdd}
          disabled={!newCategoryName.trim() || categories.length >= MAX_CATEGORIES}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 'var(--text-muted)' : 'var(--accent)',
            cursor: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 'not-allowed' : 'pointer',
            fontSize: 11,
            padding: '4px 8px',
            opacity: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 0.5 : 1,
          }}
        >
          {t('notes.addCategory')}
        </button>
      </div>

      {/* Max categories notice */}
      {categories.length >= MAX_CATEGORIES && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
          {t('notes.maxCategories')}
        </div>
      )}

      {/* Existing categories */}
      {categories.map(cat => (
        <div
          key={cat.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 0',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
          {editingCategoryId === cat.id ? (
            <input
              type="text"
              value={editingCategoryName}
              onChange={e => onEditingCategoryNameChange(e.target.value.slice(0, MAX_CATEGORY_NAME))}
              onKeyDown={e => {
                if (e.key === 'Enter') onRenameSave()
                if (e.key === 'Escape') onEditingCategoryIdChange(null)
              }}
              onBlur={onRenameSave}
              autoFocus
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 11,
                padding: '2px 6px',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              onClick={() => onRenameStart(cat)}
              style={{
                flex: 1,
                fontSize: 11,
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title="Click to rename"
            >
              {cat.name}
            </span>
          )}
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            ({categoryCounts[cat.id] || 0})
          </span>
          <button
            onClick={() => onDelete(cat.id)}
            aria-label={deletingCategoryId === cat.id ? t('notes.deleteConfirm') : t('notes.delete')}
            style={{
              background: 'none',
              border: 'none',
              color: deletingCategoryId === cat.id ? '#e06c75' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              opacity: deletingCategoryId === cat.id ? 1 : 0.4,
              transition: 'opacity 0.15s, color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => { if (deletingCategoryId !== cat.id) e.currentTarget.style.opacity = '0.4' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
