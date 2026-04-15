import React, { useState, useRef, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'

const STYLE_OPTIONS = ['default', 'explanatory', 'learning'] as const

export default function InputToolbarStyleSelector() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const [show, setShow] = useState(false)
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const currentStyle = prefs.outputStyle || 'default'

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  const handleSelect = (style: string) => {
    setPrefs({ outputStyle: style as any })
    window.electronAPI.prefsSet('outputStyle', style)
    setShow(false)
  }

  const isActive = currentStyle !== 'default'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={t('outputStyle.title')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '3px 8px',
          background: isActive ? 'rgba(99,102,241,0.14)' : 'var(--bg-hover)',
          border: `1px solid ${isActive ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
          borderRadius: 6,
          color: isActive ? '#818cf8' : 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 11,
          flexShrink: 0,
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.14)' : 'var(--bg-hover)'
          e.currentTarget.style.color = isActive ? '#818cf8' : 'var(--text-secondary)'
          e.currentTarget.style.borderColor = isActive ? 'rgba(99,102,241,0.3)' : 'var(--border)'
        }}
      >
        <Sparkles size={11} />
        {t(`outputStyle.${currentStyle}`)}
      </button>
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: '4px',
            minWidth: 200,
            zIndex: 100,
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{
            padding: '4px 10px 6px',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--text-muted)',
          }}>
            {t('outputStyle.title')}
          </div>
          {STYLE_OPTIONS.map(style => {
            const isSelected = style === currentStyle
            return (
              <button
                key={style}
                onClick={() => handleSelect(style)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 7,
                  background: isSelected ? 'rgba(99,102,241,0.12)' : 'none',
                  border: 'none',
                  borderLeft: isSelected ? '2px solid rgba(99,102,241,0.6)' : '2px solid transparent',
                  color: isSelected ? '#818cf8' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 400,
                  lineHeight: 1.4,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? 'rgba(99,102,241,0.12)' : 'none'
                  e.currentTarget.style.color = isSelected ? '#818cf8' : 'var(--text-secondary)'
                }}
              >
                <span style={{
                  width: 16, height: 16, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0,
                }}>
                  <Sparkles size={12} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span>{t(`outputStyle.${style}`)}</span>
                    {isSelected && <span style={{ fontSize: 11 }}>{'\u2713'}</span>}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {t(`outputStyle.${style}.desc`)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
