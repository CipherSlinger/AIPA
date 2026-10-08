// ArchivePanel — 档案部: the company-wide ledger of finished work.
//
// Every department roster answers "who works here"; this answers "what has this
// company actually done, and who did it". A record is a session, because a
// session *is* an employee's run at a task, and it is attributed to the node
// whose folder it ran in. That attribution is derived, not stored — see
// `findDeptForSession` in deptUtils for the one join between the two. Sessions in
// folders no node owns are not lost: they land in an explicit 未分派 group.
//
// Records are *grouped* by the top of their branch, not by the leaf that owns
// them. Once an org has three levels, grouping by leaf would shred one company's
// ledger into a row of 研发部 / 前端组 / 后端组 groups with no visible relation;
// the leaf is shown per record instead, and the group is the company.

import React, { useCallback, useMemo, useState } from 'react'
import {
  Archive,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  Inbox,
  Search,
  X,
} from 'lucide-react'
import { useDepartmentStore, usePrefsStore, useSessionStore, type Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useT, useI18n } from '../../i18n'
import { deptByNormDir, deptBySlug, deptEmoji, findDeptForSession, kindOf, rootOf } from '../departments/deptUtils'
import { openSessionCore } from '../departments/openSessionCore'

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

type TimeRange = 'all' | 'today' | 'week' | 'month'
/** Sentinel for the department filter's "not assigned to any department" option. */
const UNASSIGNED = '__unassigned__'

interface ArchiveRecord {
  session: SessionListItem
  /** The node whose folder the session ran in — the leaf, for the sub-label. */
  dept: Department | null
  /** The top of that node's branch — what the record is grouped under. */
  root: Department | null
  archived: boolean
}

interface ArchiveGroup {
  /** null for the 未分派 group. */
  root: Department | null
  records: ArchiveRecord[]
  /** Newest timestamp in the group — the ledger reads best newest-company-first. */
  latest: number
}

const TIME_WINDOWS: Record<Exclude<TimeRange, 'all'>, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

/** Short, stable handle for an employee — the session id is all they have. */
function employeeTag(sessionId: string): string {
  return sessionId.replace(/-/g, '').slice(0, 6)
}

function recordTitle(session: SessionListItem, untitled: string): string {
  return session.title?.trim() || session.lastPrompt?.split('\n')[0].trim() || untitled
}

