import { ScheduledPrompt, ScheduleRepeat } from '../../types/app.types'

export const MAX_SCHEDULES = 30
export const MAX_NAME_LENGTH = 50
export const MAX_PROMPT_LENGTH = 2000

export const SCHEDULE_ICONS = ['⏰', '📅', '🔔', '📊', '📝', '🎯', '💡', '📧', '🗓️', '✅', '📋', '🔄']

export const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const PRESET_SCHEDULES: Omit<ScheduledPrompt, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'runCount'>[] = [
  {
    name: 'Daily Summary',
    prompt: 'Give me a brief summary of today\'s key tasks and progress. What should I focus on tomorrow?',
    icon: '📊',
    repeat: 'daily',
    hour: 18,
    minute: 0,
    enabled: true,
  },
  {
    name: 'Weekly Review',
    prompt: 'Help me review this week: What went well? What could be improved? What are my priorities for next week?',
    icon: '📅',
    repeat: 'weekly',
    hour: 17,
    minute: 0,
    dayOfWeek: 5, // Friday
    enabled: true,
  },
  {
    name: 'Morning Motivation',
    prompt: 'Good morning! Give me an inspiring thought for today and suggest 3 productive things I could accomplish.',
    icon: '🌅',
    repeat: 'daily',
    hour: 8,
    minute: 0,
    enabled: true,
  },
]

export function computeNextRun(
  repeat: ScheduleRepeat,
  hour: number,
  minute: number,
  dayOfWeek?: number,
  dayOfMonth?: number,
): number {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)

  if (repeat === 'once') {
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime()
  }

  if (repeat === 'daily') {
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime()
  }

  if (repeat === 'weekly' && dayOfWeek !== undefined) {
    const currentDay = now.getDay()
    let daysUntil = dayOfWeek - currentDay
    if (daysUntil < 0 || (daysUntil === 0 && target.getTime() <= now.getTime())) {
      daysUntil += 7
    }
    target.setDate(target.getDate() + daysUntil)
    return target.getTime()
  }

  if (repeat === 'monthly' && dayOfMonth !== undefined) {
    target.setDate(dayOfMonth)
    if (target.getTime() <= now.getTime()) {
      target.setMonth(target.getMonth() + 1)
    }
    return target.getTime()
  }

  return target.getTime()
}

export function formatNextRun(nextRunAt: number, t: (k: string) => string): string {
  const now = Date.now()
  const diff = nextRunAt - now
  if (diff < 0) return t('schedule.overdue')

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return t('schedule.inDays').replace('{{days}}', String(days))
  }
  if (hours > 0) {
    return t('schedule.inHours').replace('{{hours}}', String(hours)).replace('{{minutes}}', String(minutes))
  }
  return t('schedule.inMinutes').replace('{{minutes}}', String(minutes || 1))
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
