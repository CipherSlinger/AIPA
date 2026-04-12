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
              padding: '2px 8px', fontSize: 12,
              background: active ? 'rgba(99,102,241,0.20)' : 'rgba(255,255,255,0.06)',
              border: active ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.09)',
              borderRadius: 20, cursor: 'pointer',
              color: active ? '#a5b4fc' : 'rgba(255,255,255,0.60)',
              transition: 'all 0.15s ease',
              opacity: active ? 1 : (hovered ? 1 : 0),
              fontVariantNumeric: 'tabular-nums',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              if (!active) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.opacity = hovered ? '1' : '0'
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
              }
            }}
          >
            <Icon size={12} style={active ? { fill: '#a5b4fc', opacity: 0.8 } : { opacity: 0.7 }} />
          </button>
        )
      })}
    </div>
  )
}
