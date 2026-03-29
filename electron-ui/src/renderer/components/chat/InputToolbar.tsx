import React, { useState, useRef, useEffect } from 'react'
import { AtSign, TerminalSquare, Mic, MicOff, ListPlus, Cpu, Star, Calendar, Smile, Wand2 } from 'lucide-react'
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
  onInsertText: (text: string) => void
  hasInput: boolean
  inputText: string
}

export default function InputToolbar({
  listening,
  toggleSpeech,
  onAtClick,
  onSlashClick,
  onQueueClick,
  onSend,
  onInsertText,
  hasInput,
  inputText,
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
      {/* Date/Time insertion */}
      <DateTimeInsert onInsert={onInsertText} />
      {/* Emoji picker */}
      <EmojiPicker onInsert={onInsertText} />
      {/* Text transform */}
      <TextTransformMenu inputText={inputText} onSend={onSend} />
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

// Date/Time quick-insert dropdown
function DateTimeInsert({ onInsert }: { onInsert: (text: string) => void }) {
  const t = useT()
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  const now = new Date()
  const items = [
    { label: t('datetime.today'), value: now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: t('datetime.now'), value: now.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { label: t('datetime.time'), value: now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) },
    { label: t('datetime.tomorrow'), value: new Date(now.getTime() + 86400000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) },
    { label: t('datetime.yesterday'), value: new Date(now.getTime() - 86400000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) },
    { label: t('datetime.weekday'), value: now.toLocaleDateString(undefined, { weekday: 'long' }) },
    { label: t('datetime.iso'), value: now.toISOString().slice(0, 10) },
  ]

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={t('datetime.insertDate')}
        style={{
          ...toolbarBtnStyle,
          color: show ? 'var(--accent)' : 'var(--input-toolbar-icon)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0, 122, 204, 0.10)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = show ? 'var(--accent)' : 'var(--input-toolbar-icon)'; e.currentTarget.style.background = 'none' }}
      >
        <Calendar size={16} />
      </button>
      {show && (
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
            minWidth: 200,
            maxWidth: 320,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('datetime.insertDate')}
          </div>
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => {
                onInsert(item.value)
                setShow(false)
              }}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1.4,
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{item.label}</span>
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Emoji categories with frequently used emojis
const EMOJI_CATEGORIES = [
  { label: 'Smileys', emojis: ['\u{1F60A}', '\u{1F602}', '\u{1F923}', '\u{1F60D}', '\u{1F970}', '\u{1F618}', '\u{1F60E}', '\u{1F914}', '\u{1F605}', '\u{1F622}', '\u{1F62D}', '\u{1F97A}', '\u{1F624}', '\u{1F917}', '\u{1F634}', '\u{1F644}'] },
  { label: 'Gestures', emojis: ['\u{1F44D}', '\u{1F44E}', '\u{1F44F}', '\u{1F64F}', '\u{1F91D}', '\u{1F4AA}', '\u270C\uFE0F', '\u{1F91E}', '\u{1F44C}', '\u270B', '\u{1F44B}', '\u{1F590}\uFE0F', '\u{1FAE1}', '\u{1FAF6}', '\u261D\uFE0F', '\u{1F446}'] },
  { label: 'Hearts', emojis: ['\u2764\uFE0F', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F90D}', '\u{1F494}', '\u2763\uFE0F', '\u{1F495}', '\u{1F497}', '\u{1F496}', '\u2728', '\u2B50', '\u{1F31F}', '\u{1F4AB}'] },
  { label: 'Objects', emojis: ['\u{1F4DD}', '\u{1F4CE}', '\u{1F4CC}', '\u{1F4CD}', '\u{1F511}', '\u{1F4A1}', '\u{1F4CA}', '\u{1F4C8}', '\u2705', '\u274C', '\u26A0\uFE0F', '\u{1F514}', '\u{1F4C5}', '\u23F0', '\u{1F3AF}', '\u{1F3C6}'] },
]

function EmojiPicker({ onInsert }: { onInsert: (text: string) => void }) {
  const t = useT()
  const [show, setShow] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setShow(!show)}
        title={t('toolbar.emoji')}
        style={{
          ...toolbarBtnStyle,
          color: show ? 'var(--accent)' : 'var(--input-toolbar-icon)',
        }}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={(e) => { if (!show) toolbarHoverOut(e) }}
      >
        <Smile size={16} />
      </button>
      {show && (
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
            padding: 8,
            width: 260,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveTab(i)}
                style={{
                  flex: 1,
                  padding: '3px 4px',
                  fontSize: 9,
                  fontWeight: activeTab === i ? 600 : 400,
                  background: activeTab === i ? 'var(--popup-item-hover)' : 'none',
                  border: 'none',
                  borderRadius: 4,
                  color: activeTab === i ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'background 100ms',
                }}
              >
                {cat.emojis[0]} {cat.label}
              </button>
            ))}
          </div>
          {/* Emoji grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
            {EMOJI_CATEGORIES[activeTab].emojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onInsert(emoji)
                  setShow(false)
                }}
                style={{
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'background 100ms, transform 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)'; e.currentTarget.style.transform = 'scale(1.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.transform = 'scale(1)' }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Text transform actions menu
const TRANSFORM_ACTIONS = [
  { id: 'formal', labelKey: 'transform.formal', prompt: 'Rewrite the following text in a more formal, professional tone. Only output the rewritten text, nothing else:\n\n' },
  { id: 'casual', labelKey: 'transform.casual', prompt: 'Rewrite the following text in a more casual, friendly tone. Only output the rewritten text, nothing else:\n\n' },
  { id: 'shorter', labelKey: 'transform.shorter', prompt: 'Make the following text shorter and more concise while keeping the key points. Only output the rewritten text, nothing else:\n\n' },
  { id: 'longer', labelKey: 'transform.longer', prompt: 'Expand the following text with more detail and explanation. Only output the rewritten text, nothing else:\n\n' },
  { id: 'grammar', labelKey: 'transform.grammar', prompt: 'Fix any grammar, spelling, and punctuation errors in the following text. Only output the corrected text, nothing else:\n\n' },
] as const

function TextTransformMenu({ inputText, onSend }: { inputText: string; onSend: (text: string) => Promise<void> }) {
  const t = useT()
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const hasText = inputText.trim().length > 0

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => { if (hasText) setShow(!show) }}
        title={t('transform.title')}
        style={{
          ...toolbarBtnStyle,
          color: show ? 'var(--accent)' : 'var(--input-toolbar-icon)',
          opacity: hasText ? 1 : 0.4,
          cursor: hasText ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => { if (hasText) { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0, 122, 204, 0.10)' } }}
        onMouseLeave={(e) => { e.currentTarget.style.color = show ? 'var(--accent)' : 'var(--input-toolbar-icon)'; e.currentTarget.style.background = 'none' }}
      >
        <Wand2 size={16} />
      </button>
      {show && (
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
            minWidth: 180,
            zIndex: 100,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('transform.title')}
          </div>
          {TRANSFORM_ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => {
                onSend(action.prompt + inputText.trim())
                setShow(false)
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
                transition: 'background 100ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
