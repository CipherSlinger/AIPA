// SessionStats — weekly activity chart and aggregate statistics (Iteration 437)
import React, { useMemo } from 'react'
import { ArrowLeft, BarChart3, MessageSquare, Layers, Calendar, Flame, Tag } from 'lucide-react'
import { useSessionStore, usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { TAG_PRESETS } from './sessionUtils'

interface SessionStatsProps {
  onBack: () => void
}

export default function SessionStats({ onBack }: SessionStatsProps) {
  const t = useT()
  const sessions = useSessionStore(s => s.sessions)
  const prefs = usePrefsStore(s => s.prefs)
  const sessionTags = prefs.sessionTags || {}
  const tagNames = prefs.tagNames || TAG_PRESETS.map(tp => t(tp.defaultKey))

  const stats = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Weekly chart: 7 days including today
    const weekDays: { label: string; count: number; date: Date }[] = []
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * 86400000)
      const nextD = new Date(d.getTime() + 86400000)
      const count = sessions.filter(s => s.timestamp >= d.getTime() && s.timestamp < nextD.getTime()).length
      weekDays.push({ label: dayNames[d.getDay()], count, date: d })
    }
    const maxWeekCount = Math.max(...weekDays.map(d => d.count), 1)

    // Totals
    const totalSessions = sessions.length
    const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0)
    const avgMessages = totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0

    // Most active day of week
    const dayTotals = [0, 0, 0, 0, 0, 0, 0]
    for (const s of sessions) {
      dayTotals[new Date(s.timestamp).getDay()]++
    }
    const maxDayIdx = dayTotals.indexOf(Math.max(...dayTotals))
    const mostActiveDay = dayNames[maxDayIdx]

    // Activity streak
    let streak = 0
    const checkDate = new Date(todayStart)
    while (true) {
      const nextD = new Date(checkDate.getTime() + 86400000)
      const hasSession = sessions.some(s => s.timestamp >= checkDate.getTime() && s.timestamp < nextD.getTime())
      if (hasSession) {
        streak++
        checkDate.setTime(checkDate.getTime() - 86400000)
      } else {
        break
      }
    }

    // Top tags
    const tagCounts: Record<string, number> = {}
    for (const tags of Object.values(sessionTags)) {
      for (const tagId of tags) {
        tagCounts[tagId] = (tagCounts[tagId] || 0) + 1
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tagId, count]) => {
        const preset = TAG_PRESETS.find(p => p.id === tagId)
        const idx = preset ? TAG_PRESETS.indexOf(preset) : -1
        return { name: idx >= 0 ? tagNames[idx] : tagId, count, color: preset?.color || 'var(--text-muted)' }
      })
    const maxTagCount = topTags.length > 0 ? topTags[0].count : 1

    return { weekDays, maxWeekCount, totalSessions, totalMessages, avgMessages, mostActiveDay, streak, topTags, maxTagCount }
  }, [sessions, sessionTags, tagNames])

  const glassCard: React.CSSProperties = {
    background: 'var(--popup-bg)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '12px 14px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
    marginBottom: 12,
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }

  return (
    <div style={{ padding: '12px 14px', overflow: 'auto', height: '100%', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '4px 6px', borderRadius: 8,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ArrowLeft size={12} />
          {t('session.backToList')}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <BarChart3 size={13} color="#6366f1" />
          {t('session.statsTitle')}
        </span>
      </div>

      {/* Weekly chart */}
      <div style={glassCard}>
        <div style={sectionLabel}>
          <span style={{ width: 3, height: 12, background: '#6366f1', borderRadius: 2, display: 'inline-block' }} />
          {t('session.thisWeek')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {stats.weekDays.map((day, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                {day.label}
              </span>
              <div style={{ flex: 1, height: 14, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{
                  height: '100%',
                  width: `${(day.count / stats.maxWeekCount) * 100}%`,
                  background: 'linear-gradient(90deg, rgba(99,102,241,0.90), rgba(129,140,248,0.90))',
                  borderRadius: 4,
                  transition: 'all 0.15s ease',
                  minWidth: day.count > 0 ? 4 : 0,
                }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                {day.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Overview */}
      <div style={glassCard}>
        <div style={sectionLabel}>
          <span style={{ width: 3, height: 12, background: '#6366f1', borderRadius: 2, display: 'inline-block' }} />
          {t('session.overview')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          <StatRow icon={<Layers size={11} />} label={t('session.totalSessions')} value={String(stats.totalSessions)} />
          <StatRow icon={<MessageSquare size={11} />} label={t('session.totalMessages')} value={String(stats.totalMessages)} />
          <StatRow icon={<Calendar size={11} />} label={t('session.mostActiveDay')} value={stats.mostActiveDay} />
          <StatRow icon={<MessageSquare size={11} />} label={t('session.avgMessages')} value={String(stats.avgMessages)} />
          <StatRow icon={<Flame size={11} />} label={t('session.activityStreak')} value={`${stats.streak}d${stats.streak >= 3 ? ' 🔥' : ''}`} />
        </div>
      </div>

      {/* Top Tags */}
      {stats.topTags.length > 0 && (
        <div style={glassCard}>
          <div style={sectionLabel}>
            <span style={{ width: 3, height: 12, background: '#6366f1', borderRadius: 2, display: 'inline-block' }} />
            {t('session.topTags')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.topTags.map((tag, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag size={9} color={tag.color} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tag.name}
                </span>
                <div style={{ flex: 1, height: 10, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{
                    height: '100%',
                    width: `${(tag.count / stats.maxTagCount) * 100}%`,
                    background: tag.color,
                    borderRadius: 4,
                    opacity: 0.75,
                  }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                  {tag.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color: '#a5b4fc', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', lineHeight: 1.3, letterSpacing: '-0.02em' }}>{value}</span>
    </div>
  )
}
