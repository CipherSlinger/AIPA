import React, { useState, useRef, useEffect } from 'react'
import { Gauge } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'

type EffortLevel = 'auto' | 'low' | 'medium' | 'high' | 'max'

const EFFORT_OPTIONS: EffortLevel[] = ['auto', 'low', 'medium', 'high', 'max']

const EFFORT_COLORS: Record<EffortLevel, string> = {
  auto: '#818cf8',   // blue
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
  const [triggerHovered, setTriggerHovered] = useState(false)
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

  // Build trigger button colors from design tokens
  const triggerBg = isNonDefault
    ? triggerHovered ? `${color}33` : `${color}22`
    : triggerHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'
  const triggerBorder = isNonDefault
    ? triggerHovered ? `${color}88` : `${color}55`
    : triggerHovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.09)'
  const triggerColor = isNonDefault ? color : 'rgba(255,255,255,0.60)'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={t('effort.pickerTitle') + ': ' + t(`effort.${currentEffort}`)}
        aria-label={t('effort.pickerTitle')}
        aria-expanded={show}
        onMouseEnter={() => setTriggerHovered(true)}
        onMouseLeave={() => setTriggerHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          background: triggerBg,
          border: `1px solid ${triggerBorder}`,
          borderRadius: 6,
          color: triggerColor,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
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
            background: 'rgba(15,15,25,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            padding: '4px',
            minWidth: 220,
            zIndex: 100,
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{
            padding: '6px 10px 4px',
            fontSize: 10,
            color: 'rgba(255,255,255,0.38)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {t('effort.pickerTitle')}
          </div>
          <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>
            {t('effort.pickerHint')}
          </div>
          {EFFORT_OPTIONS.map(level => {
            const isSelected = level === currentEffort
            const lvlColor = EFFORT_COLORS[level]
            return (
              <EffortOption
                key={level}
                level={level}
                isSelected={isSelected}
                lvlColor={lvlColor}
                label={t(`effort.${level}`)}
                hint={t(`effort.${level}Hint`)}
                onSelect={handleSelect}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface EffortOptionProps {
  level: EffortLevel
  isSelected: boolean
  lvlColor: string
  label: string
  hint: string
  onSelect: (level: EffortLevel) => void
}

function EffortOption({ level, isSelected, lvlColor, label, hint, onSelect }: EffortOptionProps) {
  const [hovered, setHovered] = useState(false)

  const bg = isSelected
    ? 'rgba(99,102,241,0.20)'
    : hovered
    ? 'rgba(255,255,255,0.06)'
    : 'transparent'

  const textColor = isSelected
    ? '#a5b4fc'
    : hovered
    ? 'rgba(255,255,255,0.82)'
    : 'rgba(255,255,255,0.60)'

  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(level)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: bg,
        border: 'none',
        borderLeft: isSelected ? '2px solid rgba(99,102,241,0.40)' : '2px solid transparent',
        borderRadius: 7,
        color: textColor,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: isSelected ? 600 : 500,
        lineHeight: 1.4,
        transition: 'all 0.15s ease',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: lvlColor,
            flexShrink: 0,
            boxShadow: isSelected ? `0 0 6px ${lvlColor}88` : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        </span>
        {isSelected && <span style={{ fontSize: 11, color: '#818cf8' }}>{'✓'}</span>}
      </span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 400, paddingLeft: 15 }}>
        {hint}
      </span>
    </button>
  )
}
