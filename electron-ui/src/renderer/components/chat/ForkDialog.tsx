import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore } from '../../store'

interface ForkDialogProps {
  msgIdx: number
  sessionId: string | null
  onConfirm: (msgIdx: number) => void
  onCancel: () => void
}

export default function ForkDialog({ msgIdx, sessionId, onConfirm, onCancel }: ForkDialogProps) {
  const t = useT()
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const defaultName = currentSessionTitle
    ? `${currentSessionTitle} (${t('fork.forkSuffix')})`
    : t('fork.defaultName')
  const [name, setName] = useState(defaultName)
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const handleConfirm = () => {
    onConfirm(msgIdx)
  }

  const dialog = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: 'rgba(15,15,25,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.15s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <GitBranch size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.82)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
            {t('fork.dialogTitle')}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Info */}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
            {t('fork.dialogInfo', { index: String(msgIdx + 1) })}
          </div>

          {/* Name input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.38)',
              }}
            >
              {t('fork.nameLabel')}
            </label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={t('fork.namePlaceholder')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${inputFocused ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)'}`,
                boxShadow: inputFocused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
                borderRadius: 6,
                padding: '7px 10px',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 13,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box' as const,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.60)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.95)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <GitBranch size={12} />
              {t('fork.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
