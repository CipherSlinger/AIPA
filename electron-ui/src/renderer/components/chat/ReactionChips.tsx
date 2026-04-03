import React, { useState, useCallback, useRef } from 'react'
import { ThumbsUp, Heart, Lightbulb, BookmarkPlus } from 'lucide-react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

/**
 * ReactionChips — emoji reaction buttons for assistant messages (Iteration 451)
 * Extracted from Message.tsx inline IIFE.
 */
interface ReactionChipsProps {
  messageId: string
  reactions: string[]
  hovered: boolean
}

export default function ReactionChips({ messageId, reactions, hovered }: ReactionChipsProps) {
  const t = useT()
  const toggleReaction = useChatStore.getState().toggleReaction

  const REACTION_DEFS = [
    { key: 'thumbsUp', icon: ThumbsUp, label: t('message.thumbsUp') },
    { key: 'heart', icon: Heart, label: t('message.reactionHeart') },
    { key: 'lightbulb', icon: Lightbulb, label: t('message.reactionInsightful') },
    { key: 'bookmark', icon: BookmarkPlus, label: t('message.reactionSave') },
  ]

  const hasAny = reactions.length > 0
  if (!hasAny && !hovered) return null

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
      {REACTION_DEFS.map(({ key, icon: Icon, label }) => {
        const active = reactions.includes(key)
        return (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); toggleReaction(messageId, key) }}
            title={label}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', fontSize: 10,
              background: active ? 'rgba(0, 122, 204, 0.12)' : 'transparent',
              border: active ? '1px solid rgba(0, 122, 204, 0.3)' : '1px solid transparent',
              borderRadius: 10, cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.12s ease',
              opacity: active ? 1 : (hovered ? 0.6 : 0),
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; if (!active) e.currentTarget.style.borderColor = 'var(--border)' }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.opacity = hovered ? '0.6' : '0'; e.currentTarget.style.borderColor = 'transparent' } }}
          >
            <Icon size={11} style={active ? { fill: 'var(--accent)', opacity: 0.3 } : {}} />
          </button>
        )
      })}
    </div>
  )
}
