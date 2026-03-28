import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  onClose: () => void
}

// Keys reference i18n path under shortcutCheatsheet.*
const SHORTCUTS = [
  { sectionKey: 'global', items: [
    { keys: 'Ctrl + Shift + Space', actionKey: 'toggleWindow' },
    { keys: 'Ctrl + Shift + G', actionKey: 'clipboardQuickAction' },
  ]},
  { sectionKey: 'general', items: [
    { keys: 'Ctrl + N', actionKey: 'newConversation' },
    { keys: 'Ctrl + K', actionKey: 'clearConversation' },
    { keys: 'Ctrl + B', actionKey: 'toggleSidebar' },
    { keys: 'Ctrl + `', actionKey: 'toggleTerminal' },
    { keys: 'Ctrl + L', actionKey: 'focusChatInput' },
    { keys: 'Ctrl + ,', actionKey: 'openSettings' },
    { keys: 'Ctrl + Shift + P', actionKey: 'commandPalette' },
    { keys: 'Ctrl + /', actionKey: 'thisCheatsheet' },
    { keys: 'Ctrl + Shift + F', actionKey: 'focusMode' },
    { keys: 'Ctrl + Shift + N', actionKey: 'toggleNotes' },
    { keys: 'Ctrl + Shift + C', actionKey: 'collapseExpandAll' },
    { keys: 'Ctrl + [ / ]', actionKey: 'prevNextSession' },
  ]},
  { sectionKey: 'chat', items: [
    { keys: 'Enter', actionKey: 'sendMessage' },
    { keys: 'Shift + Enter', actionKey: 'newLine' },
    { keys: 'Escape', actionKey: 'stopStreaming' },
    { keys: 'Up / Down', actionKey: 'browseInputHistory' },
    { keys: '@', actionKey: 'mentionFile' },
    { keys: '/', actionKey: 'slashCommands' },
    { keys: 'Ctrl + Shift + Q', actionKey: 'addToTaskQueue' },
    { keys: 'Ctrl + Shift + R', actionKey: 'regenerateResponse' },
    { keys: 'Ctrl + = / -', actionKey: 'zoomInOut' },
    { keys: 'Ctrl + 0', actionKey: 'resetZoom' },
  ]},
  { sectionKey: 'conversation', items: [
    { keys: 'Ctrl + F', actionKey: 'searchInConversation' },
    { keys: 'Ctrl + Shift + F', actionKey: 'globalSearch' },
    { keys: 'Ctrl + Shift + E', actionKey: 'exportConversation' },
    { keys: 'Ctrl + Shift + X', actionKey: 'copyConversation' },
    { keys: 'Right-click', actionKey: 'messageContextMenu' },
  ]},
]

export default function ShortcutCheatsheet({ onClose }: Props) {
  const t = useT()
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
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 10,
          padding: '20px 24px',
          maxWidth: 480,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: 'var(--popup-shadow)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)', margin: 0 }}>
            {t('shortcutCheatsheet.title')}
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
          <div key={section.sectionKey} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t(`shortcutCheatsheet.${section.sectionKey}`)}
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
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{t(`shortcutCheatsheet.${item.actionKey}`)}</span>
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
          {t('shortcutCheatsheet.pressEscToClose')}
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
