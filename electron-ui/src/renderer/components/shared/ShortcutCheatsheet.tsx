import React, { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search } from 'lucide-react'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'

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
    { keys: 'Ctrl + Shift + O', actionKey: 'focusMode' },
    { keys: 'Ctrl + Shift + N', actionKey: 'toggleNotes' },
    { keys: 'Ctrl + Shift + C', actionKey: 'collapseExpandAll' },
    { keys: 'Ctrl + Shift + D', actionKey: 'toggleTheme' },
    { keys: 'Ctrl + Shift + L', actionKey: 'toggleLanguage' },
    { keys: 'Ctrl + Shift + M', actionKey: 'cycleModel' },
    { keys: 'Ctrl + Shift + T', actionKey: 'pinWindow' },
    { keys: 'Ctrl + [ / ]', actionKey: 'prevNextSession' },
    { keys: 'Ctrl + 1-9', actionKey: 'switchSidebarTab' },
    { keys: '/', actionKey: 'quickSearch' },
  ]},
  { sectionKey: 'sessionList', items: [
    { keys: 'Up / Down', actionKey: 'navigateSessions' },
    { keys: 'Enter', actionKey: 'openSession' },
    { keys: 'F2', actionKey: 'renameSession' },
    { keys: 'Delete', actionKey: 'deleteSession' },
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
    { keys: 'Ctrl + U', actionKey: 'clearInput' },
    { keys: 'Ctrl + B', actionKey: 'boldText' },
    { keys: 'Ctrl + I', actionKey: 'italicText' },
    { keys: 'Ctrl + Shift + U', actionKey: 'cycleTextCase' },
    { keys: 'Ctrl + = / -', actionKey: 'zoomInOut' },
    { keys: 'Ctrl + 0', actionKey: 'resetZoom' },
  ]},
  { sectionKey: 'conversation', items: [
    { keys: 'Ctrl + F', actionKey: 'searchInConversation' },
    { keys: 'Ctrl + Shift + F', actionKey: 'globalSearch' },
    { keys: 'Ctrl + Shift + E', actionKey: 'exportConversation' },
    { keys: 'Ctrl + Shift + X', actionKey: 'copyConversation' },
    { keys: 'Ctrl + Shift + K', actionKey: 'compactConversation' },
    { keys: 'Ctrl + Shift + B', actionKey: 'toggleBookmarks' },
    { keys: 'Ctrl + Shift + S', actionKey: 'toggleStats' },
    { keys: 'Ctrl + Home', actionKey: 'jumpToFirstMessage' },
    { keys: 'Ctrl + End', actionKey: 'jumpToLastMessage' },
    { keys: 'PageUp / PageDown', actionKey: 'pageUpDown' },
    { keys: 'Alt + Up / Down', actionKey: 'jumpUserMessage' },
    { keys: 'Right-click', actionKey: 'messageContextMenu' },
  ]},
]

export default function ShortcutCheatsheet({ onClose }: Props) {
  const t = useT()
  const overlayRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap(true)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchFilter, setSearchFilter] = useState('')

  // Filter shortcuts based on search query
  const filteredSections = useMemo(() => {
    if (!searchFilter.trim()) return SHORTCUTS
    const query = searchFilter.toLowerCase()
    return SHORTCUTS.map(section => ({
      ...section,
      items: section.items.filter(item =>
        t(`shortcutCheatsheet.${item.actionKey}`).toLowerCase().includes(query) ||
        item.keys.toLowerCase().includes(query)
      ),
    })).filter(section => section.items.length > 0)
  }, [searchFilter, t])

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
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcutCheatsheet.title')}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)', margin: 0 }}>
            {t('shortcutCheatsheet.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
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

        {/* Search filter */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={t('shortcutCheatsheet.searchPlaceholder')}
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            autoFocus
          />
        </div>

        {filteredSections.map(section => (
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
