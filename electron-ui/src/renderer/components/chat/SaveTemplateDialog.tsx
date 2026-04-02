// SaveTemplateDialog — dialog for saving current conversation as a template (Iteration 416)
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore, useChatStore } from '../../store'
import { TEMPLATE_EMOJI_PRESETS, TEMPLATE_CATEGORIES, MAX_CUSTOM_TEMPLATES, type TemplateCategory } from './conversationTemplates'
import type { CustomConversationTemplate } from '../../types/app.types'
import { useClickOutside } from '../../hooks/useClickOutside'

interface Props {
  onClose: () => void
}

export default function SaveTemplateDialog({ onClose }: Props) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const messages = useChatStore(s => s.messages)
  const customTemplates = usePrefsStore(s => s.prefs.customConversationTemplates) || []

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState(TEMPLATE_EMOJI_PRESETS[0])
  const [category, setCategory] = useState<TemplateCategory>('custom')
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useClickOutside(dialogRef, onClose)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Get the first user message as the initial prompt
  const firstUserMsg = messages.find(m => m.role === 'user')
  const initialPrompt = firstUserMsg && 'content' in firstUserMsg ? String(firstUserMsg.content).slice(0, 500) : ''

  const handleSave = useCallback(() => {
    if (!name.trim()) return
    if (!initialPrompt) {
      addToast('warning', t('convTemplate.noMessages'))
      return
    }
    if (customTemplates.length >= MAX_CUSTOM_TEMPLATES) {
      addToast('warning', t('convTemplate.maxReached'))
      return
    }

    const newTemplate: CustomConversationTemplate = {
      id: `ctpl-${Date.now()}`,
      emoji,
      title: name.trim().slice(0, 50),
      description: description.trim().slice(0, 200),
      category,
      initialPrompt,
      createdAt: Date.now(),
    }

    const updated = [...customTemplates, newTemplate]
    usePrefsStore.getState().setPrefs({ customConversationTemplates: updated })
    window.electronAPI?.prefsSet('customConversationTemplates', updated)
    addToast('success', t('convTemplate.saved'))
    onClose()
  }, [name, description, emoji, category, initialPrompt, customTemplates, addToast, t, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') onClose()
  }, [handleSave, onClose])

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        style={{
          width: 340, padding: 20, background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('convTemplate.saveAsTemplate')}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Name input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('convTemplate.templateName')}
          </label>
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            placeholder={t('convTemplate.templateName')}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Description input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('convTemplate.templateDesc')}
          </label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={200}
            placeholder={t('convTemplate.templateDesc')}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Emoji picker */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('convTemplate.selectEmoji')}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TEMPLATE_EMOJI_PRESETS.map(em => (
              <button
                key={em}
                onClick={() => setEmoji(em)}
                style={{
                  width: 32, height: 32, fontSize: 16, background: emoji === em ? 'var(--accent)' : 'var(--card-bg)',
                  border: emoji === em ? '2px solid var(--accent)' : '1px solid var(--card-border)',
                  borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* Category selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('convTemplate.selectCategory')}
          </label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TEMPLATE_CATEGORIES.filter(c => c.key !== 'custom').map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                  border: category === cat.key ? '1px solid var(--accent)' : '1px solid var(--card-border)',
                  background: category === cat.key ? 'var(--accent)' : 'transparent',
                  color: category === cat.key ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {t(cat.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--card-border)',
              color: 'var(--text-muted)', transition: 'all 0.15s',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: name.trim() ? 'pointer' : 'not-allowed',
              background: name.trim() ? 'var(--accent)' : 'var(--card-bg)',
              border: 'none', color: '#fff', fontWeight: 600,
              opacity: name.trim() ? 1 : 0.5, transition: 'all 0.15s',
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
