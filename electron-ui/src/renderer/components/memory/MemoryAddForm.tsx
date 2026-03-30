import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MemoryCategory } from '../../types/app.types'
import { CATEGORY_CONFIG, CATEGORIES, MAX_CONTENT_LENGTH } from './memoryConstants'

interface MemoryAddFormProps {
  t: (key: string) => string
  newContent: string
  newCategory: MemoryCategory
  autoSuggested: boolean
  onContentChange: (content: string) => void
  onCategoryChange: (cat: MemoryCategory) => void
  onAutoSuggestedChange: (v: boolean) => void
  onSave: () => void
  onClose: () => void
}

export default function MemoryAddForm({
  t, newContent, newCategory, autoSuggested,
  onContentChange, onCategoryChange, onAutoSuggestedChange,
  onSave, onClose,
}: MemoryAddFormProps) {
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.03)',
      flexShrink: 0,
    }}>
      <textarea
        value={newContent}
        onChange={e => onContentChange(e.target.value)}
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
            onSave()
          }
          if (e.key === 'Escape') {
            onClose()
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
            onClick={() => setShowDropdown(!showDropdown)}
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
            {!autoSuggested && newContent.trim().length > 10 && (
              <span style={{ fontSize: 8, opacity: 0.7, fontStyle: 'italic' }}>({t('memory.autoCategory')})</span>
            )}
            <ChevronDown size={10} />
          </button>
          {showDropdown && (
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
                    onCategoryChange(cat)
                    onAutoSuggestedChange(true)
                    setShowDropdown(false)
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
            onClick={onClose}
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
            onClick={onSave}
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
  )
}
