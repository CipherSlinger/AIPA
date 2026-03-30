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
          color: show ? 'var(--accent)' : 'var(--input-toolbar-icon)',
          opacity: hasText ? 1 : 0.4,
          cursor: hasText ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => { if (hasText) { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0, 122, 204, 0.10)' } }}
        onMouseLeave={(e) => { e.currentTarget.style.color = show ? 'var(--accent)' : 'var(--input-toolbar-icon)'; e.currentTarget.style.background = 'none' }}
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
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: '4px 0',
            minWidth: 180,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
