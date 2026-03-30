import React from 'react'
import {
  Brain,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useT } from '../../i18n'
import { CATEGORY_CONFIG, CATEGORIES, MAX_MEMORIES } from './memoryConstants'
import { useMemoryCrud } from './useMemoryCrud'
import MemoryAddForm from './MemoryAddForm'
import MemoryItemCard from './MemoryItemCard'

export default function MemoryPanel() {
  const t = useT()
  const crud = useMemoryCrud()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-sessionpanel)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 12px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.06) 0%, transparent 100%)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Brain size={16} style={{ color: 'var(--accent)' }} />
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              {t('memory.title')}
            </span>
            <span style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              background: 'var(--input-field-bg)',
              borderRadius: 8,
              padding: '1px 6px',
            }}>
              {crud.memories.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => crud.setShowAddForm(!crud.showAddForm)}
              aria-label={t('memory.addNew')}
              title={t('memory.addNew')}
              style={{
                background: crud.showAddForm ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: 4,
                cursor: 'pointer',
                color: crud.showAddForm ? '#fff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} />
            </button>
            {crud.memories.length > 0 && (
              <button
                onClick={() => crud.clearAllMemories(t)}
                aria-label={t('memory.clearAll')}
                title={t('memory.clearAll')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  padding: 4,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <Search size={12} style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={crud.searchQuery}
            onChange={e => crud.setSearchQuery(e.target.value)}
            placeholder={t('memory.searchPlaceholder')}
            style={{
              width: '100%',
              height: 28,
              paddingLeft: 26,
              paddingRight: crud.searchQuery.trim() ? 56 : 8,
              background: 'var(--input-field-bg)',
              border: '1px solid var(--input-field-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-field-border)')}
          />
          {crud.searchQuery.trim() && (
            <span style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 9,
              color: crud.filteredMemories.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: 500,
              pointerEvents: 'none',
            }}>
              {t('memory.searchResults', { count: String(crud.filteredMemories.length) })}
            </span>
          )}
        </div>

        {/* Category filter pills */}
        <div style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => crud.setFilterCategory('all')}
            style={{
              background: crud.filterCategory === 'all' ? 'var(--accent)' : 'var(--input-field-bg)',
              color: crud.filterCategory === 'all' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 10,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {t('memory.all')} ({crud.categoryCounts.all})
          </button>
          {CATEGORIES.map(cat => {
            const cfg = CATEGORY_CONFIG[cat]
            return (
              <button
                key={cat}
                onClick={() => crud.setFilterCategory(crud.filterCategory === cat ? 'all' : cat)}
                style={{
                  background: crud.filterCategory === cat ? `${cfg.color}20` : 'var(--input-field-bg)',
                  color: crud.filterCategory === cat ? cfg.color : 'var(--text-muted)',
                  border: crud.filterCategory === cat ? `1px solid ${cfg.color}40` : '1px solid transparent',
                  borderRadius: 10,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'all 0.15s ease',
                }}
              >
                {cfg.icon}
                {t(cfg.labelKey)} ({crud.categoryCounts[cat] || 0})
              </button>
            )
          })}
        </div>
      </div>

      {/* Add form */}
      {crud.showAddForm && (
        <MemoryAddForm
          t={t}
          newContent={crud.newContent}
          newCategory={crud.newCategory}
          autoSuggested={crud.autoSuggested}
          onContentChange={crud.handleNewContentChange}
          onCategoryChange={crud.setNewCategory}
          onAutoSuggestedChange={crud.setAutoSuggested}
          onSave={() => crud.addMemory(t)}
          onClose={() => { crud.setShowAddForm(false); crud.handleNewContentChange(''); crud.setAutoSuggested(false) }}
        />
      )}

      {/* Memory list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
      }}>
        {crud.filteredMemories.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60%',
            color: 'var(--text-muted)',
            gap: 8,
          }}>
            <Brain size={32} style={{ opacity: 0.3, animation: 'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12 }}>
              {crud.memories.length === 0
                ? t('memory.emptyState')
                : t('memory.noResults')
              }
            </span>
            {crud.memories.length === 0 && (
              <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center', padding: '0 20px' }}>
                {t('memory.emptyHint')}
              </span>
            )}
          </div>
        ) : (
          crud.filteredMemories.map(mem => (
            <MemoryItemCard
              key={mem.id}
              mem={mem}
              t={t}
              searchQuery={crud.searchQuery}
              isEditing={crud.editingId === mem.id}
              editContent={crud.editContent}
              editCategory={crud.editCategory}
              onEditContentChange={crud.setEditContent}
              onEditCategoryChange={crud.setEditCategory}
              onStartEdit={() => crud.startEdit(mem)}
              onSaveEdit={() => crud.saveEdit(t)}
              onCancelEdit={crud.cancelEdit}
              onTogglePin={() => crud.togglePin(mem.id)}
              onDelete={() => crud.deleteMemory(mem.id, t)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {t('memory.footer', { count: String(crud.memories.length), max: String(MAX_MEMORIES) })}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
          {t('memory.inspired')}
        </span>
      </div>

      {/* CSS for hover actions and animations */}
      <style>{`
        div:hover > .memory-item-actions {
          display: flex !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
