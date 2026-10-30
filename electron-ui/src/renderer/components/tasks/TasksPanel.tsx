// Tasks — the task-owned work surface (increment 1).
//
// The list is grouped by status; the detail owns the materials rail and an
// empty conversation area. Nothing here starts a conversation, picks a
// department, or writes `prefs.workingDir`. Creating a task only creates a
// record and a folder; the user's ad-hoc chat is untouched.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Coins,
  FileText,
  Inbox,
  ListChecks,
  Plus,
  Search,
  X,
} from 'lucide-react'
import type { TaskRecordData, TaskStatusData } from '../../../preload'
import { useDepartmentStore, useTaskStore, useUiStore } from '../../store'
import { useI18n, useT } from '../../i18n'
import { Pill } from '../archive/ArchiveChrome'
import { deptTreeOptionText, deptTreeOptions } from '../departments/deptUtils'
import { pushEscapeHandler } from '../ui/escapeStack'
import { suggestDepartment } from '../../lib/taskRouting'
import DepartmentSuggestionChip from './DepartmentSuggestionChip'
import TaskDetail from './TaskDetail'
import { TaskGroupBySwitch } from './TaskGroupBySwitch'
import type { DueGroupedTasks, TaskGroupBy } from './taskUi'
import {
  countActive,
  dueRowMarker,
  formatTaskTime,
  groupTasks,
  groupTasksByDue,
  statusColor,
  statusLabelKey,
  taskSpendLabel,
  taskWaitingReason,
} from './taskUi'
import { useToday } from '../../hooks/useToday'
import { useUsageEntries } from './useUsageEntries'

const HEADER_BUTTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  height: 28, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
  fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
}

