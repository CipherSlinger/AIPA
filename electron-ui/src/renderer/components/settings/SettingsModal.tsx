// Settings modal overlay — renders SettingsPanel in a centered overlay
// instead of the cramped sidebar. Iteration 341.

import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useUiStore } from '../../store'
import { useT } from '../../i18n'

// Lazy-load SettingsPanel (same chunk as sidebar version)
const SettingsPanel = React.lazy(() => import('./SettingsPanel'))

export default function SettingsModal() {
  const isOpen = useUiStore(s => s.settingsModalOpen)
  const close = useUiStore(s => s.closeSettingsModal)
  const t = useT()
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isOpen, close])

  if (!isOpen) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) close()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        animation: 'settings-modal-fade-in 0.2s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        style={{
          width: '90%',
          maxWidth: 720,
          height: '85%',
          maxHeight: 700,
          background: 'var(--bg-sessionpanel)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          animation: 'settings-modal-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Close button */}
        <button
          onClick={close}
          aria-label={t('settings.close') || 'Close'}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 6,
            border: 'none',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
            e.currentTarget.style.color = '#ef4444'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <X size={14} />
        </button>

        {/* SettingsPanel content — fills the modal */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <React.Suspense
            fallback={
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--text-muted)', fontSize: 12,
              }}>
                <div style={{
                  width: 20, height: 20,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              </div>
            }
          >
            <SettingsPanel />
          </React.Suspense>
        </div>
      </div>

      <style>{`
        @keyframes settings-modal-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes settings-modal-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
