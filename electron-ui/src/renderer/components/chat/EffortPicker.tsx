import React, { useState, useRef, useEffect } from 'react'
import { Gauge } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'

type EffortLevel = 'auto' | 'low' | 'medium' | 'high' | 'max'

const EFFORT_OPTIONS: EffortLevel[] = ['auto', 'low', 'medium', 'high', 'max']

const EFFORT_COLORS: Record<EffortLevel, string> = {
  auto: '#60a5fa',   // blue
  low: '#4ade80',    // green
  medium: '#fbbf24', // yellow
  high: '#fb923c',   // orange
  max: '#f87171',    // red
}

const EFFORT_ABBREVIATIONS: Record<EffortLevel, string> = {
  auto: 'A',
  low: 'L',
  medium: 'M',
  high: 'H',
  max: 'X',
}

export default function EffortPicker() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToast = useUiStore(s => s.addToast)
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentEffort = (prefs.effortLevel || 'auto') as EffortLevel

  // Close dropdown on outside click
  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  // Keyboard navigation
  useEffect(() => {
    if (!show) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShow(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [show])

  const handleSelect = (level: EffortLevel) => {
    setPrefs({ effortLevel: level })
    window.electronAPI.prefsSet('effortLevel', level)
    addToast('info', t('effort.switched', { level: t(`effort.${level}`) }))
    setShow(false)
  }

  const color = EFFORT_COLORS[currentEffort]
  const isNonDefault = currentEffort !== 'auto'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={t('effort.pickerTitle') + ': ' + t(`effort.${currentEffort}`)}
        aria-label={t('effort.pickerTitle')}
        aria-expanded={show}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          background: isNonDefault ? `${color}14` : 'none',
          border: `1px solid ${isNonDefault ? color : 'var(--border)'}`,
          borderRadius: 10,
          color: isNonDefault ? color : 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 9,
          flexShrink: 0,
          transition: 'border-color 150ms, color 150ms, background 150ms',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = isNonDefault ? color : 'var(--border)'; e.currentTarget.style.color = isNonDefault ? color : 'var(--text-muted)' }}
      >
        <Gauge size={9} />
        <span style={{ fontWeight: 600 }}>{EFFORT_ABBREVIATIONS[currentEffort]}</span>
        {t(`effort.${currentEffort}`)}
      </button>
      {show && (
        <div
          className="popup-enter"
          role="listbox"
          aria-label={t('effort.pickerTitle')}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: '4px 0',
            minWidth: 220,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('effort.pickerTitle')}
          </div>
          <div style={{ padding: '0 12px 4px', fontSize: 10, color: 'var(--text-muted)', opacity: 0.8 }}>
            {t('effort.pickerHint')}
          </div>
          {EFFORT_OPTIONS.map(level => (
            <button
              key={level}
              role="option"
              aria-selected={level === currentEffort}
              onClick={() => handleSelect(level)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: level === currentEffort ? 'var(--popup-item-hover)' : 'none',
                border: 'none',
                color: level === currentEffort ? EFFORT_COLORS[level] : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: level === currentEffort ? 600 : 400,
                lineHeight: 1.4,
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = level === currentEffort ? 'var(--popup-item-hover)' : 'none' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: EFFORT_COLORS[level],
                    flexShrink: 0,
                  }} />
                  {t(`effort.${level}`)}
                </span>
                {level === currentEffort && <span style={{ fontSize: 11 }}>{'\u2713'}</span>}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, paddingLeft: 14 }}>
                {t(`effort.${level}Hint`)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
