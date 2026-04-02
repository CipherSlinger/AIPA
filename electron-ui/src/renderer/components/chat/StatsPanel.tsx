import React, { useState, useRef, useCallback, useEffect } from 'react'
import { BarChart3, ClipboardCopy, Check } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
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
  const addToast = useUiStore(s => s.addToast)
  const [showStats, setShowStats] = useState(false)
  const [statsCopied, setStatsCopied] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  const handleCopyStats = useCallback(() => {
    const lines: string[] = [
      `${t('chat.conversationStats')}`,
      `${t('chat.statsMessages')}: ${conversationStats.total}`,
      `${t('chat.statsYourMessages')}: ${conversationStats.user}`,
      `${t('chat.statsClaudeMessages')}: ${conversationStats.assistant}`,
      `${t('chat.statsTotalWords')}: ${conversationStats.totalWords.toLocaleString()}`,
      `${t('chat.statsTotalChars')}: ${conversationStats.totalChars.toLocaleString()}`,
      `${t('chat.statsReadingTime')}: ${t('chat.statsReadingTimeValue', { min: String(conversationStats.readingTimeMin) })}`,
      `${t('chat.statsToolUses')}: ${conversationStats.toolUseCount}`,
      `${t('chat.statsDuration')}: ${t('chat.statsDurationValue', { min: String(conversationStats.durationMin) })}`,
    ]
    if (conversationStats.avgResponseSec > 0) {
      lines.push(`${t('chat.statsAvgResponse')}: ~${conversationStats.avgResponseSec}s`)
    }
    if (conversationStats.annotationCount > 0) {
      lines.push(`${t('chat.statsAnnotations')}: ${conversationStats.annotationCount}`)
    }
    if (conversationStats.ratingUp + conversationStats.ratingDown > 0) {
      lines.push(`${t('chat.statsRatings')}: ${conversationStats.ratingUp} / ${conversationStats.ratingDown}`)
    }
    const cost = useChatStore.getState().totalSessionCost
    if (cost > 0) {
      lines.push(`${t('chat.statsSessionCost')}: $${cost.toFixed(4)}`)
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setStatsCopied(true)
      addToast('success', t('chat.statsCopied'))
      setTimeout(() => setStatsCopied(false), 2000)
    })
  }, [conversationStats, addToast, t])

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
            { label: t('chat.statsTotalChars'), value: conversationStats.totalChars.toLocaleString() },
            { label: t('chat.statsReadingTime'), value: t('chat.statsReadingTimeValue', { min: String(conversationStats.readingTimeMin) }) },
            { label: t('chat.statsToolUses'), value: conversationStats.toolUseCount },
            { label: t('chat.statsDuration'), value: t('chat.statsDurationValue', { min: String(conversationStats.durationMin) }) },
            ...(conversationStats.avgResponseSec > 0 ? [{ label: t('chat.statsAvgResponse'), value: `~${conversationStats.avgResponseSec}s` }] : []),
            ...(conversationStats.annotationCount > 0 ? [{ label: t('chat.statsAnnotations'), value: conversationStats.annotationCount }] : []),
            ...((conversationStats.ratingUp + conversationStats.ratingDown) > 0 ? [{ label: t('chat.statsRatings'), value: `${conversationStats.ratingUp} / ${conversationStats.ratingDown}` }] : []),
            ...(useChatStore.getState().compactionCount > 0 ? [{ label: t('compact.complete'), value: useChatStore.getState().compactionCount }] : []),
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
          {/* Copy stats */}
          <button
            onClick={handleCopyStats}
            style={{
              width: '100%', marginTop: 6, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '4px 0', color: statsCopied ? 'var(--success)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {statsCopied ? <Check size={10} /> : <ClipboardCopy size={10} />}
            {statsCopied ? t('chat.statsCopied') : t('chat.copyStats')}
          </button>
        </div>
      )}
    </div>
  )
}
