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
          padding: '2px 8px',
          background: isActive ? 'rgba(0, 122, 204, 0.08)' : 'none',
          border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 10,
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 9,
          flexShrink: 0,
          transition: 'border-color 150ms, color 150ms, background 150ms',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)'; e.currentTarget.style.color = isActive ? 'var(--accent)' : 'var(--text-muted)' }}
      >
        <Sparkles size={9} />
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
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: '4px 0',
            minWidth: 200,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('outputStyle.title')}
          </div>
          {STYLE_OPTIONS.map(style => (
            <button
              key={style}
              onClick={() => handleSelect(style)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: style === currentStyle ? 'var(--popup-item-hover)' : 'none',
                border: 'none',
                color: style === currentStyle ? 'var(--accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: style === currentStyle ? 600 : 400,
                lineHeight: 1.4,
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = style === currentStyle ? 'var(--popup-item-hover)' : 'none' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>{t(`outputStyle.${style}`)}</span>
                {style === currentStyle && <span style={{ fontSize: 11 }}>{'\u2713'}</span>}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                {t(`outputStyle.${style}.desc`)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