function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '3px 9px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
        border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
        background: active ? 'rgba(99,102,241,0.14)' : hovered ? 'var(--bg-hover)' : 'transparent',
        color: active ? '#818cf8' : 'var(--text-muted)',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export default function ArchivePanel() {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const departments = useDepartmentStore(s => s.departments)
  const sessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const homeDir = useSessionStore(s => s.homeDir)
  const archivedSessions = usePrefsStore(s => s.prefs.archivedSessions) || []
  const setPrefs = usePrefsStore(s => s.setPrefs)

  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [opening, setOpening] = useState<string | null>(null)

  const archivedSet = useMemo(() => new Set(archivedSessions), [archivedSessions])
  const slugIndex = useMemo(() => deptBySlug(departments), [departments])
  const dirIndex = useMemo(() => deptByNormDir(departments, homeDir), [departments, homeDir])
  const byId = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  // Every session is a record. Attribution is a lookup, never stored.
  const allRecords: ArchiveRecord[] = useMemo(
    () => sessions.map(session => {
      const dept = findDeptForSession(session, slugIndex, dirIndex, homeDir)
      return {
        session,
        dept,
        root: dept ? rootOf(dept, byId) : null,
        archived: archivedSet.has(session.sessionId),
      }
    }),
    [sessions, slugIndex, dirIndex, homeDir, archivedSet, byId],
  )

  const records = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cutoff = timeRange === 'all' ? 0 : Date.now() - TIME_WINDOWS[timeRange]
    return allRecords.filter(r => {
      if (!showArchived && r.archived) return false
      if (timeRange !== 'all' && r.session.timestamp < cutoff) return false
      // The filter picks a branch, so anything anywhere under it matches.
      if (deptFilter === UNASSIGNED ? r.dept !== null : deptFilter !== 'all' && r.root?.id !== deptFilter) return false
      if (!q) return true
      const haystack = `${r.session.title || ''}\n${r.session.lastPrompt || ''}\n${r.session.project || ''}`
      return haystack.toLowerCase().includes(q)
    })
  }, [allRecords, query, timeRange, showArchived, deptFilter])

  // Group by the top of each branch, newest-worked group first, 未分派 last.
  const groups: ArchiveGroup[] = useMemo(() => {
    const byRoot = new Map<string, ArchiveGroup>()
    for (const record of records) {
      const key = record.root?.id ?? UNASSIGNED
      let group = byRoot.get(key)
      if (!group) {
        group = { root: record.root, records: [], latest: 0 }
        byRoot.set(key, group)
      }
      group.records.push(record)
      group.latest = Math.max(group.latest, record.session.timestamp)
    }
    return [...byRoot.values()].sort((a, b) => {
      if (!a.root) return 1
      if (!b.root) return -1
      return b.latest - a.latest
    })
  }, [records])

  const summary = useMemo(() => {
    const weekCutoff = Date.now() - TIME_WINDOWS.week
    const week = allRecords.filter(r => r.session.timestamp >= weekCutoff).length
    const rootIds = new Set(allRecords.map(r => r.root?.id).filter(Boolean) as string[])
    return { total: allRecords.length, roots: rootIds.size, week }
  }, [allRecords])

  /** The filter's options — one per branch that actually holds work. */
  const filterTargets = useMemo(() => {
    const seen = new Map<string, Department>()
    for (const r of allRecords) if (r.root) seen.set(r.root.id, r.root)
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allRecords])

  const unassignedCount = useMemo(
    () => allRecords.filter(r => r.dept === null).length,
    [allRecords],
  )

  const open = useCallback(async (record: ArchiveRecord) => {
    setOpening(record.session.sessionId)
    try {
      await openSessionCore(record.session, record.dept?.directory ?? '', 'archive')
    } finally {
      setOpening(null)
    }
  }, [])

  const toggleArchived = useCallback((sessionId: string) => {
    const current = usePrefsStore.getState().prefs.archivedSessions || []
    const next = current.includes(sessionId)
      ? current.filter(id => id !== sessionId)
      : [...current, sessionId]
    setPrefs({ archivedSessions: next })
    window.electronAPI.prefsSet('archivedSessions', next)
  }, [setPrefs])

  const exportLedger = useCallback(() => {
    const data = groups.map(group => ({
      company: group.root?.name ?? t('archive.unassigned'),
      directory: group.root?.directory ?? null,
      tasks: group.records.map(r => ({
        title: recordTitle(r.session, t('session.untitled')),
        employee: employeeTag(r.session.sessionId),
        // Which desk inside that company the work happened at.
        department: r.dept?.name ?? null,
        sessionId: r.session.sessionId,
        project: r.session.project,
        lastPrompt: r.session.lastPrompt,
        messageCount: r.session.messageCount ?? 0,
        timestamp: new Date(r.session.timestamp).toISOString(),
        archived: r.archived,
      })),
    }))
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), companies: data }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aipa_archive_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [groups, t])

  const filtersActive = deptFilter !== 'all' || timeRange !== 'all' || showArchived || query.trim().length > 0
  const clearFilters = () => { setDeptFilter('all'); setTimeRange('all'); setShowArchived(false); setQuery('') }

  const timeOptions: TimeRange[] = ['all', 'today', 'week', 'month']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)',
        }}>
          <Archive size={14} color="#818cf8" />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('nav.archive')}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', ...ELLIPSIS }}>
          {t('archive.summary', {
            total: String(summary.total),
            depts: String(summary.roots),
            week: String(summary.week),
          })}
        </span>
        <button
          onClick={exportLedger}
          disabled={records.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
            color: records.length === 0 ? 'var(--text-faint)' : '#22c55e',
            cursor: records.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <ArrowUpDown size={11} />{t('archive.export')}
        </button>
      </div>

      {/* Filters */}
      <div style={{
        flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderBottom: '1px solid var(--bg-hover)',
      }}>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: 8, fontSize: 11, maxWidth: 180,
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
            color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="all">{t('archive.allDepartments')}</option>
          {filterTargets.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
          <option value={UNASSIGNED}>{t('archive.unassigned')}</option>
        </select>

        {timeOptions.map(range => (
          <Pill key={range} active={timeRange === range} onClick={() => setTimeRange(range)}>
            {t(`archive.time.${range}`)}
          </Pill>
        ))}

        <Pill active={showArchived} onClick={() => setShowArchived(v => !v)}>
          {t('archive.showArchived')}
        </Pill>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 140,
          padding: '4px 9px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-hover)',
        }}>
          <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('archive.searchPlaceholder')}
            style={{
              flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 11,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
            >
              <X size={10} />
            </button>
          )}
        </div>

        {filtersActive && (
          <button
            onClick={clearFilters}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {t('archive.clearFilters')}
          </button>
        )}
      </div>

      {/* Ledger */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
        {sessionsLoading && sessions.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('archive.loading')}
          </div>
        ) : allRecords.length === 0 ? (
          <EmptyState
            icon={<Inbox size={30} style={{ color: '#6366f1', opacity: 0.45 }} />}
            title={t('archive.emptyTitle')}
            hint={t('archive.emptyHint')}
          />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Search size={30} style={{ color: '#6366f1', opacity: 0.45 }} />}
            title={t('archive.noMatchTitle')}
            hint={t('archive.noMatchHint')}
            onClear={clearFilters}
            clearLabel={t('archive.clearFilters')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map(group => {
              const key = group.root?.id ?? UNASSIGNED
              const isCollapsed = !!collapsed[key]
              return (
                <div key={key}>
                  {/* Group header — the company (or a legacy top-level department) */}
                  <button
                    onClick={() => setCollapsed(c => ({ ...c, [key]: !c[key] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px',
                      color: 'var(--text-secondary)', textAlign: 'left',
                    }}
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{group.root ? deptEmoji(group.root.id) : '📭'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {group.root?.name ?? t('archive.unassigned')}
                    </span>
                    {group.root && kindOf(group.root) === 'company' && (
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 999,
                        border: '1px solid rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.08)',
                        color: '#818cf8',
                      }}>
                        {t('dept.companyTag')}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 999,
                      background: 'var(--bg-hover)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {group.records.length}
                    </span>
                    {group.root && (
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', ...ELLIPSIS, maxWidth: 260 }}>
                        {group.root.directory}
                      </span>
                    )}
                  </button>

                  {!isCollapsed && (
                    <div style={{
                      border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                      background: 'var(--bg-hover)',
                    }}>
                      {group.records.map((record, i) => (
                        <ArchiveRow
                          key={record.session.sessionId}
                          record={record}
                          first={i === 0}
                          opening={opening === record.session.sessionId}
                          onOpen={() => void open(record)}
                          onToggleArchived={() => toggleArchived(record.session.sessionId)}
                          t={t}
                          locale={resolvedLocale}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {unassignedCount > 0 && deptFilter === 'all' && (
        <div style={{
          flexShrink: 0, padding: '7px 16px', borderTop: '1px solid var(--bg-hover)',
          fontSize: 10, color: 'var(--text-faint)',
        }}>
          {t('archive.unassignedHint', { count: String(unassignedCount) })}
        </div>
      )}
    </div>
  )
}

function EmptyState({
  icon, title, hint, onClear, clearLabel,
}: { icon: React.ReactNode; title: string; hint: string; onClear?: () => void; clearLabel?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 20px', textAlign: 'center' }}>
      <div style={{
        width: 68, height: 68, borderRadius: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 340 }}>{hint}</div>
      {onClear && (
        <button
          onClick={onClear}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)',
          }}
        >
          {clearLabel}
        </button>
      )}
    </div>
  )
}

function ArchiveRow({
  record, first, opening, onOpen, onToggleArchived, t, locale,
}: {
  record: ArchiveRecord
  first: boolean
  opening: boolean
  onOpen: () => void
  onToggleArchived: () => void
  t: ReturnType<typeof useT>
  locale: string
}) {
  const [hovered, setHovered] = useState(false)
  const { session } = record
  const title = recordTitle(session, t('session.untitled'))
  const when = new Date(session.timestamp).toLocaleString(locale)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      title={session.lastPrompt || title}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', cursor: 'pointer',
        borderTop: first ? 'none' : '1px solid var(--bg-active)',
        background: hovered ? 'var(--bg-active)' : 'transparent',
        opacity: record.archived ? 0.55 : 1,
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{ fontSize: 11, width: 12, flexShrink: 0, color: 'var(--text-muted)' }}>
        {record.archived ? '📦' : '📄'}
      </span>

      <span style={{
        flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)',
        fontWeight: 500, ...ELLIPSIS,
      }}>
        {title}
      </span>

      {record.archived && (
        <span style={{
          flexShrink: 0, fontSize: 9, padding: '1px 6px', borderRadius: 999,
          border: '1px solid var(--border)', color: 'var(--text-muted)',
        }}>
          {t('archive.archivedTag')}
        </span>
      )}

      {/* Employee handle — a session has no name of its own, so the id is it. */}
      <span
        title={session.sessionId}
        style={{
          flexShrink: 0, fontSize: 10, fontFamily: 'monospace',
          padding: '1px 6px', borderRadius: 5,
          background: 'rgba(99,102,241,0.10)', color: '#818cf8',
          border: '1px solid rgba(99,102,241,0.22)',
        }}
      >
        #{employeeTag(session.sessionId)}
      </span>

      {/* Which desk inside the group's company this was worked at. Only shown when
          the record sat below the group node — a top-level department's own work
          would otherwise repeat its own name on every row. */}
      {record.dept && record.dept.id !== record.root?.id && (
        <span
          title={record.dept.directory}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-faint)', maxWidth: 180 }}
        >
          <FolderOpen size={10} />
          <span style={ELLIPSIS}>
            {kindOf(record.dept) === 'team'
              ? `${record.dept.name} · ${t('dept.team')}`
              : record.dept.name}
          </span>
        </span>
      )}

      {/* Unassigned records have no group to carry their folder, so spell it out. */}
      {!record.dept && (
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-faint)', maxWidth: 200 }}>
          <FolderOpen size={10} />
          <span style={ELLIPSIS}>{session.project || '—'}</span>
        </span>
      )}

      <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', width: 118, textAlign: 'right' }}>
        {when}
      </span>

      <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-faint)', width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {t('archive.rounds', { count: String(session.messageCount ?? 0) })}
      </span>

      <button
        onClick={(e) => { e.stopPropagation(); onToggleArchived() }}
        title={record.archived ? t('archive.unarchive') : t('archive.archive')}
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', display: 'flex', padding: 2,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <Archive size={12} />
      </button>

      <span style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, color: opening ? 'var(--text-muted)' : '#818cf8',
        opacity: opening || hovered ? 1 : 0.55, transition: 'opacity 0.15s ease',
      }}>
        <ExternalLink size={11} />{t('archive.open')}
      </span>
    </div>
  )
}
