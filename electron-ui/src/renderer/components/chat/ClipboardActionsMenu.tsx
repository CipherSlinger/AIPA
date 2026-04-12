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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
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
          color: showMenu ? '#818cf8' : 'rgba(255,255,255,0.45)',
        }}
        onMouseEnter={(e) => { if (!showMenu) toolbarHoverIn(e) }}
        onMouseLeave={(e) => { if (!showMenu) toolbarHoverOut(e) }}
      >
        <ClipboardPaste size={16} />
      </button>
      {showMenu && (
        <div className="popup-enter" style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          background: 'rgba(15,15,25,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
          padding: '4px 0',
          minWidth: 180,
          zIndex: 100,
          animation: 'slideUp 0.15s ease',
        }}>
          <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>
            {t('clipboard.pasteAndAsk')}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '3px 0' }} />
          {CLIPBOARD_ACTIONS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => handleAction(id)}
              onMouseEnter={() => setHoveredItem(id)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '7px 12px',
                background: hoveredItem === id ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: hoveredItem === id ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.82)',
                cursor: 'pointer',
                fontSize: 13,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={15} style={{ color: hoveredItem === id ? '#a5b4fc' : '#818cf8', flexShrink: 0, transition: 'all 0.15s ease' }} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
