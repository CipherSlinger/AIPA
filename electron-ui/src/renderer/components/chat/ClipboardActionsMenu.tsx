import React, { useState, useRef, useEffect } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import { CLIPBOARD_ACTIONS, toolbarBtnStyle, toolbarHoverIn, toolbarHoverOut } from './chatInputConstants'

interface ClipboardActionsMenuProps {
  onSend: (text: string) => Promise<void>
}

export default function ClipboardActionsMenu({ onSend }: ClipboardActionsMenuProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const addToast = useUiStore(s => s.addToast)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const handleAction = async (actionId: string) => {
    setShowMenu(false)
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) {
        addToast('info', t('clipboard.emptyClipboard'))
        return
      }
      const action = CLIPBOARD_ACTIONS.find(a => a.id === actionId)
      if (!action) return
      let prompt: string
      if (actionId === 'translate') {
        const isZh = prefs.language === 'zh-CN'
        const tpl = isZh ? (action.templateZh ?? action.template ?? '') : (action.templateEn ?? action.template ?? '')
        prompt = tpl.replace('{text}', text.trim())
      } else {
        prompt = (action.template || '').replace('{text}', text.trim())
      }
      if (prompt) {
        await onSend(prompt)
      }
    } catch {
      addToast('error', t('clipboard.clipboardError'))
    }
  }

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShowMenu(v => !v)}
        title={t('clipboard.pasteAndAsk')}
        style={{
          ...toolbarBtnStyle,
          background: showMenu ? 'rgba(255,255,255,0.06)' : 'none',
          color: showMenu ? 'var(--input-toolbar-hover)' : 'var(--input-toolbar-icon)',
        }}
        onMouseEnter={(e) => { if (!showMenu) toolbarHoverIn(e) }}
        onMouseLeave={(e) => { if (!showMenu) toolbarHoverOut(e) }}
      >
        <ClipboardPaste size={16} />
      </button>
      {showMenu && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 10,
          boxShadow: 'var(--popup-shadow)',
          padding: '4px 0',
          minWidth: 180,
          zIndex: 100,
          animation: 'popup-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.02em' }}>
            {t('clipboard.pasteAndAsk')}
          </div>
          {CLIPBOARD_ACTIONS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => handleAction(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 13,
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
