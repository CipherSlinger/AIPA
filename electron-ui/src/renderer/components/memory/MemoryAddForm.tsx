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
      padding: '14px 16px',
      background: 'rgba(15,15,25,0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      marginBottom: 6,
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.60)',
        marginBottom: 8,
      }}>
        {t('memory.addTitle')}
      </div>
      <textarea
        value={newContent}
        onChange={e => onContentChange(e.target.value)}
        placeholder={t('memory.addPlaceholder')}
        maxLength={MAX_CONTENT_LENGTH}
        autoFocus
        style={{
          width: '100%',
          minHeight: 80,
          padding: '7px 10px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6,
          fontSize: 13,
          color: 'rgba(255,255,255,0.82)',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'monospace',
          lineHeight: 1.6,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45)'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
          e.currentTarget.style.boxShadow = 'none'
        }}
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
        marginTop: 8,
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
              fontWeight: 600,
              transition: 'all 0.15s ease',
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
              background: 'rgba(15,15,25,0.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
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
                    background: newCategory === cat ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    color: CATEGORY_CONFIG[cat].color,
                    fontSize: 11,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (newCategory !== cat) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={e => {
                    if (newCategory !== cat) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {CATEGORY_CONFIG[cat].icon}
                  {t(CATEGORY_CONFIG[cat].labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Character counter */}
          <span style={{
            fontSize: 10,
            color: newContent.length > MAX_CONTENT_LENGTH * 0.9 ? '#fbbf24' : 'rgba(255,255,255,0.38)',
            alignSelf: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {newContent.length}/{MAX_CONTENT_LENGTH}
          </span>
          {/* Cancel button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              color: 'rgba(255,255,255,0.60)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            {t('memory.cancel')}
          </button>
          {/* Save/add button */}
          <button
            onClick={onSave}
            disabled={!newContent.trim()}
            style={{
              background: newContent.trim()
                ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'
                : 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: newContent.trim() ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
              cursor: newContent.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
              boxShadow: newContent.trim() ? '0 2px 8px rgba(99,102,241,0.30)' : 'none',
            }}
            onMouseEnter={e => { if (newContent.trim()) { e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = newContent.trim() ? '0 2px 8px rgba(99,102,241,0.30)' : 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {t('memory.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
