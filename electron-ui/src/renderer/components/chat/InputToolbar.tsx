import React, { useState, useRef, useEffect } from 'react'
import { AtSign, TerminalSquare, Mic, MicOff, ListPlus, Cpu, Star } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useChatStore } from '../../store'
import ClipboardActionsMenu from './ClipboardActionsMenu'
import { toolbarBtnStyle, toolbarHoverIn, toolbarHoverOut } from './chatInputConstants'
import { PromptHistoryItem } from '../../types/app.types'

interface InputToolbarProps {
  listening: boolean
  toggleSpeech: () => void
  onAtClick: () => void
  onSlashClick: () => void
  onQueueClick: () => void
  onSend: (text: string) => Promise<void>
  hasInput: boolean
}

export default function InputToolbar({
  listening,
  toggleSpeech,
  onAtClick,
  onSlashClick,
  onQueueClick,
  onSend,
  hasInput,
}: InputToolbarProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const taskQueue = useChatStore(s => s.taskQueue)
  const addToQueue = useChatStore(s => s.addToQueue)

  // Favorite prompts dropdown
  const [showFavorites, setShowFavorites] = useState(false)
  const favRef = useRef<HTMLDivElement>(null)
  const promptHistory: PromptHistoryItem[] = prefs.promptHistory || []
  const favorites = promptHistory.filter(p => p.favorite).sort((a, b) => b.lastUsedAt - a.lastUsedAt)

  useEffect(() => {
    if (!showFavorites) return
    const handler = (e: MouseEvent) => {
      if (favRef.current && !favRef.current.contains(e.target as Node)) setShowFavorites(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFavorites])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6, paddingLeft: 4 }}>
      {/* @ mention */}
      <button
        onClick={onAtClick}
        title={t('toolbar.insertMention')}
        style={toolbarBtnStyle}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={toolbarHoverOut}
      >
        <AtSign size={16} />
      </button>
      {/* / slash command */}
      <button
        onClick={onSlashClick}
        title={t('toolbar.insertSlashCommand')}
        style={toolbarBtnStyle}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={toolbarHoverOut}
      >
        <TerminalSquare size={16} />
      </button>
      {/* Voice input */}
      <button
        onClick={toggleSpeech}
        title={listening ? t('toolbar.stopRecording') : t('toolbar.voiceInput')}
        style={{
          ...toolbarBtnStyle,
          background: listening ? 'var(--error)' : 'none',
          color: listening ? '#fff' : 'var(--input-toolbar-icon)',
        }}
        onMouseEnter={(e) => { if (!listening) toolbarHoverIn(e) }}
        onMouseLeave={(e) => { if (!listening) toolbarHoverOut(e) }}
      >
        {listening ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      {/* Clipboard actions */}
      <ClipboardActionsMenu onSend={onSend} />
      {/* Favorite prompts */}
      {favorites.length > 0 && (
        <div ref={favRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onClick={() => setShowFavorites(!showFavorites)}
            title={t('toolbar.favoritePrompts')}
            style={{
              ...toolbarBtnStyle,
              color: showFavorites ? '#f59e0b' : 'var(--input-toolbar-icon)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.background = 'rgba(245, 158, 11, 0.10)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = showFavorites ? '#f59e0b' : 'var(--input-toolbar-icon)'; e.currentTarget.style.background = 'none' }}
          >
            <Star size={16} fill={showFavorites ? '#f59e0b' : 'none'} />
          </button>
          {showFavorites && (
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
                minWidth: 220,
                maxWidth: 320,
                maxHeight: 240,
                overflowY: 'auto',
                zIndex: 100,
                animation: 'popup-in 0.15s ease',
              }}
            >
              <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('toolbar.favoritePrompts')} ({favorites.length})
              </div>
              {favorites.slice(0, 15).map(fav => (
                <button
                  key={fav.id}
                  onClick={() => {
                    onSend(fav.text)
                    setShowFavorites(false)
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
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                  title={fav.text}
                >
                  <Star size={10} fill="#f59e0b" color="#f59e0b" style={{ marginRight: 6, verticalAlign: -1 }} />
                  {fav.text.length > 60 ? fav.text.slice(0, 60) + '...' : fav.text}
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 6 }}>
                    x{fav.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Model indicator chip */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'P' }))}
        title={t('chat.switchModel')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 9,
          flexShrink: 0,
          transition: 'border-color 150ms, color 150ms',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <Cpu size={9} />
        {(() => {
          const m = prefs.model || 'claude-sonnet-4-6'
          const parts = m.replace('claude-', '').split('-')
          return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? ' ' + parts.slice(1).join('.') : '')
        })()}
      </button>
      <span style={{ flex: 1 }} />
      {/* Queue button */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={onQueueClick}
          disabled={!hasInput}
          aria-label={t('taskQueue.addToQueue')}
          title={t('taskQueue.addToQueueShortcut')}
          style={{
            ...toolbarBtnStyle,
            color: taskQueue.length > 0 ? '#a78bfa' : 'var(--input-toolbar-icon)',
            cursor: hasInput ? 'pointer' : 'not-allowed',
            opacity: hasInput ? 1 : 0.4,
          }}
          onMouseEnter={(e) => {
            if (hasInput) {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#a78bfa'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 92, 246, 0.10)'
            }
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = taskQueue.length > 0 ? '#a78bfa' : 'var(--input-toolbar-icon)'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
          }}
        >
          <ListPlus size={16} />
        </button>
        {taskQueue.length > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 14,
            height: 14,
            background: '#8b5cf6',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 600,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            {taskQueue.length > 9 ? '9+' : taskQueue.length}
          </span>
        )}
      </div>
    </div>
  )
}
