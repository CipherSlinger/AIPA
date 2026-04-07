// TemplatesSection — conversation template cards on WelcomeScreen (Iteration 416)
import React, { useState, useMemo, useCallback } from 'react'
import { FileText, X } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import {
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type ConversationTemplate,
  type CustomConversationTemplate,
  type AnyTemplate,
  type TemplateCategory,
} from './conversationTemplates'

interface Props {
  onUseTemplate: (prompt: string) => void
}

const EMPTY_TEMPLATES: never[] = []

export default function TemplatesSection({ onUseTemplate }: Props) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const customTemplates = usePrefsStore(s => s.prefs.customConversationTemplates ?? EMPTY_TEMPLATES)
  const [activeCategory, setActiveCategory] = useState<'all' | TemplateCategory>('all')

  const allTemplates = useMemo(() => {
    const builtIn: AnyTemplate[] = BUILT_IN_TEMPLATES
    const custom: AnyTemplate[] = customTemplates.map(ct => ({ ...ct, isBuiltIn: false as const }))
    return [...builtIn, ...custom]
  }, [customTemplates])

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return allTemplates
    return allTemplates.filter(tpl => tpl.category === activeCategory)
  }, [allTemplates, activeCategory])

  const handleUse = useCallback((tpl: AnyTemplate) => {
    if (tpl.isBuiltIn) {
      onUseTemplate(t(tpl.promptKey))
    } else {
      onUseTemplate((tpl as CustomConversationTemplate).initialPrompt)
    }
  }, [onUseTemplate, t])

  const handleDeleteCustom = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const updated = customTemplates.filter(ct => ct.id !== id)
    usePrefsStore.getState().setPrefs({ customConversationTemplates: updated })
    window.electronAPI?.prefsSet('customConversationTemplates', updated)
    addToast('success', t('convTemplate.deleted'))
  }, [customTemplates, addToast, t])

  if (allTemplates.length === 0) return null

  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      {/* Header + category pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <FileText size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginRight: 4 }}>
          {t('convTemplate.section')}
        </span>
        {/* "All" pill */}
        <button
          onClick={() => setActiveCategory('all')}
          style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
            border: activeCategory === 'all' ? '1px solid var(--accent)' : '1px solid var(--card-border)',
            background: activeCategory === 'all' ? 'var(--accent)' : 'transparent',
            color: activeCategory === 'all' ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
        >
          {t('convTemplate.all')}
        </button>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            style={{
              padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
              border: activeCategory === cat.key ? '1px solid var(--accent)' : '1px solid var(--card-border)',
              background: activeCategory === cat.key ? 'var(--accent)' : 'transparent',
              color: activeCategory === cat.key ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Template cards — 2-col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {filtered.map(tpl => {
          const title = tpl.isBuiltIn ? t((tpl as ConversationTemplate).titleKey) : (tpl as CustomConversationTemplate).title
          const desc = tpl.isBuiltIn ? t((tpl as ConversationTemplate).descriptionKey) : (tpl as CustomConversationTemplate).description
          const isCustom = !tpl.isBuiltIn

          return (
            <button
              key={tpl.id}
              onClick={() => handleUse(tpl)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{tpl.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {title}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--text-muted)', marginTop: 2,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  lineHeight: 1.4,
                }}>
                  {desc}
                </div>
              </div>
              {isCustom && (
                <button
                  onClick={e => handleDeleteCustom(e, tpl.id)}
                  title={t('convTemplate.deleted')}
                  className="tpl-delete-btn"
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2, borderRadius: 3,
                    opacity: 0, transition: 'opacity 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              )}
            </button>
          )
        })}
      </div>

      {/* CSS for showing delete button on hover */}
      <style>{`
        button:hover .tpl-delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
