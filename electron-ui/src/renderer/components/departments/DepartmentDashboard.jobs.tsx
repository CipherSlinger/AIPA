// A compact jobs line on one department page. It answers "what scheduled work
// is filed here?" without turning the department page into a second Settings →
// Automations: enabled state and last outcome only. A click opens the real
// management surface, which already exists (`openSettingsAt('automations')`).
//
// Jobs are attributed by `departmentId` alone — the node itself plus every
// descendant. The join and the malformed-input rules live in `deptJobs.data.ts`.

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type { Department } from '../../store'
import { useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import { briefSubtree } from './deptBrief.data'
import {
  buildDeptJobs,
  deptJobStateText,
  deptJobStatusText,
  type DeptJobRow,
} from './deptJobs.data'

interface DeptJobsBlockProps {
  deptId: string
  departments: Department[]
}

const PAGE_JOB_ROW_LIMIT = 5

export default function DeptJobsBlock({ deptId, departments }: DeptJobsBlockProps) {
  const { t } = useI18n()
  const [now] = useState(() => Date.now())
  const [source, setSource] = useState<
    { status: 'loading' | 'error'; jobs: null } | { status: 'ready'; jobs: unknown }
  >({ status: 'loading', jobs: null })

  // A late promise must not write into a page that already unmounted (or into
  // the next department after a quick navigation).
  useEffect(() => {
    let cancelled = false
    setSource({ status: 'loading', jobs: null })
    window.electronAPI.automationList()
      .then(result => {
        if (!cancelled) setSource({ status: 'ready', jobs: result?.jobs })
      })
      .catch(() => {
        if (!cancelled) setSource({ status: 'error', jobs: null })
      })
    return () => { cancelled = true }
  }, [deptId])

  const summary = useMemo(
    () => buildDeptJobs({
      jobs: source.jobs,
      nodeIds: departments.map(node => node.id),
      scopeIds: briefSubtree(departments, deptId).map(node => node.id),
      window: { start: now, end: now },
      load: source.status,
    }),
    [source, departments, deptId, now],
  )

  // No card for an empty scope or an unavailable read: the department page is
  // not the place to raise an automation error, and the Brief reports it in
  // full. Rendering "0 jobs" here would be the one wrong answer.
  if (summary.state !== 'ready' || summary.owned.length === 0) return null

  const owned = summary.owned
  const visible = owned.slice(0, PAGE_JOB_ROW_LIMIT)
  const hidden = owned.length - visible.length
  const openAutomations = () => useUiStore.getState().openSettingsAt('automations')

  return (
    <section
      aria-label={t('dept.jobs.title')}
      style={{
        marginBottom: 14,
        padding: '9px 14px',
        background: 'var(--glass-bg-low)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <CalendarClock size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {t('dept.jobs.title')}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 9.5, color: 'var(--text-faint)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {t('dept.jobs.count', { count: owned.length })}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visible.map(job => (
          <JobLine key={job.id} job={job} onOpen={openAutomations} />
        ))}
      </div>

      {hidden > 0 && (
        <button
          onClick={openAutomations}
          title={t('dept.jobs.openInSettings')}
          style={{
            marginTop: 3, padding: 0, border: 'none', background: 'none',
            color: 'var(--text-faint)', fontSize: 9.5, cursor: 'pointer',
          }}
        >
          {t('dept.jobs.more', { count: hidden })}
        </button>
      )}
    </section>
  )
}

function JobLine({ job, onOpen }: { job: DeptJobRow; onOpen: () => void }) {
  const { t } = useI18n()
  const statusColor = job.running || job.lastStatus === 'running'
    ? 'var(--accent-text)'
    : job.lastStatus === 'error'
      ? 'var(--danger-text)'
      : job.lastStatus === 'success'
        ? 'var(--success-text)'
        : 'var(--text-faint)'

  return (
    <button
      onClick={onOpen}
      title={t('dept.jobs.openInSettings')}
      style={{
        width: '100%', display: 'flex', alignItems: 'baseline', gap: 6,
        padding: '2px 4px', border: 'none', borderRadius: 6, background: 'transparent',
        cursor: 'pointer', textAlign: 'left', minWidth: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{
        flex: '1 1 120px', minWidth: 0, fontSize: 11, color: 'var(--text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {job.name}
      </span>
      <span style={{
        flexShrink: 0, fontSize: 9, lineHeight: '15px', padding: '0 5px',
        borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-muted)',
      }}>
        {deptJobStateText(job, t)}
      </span>
      <span style={{ flexShrink: 0, fontSize: 10, color: statusColor }}>
        {deptJobStatusText(job, t)}
      </span>
    </button>
  )
}
