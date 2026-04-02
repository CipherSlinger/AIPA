// DailySummaryCard — shows daily usage stats on WelcomeScreen (Iteration 417)
import React, { useState, useMemo } from 'react'
import { Calendar, X, MessageSquare, Layers, Zap } from 'lucide-react'
import { useSessionStore } from '../../store'
import { useT } from '../../i18n'

export default function DailySummaryCard() {
  const t = useT()
  const sessions = useSessionStore(s => s.sessions)

  // Check if we should show the card
  const [dismissed, setDismissed] = useState(() => {
    try {
      const lastDismiss = localStorage.getItem('aipa:daily-summary-date')
      if (!lastDismiss) return false
      const today = new Date().toDateString()
      return lastDismiss === today
    } catch { return false }
  })

  const stats = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTs = todayStart.getTime()

    const todaySessions = sessions.filter(s => s.timestamp >= todayTs)
    const todayMessages = todaySessions.reduce((sum, s) => sum + (s.messageCount || 0), 0)

    // Extract top topics from today's session titles
    const topics = todaySessions
      .map(s => s.title || s.lastPrompt || '')
      .filter(t => t.length > 3)
      .slice(0, 3)
      .map(t => t.length > 25 ? t.slice(0, 25) + '...' : t)

    return {
      sessionsToday: todaySessions.length,
      messagesToday: todayMessages,
      topics,
    }
  }, [sessions])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem('aipa:daily-summary-date', new Date().toDateString())
    } catch { /* ignore */ }
  }

  // Don't show if dismissed today or no sessions exist
  if (dismissed || stats.sessionsToday === 0) return null

  return (
    <div style={{
      width: '100%', maxWidth: 420, padding: '12px 16px',
      background: 'linear-gradient(135deg, var(--card-bg), rgba(0,122,204,0.05))',
      border: '1px solid var(--card-border)', borderRadius: 12,
      position: 'relative',
    }}>
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 2, borderRadius: 3,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <X size={14} />
      </button>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Calendar size={13} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('dailySummary.title')}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, marginBottom: stats.topics.length > 0 ? 8 : 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {stats.sessionsToday}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            <Layers size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
            {t('dailySummary.sessions')}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {stats.messagesToday}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            <MessageSquare size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
            {t('dailySummary.messages')}
          </div>
        </div>
      </div>

      {/* Topics */}
      {stats.topics.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <Zap size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
          {t('dailySummary.topics')}: {stats.topics.join(', ')}
        </div>
      )}
    </div>
  )
}
