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
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      position: 'relative',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
        {t('notes.categoryLabel')}:
      </span>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={onToggleDropdown}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          {noteCategory && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: noteCategory.color, flexShrink: 0 }} />
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
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
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
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--action-btn-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 14, textAlign: 'center' }}>
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
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--action-btn-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: 14, textAlign: 'center' }}>
                  {note.categoryId === cat.id && <Check size={12} />}
                </span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
