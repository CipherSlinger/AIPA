/**
 * Work Calendar reminders + legacy Tasks panel migration.
 *
 * Reminders live in the Work Calendar plugin data (reminders.json) so the
 * plugin UI owns them, but they must fire even when the plugin iframe is not
 * mounted — so the scheduler runs here in the main process.
 */
import { BrowserWindow, Notification } from 'electron'
import { readPluginData, writePluginData } from './plugin-services'
import { listNavPlugins } from './nav-plugin-manager'
import { getRawPref, deleteRawPref } from '../config/config-manager'
import { nextFireTime } from '../utils/cron'
import { createLogger } from '../utils/logger'

const log = createLogger('work-calendar-reminders')

export const WORK_CALENDAR_ID = 'aipa-work-calendar'
const CHECK_INTERVAL_MS = 15_000

export interface CalendarReminder {
  id: string
  text: string
  fireAt: number          // epoch ms of next fire
  cron?: string           // set for recurring reminders
  createdAt: number
  lastFiredAt?: number
}

interface CalendarTask {
  id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  startDate: string | null
  dueDate: string | null
  workSourceId: string | null
  createdAt: string
  updatedAt: string
}

interface LegacyTask {
  id?: string
  text?: string
  done?: boolean
  status?: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  createdAt?: number
}

interface LegacyReminder {
  id?: string
  text?: string
  fireAt?: number
  createdAt?: number
  cronExpression?: string
  recurring?: boolean
}

function readList<T>(key: string): T[] {
  const value = readPluginData(WORK_CALENDAR_ID, key)
  return Array.isArray(value) ? value as T[] : []
}

/**
 * One-time move of the removed Tasks panel data (prefs `tasks` / `reminders`)
 * into the Work Calendar plugin. Legacy prefs are deleted only after the
 * plugin data is written, so a failure leaves the originals untouched.
 */
export function migrateLegacyTasks(): void {
  try {
    const legacyTasks = getRawPref('tasks')
    const legacyReminders = getRawPref('reminders')

    if (Array.isArray(legacyTasks)) {
      if (legacyTasks.length > 0) {
        const existing = readList<CalendarTask>('tasks')
        const ids = new Set(existing.map(t => t.id))
        const migrated = (legacyTasks as LegacyTask[])
          .filter(t => t && typeof t.text === 'string' && t.text.trim())
          .map((t): CalendarTask => {
            const status = t.status ?? (t.done ? 'completed' : 'pending')
            const iso = new Date(t.createdAt || Date.now()).toISOString()
            return {
              id: t.id || `legacy-${Math.random().toString(36).slice(2, 10)}`,
              title: t.text!.trim().slice(0, 200),
              description: t.activeForm || '',
              status: status === 'completed' ? 'done' : status === 'in_progress' ? 'in_progress' : 'todo',
              priority: 'medium',
              startDate: null,
              dueDate: null,
              workSourceId: null,
              createdAt: iso,
              updatedAt: iso,
            }
          })
          .filter(t => !ids.has(t.id))
        writePluginData(WORK_CALENDAR_ID, 'tasks', existing.concat(migrated))
        log.info(`Migrated ${migrated.length} legacy tasks into Work Calendar`)
      }
      deleteRawPref('tasks')
    }

    if (Array.isArray(legacyReminders)) {
      if (legacyReminders.length > 0) {
        const now = Date.now()
        const existing = readList<CalendarReminder>('reminders')
        const ids = new Set(existing.map(r => r.id))
        const migrated = (legacyReminders as LegacyReminder[])
          .filter(r => r && typeof r.text === 'string' && r.text.trim() && typeof r.fireAt === 'number')
          .map((r): CalendarReminder | null => {
            const cron = r.recurring && r.cronExpression ? r.cronExpression : undefined
            let fireAt = r.fireAt!
            if (fireAt <= now) {
              // Overdue one-shots are dropped; recurring ones roll forward
              if (!cron) return null
              const next = nextFireTime(cron)
              if (!next) return null
              fireAt = next.getTime()
            }
            return {
              id: r.id || `legacy-${Math.random().toString(36).slice(2, 10)}`,
              text: r.text!.trim(),
              fireAt,
              cron,
              createdAt: r.createdAt || now,
            }
          })
          .filter((r): r is CalendarReminder => r !== null && !ids.has(r.id))
        writePluginData(WORK_CALENDAR_ID, 'reminders', existing.concat(migrated))
        log.info(`Migrated ${migrated.length} legacy reminders into Work Calendar`)
      }
      deleteRawPref('reminders')
    }
  } catch (err) {
    log.warn('Legacy tasks migration failed (prefs left intact):', err)
  }
}

function fireDueReminders(win: BrowserWindow): void {
  if (!listNavPlugins().some(p => p.manifest.id === WORK_CALENDAR_ID)) return
  const reminders = readList<CalendarReminder>('reminders')
  const now = Date.now()
  const due = reminders.filter(r => typeof r.fireAt === 'number' && r.fireAt <= now)
  if (due.length === 0) return

  for (const r of due) {
    if (!Notification.isSupported()) break
    const notif = new Notification({ title: '工作日历提醒', body: r.text })
    notif.on('click', () => {
      if (win.isDestroyed()) return
      win.show()
      win.focus()
      win.webContents.send('plugin:open', WORK_CALENDAR_ID)
    })
    notif.show()
  }

  // One-shot reminders are removed; recurring ones are rescheduled
  const dueIds = new Set(due.map(r => r.id))
  const rescheduled = due
    .filter(r => r.cron)
    .map(r => {
      const next = nextFireTime(r.cron!, new Date(now))
      return next ? { ...r, fireAt: next.getTime(), lastFiredAt: now } : null
    })
    .filter((r): r is CalendarReminder => r !== null)
  writePluginData(WORK_CALENDAR_ID, 'reminders', reminders.filter(r => !dueIds.has(r.id)).concat(rescheduled))
}

export function startWorkCalendarReminders(win: BrowserWindow): void {
  const tick = () => {
    try { fireDueReminders(win) } catch (err) { log.warn('Reminder check failed:', err) }
  }
  tick()
  const timer = setInterval(tick, CHECK_INTERVAL_MS)
  timer.unref()
  win.on('closed', () => clearInterval(timer))
}
