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
        background: 'rgba(0,0,0,0.45)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 10,
          boxShadow: 'var(--popup-shadow)',
          padding: '20px 24px',
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('fork.dialogTitle')}
          </span>
        </div>

        {/* Info */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('fork.dialogInfo', { index: String(msgIdx + 1) })}
        </div>

        {/* Name input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            {t('fork.nameLabel')}
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
            placeholder={t('fork.namePlaceholder')}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '6px 10px',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '6px 14px',
              fontSize: 12,
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 5,
              padding: '6px 14px',
              fontSize: 12,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            <GitBranch size={12} />
            {t('fork.confirm')}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
