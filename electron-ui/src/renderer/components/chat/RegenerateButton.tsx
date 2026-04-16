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
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px' }}>
      <div ref={regenModelRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={onRegenerate}
          title={`${t('chat.regenerate')} (Ctrl+Shift+R)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 14px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            cursor: 'pointer',
            color: '#818cf8',
            fontSize: 12,
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
            e.currentTarget.style.color = '#a5b4fc'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = '#818cf8'
          }}
        >
          <RefreshCw size={14} style={{ transition: 'transform 0.15s ease' }} />
          <span>{t('chat.regenerate')}</span>
          <kbd style={{
            fontSize: 9,
            opacity: 0.5,
            fontFamily: 'monospace',
            background: 'var(--bg-hover)',
            padding: '1px 5px',
            borderRadius: 6,
            border: '1px solid var(--border)',
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
            marginLeft: 4,
            background: showRegenModels ? 'rgba(99,102,241,0.18)' : 'var(--bg-hover)',
            border: showRegenModels ? '1px solid rgba(99,102,241,0.40)' : '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            color: showRegenModels ? '#818cf8' : 'rgba(255,255,255,0.55)',
            fontSize: 12,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
            e.currentTarget.style.color = '#818cf8'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = showRegenModels ? 'rgba(99,102,241,0.18)' : 'var(--bg-hover)'
            e.currentTarget.style.borderColor = showRegenModels ? 'rgba(99,102,241,0.40)' : 'var(--border)'
            e.currentTarget.style.color = showRegenModels ? '#818cf8' : 'rgba(255,255,255,0.55)'
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
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
              padding: '4px 0',
              minWidth: 200,
              zIndex: 200,
              animation: 'slideUp 0.15s ease',
            }}
          >
            <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
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
                    background: isCurrent ? 'rgba(99,102,241,0.12)' : 'none',
                    border: 'none',
                    borderLeft: isCurrent ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                    borderRadius: 0,
                    color: isCurrent ? '#818cf8' : 'rgba(255,255,255,0.80)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: isCurrent ? 600 : 400,
                    lineHeight: 1.4,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? 'rgba(99,102,241,0.12)' : 'none' }}
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
