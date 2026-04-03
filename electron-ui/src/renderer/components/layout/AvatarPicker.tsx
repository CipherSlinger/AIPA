// AvatarPicker — dropdown for selecting preset avatars (Luo Xiaohei theme)
// Iteration 413 → Portal refactor Iteration 461

import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { AVATAR_PRESETS } from './avatarPresets'
export type { AvatarPreset } from './avatarPresets'

interface AvatarPickerProps {
  onClose: () => void
  navExpanded: boolean
  anchorRef: React.RefObject<HTMLDivElement>
}

export default function AvatarPicker({ onClose, navExpanded, anchorRef }: AvatarPickerProps) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const currentPreset = usePrefsStore(s => s.prefs.avatarPreset)

  // Calculate position based on anchor element
  const getPosition = useCallback(() => {
    if (!anchorRef.current) return { left: 0, bottom: 0 }
    const rect = anchorRef.current.getBoundingClientRect()
    return {
      left: rect.left,
      bottom: window.innerHeight - rect.top + 6,
    }
  }, [anchorRef])

  const [pos, setPos] = useState(getPosition)

  // Recalculate on resize
  useEffect(() => {
    const handleResize = () => setPos(getPosition())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [getPosition])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout to avoid immediately closing from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const selectPreset = (presetId: string | null) => {
    const value = presetId === currentPreset ? undefined : presetId  // toggle off if same
    usePrefsStore.getState().setPrefs({ avatarPreset: value || undefined })
    window.electronAPI.prefsSet('avatarPreset', value || null)
    onClose()
  }

  return ReactDOM.createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.left,
        bottom: pos.bottom,
        width: 200,
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        borderRadius: 8,
        boxShadow: 'var(--popup-shadow)',
        padding: 8,
        zIndex: 10000,
        animation: 'popup-in 0.12s ease',
      }}
    >
      {/* Title */}
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
        paddingLeft: 4,
      }}>
        {t('avatar.choose')}
      </div>

      {/* Grid of presets */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
      }}>
        {/* Default (no preset) */}
        <button
          onClick={() => selectPreset(null)}
          title={t('avatar.default')}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: !currentPreset ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'var(--avatar-ai)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 16,
            transition: 'transform 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <span style={{ fontSize: 14, color: '#ffffff' }}>U</span>
        </button>

        {AVATAR_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => selectPreset(preset.id)}
            title={t(preset.nameKey)}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: currentPreset === preset.id ? '2px solid var(--accent)' : `2px solid ${preset.border}`,
              background: preset.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              transition: 'transform 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {preset.emoji}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
