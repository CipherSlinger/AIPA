import React, { useState, useRef, useEffect } from 'react'
import { Wand2 } from 'lucide-react'
import { useT } from '../../i18n'
import { toolbarBtnStyle } from './chatInputConstants'

const TRANSFORM_ACTIONS = [
  { id: 'formal', labelKey: 'transform.formal', prompt: 'Rewrite the following text in a more formal, professional tone. Only output the rewritten text, nothing else:\n\n' },
  { id: 'casual', labelKey: 'transform.casual', prompt: 'Rewrite the following text in a more casual, friendly tone. Only output the rewritten text, nothing else:\n\n' },
  { id: 'shorter', labelKey: 'transform.shorter', prompt: 'Make the following text shorter and more concise while keeping the key points. Only output the rewritten text, nothing else:\n\n' },
  { id: 'longer', labelKey: 'transform.longer', prompt: 'Expand the following text with more detail and explanation. Only output the rewritten text, nothing else:\n\n' },
  { id: 'grammar', labelKey: 'transform.grammar', prompt: 'Fix any grammar, spelling, and punctuation errors in the following text. Only output the corrected text, nothing else:\n\n' },
] as const

interface TextTransformMenuProps {
  inputText: string
  onSend: (text: string) => Promise<void>
}

export default function InputToolbarTextTransform({ inputText, onSend }: TextTransformMenuProps) {
  const t = useT()
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const hasText = inputText.trim().length > 0

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => { if (hasText) setShow(!show) }}
        title={t('transform.title')}
        style={{
          ...toolbarBtnStyle,
          color: show ? '#818cf8' : 'var(--text-muted)',
          background: show ? 'rgba(99,102,241,0.12)' : 'transparent',
          opacity: hasText ? 1 : 0.4,
          cursor: hasText ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => { if (hasText) { e.currentTarget.style.color = '#818cf8'; e.currentTarget.style.background = 'rgba(99,102,241,0.12)' } }}
        onMouseLeave={(e) => { e.currentTarget.style.color = show ? '#818cf8' : 'var(--text-muted)'; e.currentTarget.style.background = show ? 'rgba(99,102,241,0.12)' : 'transparent' }}
      >
        <Wand2 size={16} />
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
            padding: '6px 0',
            minWidth: 180,
            zIndex: 100,
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {t('transform.title')}
          </div>
          {TRANSFORM_ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => {
                onSend(action.prompt + inputText.trim())
                setShow(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 7,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1.4,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.color = '#a5b4fc' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
