// The three "things you built" sections of the global search overlay, after the
// transcript groups: Workflows, Skills and Scheduled jobs.
//
// They sit outside every session filter on purpose. The origin and department
// pills narrow conversations; a workflow has no origin and no department, so
// hiding it behind those pills would claim the search has nothing when it does.
// This component therefore reads only the query.
//
// Loading, empty and failed are kept apart. A list that could not be read says
// so and offers a retry; it must never render as "no matches", because absent
// data is not zero data.

import React from 'react'
import { AlarmClock, Puzzle, RefreshCw, Workflow as WorkflowIcon } from 'lucide-react'
import type { AutomationJobData, SkillInfoData } from '../../../preload/index'
import type { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import {
  ENTITY_HIT_ROWS,
  deriveJobHits,
  deriveSkillHits,
  deriveWorkflowHits,
  type EntityHit,
  type EntityHitPage,
} from '../../lib/entitySearch'

/** Whether one IPC-backed list has been read yet, and whether it could be. */
export type EntitySourceStatus = 'loading' | 'ready' | 'failed'

type EntityKind = 'workflow' | 'skill' | 'job'

export interface EntityHitGroupsProps {
  query: string
  /** `undefined` until prefs load; the workflows section waits for it. */
  workflows: readonly Workflow[] | undefined
  skills: readonly SkillInfoData[] | null
  jobs: readonly AutomationJobData[] | null
  skillStatus: EntitySourceStatus
  jobStatus: EntitySourceStatus
  /** Resolves a job's workflow id so the job is findable by that name. */
  workflowName: (workflowId: string) => string | undefined
  onOpenWorkflow: (workflowId: string) => void
  onOpenSkill: (dirPath: string) => void
  onOpenJob: (jobId: string) => void
  onRetrySkills: () => void
  onRetryJobs: () => void
}

/**
 * Enter inside an entity row is that row's to handle. The dialog's own Enter
 * handler opens the highlighted transcript, so without this a keyboard user
 * tabbing to a workflow and pressing Enter would open somebody's conversation
 * instead.
 */
function stopRowActivation(event: React.KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
}

const SECTION_STYLE: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: 2,
}

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  padding: '8px 16px 4px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const STATUS_STYLE: React.CSSProperties = {
  padding: '7px 16px 9px',
  fontSize: 11,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

const RETRY_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  marginLeft: 6,
  fontFamily: 'inherit',
  fontSize: 11,
  color: 'var(--accent-text)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

/** The token from the pure module, in the user's language. */
function metaText(hit: EntityHit, kind: EntityKind, t: ReturnType<typeof useT>): string | null {
  if (kind === 'skill') {
    if (hit.meta === 'personal') return t('globalSearch.entities.skillPersonal')
    if (hit.meta === 'project') return t('globalSearch.entities.skillProject')
    return null
  }
  if (kind === 'job') {
    return hit.meta === 'enabled'
      ? t('globalSearch.entities.jobEnabled')
      : t('globalSearch.entities.jobDisabled')
  }
  return null
}

function HitSection({
  kind,
  labelKey,
  icon,
  page,
  onOpen,
}: {
  kind: EntityKind
  labelKey: string
  icon: React.ReactNode
  page: EntityHitPage
  onOpen: (id: string) => void
}) {
  const t = useT()
  // Zero matches render nothing: the overlay owns the overall empty copy, and
  // three "nothing here" lines under it would only repeat it.
  if (page.rows.length === 0) return null
  const hidden = page.total - page.rows.length
  return (
    <div data-entity-section={kind} style={SECTION_STYLE}>
      <div
        role="heading"
        aria-level={3}
        aria-label={t('globalSearch.entities.sectionAria', {
          name: t(labelKey),
          count: page.total,
        })}
        style={HEADER_STYLE}
      >
        <span style={{ display: 'flex', color: 'var(--text-muted)' }}>{icon}</span>
        <span>{t(labelKey)}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: 0 }}>{page.total}</span>
      </div>
      {page.rows.map(hit => (
        <EntityRow key={hit.id} kind={kind} hit={hit} icon={icon} onOpen={onOpen} />
      ))}
      {hidden > 0 && (
        <div style={{ ...STATUS_STYLE, paddingTop: 0, paddingBottom: 8 }}>
          {t('globalSearch.entities.more', { count: hidden })}
        </div>
      )}
    </div>
  )
}

