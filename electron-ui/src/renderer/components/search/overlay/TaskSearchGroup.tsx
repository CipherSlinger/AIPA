// The task rows, drawn above the conversation groups.
//
// Tasks are the unit of work, so a matching task is the first thing the palette
// offers. The group is a client-side view over the task store — it is not part
// of the transcript scan, and the transcript filters (match kind, origin,
// folder) deliberately do not touch it. The department filter does, because a
// task's routed department is the same attribution the conversation chips use.
//
// Row shape mirrors the conversation rows: title first, then the facts that
// say what the task is and where it lives. The status pill reuses the Tasks
// page's colours and labels so the two surfaces cannot disagree.

import type { CSSProperties } from 'react'
import { Building2, FileText, ListTodo } from 'lucide-react'
import { useT } from '../../../i18n'
import SearchDeptBadge from '../SearchDeptBadge'
import { emphasise } from '../SearchResultRow'
import type { TaskSearchHit } from '../searchTasks'
import { statusColor, statusLabelKey } from '../../tasks/taskUi'

interface Props {
  hits: ReadonlyArray<TaskSearchHit>
  /** The term to emphasise in titles and matched material names. */
  query: string
  /** Index of the selected row in the merged list (tasks first). */
  active: number
  onHover: (index: number) => void
  onOpen: (hit: TaskSearchHit) => void
}

const HEADER_STYLE: CSSProperties = {
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

const COUNT_STYLE: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0,
}

const META_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  flexShrink: 0,
  fontSize: 9,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

const UNASSIGNED_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  maxWidth: 130,
  boxSizing: 'border-box',
  padding: '0 6px',
  borderRadius: 999,
  lineHeight: '15px',
  fontSize: 9,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px dashed var(--border)',
}

function rowStyle(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '9px 16px',
    cursor: 'pointer',
    background: selected ? 'rgba(99,102,241,0.14)' : 'transparent',
    borderLeft: selected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
    transition: 'background 0.12s ease, border-color 0.12s ease',
  }
}

export function TaskSearchGroup({ hits, query, active, onHover, onOpen }: Props) {
  const t = useT()
  if (hits.length === 0) return null

  return (
    <div data-task-group>
      <div
        role="heading"
        aria-level={3}
        aria-label={t('globalSearch.tasks.sectionAria', { count: hits.length })}
        style={HEADER_STYLE}
      >
        <span style={{ display: 'flex', color: 'var(--text-muted)' }} aria-hidden="true">
          <ListTodo size={14} />
        </span>
        <span>{t('globalSearch.tasks.group')}</span>
        <span style={COUNT_STYLE}>{hits.length}</span>
      </div>

      {hits.map((hit, index) => {
        const task = hit.task
        const selected = index === active
        return (
          <div
            key={task.id}
            id={`global-search-row-${index}`}
            role="option"
            aria-selected={selected}
            onMouseEnter={() => onHover(index)}
            onClick={() => onOpen(hit)}
            style={rowStyle(selected)}
          >
            <span
              style={{
                color: selected ? 'var(--accent-text)' : 'var(--text-muted)',
                display: 'flex',
                paddingTop: 2,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <ListTodo size={14} />
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span
                  title={task.title}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {emphasise(task.title, query)}
                </span>
                {/* Status uses the same colour and label as the Tasks page. */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    padding: '0 6px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: statusColor(task.status),
                    fontSize: 9,
                    lineHeight: '15px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: statusColor(task.status),
                    }}
                  />
                  {t(statusLabelKey(task.status))}
                </span>
                {hit.department && hit.departmentLabel && hit.departmentPath && hit.departmentKind ? (
                  <SearchDeptBadge
                    context="task"
                    attribution={{
                      state: 'attributed',
                      nodeId: hit.department.id,
                      label: hit.departmentLabel,
                      path: hit.departmentPath,
                      kind: hit.departmentKind,
                      filedBy: 'task',
                    }}
                  />
                ) : (
                  <span
                    title={t('globalSearch.tasks.unassignedTitle')}
                    aria-label={t('tasks.departmentUnassigned')}
                    style={UNASSIGNED_STYLE}
                  >
                    <Building2 size={9} style={{ flexShrink: 0, opacity: 0.6 }} aria-hidden="true" />
                    <span
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t('tasks.departmentUnassigned')}
                    </span>
                  </span>
                )}
                <span
                  title={t(
                    task.materials.length === 1
                      ? 'globalSearch.tasks.materialCountOne'
                      : 'globalSearch.tasks.materialCount',
                    { count: task.materials.length },
                  )}
                  style={{ ...META_STYLE, marginLeft: 'auto' }}
                >
                  <FileText size={9} aria-hidden="true" />
                  {task.materials.length}
                </span>
              </div>

              {hit.materialName !== null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 3,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <FileText size={10} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <span
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {emphasise(hit.materialName, query)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
