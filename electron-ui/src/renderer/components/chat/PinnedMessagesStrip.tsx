import React, { useState, useMemo, useCallback } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { Pin, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
import type { Virtualizer } from '@tanstack/react-virtual'

interface ListItem {
  type: string
  msgIdx?: number
}

interface Props {
  messages: ChatMessage[]
  items: ListItem[]
  virtualizer: Virtualizer<HTMLDivElement, Element>
}

/**
 * Pinned messages strip component extracted from MessageList (Iteration 403).
 *
 * Shows a collapsible list of pinned messages at the top of the message list.
 * Clicking a pinned message scrolls to it in the virtual list.
 */
export default function PinnedMessagesStrip({ messages, items, virtualizer }: Props) {
  const t = useT()
  const [pinnedExpanded, setPinnedExpanded] = useState(true)
  const addToast = useUiStore(s => s.addToast)

  const pinnedMessages = useMemo(() =>
    messages
      .map((m, idx) => ({ msg: m, idx }))
      .filter(({ msg }) => msg.role !== 'permission' && msg.role !== 'plan' && (msg as StandardChatMessage).pinned),
    [messages]
  )

  const handleUnpinAll = useCallback(() => {
    const togglePin = useChatStore.getState().togglePin
    pinnedMessages.forEach(({ msg }) => {
      togglePin(msg.id)
    })
    addToast('info', t('message.unpinAll'))
  }, [pinnedMessages, addToast, t])

  if (pinnedMessages.length === 0) return null

  return (
    <div style={{
      flexShrink: 0,
      background: 'rgba(99,102,241,0.08)',
      borderBottom: '1px solid rgba(99,102,241,0.20)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <button
        onClick={() => setPinnedExpanded(prev => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.45)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <Pin size={12} style={{ transform: 'rotate(-45deg)', color: '#818cf8' }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>
          {t('message.pinnedMessages')}
        </span>
        <span style={{
          background: 'rgba(99,102,241,0.15)',
          color: '#a5b4fc',
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 600,
        }}>
          {pinnedMessages.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleUnpinAll() }}
          title={t('message.unpinAll')}
          style={{
            marginLeft: 'auto', marginRight: 8,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.38)', fontSize: 10,
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '2px 6px', borderRadius: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
        >
          <X size={10} />
          {t('message.unpinAll')}
        </button>
        <span>
          {pinnedExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {pinnedExpanded && (
        <div style={{ padding: '0 12px 6px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
          {pinnedMessages.map(({ msg, idx }) => {
            const content = (msg as StandardChatMessage).content || ''
            const preview = content.length > 120 ? content.slice(0, 120) + '...' : content
            const roleLabel = msg.role === 'user' ? 'You' : 'AIPA'
            return (
              <button
                key={msg.id}
                onClick={() => {
                  const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === idx)
                  if (itemIdx >= 0) {
                    virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '4px 8px',
                  background: 'rgba(251,191,36,0.06)',
                  border: '1px solid rgba(251,191,36,0.15)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(251,191,36,0.12)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(251,191,36,0.10)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(251,191,36,0.06)'
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: msg.role === 'user' ? '#fbbf24' : 'rgba(255,255,255,0.38)',
                  flexShrink: 0,
                  minWidth: 32,
                }}>
                  {roleLabel}
                </span>
                <span style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.60)',
                  lineHeight: 1.6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {preview}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
