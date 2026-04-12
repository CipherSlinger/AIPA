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
            borderRadius: 20,
            padding: '0 8px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.09)',
            cursor: 'pointer',
            fontSize: 10,
            color: 'rgba(255,255,255,0.60)',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)' }}
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
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
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
          borderRadius: 20,
          padding: '0 10px',
          background: activeCategoryFilter === null ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.20))' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${activeCategoryFilter === null ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.09)'}`,
          cursor: 'pointer',
          fontSize: 11,
          color: activeCategoryFilter === null ? '#a5b4fc' : 'rgba(255,255,255,0.60)',
          fontWeight: activeCategoryFilter === null ? 600 : 400,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          if (activeCategoryFilter !== null) {
            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
          }
        }}
        onMouseLeave={e => {
          if (activeCategoryFilter !== null) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
          }
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
              borderRadius: 20,
              padding: '3px 10px',
              background: isActive ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.20))' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isActive ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.09)'}`,
              cursor: 'pointer',
              fontSize: 11,
              color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.60)',
              fontWeight: isActive ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
              }
            }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
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
          borderRadius: 20,
          padding: '0 6px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.09)',
          cursor: 'pointer',
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
      >
        <Settings size={10} />
      </button>
    </div>
  )
}
