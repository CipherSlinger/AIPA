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
        width: 220,
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        padding: 10,
        zIndex: 10000,
        animation: 'slideUp 0.15s ease',
      }}
    >
      {/* Title */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 10,
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
            width: 36,
            height: 36,
            borderRadius: 8,
            border: !currentPreset ? '1px solid rgba(99,102,241,0.70)' : '1px solid var(--border)',
            background: !currentPreset ? 'rgba(99,102,241,0.12)' : 'var(--bg-hover)',
            boxShadow: !currentPreset ? '0 0 0 2px rgba(99,102,241,0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 16,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (currentPreset) {
              e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
            }
          }}
          onMouseLeave={(e) => {
            if (currentPreset) {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>U</span>
        </button>

        {AVATAR_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => selectPreset(preset.id)}
            title={t(preset.nameKey)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: currentPreset === preset.id ? '1px solid rgba(99,102,241,0.70)' : '1px solid var(--border)',
              background: currentPreset === preset.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-hover)',
              boxShadow: currentPreset === preset.id ? '0 0 0 2px rgba(99,102,241,0.25)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (currentPreset !== preset.id) {
                e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
              }
            }}
            onMouseLeave={(e) => {
              if (currentPreset !== preset.id) {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }
            }}
          >
            {preset.emoji}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
