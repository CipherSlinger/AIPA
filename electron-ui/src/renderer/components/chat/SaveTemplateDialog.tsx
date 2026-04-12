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

const EMPTY_TEMPLATES: never[] = []

export default function SaveTemplateDialog({ onClose }: Props) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const messages = useChatStore(s => s.messages)
  const customTemplates = usePrefsStore(s => s.prefs.customConversationTemplates ?? EMPTY_TEMPLATES)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState(TEMPLATE_EMOJI_PRESETS[0])
  const [category, setCategory] = useState<TemplateCategory>('custom')
  const [nameFocused, setNameFocused] = useState(false)
  const [descFocused, setDescFocused] = useState(false)
  const [cancelHovered, setCancelHovered] = useState(false)
  const [closeHovered, setCloseHovered] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useClickOutside(dialogRef, true, onClose)

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
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.15s ease',
    }}>
      <div
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        style={{
          width: 360, padding: 20,
          background: 'rgba(15,15,25,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.20s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
            {t('convTemplate.saveAsTemplate')}
          </span>
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
            style={{
              background: closeHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Name input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
            display: 'block', marginBottom: 6,
          }}>
            {t('convTemplate.templateName')}
          </label>
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            maxLength={50}
            placeholder={t('convTemplate.templateName')}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'rgba(255,255,255,0.06)',
              border: nameFocused ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6, color: 'rgba(255,255,255,0.82)', outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
            }}
          />
        </div>

        {/* Description input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
            display: 'block', marginBottom: 6,
          }}>
            {t('convTemplate.templateDesc')}
          </label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            onFocus={() => setDescFocused(true)}
            onBlur={() => setDescFocused(false)}
            maxLength={200}
            placeholder={t('convTemplate.templateDesc')}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'rgba(255,255,255,0.06)',
              border: descFocused ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6, color: 'rgba(255,255,255,0.82)', outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
            }}
          />
        </div>

        {/* Emoji picker */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
            display: 'block', marginBottom: 6,
          }}>
            {t('convTemplate.selectEmoji')}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TEMPLATE_EMOJI_PRESETS.map(em => (
              <button
                key={em}
                onClick={() => setEmoji(em)}
                style={{
                  width: 32, height: 32, fontSize: 16,
                  background: emoji === em ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                  border: emoji === em ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* Category selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
            display: 'block', marginBottom: 6,
          }}>
            {t('convTemplate.selectCategory')}
          </label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TEMPLATE_CATEGORIES.filter(c => c.key !== 'custom').map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                style={{
                  padding: '4px 10px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                  fontWeight: 700, letterSpacing: '0.04em',
                  border: category === cat.key ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  background: category === cat.key ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                  color: category === cat.key ? '#818cf8' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s ease',
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
            onMouseEnter={() => setCancelHovered(true)}
            onMouseLeave={() => setCancelHovered(false)}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              background: cancelHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.60)',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              background: name.trim()
                ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'
                : 'rgba(255,255,255,0.06)',
              border: 'none', color: 'rgba(255,255,255,0.95)', fontWeight: 600,
              opacity: !name.trim() ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!name.trim()) return
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              if (!name.trim()) return
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
