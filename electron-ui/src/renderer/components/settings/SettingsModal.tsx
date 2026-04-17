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
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
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
          background: 'var(--glass-bg-deep)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border-md)',
          borderRadius: 16,
          boxShadow: 'var(--glass-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          animation: 'slideUp 0.15s ease',
        }}
      >
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
                  border: '2px solid var(--glass-border-md)',
                  borderTopColor: '#6366f1',
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

    </div>
  )
}
