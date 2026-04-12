import React, { useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'

interface NoteCategorySelectorProps {
  note: Note
  categories: NoteCategory[]
  showDropdown: boolean
  noteCategory: NoteCategory | undefined
  onSetCategory: (categoryId: string | undefined) => void
  onToggleDropdown: () => void
}

export default function NoteCategorySelector({
  note,
  categories,
  showDropdown,
  noteCategory,
  onSetCategory,
  onToggleDropdown,
}: NoteCategorySelectorProps) {
  const t = useT()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onToggleDropdown()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown, onToggleDropdown])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      position: 'relative',
    }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
        {t('notes.categoryLabel')}:
      </span>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={onToggleDropdown}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            color: 'rgba(255,255,255,0.82)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
            e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          }}
        >
          {noteCategory && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: noteCategory.color, flexShrink: 0 }} />
          )}
          <span>{noteCategory ? noteCategory.name : t('notes.uncategorized')}</span>
          <ChevronDown size={10} style={{ opacity: 0.5 }} />
        </button>

        {/* Category dropdown menu */}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 160,
            background: 'rgba(15,15,25,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 100,
            animation: 'slideUp 0.15s ease',
            padding: '4px 0',
          }}>
            {/* Uncategorized option */}
            <button
              role="option"
              aria-selected={!note.categoryId}
              onClick={() => onSetCategory(undefined)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 12px',
                background: !note.categoryId ? 'rgba(99,102,241,0.12)' : 'none',
                border: 'none',
                color: !note.categoryId ? '#818cf8' : 'rgba(255,255,255,0.45)',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (note.categoryId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = !note.categoryId ? 'rgba(99,102,241,0.12)' : 'transparent' }}
            >
              <span style={{ width: 14, textAlign: 'center', color: '#818cf8' }}>
                {!note.categoryId && <Check size={12} />}
              </span>
              {t('notes.uncategorized')}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                role="option"
                aria-selected={note.categoryId === cat.id}
                onClick={() => onSetCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 12px',
                  background: note.categoryId === cat.id ? 'rgba(99,102,241,0.12)' : 'none',
                  border: 'none',
                  color: note.categoryId === cat.id ? '#818cf8' : 'rgba(255,255,255,0.82)',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { if (note.categoryId !== cat.id) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = note.categoryId === cat.id ? 'rgba(99,102,241,0.12)' : 'transparent' }}
              >
                <span style={{ width: 14, textAlign: 'center', color: '#818cf8' }}>
                  {note.categoryId === cat.id && <Check size={12} />}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
