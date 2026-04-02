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
      background: 'var(--popup-bg)',
      borderBottom: '1px solid var(--popup-border)',
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
          color: 'var(--accent)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <Pin size={12} style={{ transform: 'rotate(-45deg)' }} />
        <span>{t('message.pinnedMessages')} ({pinnedMessages.length})</span>
        <button
          onClick={(e) => { e.stopPropagation(); handleUnpinAll() }}
          title={t('message.unpinAll')}
          style={{
            marginLeft: 'auto', marginRight: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 10,
            display: 'flex', alignItems: 'center', gap: 2,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
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
                  padding: '5px 8px',
                  background: 'var(--action-btn-bg)',
                  border: '1px solid var(--action-btn-border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--action-btn-bg)' }}
              >
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: msg.role === 'user' ? 'var(--accent)' : 'var(--text-muted)',
                  flexShrink: 0,
                  minWidth: 32,
                }}>
                  {roleLabel}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
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
