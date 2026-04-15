// DailySummaryCard — shows daily usage stats + tasks/reminders briefing on WelcomeScreen (Iteration 417, 466)
import React, { useState, useMemo } from 'react'
import { Calendar, X, MessageSquare, Layers, Zap, CheckSquare, Bell, ArrowRight } from 'lucide-react'
import { useSessionStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { TaskItem, ReminderItem } from '../sidebar/TasksPanel'

// Stable empty arrays — prevent new reference when prefs key is absent
const EMPTY_TASKS: TaskItem[] = []
const EMPTY_REMINDERS: ReminderItem[] = []

// Rotating productivity tips (20+)
const TIPS = [
  'dailyBriefing.tips.breakTasks',
  'dailyBriefing.tips.twoMinRule',
  'dailyBriefing.tips.deepWork',
  'dailyBriefing.tips.singleTask',
  'dailyBriefing.tips.timeBlock',
  'dailyBriefing.tips.eatTheFrog',
  'dailyBriefing.tips.batchSimilar',
  'dailyBriefing.tips.reviewDaily',
  'dailyBriefing.tips.takeBreaks',
  'dailyBriefing.tips.limitWIP',
  'dailyBriefing.tips.setDeadlines',
  'dailyBriefing.tips.useTemplates',
  'dailyBriefing.tips.automate',
  'dailyBriefing.tips.delegateOrDrop',
  'dailyBriefing.tips.morningRoutine',
  'dailyBriefing.tips.endOfDay',
  'dailyBriefing.tips.energyManagement',
  'dailyBriefing.tips.progressNotPerfection',
  'dailyBriefing.tips.contextSwitch',
  'dailyBriefing.tips.celebrateWins',
]

export default function DailySummaryCard() {
  const t = useT()
  const sessions = useSessionStore(s => s.sessions)
  const tasks: TaskItem[] = usePrefsStore(s => (s.prefs as any).tasks ?? EMPTY_TASKS)
  const reminders: ReminderItem[] = usePrefsStore(s => (s.prefs as any).reminders ?? EMPTY_REMINDERS)

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

    // Tasks stats
    const pendingTasks = tasks.filter(tk => !tk.done).length
    const completedToday = tasks.filter(tk => tk.done && tk.createdAt >= todayTs).length

    // Next upcoming reminder
    const now = Date.now()
    const futureReminders = reminders
      .filter(r => r.fireAt > now)
      .sort((a, b) => a.fireAt - b.fireAt)
    const nextReminder = futureReminders[0] || null

    return {
      sessionsToday: todaySessions.length,
      messagesToday: todayMessages,
      topics,
      pendingTasks,
      completedToday,
      nextReminder,
    }
  }, [sessions, tasks, reminders])

  // Rotate tip daily based on day of year
  const tipKey = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
    return TIPS[dayOfYear % TIPS.length]
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem('aipa:daily-summary-date', new Date().toDateString())
    } catch { /* ignore */ }
  }

  const navigateToTasks = () => {
    const ui = useUiStore.getState()
    ui.setSidebarOpen(true)
    ui.setSidebarTab('tasks')
    ui.setActiveNavItem('tasks')
  }

  // Time-aware greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return t('dailyBriefing.goodMorning')
    if (hour < 17) return t('dailyBriefing.goodAfternoon')
    return t('dailyBriefing.goodEvening')
  }, [t])

  // Don't show if dismissed today
  if (dismissed) return null

  // Show briefing even when no sessions — now has tasks/reminders content
  const hasContent = stats.sessionsToday > 0 || stats.pendingTasks > 0 || stats.nextReminder

  return (
    <div style={{
      width: '100%', maxWidth: 420, padding: '12px 16px',
      background: 'rgba(15,15,25,0.88)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid rgba(99,102,241,0.6)',
      borderRadius: 12,
      position: 'relative',
      transition: 'all 0.15s ease',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
    }}>
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: '3px 4px', borderRadius: 6,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <X size={14} />
      </button>

      {/* Title with greeting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Calendar size={13} color="#818cf8" />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {greeting}
        </span>
      </div>

      {/* Stats row */}
      {hasContent && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {stats.sessionsToday > 0 && (
            <>
              <div style={{
                background: 'var(--bg-hover)', borderRadius: 6,
                padding: '3px 8px', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                color: 'var(--text-primary)',
              }}>
                <Layers size={9} color="#818cf8" />
                <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{stats.sessionsToday}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('dailySummary.sessions')}</span>
              </div>
              <div style={{
                background: 'var(--bg-hover)', borderRadius: 6,
                padding: '3px 8px', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                color: 'var(--text-primary)',
              }}>
                <MessageSquare size={9} color="#818cf8" />
                <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{stats.messagesToday}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('dailySummary.messages')}</span>
              </div>
            </>
          )}
          {stats.pendingTasks > 0 && (
            <div style={{
              background: 'var(--bg-hover)', borderRadius: 6,
              padding: '3px 8px', fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
              color: 'var(--text-primary)',
            }}>
              <CheckSquare size={9} color="#818cf8" />
              <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{stats.pendingTasks}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('dailyBriefing.pendingTasks')}</span>
            </div>
          )}
        </div>
      )}

      {/* Next reminder */}
      {stats.nextReminder && (
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
        }}>
          <Bell size={9} color="#818cf8" />
          <span>
            {t('dailyBriefing.nextReminder')}: {stats.nextReminder.text}
            {' '}(<span style={{ opacity: 0.60, fontSize: 11, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{new Date(stats.nextReminder.fireAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>)
          </span>
        </div>
      )}

      {/* Topics */}
      {stats.topics.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>
          <Zap size={9} style={{ marginRight: 3, verticalAlign: 'middle', color: '#818cf8' }} />
          {t('dailySummary.topics')}: {stats.topics.join(', ')}
        </div>
      )}

      {/* No content state */}
      {!hasContent && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>
          {t('dailyBriefing.allClear')}
        </div>
      )}

      {/* Productivity tip */}
      <div style={{
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
        padding: '6px 8px', background: 'rgba(99,102,241,0.06)',
        borderRadius: 6, marginTop: 4,
        borderTop: '1px solid var(--bg-hover)',
      }}>
        <Zap size={9} style={{ marginRight: 3, verticalAlign: 'middle', color: '#818cf8' }} />
        {t(tipKey)}
      </div>

      {/* View tasks link */}
      {stats.pendingTasks > 0 && (
        <button
          onClick={navigateToTasks}
          style={{
            marginTop: 8, background: 'transparent',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: '#818cf8', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: 8,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {t('dailyBriefing.viewTasks')}
          <ArrowRight size={10} />
        </button>
      )}
    </div>
  )
}
