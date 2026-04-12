import React, { useState, useRef, useCallback, useEffect } from 'react'
import { BarChart3, ClipboardCopy, Check, FileText } from 'lucide-react'
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
  const [summaryCopied, setSummaryCopied] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  const handleCopyStats = useCallback(() => {
    const lines: string[] = [
      `${t('chat.conversationStats')}`,
      `${t('chat.statsMessages')}: ${conversationStats.total}`,
      `${t('chat.statsYourMessages')}: ${conversationStats.user}`,
      `${t('chat.statsClaudeMessages')}: ${conversationStats.assistant}`,
      ``,
      `${t('chat.statsContentSection')}`,
      `${t('chat.statsUserWords')}: ${conversationStats.userWords.toLocaleString()}`,
      `${t('chat.statsAssistantWords')}: ${conversationStats.assistantWords.toLocaleString()}`,
      `${t('chat.statsTotalWords')}: ${conversationStats.totalWords.toLocaleString()}`,
      `${t('chat.statsTotalChars')}: ${conversationStats.totalChars.toLocaleString()}`,
      `${t('chat.statsEstTokens')}: ~${conversationStats.estTokens.toLocaleString()}`,
      `${t('chat.statsAvgWordsPerMsg')}: ${conversationStats.avgWordsPerMsg}`,
      `${t('chat.statsReadingTime')}: ${t('chat.statsReadingTimeValue', { min: String(conversationStats.readingTimeMin) })}`,
      ``,
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

  const handleCopySummary = useCallback(() => {
    const messages = useChatStore.getState().messages
    const userMsgs = messages.filter(m => m.role === 'user')
    const assistantMsgs = messages.filter(m => m.role === 'assistant')
    const topics: string[] = []
    // Extract key topics from user messages (first line of each)
    userMsgs.forEach(m => {
      const content = (m as import('../../types/app.types').StandardChatMessage).content || ''
      const firstLine = content.split('\n')[0].trim().slice(0, 80)
      if (firstLine) topics.push(firstLine)
    })
    const lines: string[] = [
      `## ${t('chat.conversationStats')}`,
      ``,
      `**${t('chat.statsMessages')}**: ${conversationStats.total} (${conversationStats.user} ${t('chat.you').toLowerCase()}, ${conversationStats.assistant} Claude)`,
      `**${t('chat.statsTotalWords')}**: ${conversationStats.totalWords.toLocaleString()}`,
      `**${t('chat.statsDuration')}**: ${t('chat.statsDurationValue', { min: String(conversationStats.durationMin) })}`,
      ``,
      `### ${t('chat.copySummaryTopics')}`,
      ...topics.slice(0, 10).map((topic, i) => `${i + 1}. ${topic}`),
    ]
    if (topics.length > 10) lines.push(`... ${t('chat.copySummaryMore', { count: String(topics.length - 10) })}`)

    const lastAssistant = assistantMsgs[assistantMsgs.length - 1]
    if (lastAssistant) {
      const lastContent = (lastAssistant as import('../../types/app.types').StandardChatMessage).content || ''
      const lastSnippet = lastContent.slice(0, 200).trim()
      if (lastSnippet) {
        lines.push(``, `### ${t('chat.copySummaryLastResponse')}`, `> ${lastSnippet}${lastContent.length > 200 ? '...' : ''}`)
      }
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setSummaryCopied(true)
      addToast('success', t('chat.copySummaryCopied'))
      setTimeout(() => setSummaryCopied(false), 2000)
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
          background: showStats ? '#6366f1' : 'none',
          color: showStats ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
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
            width: 240,
            background: 'rgba(15,15,25,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            padding: '12px 14px',
            marginTop: 4,
            animation: 'slideUp 0.15s ease',
          }}
        >
          {/* Panel header */}
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.88)',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
          }}>
            {t('chat.conversationStats')}
          </div>
          {/* Message count stat cards */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[
              { label: t('chat.statsMessages'), value: conversationStats.total },
              { label: t('chat.statsYourMessages'), value: conversationStats.user },
              { label: t('chat.statsClaudeMessages'), value: conversationStats.assistant },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: '10px 6px',
                  textAlign: 'center',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.12)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'
                }}
              >
                <div style={{
                  fontSize: 26,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                  color: '#818cf8',
                  lineHeight: 1.2,
                }}>
                  {value}
                </div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.38)',
                  marginTop: 3,
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          {/* Content statistics section */}
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.38)',
            marginTop: 10,
            marginBottom: 5,
          }}>
            {t('chat.statsContentSection')}
          </div>
          {[
            { label: t('chat.statsUserWords'), value: conversationStats.userWords.toLocaleString() },
            { label: t('chat.statsAssistantWords'), value: conversationStats.assistantWords.toLocaleString() },
            { label: t('chat.statsTotalWords'), value: conversationStats.totalWords.toLocaleString() },
            { label: t('chat.statsTotalChars'), value: conversationStats.totalChars.toLocaleString() },
            { label: t('chat.statsEstTokens'), value: `~${conversationStats.estTokens.toLocaleString()}` },
            { label: t('chat.statsAvgWordsPerMsg'), value: conversationStats.avgWordsPerMsg },
            { label: t('chat.statsReadingTime'), value: t('chat.statsReadingTimeValue', { min: String(conversationStats.readingTimeMin) }) },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span style={{ color: '#a78bfa', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{value}</span>
            </div>
          ))}
          {/* Activity statistics section */}
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.38)',
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 5,
          }}>
            {t('chat.statsActivitySection')}
          </div>
          {[
            { label: t('chat.statsToolUses'), value: conversationStats.toolUseCount, color: '#818cf8' },
            { label: t('chat.statsDuration'), value: t('chat.statsDurationValue', { min: String(conversationStats.durationMin) }), color: '#67e8f9' },
            ...(conversationStats.avgResponseSec > 0 ? [{ label: t('chat.statsAvgResponse'), value: `~${conversationStats.avgResponseSec}s`, color: '#67e8f9' }] : []),
            ...(conversationStats.annotationCount > 0 ? [{ label: t('chat.statsAnnotations'), value: conversationStats.annotationCount, color: '#818cf8' }] : []),
            ...((conversationStats.ratingUp + conversationStats.ratingDown) > 0 ? [{ label: t('chat.statsRatings'), value: `${conversationStats.ratingUp} / ${conversationStats.ratingDown}`, color: '#4ade80' }] : []),
            ...(useChatStore.getState().compactionCount > 0 ? [{ label: t('compact.complete'), value: useChatStore.getState().compactionCount, color: '#818cf8' }] : []),
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span style={{ color: color ?? '#818cf8', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{value}</span>
            </div>
          ))}
          {useChatStore.getState().totalSessionCost > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0 3px',
              fontSize: 11,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: 6,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>{t('chat.statsSessionCost')}</span>
              <span style={{ color: '#4ade80', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>${useChatStore.getState().totalSessionCost.toFixed(4)}</span>
            </div>
          )}
          {/* Collapse/Expand all actions */}
          <div style={{
            display: 'flex',
            gap: 6,
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <button
              onClick={() => { useChatStore.getState().collapseAll(); setShowStats(false) }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 6,
                padding: '5px 0',
                color: 'rgba(255,255,255,0.50)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.04em',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.50)'
              }}
            >
              {t('chat.collapseAll')}
            </button>
            <button
              onClick={() => { useChatStore.getState().expandAll(); setShowStats(false) }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 6,
                padding: '5px 0',
                color: 'rgba(255,255,255,0.50)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.04em',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.50)'
              }}
            >
              {t('chat.expandAll')}
            </button>
          </div>
          {/* Copy stats */}
          <button
            onClick={handleCopyStats}
            style={{
              width: '100%',
              marginTop: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 6,
              padding: '5px 0',
              color: statsCopied ? '#4ade80' : 'rgba(255,255,255,0.50)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!statsCopied) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
              }
            }}
            onMouseLeave={(e) => {
              if (!statsCopied) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.50)'
              }
            }}
          >
            {statsCopied ? <Check size={10} /> : <ClipboardCopy size={10} />}
            {statsCopied ? t('chat.statsCopied') : t('chat.copyStats')}
          </button>
          {/* Copy Summary */}
          <button
            onClick={handleCopySummary}
            style={{
              width: '100%',
              marginTop: 4,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 6,
              padding: '5px 0',
              color: summaryCopied ? '#4ade80' : 'rgba(255,255,255,0.50)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!summaryCopied) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
              }
            }}
            onMouseLeave={(e) => {
              if (!summaryCopied) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.50)'
              }
            }}
          >
            {summaryCopied ? <Check size={10} /> : <FileText size={10} />}
            {summaryCopied ? t('chat.copySummaryCopied') : t('chat.copySummary')}
          </button>
        </div>
      )}
    </div>
  )
}