/** A row whose click is wired by its section, so the row stays one component. */
function EntityRow({
  kind,
  hit,
  icon,
  onOpen,
}: {
  kind: EntityKind
  hit: EntityHit
  icon: React.ReactNode
  onOpen: (id: string) => void
}) {
  const t = useT()
  const meta = metaText(hit, kind, t)
  return (
    <button
      type="button"
      data-entity-hit={kind}
      data-entity-id={hit.id}
      onClick={() => onOpen(hit.id)}
      onKeyDown={stopRowActivation}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        borderLeft: '2px solid transparent',
        fontFamily: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
        e.currentTarget.style.borderLeftColor = 'rgba(99,102,241,0.45)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderLeftColor = 'transparent'
      }}
    >
      <span style={{ display: 'flex', paddingTop: 2, flexShrink: 0, color: 'var(--text-muted)' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            title={hit.title}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {hit.title}
          </span>
          {meta && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '1px 4px',
              }}
            >
              {meta}
            </span>
          )}
        </span>
        {hit.subtitle !== '' && (
          <span
            title={hit.subtitle}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              marginTop: 3,
              fontSize: 12,
              lineHeight: 1.45,
              color: 'var(--text-secondary)',
            }}
          >
            {hit.subtitle}
          </span>
        )}
      </span>
    </button>
  )
}

export function EntityHitGroups({
  query,
  workflows,
  skills,
  jobs,
  skillStatus,
  jobStatus,
  workflowName,
  onOpenWorkflow,
  onOpenSkill,
  onOpenJob,
  onRetrySkills,
  onRetryJobs,
}: EntityHitGroupsProps) {
  const t = useT()
  // The limit is read from the shared constant so a caller and the "N more"
  // line cannot disagree about how many rows were shown.
  const workflowHits = React.useMemo(
    () => deriveWorkflowHits(workflows, query, ENTITY_HIT_ROWS),
    [workflows, query],
  )
  const skillHits = React.useMemo(
    () => deriveSkillHits(skills, query, ENTITY_HIT_ROWS),
    [skills, query],
  )
  const jobHits = React.useMemo(
    () => deriveJobHits(jobs, query, ENTITY_HIT_ROWS, { workflowName }),
    [jobs, query, workflowName],
  )

  const workflowIcon = <WorkflowIcon size={14} />
  const skillIcon = <Puzzle size={14} />
  const jobIcon = <AlarmClock size={14} />

  return (
    <div data-entity-groups>
      {/* A list that failed is reported where its rows would have been, not
          swallowed into the empty state. Retry stays here so the user does not
          have to close and reopen the overlay to try again. */}
      {workflows === undefined ? null : (
        <HitSection
          kind="workflow"
          labelKey="globalSearch.entities.workflows"
          icon={workflowIcon}
          page={workflowHits}
          onOpen={onOpenWorkflow}
        />
      )}

      {skillStatus === 'failed' ? (
        <div data-entity-section="skill" data-entity-source="failed" style={SECTION_STYLE}>
          <div style={{ ...STATUS_STYLE, color: 'var(--danger-text)' }}>
            {t('globalSearch.entities.skillsFailed')}
            <button type="button" onClick={onRetrySkills} onKeyDown={stopRowActivation} style={RETRY_STYLE}>
              <RefreshCw size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} aria-hidden="true" />
              {t('globalSearch.entities.retry')}
            </button>
          </div>
        </div>
      ) : skillStatus === 'loading' ? (
        <div data-entity-section="skill" data-entity-source="loading" style={SECTION_STYLE}>
          <div style={STATUS_STYLE}>{t('globalSearch.entities.loadingSkills')}</div>
        </div>
      ) : (
        <HitSection
          kind="skill"
          labelKey="globalSearch.entities.skills"
          icon={skillIcon}
          page={skillHits}
          onOpen={onOpenSkill}
        />
      )}

      {jobStatus === 'failed' ? (
        <div data-entity-section="job" data-entity-source="failed" style={SECTION_STYLE}>
          <div style={{ ...STATUS_STYLE, color: 'var(--danger-text)' }}>
            {t('globalSearch.entities.jobsFailed')}
            <button type="button" onClick={onRetryJobs} onKeyDown={stopRowActivation} style={RETRY_STYLE}>
              <RefreshCw size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} aria-hidden="true" />
              {t('globalSearch.entities.retry')}
            </button>
          </div>
        </div>
      ) : jobStatus === 'loading' ? (
        <div data-entity-section="job" data-entity-source="loading" style={SECTION_STYLE}>
          <div style={STATUS_STYLE}>{t('globalSearch.entities.loadingJobs')}</div>
        </div>
      ) : (
        <HitSection
          kind="job"
          labelKey="globalSearch.entities.jobs"
          icon={jobIcon}
          page={jobHits}
          onOpen={onOpenJob}
        />
      )}
    </div>
  )
}
