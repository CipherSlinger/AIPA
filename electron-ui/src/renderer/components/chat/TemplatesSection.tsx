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
        <FileText size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginRight: 4 }}>
          {t('convTemplate.section')}
        </span>
        {/* "All" pill */}
        <button
          onClick={() => setActiveCategory('all')}
          style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
            border: activeCategory === 'all' ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.10)',
            background: activeCategory === 'all' ? 'rgba(99,102,241,0.20)' : 'rgba(255,255,255,0.06)',
            color: activeCategory === 'all' ? '#818cf8' : 'var(--text-muted)',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            transition: 'all 0.15s ease',
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
              border: activeCategory === cat.key ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.10)',
              background: activeCategory === cat.key ? 'rgba(99,102,241,0.20)' : 'rgba(255,255,255,0.06)',
              color: activeCategory === cat.key ? '#818cf8' : 'var(--text-muted)',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              transition: 'all 0.15s ease',
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
            <div
              key={tpl.id}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
                background: 'var(--bg-hover)', border: '1px solid var(--glass-border)',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s ease',
                position: 'relative',
                boxShadow: '0 2px 8px rgba(0,0,0,0)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = 'var(--glass-border)';
                el.style.borderColor = 'rgba(255,255,255,0.12)';
                el.style.transform = 'translateY(-1px)';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = 'var(--bg-hover)';
                el.style.borderColor = 'var(--glass-border)';
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{tpl.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)', marginTop: 3,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    lineHeight: 1.5,
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
                      color: 'var(--text-muted)', padding: 2, borderRadius: 6,
                      opacity: 0, transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {/* Use CTA button */}
              <button
                onClick={() => handleUse(tpl)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '4px 12px',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                  border: 'none',
                  borderRadius: 20,
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.filter = 'brightness(0.95)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.filter = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {t('convTemplate.use') || 'Use'}
              </button>
            </div>
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
