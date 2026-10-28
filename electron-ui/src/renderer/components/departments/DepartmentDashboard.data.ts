// Derivation for the single-department view: roster ordering/search, the stat
// line and the JSON export. Pure (plus the pin flag) so the view itself can stay
// about state and layout.

import type { Position } from '../../store'
import type { SessionListItem } from '../../types/app.types'

export type SortOrder = 'recent' | 'oldest' | 'msgs'
export type Translate = (key: string, params?: Record<string, string | number>) => string

const PIN_PREFIX = 'aipa:session-pin:'

/** A pinned session is a localStorage flag, not part of the session record. */
export function isSessionPinned(sessionId: string): boolean {
  try {
    return localStorage.getItem(`${PIN_PREFIX}${sessionId}`) === '1'
  } catch {
    return false
  }
}

export function sortSessions(sessions: SessionListItem[], order: SortOrder): SessionListItem[] {
  if (order === 'recent') return sessions
  const sorted = [...sessions]
  if (order === 'oldest') sorted.sort((a, b) => a.timestamp - b.timestamp)
  else sorted.sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
  return sorted
}

export function searchSessions(sessions: SessionListItem[], query: string): SessionListItem[] {
  if (!query.trim()) return sessions
  const q = query.toLowerCase()
  return sessions.filter(s =>
    (s.title || '').toLowerCase().includes(q) ||
    (s.lastPrompt || '').toLowerCase().includes(q),
  )
}

export function pinnedFirst(sessions: SessionListItem[]): SessionListItem[] {
  const pinned: SessionListItem[] = []
  const rest: SessionListItem[] = []
  for (const session of sessions) {
    if (isSessionPinned(session.sessionId)) pinned.push(session)
    else rest.push(session)
  }
  return [...pinned, ...rest]
}

export function searchPositions(positions: Position[], query: string): Position[] {
  const q = query.trim().toLowerCase()
  if (!q) return positions
  return positions.filter(p => p.title.toLowerCase().includes(q) || p.brief.toLowerCase().includes(q))
}

export interface SessionGroup {
  label: string
  sessions: SessionListItem[]
}

/** Recent order splits the roster into today / yesterday / this week / older. */
export function groupSessionsByRecency(sessions: SessionListItem[], t: Translate): SessionGroup[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 6 * 86400000

  const today: SessionListItem[] = []
  const yesterday: SessionListItem[] = []
  const thisWeek: SessionListItem[] = []
  const older: SessionListItem[] = []
  for (const session of sessions) {
    if (session.timestamp >= todayStart) today.push(session)
    else if (session.timestamp >= yesterdayStart) yesterday.push(session)
    else if (session.timestamp >= weekStart) thisWeek.push(session)
    else older.push(session)
  }

  const groups: SessionGroup[] = []
  if (today.length) groups.push({ label: t('session.today'), sessions: today })
  if (yesterday.length) groups.push({ label: t('session.yesterday'), sessions: yesterday })
  if (thisWeek.length) groups.push({ label: t('session.thisWeek'), sessions: thisWeek })
  if (older.length) groups.push({ label: t('session.thisMonth'), sessions: older })
  return groups
}

export function countToday(sessions: SessionListItem[]): number {
  const todayStart = new Date().setHours(0, 0, 0, 0)
  return sessions.filter(s => s.timestamp >= todayStart).length
}

export interface StatItem {
  label: string
  value: number
}

export function buildDeptStats(
  counts: { sessions: number; today: number; messages: number; positions: number; teams: number },
  t: Translate,
): StatItem[] {
  const stats: StatItem[] = [
    { label: t('dept.sessions'), value: counts.sessions },
    { label: t('session.today'), value: counts.today },
    { label: t('dept.msgCount'), value: counts.messages },
  ]
  if (counts.positions > 0) stats.push({ label: t('dept.positionOpen'), value: counts.positions })
  if (counts.teams > 0) stats.push({ label: t('dept.teams'), value: counts.teams })
  return stats
}

/** Download the department's sessions as JSON — the only bulk action here. */
export function exportSessionsToFile(deptName: string, sessions: SessionListItem[]): void {
  const data = sessions.map(s => ({
    id: s.sessionId,
    title: s.title || s.lastPrompt?.slice(0, 60) || 'Untitled',
    lastPrompt: s.lastPrompt,
    messageCount: s.messageCount,
    timestamp: new Date(s.timestamp).toISOString(),
    project: s.project,
  }))
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${deptName.replace(/[^a-z0-9]/gi, '_')}_sessions_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
