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

      {/* Title with greeting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Calendar size={13} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {greeting}
        </span>
      </div>

      {/* Stats row */}
      {hasContent && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
          {stats.sessionsToday > 0 && (
            <>
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
            </>
          )}
          {stats.pendingTasks > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--warning, #e8a838)' }}>
                {stats.pendingTasks}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                <CheckSquare size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                {t('dailyBriefing.pendingTasks')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Next reminder */}
      {stats.nextReminder && (
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
        }}>
          <Bell size={9} color="var(--accent)" />
          <span>
            {t('dailyBriefing.nextReminder')}: {stats.nextReminder.text}
            {' '}({new Date(stats.nextReminder.fireAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
          </span>
        </div>
      )}

      {/* Topics */}
      {stats.topics.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 4 }}>
          <Zap size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
          {t('dailySummary.topics')}: {stats.topics.join(', ')}
        </div>
      )}

      {/* No content state */}
      {!hasContent && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          {t('dailyBriefing.allClear')}
        </div>
      )}

      {/* Productivity tip */}
      <div style={{
        fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
        padding: '6px 8px', background: 'rgba(0,122,204,0.04)',
        borderRadius: 6, marginTop: 4,
      }}>
        <Zap size={9} style={{ marginRight: 3, verticalAlign: 'middle', color: 'var(--accent)' }} />
        {t(tipKey)}
      </div>

      {/* View tasks link */}
      {stats.pendingTasks > 0 && (
        <button
          onClick={navigateToTasks}
          style={{
            marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
            padding: 0,
          }}
        >
          {t('dailyBriefing.viewTasks')}
          <ArrowRight size={10} />
        </button>
      )}
    </div>
  )
}
