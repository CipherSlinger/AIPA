import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

const SHORTCUTS = [
  { section: 'General', items: [
    { keys: 'Ctrl + N', action: 'New conversation' },
    { keys: 'Ctrl + B', action: 'Toggle sidebar' },
    { keys: 'Ctrl + `', action: 'Toggle terminal' },
    { keys: 'Ctrl + L', action: 'Focus chat input' },
    { keys: 'Ctrl + ,', action: 'Open settings' },
    { keys: 'Ctrl + Shift + P', action: 'Command palette' },
    { keys: 'Ctrl + /', action: 'This cheatsheet' },
    { keys: 'Ctrl + Shift + F', action: 'Focus mode' },
    { keys: 'Ctrl + Shift + C', action: 'Collapse/expand all' },
    { keys: 'Ctrl + [ / ]', action: 'Previous/next session' },
  ]},
  { section: 'Chat', items: [
    { keys: 'Enter', action: 'Send message' },
    { keys: 'Shift + Enter', action: 'New line' },
    { keys: 'Up / Down', action: 'Browse input history' },
    { keys: '@', action: 'Mention file' },
    { keys: '/', action: 'Slash commands' },
  ]},
  { section: 'Conversation', items: [
    { keys: 'Ctrl + F', action: 'Search in conversation' },
    { keys: 'Ctrl + Shift + E', action: 'Export conversation' },
    { keys: 'Right-click', action: 'Message context menu' },
  ]},
]

export default function ShortcutCheatsheet({ onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const overlay = (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '20px 24px',
          maxWidth: 480,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)', margin: 0 }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {SHORTCUTS.map(section => (
          <div key={section.section} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {section.section}
            </div>
            {section.items.map(item => (
              <div
                key={item.keys}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '5px 0',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{item.action}</span>
                <kbd
                  style={{
                    fontSize: 11,
                    color: 'var(--text-bright)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.keys}
                </kbd>
              </div>
            ))}
          </div>
        ))}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Press <kbd style={{ fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', fontFamily: 'inherit' }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
