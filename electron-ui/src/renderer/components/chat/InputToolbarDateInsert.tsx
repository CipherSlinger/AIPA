import React, { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { useT } from '../../i18n'
import { toolbarBtnStyle } from './chatInputConstants'

interface DateTimeInsertProps {
  onInsert: (text: string) => void
}

export default function InputToolbarDateInsert({ onInsert }: DateTimeInsertProps) {
  const t = useT()
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  const now = new Date()
  const items = [
    { label: t('datetime.today'), value: now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: t('datetime.now'), value: now.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { label: t('datetime.time'), value: now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) },
    { label: t('datetime.tomorrow'), value: new Date(now.getTime() + 86400000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) },
    { label: t('datetime.yesterday'), value: new Date(now.getTime() - 86400000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) },
    { label: t('datetime.weekday'), value: now.toLocaleDateString(undefined, { weekday: 'long' }) },
    { label: t('datetime.iso'), value: now.toISOString().slice(0, 10) },
  ]

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={t('datetime.insertDate')}
        style={{
          ...toolbarBtnStyle,
          color: show ? 'var(--accent)' : 'var(--input-toolbar-icon)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0, 122, 204, 0.10)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = show ? 'var(--accent)' : 'var(--input-toolbar-icon)'; e.currentTarget.style.background = 'none' }}
      >
        <Calendar size={16} />
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
            maxWidth: 320,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('datetime.insertDate')}
          </div>
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => {
                onInsert(item.value)
                setShow(false)
              }}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1.4,
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{item.label}</span>
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
