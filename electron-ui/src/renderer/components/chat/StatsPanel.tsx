import React, { useState, useRef, useCallback, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { ConversationStats } from '../../hooks/useConversationStats'

interface StatsPanelProps {
  messageCount: number
  conversationStats: ConversationStats
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

export default function StatsPanel({
  messageCount,
  conversationStats,
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: StatsPanelProps) {
  const t = useT()
  const [showStats, setShowStats] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  useClickOutside(statsRef, showStats, useCallback(() => setShowStats(false), []))

  // Listen for Ctrl+Shift+S toggle event
  useEffect(() => {
    const handler = () => setShowStats(prev => !prev)
    window.addEventListener('aipa:toggleStats', handler)
    return () => window.removeEventListener('aipa:toggleStats', handler)
  }, [])

  return (
    <div style={{ position: 'relative' }} ref={statsRef}>
      <button
        onClick={() => setShowStats(!showStats)}
        title={t('chat.stats')}
        disabled={messageCount === 0}
        style={{
          ...headerBtnStyle,
          background: showStats ? 'var(--accent)' : 'none',
          color: showStats ? '#fff' : 'var(--chat-header-icon)',
          cursor: messageCount === 0 ? 'not-allowed' : 'pointer',
          opacity: messageCount === 0 ? 0.3 : 1,
        }}
        onMouseEnter={(e) => hoverIn(e, showStats)}
        onMouseLeave={(e) => hoverOut(e, showStats)}
      >
        <BarChart3 size={15} />
      </button>
      {showStats && messageCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 60,
            width: 220,
            background: 'var(--input-field-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: '12px 14px',
            marginTop: 4,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 10 }}>
            {t('chat.conversationStats')}
          </div>
          {[
            { label: t('chat.statsMessages'), value: conversationStats.total },
            { label: t('chat.statsYourMessages'), value: conversationStats.user },
            { label: t('chat.statsClaudeMessages'), value: conversationStats.assistant },
            { label: t('chat.statsTotalWords'), value: conversationStats.totalWords.toLocaleString() },
            { label: t('chat.statsToolUses'), value: conversationStats.toolUseCount },
            { label: t('chat.statsDuration'), value: t('chat.statsDurationValue', { min: String(conversationStats.durationMin) }) },
            ...(conversationStats.avgResponseSec > 0 ? [{ label: t('chat.statsAvgResponse'), value: `~${conversationStats.avgResponseSec}s` }] : []),
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
            </div>
          ))}
          {useChatStore.getState().totalSessionCost > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('chat.statsSessionCost')}</span>
              <span style={{ color: 'var(--success)', fontWeight: 500 }}>${useChatStore.getState().totalSessionCost.toFixed(4)}</span>
            </div>
          )}
          {/* Collapse/Expand all actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button
              onClick={() => { useChatStore.getState().collapseAll(); setShowStats(false) }}
              style={{
                flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 0', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {t('chat.collapseAll')}
            </button>
            <button
              onClick={() => { useChatStore.getState().expandAll(); setShowStats(false) }}
              style={{
                flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 0', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {t('chat.expandAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
