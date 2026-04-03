// Regenerate button with model picker — extracted from ChatPanel.tsx (Iteration 441)
import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import { useT } from '../../i18n'

interface RegenerateButtonProps {
  onRegenerate: () => void
  onRegenerateWithModel: (modelId: string) => void
}

export default function RegenerateButton({ onRegenerate, onRegenerateWithModel }: RegenerateButtonProps) {
  const t = useT()
  const [showRegenModels, setShowRegenModels] = useState(false)
  const regenModelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showRegenModels) return
    const handler = (e: MouseEvent) => {
      if (regenModelRef.current && !regenModelRef.current.contains(e.target as Node)) setShowRegenModels(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRegenModels])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px 8px' }}>
      <div ref={regenModelRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={onRegenerate}
          title={`${t('chat.regenerate')} (Ctrl+Shift+R)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px 6px 16px',
            background: 'var(--action-btn-bg)',
            border: '1px solid var(--action-btn-border)',
            borderRight: 'none',
            borderRadius: '20px 0 0 20px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 500,
            transition: 'color 150ms ease, border-color 150ms ease, background 150ms ease',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.color = 'var(--accent)'
            el.style.borderColor = 'var(--accent)'
            el.style.background = 'var(--popup-item-hover)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.color = 'var(--text-muted)'
            el.style.borderColor = 'var(--action-btn-border)'
            el.style.background = 'var(--action-btn-bg)'
          }}
        >
          <RefreshCw size={14} />
          <span>{t('chat.regenerate')}</span>
          <kbd style={{
            fontSize: 9,
            opacity: 0.5,
            fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.06)',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.1)',
            marginLeft: 2,
          }}>Ctrl+Shift+R</kbd>
        </button>
        <button
          onClick={() => setShowRegenModels(!showRegenModels)}
          title={t('chat.regenerateWithModel')}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
            background: showRegenModels ? 'var(--popup-item-hover)' : 'var(--action-btn-bg)',
            border: '1px solid var(--action-btn-border)',
            borderLeft: '1px solid var(--popup-border)',
            borderRadius: '0 20px 20px 0',
            cursor: 'pointer',
            color: showRegenModels ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 12,
            transition: 'color 150ms ease, background 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.background = 'var(--popup-item-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = showRegenModels ? 'var(--accent)' : 'var(--text-muted)'
            e.currentTarget.style.background = showRegenModels ? 'var(--popup-item-hover)' : 'var(--action-btn-bg)'
          }}
        >
          <ChevronDown size={12} />
        </button>
        {showRegenModels && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
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
              {t('chat.regenerateWithModel')}
            </div>
            {MODEL_OPTIONS.map(m => {
              const currentModel = usePrefsStore.getState().prefs.model || 'claude-sonnet-4-6'
              const isCurrent = m.id === currentModel
              return (
                <button
                  key={m.id}
                  onClick={() => { setShowRegenModels(false); onRegenerateWithModel(m.id) }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    padding: '6px 12px',
                    background: 'none',
                    border: 'none',
                    color: isCurrent ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: isCurrent ? 600 : 400,
                    lineHeight: 1.4,
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <span>{t(m.labelKey)}</span>
                  {isCurrent && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t('chat.currentModel')}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
