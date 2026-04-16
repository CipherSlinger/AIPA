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
      background: 'var(--popup-bg)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
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
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 8,
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-bright)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
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
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 11,
            padding: '4px 8px',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
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
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: color,
                border: newCategoryColor === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.15s ease, border 0.15s ease',
                transform: newCategoryColor === color ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        <button
          onClick={onAdd}
          disabled={!newCategoryName.trim() || categories.length >= MAX_CATEGORIES}
          style={{
            background: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES
              ? 'rgba(99,102,241,0.3)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: 'none',
            borderRadius: 7,
            color: 'var(--text-bright)',
            fontWeight: 600,
            cursor: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 'not-allowed' : 'pointer',
            fontSize: 11,
            padding: '5px 10px',
            opacity: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 0.5 : 1,
            transition: 'opacity 0.15s ease',
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
            padding: '8px 12px',
            borderRadius: 7,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
        >
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: cat.color, flexShrink: 0, display: 'inline-block' }} />
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
                background: 'var(--bg-hover)',
                border: '1px solid rgba(99,102,241,0.5)',
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
                fontSize: 12,
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title={t('notes.clickToRename')}
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
              background: deletingCategoryId === cat.id ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              cursor: 'pointer',
              padding: '2px 5px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              opacity: deletingCategoryId === cat.id ? 1 : 0.5,
              transition: 'opacity 0.15s ease, background 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.background = 'rgba(239,68,68,0.22)'
            }}
            onMouseLeave={e => {
              if (deletingCategoryId !== cat.id) {
                e.currentTarget.style.opacity = '0.5'
                e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
              }
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