const PRIMARY_BUTTON: React.CSSProperties = {
  ...HEADER_BUTTON,
  background: 'var(--accent-solid, var(--accent))',
  borderColor: 'var(--accent-solid, var(--accent))',
  color: 'var(--bubble-user-text, #ffffff)',
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 320,
  background: 'rgba(0, 0, 0, 0.48)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}

// Section dot tones for the due view. Overdue warns, today is the accent, and
// the rest recede so a deadline that is not pressing does not shout.
const DUE_GROUP_COLORS: Record<DueGroupedTasks['id'], string> = {
  overdue: 'var(--warning)',
  today: 'var(--accent)',
  next7: 'var(--success)',
  later: 'var(--text-muted)',
  none: 'var(--text-subtle)',
  // Finished and filed work keep the status view's own tone, not a deadline's.
  done: statusColor('done'),
  archived: 'var(--text-subtle)',
}

const DIALOG: React.CSSProperties = {
  width: '100%', maxWidth: 440, borderRadius: 14,
  border: '1px solid var(--popup-border, var(--border))',
  background: 'var(--popup-bg)', color: 'var(--text-primary)',
  boxShadow: 'var(--dialog-shadow, 0 24px 60px rgba(0,0,0,0.5))',
  padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
}

export default function TasksPanel() {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const tasks = useTaskStore(s => s.tasks)
  const loading = useTaskStore(s => s.loading)
  const readFailed = useTaskStore(s => s.readFailed)
  const selectedTaskId = useTaskStore(s => s.selectedTaskId)
  const load = useTaskStore(s => s.load)
  const selectTask = useTaskStore(s => s.selectTask)
  const createTask = useTaskStore(s => s.createTask)
  const deleteTask = useTaskStore(s => s.deleteTask)
  const routeTask = useTaskStore(s => s.routeTask)
  const departments = useDepartmentStore(s => s.departments)
  const addToast = useUiStore(s => s.addToast)

  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('status')
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [departmentChoice, setDepartmentChoice] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TaskRecordData | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
    const unsub = window.electronAPI?.onTasksChanged?.(() => { void load() })
    return () => { unsub?.() }
  }, [load])

  useEffect(() => {
    if (createOpen) titleRef.current?.focus()
  }, [createOpen])

  // Modals are the innermost Escape layer; AppShell consumes this stack before
  // it would leave the Tasks view.
  useEffect(() => {
    if (!createOpen) return
    return pushEscapeHandler(() => {
      setCreateOpen(false)
      setCreateError(null)
      setDepartmentChoice('')
    })
  }, [createOpen])

  useEffect(() => {
    if (!pendingDelete) return
    return pushEscapeHandler(() => { setPendingDelete(null); setDeleteFiles(false) })
  }, [pendingDelete])

  // One local day for the whole list, refreshed when the day rolls over so a
  // panel left open overnight stops calling yesterday "Today".
  const today = useToday()
  const groups = useMemo(
    () => groupBy === 'due'
      ? groupTasksByDue(tasks, query, showArchived, today)
      : groupTasks(tasks, query, showArchived),
    [tasks, query, showArchived, groupBy, today],
  )
  // One ledger read for every visible task. The list figure is only a label:
  // the detail view owns the per-conversation breakdown.
  const visibleSessionIds = useMemo(() => {
    const ids: string[] = []
    for (const group of groups) {
      for (const task of group.tasks) {
        for (const ref of task.sessions) ids.push(ref.sessionId)
      }
    }
    return ids
  }, [groups])
  const usageEntries = useUsageEntries(visibleSessionIds)
  const selected = tasks.find(task => task.id === selectedTaskId) ?? null
  const activeCount = countActive(tasks)
  const deptOptions = useMemo(
    () => deptTreeOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  // A suggestion only describes the words already typed. It is never assigned;
  // the chip's click is what puts an id into `departmentChoice`.
  const suggestion = useMemo(
    () => suggestDepartment({ title, departments }),
    [title, departments],
  )

  const acceptSuggestion = () => {
    if (!suggestion) return
    // The tree may have changed since render. A stale chip must not write an
    // id nobody can resolve; say so and leave the picker in front of the user.
    if (!departments.some(dept => dept.id === suggestion.departmentId)) {
      addToast('warning', t('tasks.suggest.stale'))
      return
    }
    setDepartmentChoice(suggestion.departmentId)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setCreateError(null)
    setDepartmentChoice('')
  }

  const submitCreate = async () => {
    const trimmed = title.trim()
    if (!trimmed) return
    setCreating(true)
    setCreateError(null)
    const result = await createTask(trimmed)
    setCreating(false)
    if (!result.ok || !result.task) {
      setCreateError(result.error ? String(result.error) : t('tasks.error.create'))
      return
    }
    // The task exists first; routing is attribution and can fail without
    // undoing the work. A target that vanished while the dialog was open is
    // reported and the task is kept unassigned rather than guessed at.
    if (departmentChoice) {
      if (!departments.some(dept => dept.id === departmentChoice)) {
        addToast('warning', t('tasks.suggest.stale'))
      } else {
        const routed = await routeTask(result.task.id, departmentChoice)
        if (!routed.ok) addToast('error', routed.error || t('tasks.error.route'))
      }
    }
    setCreateOpen(false)
    setTitle('')
    setDepartmentChoice('')
    addToast('success', t('tasks.created', { title: result.task.title }))
  }

  const submitDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    const result = await deleteTask(pendingDelete.id, deleteFiles)
    setDeleting(false)
    if (!result.ok) {
      addToast('error', t('tasks.error.delete'))
      return
    }
    addToast('success', deleteFiles ? t('tasks.deleted') : t('tasks.archived'))
    setPendingDelete(null)
    setDeleteFiles(false)
  }

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
          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
        }}>
          <ListChecks size={14} color="var(--accent-text)" />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
          {t('tasks.title')}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-subtle)', flexShrink: 0 }}>
          {t('tasks.activeCount', { count: activeCount })}
        </span>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 140, maxWidth: 320,
          height: 24, boxSizing: 'border-box', padding: '0 9px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-hover)',
        }}>
          <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('tasks.searchPlaceholder')}
            aria-label={t('tasks.searchPlaceholder')}
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-primary)', fontSize: 11,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('tasks.clearSearch')}
              title={t('tasks.clearSearch')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        <span style={{ flex: 1 }} />

        <TaskGroupBySwitch value={groupBy} onChange={setGroupBy} />

        <Pill
          active={showArchived}
          onClick={() => setShowArchived(value => !value)}
          ariaPressed={showArchived}
          title={t(showArchived ? 'tasks.hideArchivedHint' : 'tasks.showArchivedHint')}
        >
          <Archive size={11} />
          {t(showArchived ? 'tasks.hideArchived' : 'tasks.showArchived')}
        </Pill>

        <button
          type="button"
          onClick={() => { setCreateOpen(true); setCreateError(null); setDepartmentChoice('') }}
          style={PRIMARY_BUTTON}
        >
          <Plus size={13} />
          {t('tasks.newTask')}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Task list */}
        <aside style={{
          width: 322, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)', background: 'var(--bg-sidebar)',
          minHeight: 0,
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
            {readFailed ? (
              <div style={{
                margin: 8, padding: '10px 12px', borderRadius: 8,
                border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)',
                color: 'var(--error)', fontSize: 11, display: 'flex', gap: 6, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                {t('tasks.listLoadFailed')}
              </div>
            ) : loading && tasks.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
                {t('tasks.loading')}
              </div>
            ) : groups.length === 0 ? (
              <div style={{ padding: '36px 18px', textAlign: 'center' }}>
                <span style={{
                  width: 44, height: 44, borderRadius: 12, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                  background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                }}>
                  <Inbox size={19} color="var(--accent-text)" />
                </span>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {query ? t('tasks.noMatches') : t('tasks.empty.title')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {query ? t('tasks.noMatchesHint') : t('tasks.empty.body')}
                </div>
              </div>
            ) : (
              groups.map(group => {
                // The two views share one list shape; the header's label and
                // dot are the only things that differ. Done and archived keep
                // the status view's own headings so those words never change.
                const dueId = groupBy === 'due'
                  ? group.id as DueGroupedTasks['id']
                  : null
                const groupLabel = dueId
                  ? dueId === 'archived' || dueId === 'done'
                    ? t(`tasks.groups.${dueId}`)
                    : t(`tasks.dueGroups.${dueId}`)
                  : t(`tasks.groups.${group.id}`)
                const groupColor = dueId
                  ? DUE_GROUP_COLORS[dueId]
                  : statusColor(group.id as TaskStatusData)
                return (
                <div key={group.id} style={{ marginBottom: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 8px 4px', fontSize: 9.5, fontWeight: 700,
                    letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)',
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: groupColor,
                    }} />
                    <span>{groupLabel}</span>
                    <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>{group.tasks.length}</span>
                  </div>

                  {group.tasks.map(task => {
                    const active = task.id === selectedTaskId
                    const spend = taskSpendLabel(task.sessions.map(ref => ref.sessionId), usageEntries)
                    // Only a waiting task explains itself, and only when main
                    // recorded a reason; every other row keeps its shape.
                    const waitingReason = task.status === 'needs_you'
                      ? taskWaitingReason(task)
                      : undefined
                    const due = dueRowMarker(task, today, resolvedLocale, t)
                    const dueText = due ? due.text : null
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => selectTask(task.id)}
                        aria-current={active ? 'true' : undefined}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 3, width: '100%',
                          textAlign: 'left', padding: '7px 8px', marginBottom: 2,
                          borderRadius: 7, border: 'none', position: 'relative',
                          background: active ? 'var(--bg-active)' : 'transparent',
                          color: 'var(--text-primary)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                      >
                        {active && (
                          <span style={{
                            position: 'absolute', left: 0, top: 7, bottom: 7, width: 2,
                            borderRadius: '0 2px 2px 0', background: 'var(--accent)',
                          }} />
                        )}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: statusColor(task.status),
                          }} />
                          <span style={{
                            flex: 1, minWidth: 0, fontSize: 12, fontWeight: active ? 600 : 500,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {task.title}
                          </span>
                          {task.missing && (
                            <span title={t('tasks.missing')} style={{ display: 'flex', flexShrink: 0 }}>
                              <AlertTriangle size={11} color="var(--warning)" />
                            </span>
                          )}
                        </span>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12,
                          fontSize: 9.5, color: 'var(--text-subtle)',
                        }}>
                          <span>{t(statusLabelKey(task.status))}</span>
                          {/* A task with no due day grows no marker, so the
                              row keeps exactly the shape it had before. */}
                          {due && dueText && (
                            <span
                              data-task-due-row
                              data-task-due-state={due.tone}
                              title={task.dueOn}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                color: due.tone === 'overdue'
                                  ? 'var(--warning)'
                                  : due.tone === 'today' ? 'var(--accent-text)' : 'var(--text-subtle)',
                                fontWeight: due.tone === 'quiet' ? 400 : 600,
                              }}
                            >
                              <CalendarDays size={9} />
                              {dueText}
                            </span>
                          )}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <FileText size={9} />
                            {task.materials.length}
                          </span>
                          {/* Known priced spend only. A task with no priced
                              conversation shows nothing rather than $0.00. */}
                          {spend && (
                            <span
                              data-task-spend-row
                              title={t('tasks.spend.rowTitle')}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                            >
                              <Coins size={9} />
                              {spend}
                            </span>
                          )}
                          <span style={{ flex: 1 }} />
                          <span title={t('tasks.lastActivity', { when: formatTaskTime(task.updatedAt, resolvedLocale) })}>
                            {t('tasks.lastActivity', { when: formatTaskTime(task.updatedAt, resolvedLocale) })}
                          </span>
                        </span>
                        {waitingReason && (
                          <span
                            data-task-waiting-hint
                            title={waitingReason}
                            style={{
                              display: 'block', width: '100%', minWidth: 0, paddingLeft: 12,
                              fontSize: 9.5, color: 'var(--text-muted)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {t('tasks.waitingReason.short', { reason: waitingReason })}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                )
              })
            )}
          </div>
        </aside>

        {/* Detail / empty selection */}
        {selected ? (
          <TaskDetail
            key={selected.id}
            task={selected}
            onBack={() => selectTask(null)}
            onRequestDelete={task => { setPendingDelete(task); setDeleteFiles(false) }}
          />
        ) : (
          <section style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, background: 'var(--bg-chat)',
          }}>
            <div style={{ textAlign: 'center', maxWidth: 380 }}>
              <span style={{
                width: 54, height: 54, borderRadius: 15, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
              }}>
                <ListChecks size={23} color="var(--accent-text)" />
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 7 }}>
                {t('tasks.selectTitle')}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                {t('tasks.selectHint')}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* New task sheet */}
      {createOpen && (
        <div style={OVERLAY} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCreateOpen(false) }}>
          <div style={DIALOG} role="dialog" aria-modal="true" aria-label={t('tasks.newTaskTitle')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
              }}>
                <Plus size={14} color="var(--accent-text)" />
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{t('tasks.newTaskTitle')}</span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label={t('tasks.cancel')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>

            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {t('tasks.newTaskHint')}
            </span>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('tasks.titleLabel')}
              </span>
              <input
                ref={titleRef}
                value={title}
                onChange={e => { setTitle(e.target.value); setCreateError(null) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); void submitCreate() }
                }}
                placeholder={t('tasks.titlePlaceholder')}
                maxLength={200}
                style={{
                  height: 34, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                }}
              />
            </label>

            {/* Optional attribution. The suggestion is rendered beside the
                picker, never selected for the user; the empty option is a real
                choice, and no click means no routing. */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('tasks.department')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <select
                  value={departmentChoice}
                  onChange={e => setDepartmentChoice(e.target.value)}
                  aria-label={t('tasks.department')}
                  style={{
                    flex: 1, minWidth: 0, height: 30, borderRadius: 8, padding: '0 8px',
                    border: '1px solid var(--border)', background: 'var(--bg-input)',
                    color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <option value="">{t('tasks.departmentNone')}</option>
                  {deptOptions.map(option => (
                    <option key={option.id} value={option.id}>{deptTreeOptionText(option)}</option>
                  ))}
                </select>
                {suggestion && suggestion.departmentId !== departmentChoice && (
                  <DepartmentSuggestionChip suggestion={suggestion} onAccept={acceptSuggestion} />
                )}
              </div>
            </label>

            {createError && (
              <div style={{ fontSize: 11, color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={12} />
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
              <button type="button" onClick={closeCreate} style={HEADER_BUTTON}>
                {t('tasks.cancel')}
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={creating || title.trim().length === 0}
                style={{ ...PRIMARY_BUTTON, opacity: creating || !title.trim() ? 0.55 : 1 }}
              >
                {creating ? t('tasks.creating') : t('tasks.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / archive confirmation */}
      {pendingDelete && (
        <div style={OVERLAY} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPendingDelete(null) }}>
          <div style={DIALOG} role="dialog" aria-modal="true" aria-label={t('tasks.deleteConfirmTitle')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
              }}>
                <AlertTriangle size={14} color="var(--error)" />
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {t('tasks.deleteConfirmTitle', { title: pendingDelete.title })}
              </span>
            </div>

            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>
              {t('tasks.deleteConfirmBody')}
            </span>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={e => setDeleteFiles(e.target.checked)}
                style={{ marginTop: 1 }}
              />
              <span>
                {t('tasks.deleteFiles')}
                <span style={{ display: 'block', fontSize: 10, color: 'var(--text-subtle)', marginTop: 2 }}>
                  {t('tasks.deleteFilesHint')}
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
              <button type="button" onClick={() => setPendingDelete(null)} style={HEADER_BUTTON}>
                {t('tasks.cancel')}
              </button>
              <button
                type="button"
                onClick={submitDelete}
                disabled={deleting}
                style={{ ...PRIMARY_BUTTON, background: 'var(--danger-solid, var(--error))', borderColor: 'var(--danger-solid, var(--error))', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? t('tasks.deleting') : t('tasks.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
