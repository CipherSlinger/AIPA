import React from 'react'
import { Plus, Settings } from 'lucide-react'
import { useT } from '../../i18n'
import { NoteCategory } from '../../types/app.types'

interface CategoryFilterBarProps {
  categories: NoteCategory[]
  totalNotes: number
  activeCategoryFilter: string | null
  categoryCounts: Record<string, number>
  showCategoryManager: boolean
  hasNotes: boolean
  onFilterChange: (categoryId: string | null) => void
  onToggleManager: () => void
}

export default function CategoryFilterBar({
  categories,
  totalNotes,
  activeCategoryFilter,
  categoryCounts,
  showCategoryManager,
  hasNotes,
  onFilterChange,
  onToggleManager,
}: CategoryFilterBarProps) {
  const t = useT()

  if (!hasNotes) return null

  // Show manage button even when no categories exist (to create the first one)
  if (categories.length === 0) {
    return (
      <div style={{ padding: '4px 10px', flexShrink: 0 }}>
        <button
          onClick={onToggleManager}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 20,
            borderRadius: 10,
            padding: '0 8px',
            background: 'none',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: 10,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Plus size={10} />
          {t('notes.manageCategories')}
        </button>
      </div>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('notes.categoryLabel')}
      style={{
        display: 'flex',
        gap: 6,
        padding: '6px 10px',
        overflowX: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'none',
        alignItems: 'center',
      }}
    >
      {/* "All" pill */}
      <button
        role="radio"
        aria-checked={activeCategoryFilter === null}
        onClick={() => onFilterChange(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 20,
          borderRadius: 10,
          padding: '0 8px',
          background: activeCategoryFilter === null ? 'var(--accent)20' : 'transparent',
          border: `1px solid ${activeCategoryFilter === null ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer',
          fontSize: 10,
          color: activeCategoryFilter === null ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: activeCategoryFilter === null ? 600 : 400,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        }}
      >
        {t('notes.allNotes')}
        <span style={{ opacity: 0.6, fontSize: 9 }}>({totalNotes})</span>
      </button>

      {/* Category pills */}
      {categories.map(cat => {
        const count = categoryCounts[cat.id] || 0
        const isActive = activeCategoryFilter === cat.id
        return (
          <button
            key={cat.id}
            role="radio"
            aria-checked={isActive}
            onClick={() => onFilterChange(isActive ? null : cat.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              borderRadius: 10,
              padding: '0 8px',
              background: isActive ? `${cat.color}30` : `${cat.color}1a`,
              border: `1px solid ${isActive ? `${cat.color}80` : `${cat.color}40`}`,
              cursor: 'pointer',
              fontSize: 10,
              color: isActive ? cat.color : 'var(--text-secondary)',
              fontWeight: isActive ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
          >
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
            {cat.name}
            <span style={{ opacity: 0.6, fontSize: 9 }}>({count})</span>
          </button>
        )
      })}

      {/* Manage button */}
      <button
        onClick={onToggleManager}
        title={t('notes.manageCategories')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          height: 20,
          borderRadius: 10,
          padding: '0 6px',
          background: 'none',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          fontSize: 10,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <Settings size={10} />
      </button>
    </div>
  )
}
