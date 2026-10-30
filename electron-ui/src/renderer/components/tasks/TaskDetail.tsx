// The task detail view: header (title/status/department/folder/archive),
// materials rail, dispatch + conversations, and the append-only history.
//
// Dispatch is visible: it opens the chat on a tab whose cwd is this task's
// folder and fills the composer; the user presses send. This file never sends
// a turn itself and never writes `prefs.workingDir`.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  FolderOpen,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { TaskEventData, TaskRecordData, TaskSessionRefData, TaskStatusData } from '../../../preload'
import { useDepartmentStore, useSessionStore, useTaskStore, useUiStore } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useI18n, useT } from '../../i18n'
import { pushEscapeHandler } from '../ui/escapeStack'
import { deptTreeOptionText, deptTreeOptions } from '../departments/deptUtils'
import {
  buildTaskBrief,
  dispatchTask,
  openTaskConversation,
  sessionListItemFor,
  taskConversationTitle,
  taskDispatchPurpose,
} from '../../lib/taskDispatch'
import { suggestDepartment } from '../../lib/taskRouting'
import DepartmentSuggestionChip from './DepartmentSuggestionChip'
import { formatTokens } from '../../utils/formatUtils'
import {
  EDITABLE_STATUSES,
  dueInfo,
  formatBytes,
  formatDueDate,
  formatTaskTime,
  formatUsd,
  todayLocalDay,
  parseAutomationRunDetail,
  parseImportedFolderDetail,
  parseStatusChangeDetail,
  statusColor,
  statusLabelKey,
  summarizeTaskSpend,
  taskWaitingReason,
} from './taskUi'
import { useUsageEntries } from './useUsageEntries'

interface TaskDetailProps {
  task: TaskRecordData
  onBack: () => void
  onRequestDelete: (task: TaskRecordData) => void
}

const ICON_BUTTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 4, height: 26, padding: '0 8px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-hover)',
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500,
  cursor: 'pointer', flexShrink: 0,
}

const RAIL_HEADING: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
}

const SPEND_LABEL: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: 'var(--text-subtle)',
}

const SPEND_VALUE: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums',
}

export default function TaskDetail({ task, onBack, onRequestDelete }: TaskDetailProps) {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const addToast = useUiStore(s => s.addToast)
  const updateTask = useTaskStore(s => s.updateTask)
  const archiveTask = useTaskStore(s => s.archiveTask)
  const restoreTask = useTaskStore(s => s.restoreTask)
  const addMaterials = useTaskStore(s => s.addMaterials)
  const removeMaterial = useTaskStore(s => s.removeMaterial)
  const revealTask = useTaskStore(s => s.revealTask)
  const routeTask = useTaskStore(s => s.routeTask)
  const departments = useDepartmentStore(s => s.departments)
  const sessionList = useSessionStore(s => s.sessions)
  const deptOptions = deptTreeOptions(departments, resolvedLocale)

  const [titleDraft, setTitleDraft] = useState(task.title)
  const [titleFocused, setTitleFocused] = useState(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const [savingDue, setSavingDue] = useState(false)
  const [dueFocused, setDueFocused] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [routing, setRouting] = useState(false)
  // Whether each recorded conversation can still be opened. A task row is not
  // evidence that its rollout file exists: it may have been deleted (and
  // trashed) after the turn, and saying "conversation" over a dead link would
  // be a lie. `checking` is the honest state while the file is being read.
  const [presence, setPresence] = useState<Record<string, 'checking' | 'present' | 'missing'>>({})
  const probedSessions = useRef<Set<string>>(new Set())
  const titleRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLInputElement>(null)

  // A store refresh (another window, or our own mutation) is authoritative.
  useEffect(() => { setTitleDraft(task.title) }, [task.id, task.title])

  useEffect(() => {
    if (!pasteOpen) return
    pasteRef.current?.focus()
  }, [pasteOpen])

  // The view-level Escape handler in AppShell runs first (capture phase); a
  // focused inline editor registers itself as the innermost layer so Escape
  // reverts the edit instead of leaving the task list.
  useEffect(() => {
    if (!titleFocused) return
    return pushEscapeHandler(() => {
      setTitleDraft(task.title)
      setTitleFocused(false)
      titleRef.current?.blur()
    })
  }, [titleFocused, task.title])

  useEffect(() => {
    if (!pasteOpen) return
    return pushEscapeHandler(() => {
      setPasteOpen(false)
      setPasteText('')
    })
  }, [pasteOpen])

  // Resolve each recorded conversation once. A row in the sidebar wins (it is
  // the same store the session list uses); otherwise read the transcript file
  // directly. An empty or failed read is reported as missing, not hidden.
  useEffect(() => {
    if (task.sessions.length === 0) return
    const listed = new Set(sessionList.map(session => session.sessionId))
    let disposed = false
    setPresence(prev => {
      const next = { ...prev }
      for (const ref of task.sessions) {
        if (listed.has(ref.sessionId)) next[ref.sessionId] = 'present'
        else if (!next[ref.sessionId]) next[ref.sessionId] = 'checking'
      }
      return next
    })
    for (const ref of task.sessions) {
      if (listed.has(ref.sessionId)) {
        probedSessions.current.add(ref.sessionId)
        continue
      }
      if (probedSessions.current.has(ref.sessionId)) continue
      probedSessions.current.add(ref.sessionId)
      void window.electronAPI.sessionLoad(ref.sessionId)
        .then(raw => {
          if (disposed) return
          setPresence(prev => ({
            ...prev,
            [ref.sessionId]: Array.isArray(raw) && raw.length > 0 ? 'present' : 'missing',
          }))
        })
        .catch(() => {
          if (disposed) return
          setPresence(prev => ({ ...prev, [ref.sessionId]: 'missing' }))
        })
    }
    return () => { disposed = true }
  }, [task.id, task.sessions, sessionList])

  // Suggestions follow the task's own words and files. They are advisory: the
  // select stays the authority, and this never writes anything by itself.
  const suggestion = useMemo(
    () => suggestDepartment({
      title: task.title,
      materialNames: task.materials.map(material => material.name),
      departments,
    }),
    [task.title, task.materials, departments],
  )

  // Spend is read from the main-process ledger, never derived from the
  // transcript. Only the ids this task actually recorded are asked about.
  const usageSessionIds = useMemo(
    () => task.sessions.map(ref => ref.sessionId),
    [task.sessions],
  )
  const usageEntries = useUsageEntries(usageSessionIds)
  const spend = summarizeTaskSpend(usageSessionIds, usageEntries)

  const setDepartment = async (departmentId: string) => {
    setRouting(true)
    const result = await routeTask(task.id, departmentId || null)
    setRouting(false)
    if (!result.ok) addToast('error', result.error || t('tasks.error.route'))
  }

  const acceptSuggestion = async (departmentId: string) => {
    // The chip may have been rendered before the node was deleted. Report it
    // and leave the user at the picker instead of writing an unresolvable id.
    if (!deptOptions.some(option => option.id === departmentId)) {
      addToast('warning', t('tasks.suggest.stale'))
      return
    }
    await setDepartment(departmentId)
  }

  const dispatch = () => {
    const result = dispatchTask(task, t)
    if (!result.ok) addToast('error', result.error)
  }

  const openConversation = async (ref: TaskSessionRefData) => {
    if (presence[ref.sessionId] !== 'present') return
    const listed: SessionListItem | undefined = sessionList.find(session => session.sessionId === ref.sessionId)
    const result = await openTaskConversation(
      task,
      ref,
      listed ?? sessionListItemFor(ref.sessionId, task.title),
    )
    if (!result.ok) addToast('error', result.error || t('tasks.error.openConversation'))
  }

  const commitTitle = async () => {
    const next = titleDraft.trim()
    if (!next || next === task.title) {
      setTitleDraft(task.title)
      return
    }
    setSavingTitle(true)
    const result = await updateTask(task.id, { title: next })
    setSavingTitle(false)
    if (!result.ok) {
      addToast('error', t('tasks.error.update'))
      setTitleDraft(task.title)
    }
  }

  const setStatus = async (status: TaskStatusData) => {
    if (status === task.status) return
    const result = await updateTask(task.id, { status })
    if (!result.ok) addToast('error', t('tasks.error.update'))
  }

  // The native date input hands back '' when cleared, which is the store's
  // `null` (no due day), not an empty string the store must guess at.
  const setDueOn = async (value: string | null) => {
    if ((task.dueOn ?? null) === value) return
    setSavingDue(true)
    const result = await updateTask(task.id, { dueOn: value })
    setSavingDue(false)
    if (!result.ok) addToast('error', result.error || t('tasks.error.update'))
  }

  const importPaths = async (paths: string[], source: 'picker' | 'drop' | 'paste') => {
    if (paths.length === 0) return
    setImporting(true)
    const result = await addMaterials(task.id, paths, source)
    setImporting(false)
    if (!result.ok) {
      addToast('error', result.error || t('tasks.error.materials'))
      return
    }
    if (result.added && result.added.length > 0) {
      addToast('success', t('tasks.materialsAdded', { count: result.added.length }))
    }
    if (result.errors && result.errors.length > 0) {
      const first = result.errors[0]
      addToast('warning', t('tasks.materialFailed', {
        name: first.path.split(/[\\/]/).pop() || first.path,
        error: first.error,
      }))
    }
    if (source === 'paste' && result.added && result.added.length > 0) {
      setPasteText('')
      setPasteOpen(false)
    }
  }

  const pickFiles = async () => {
    try {
      const paths = await window.electronAPI.fsShowOpenFileDialog(undefined, true)
      await importPaths(Array.isArray(paths) ? paths : [], 'picker')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : t('tasks.error.materials'))
    }
  }

  const submitPaste = async () => {
    const paths = pasteText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (paths.length === 0) return
    await importPaths(paths, 'paste')
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    const paths = Array.from(event.dataTransfer.files)
      .map(file => {
        // Electron 32 removed `File.path`; the preload exposes webUtils.
        try {
          return window.electronAPI.getPathForFile(file)
        } catch {
          return (file as File & { path?: string }).path ?? ''
        }
      })
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    if (paths.length === 0) {
      addToast('warning', t('tasks.dropNoPaths'))
      return
    }
    await importPaths(paths, 'drop')
  }

  const archive = async () => {
    const result = await archiveTask(task.id)
    if (!result.ok) addToast('error', t('tasks.error.archive'))
  }

  const restore = async () => {
    const result = await restoreTask(task.id)
    if (!result.ok) addToast('error', t('tasks.error.restore'))
  }

  const reveal = async () => {
    const result = await revealTask(task.id)
    if (!result.ok) addToast('error', t('tasks.error.reveal'))
  }

  const confirmRemove = async (materialId: string) => {
    const result = await removeMaterial(task.id, materialId)
    setPendingRemove(null)
    if (!result.ok) addToast('error', t('tasks.error.removeMaterial'))
  }

  const today = todayLocalDay()
  const due = task.dueOn ? dueInfo(task.dueOn, today) : null
  const dueWarning = due?.state === 'overdue' || due?.state === 'today'
  const dueLabel = !task.dueOn
    ? t('tasks.due.none')
    : due?.state === 'today'
      ? t('tasks.due.today')
      : due?.state === 'overdue'
        ? t('tasks.due.overdue', { days: Math.abs(due.days) })
        : due?.state === 'tomorrow'
          ? t('tasks.due.tomorrow')
          : formatDueDate(task.dueOn, resolvedLocale)

  const archived = task.status === 'archived'
  const purpose = taskDispatchPurpose(task)
  const brief = buildTaskBrief(task, purpose, t)
  // Only a task that is still waiting has a reason worth showing. The engine
  // failed its last turn, so this is a decision waiting on the user, not a
  // mistake the user made: the banner stays quiet and names the engine's text.
  const waitingReason = task.status === 'needs_you' ? taskWaitingReason(task) : undefined

  // A recorded conversation is named by its title when the session list has
  // one; the placeholder `<system_context>` title is not a name, so the short
  // id is the fallback. `no usage recorded` is not `$0.00`: a pre-ledger or
  // unpriced turn is unknown spend.
  const spendCost = spend.costUsd === null
    ? t('tasks.spend.unknown')
    : `${spend.costPartial ? '≥' : ''}${formatUsd(spend.costUsd) || '$0.00'}`
  const spendTurns = spend.turns === null ? t('tasks.spend.unknown') : String(spend.turns)
  const spendOutput = spend.outputTokens === null
    ? t('tasks.spend.unknown')
    : formatTokens(spend.outputTokens)

  const conversationLabel = (ref: TaskSessionRefData): string => {
    const listedTitle = sessionList.find(session => session.sessionId === ref.sessionId)?.title?.trim()
    return listedTitle && !listedTitle.startsWith('<') ? listedTitle : ref.sessionId.slice(0, 8)
  }

  const conversationSpend = (ref: TaskSessionRefData): string => {
    const entry = usageEntries.get(ref.sessionId)
    if (!entry) return t('tasks.spend.noUsage')
    const turns = t('tasks.spend.turnsCount', { count: entry.turns })
    const cost = typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd)
      ? (formatUsd(entry.costUsd) || '$0.00')
      : t('tasks.spend.costUnknown')
    return `${turns} · ${cost}`
  }

  // The store records ids for routing; the timeline is for people. Resolve a
  // department id to its current name, and say plainly when that name no longer
  // exists instead of printing a UUID.
  const historyDetail = (event: TaskEventData): string | undefined => {
    // The notice id is the dedupe key, not a fact worth reading; the label
    // above it already says where the task came from.
    if (event.kind === 'from_notice') return undefined
    if (!event.detail) return undefined
    if (event.kind === 'routed' || event.kind === 'reassigned') {
      return deptOptions.find(option => option.id === event.detail)?.label
        ?? t('tasks.departmentNotFound')
    }
    if (event.kind === 'session_started') {
      return event.detail === 'dispatch' || event.detail === 'followup'
        ? t(`tasks.sessionPurpose.${event.detail}`)
        : event.detail
    }
    if (event.kind === 'from_automation') {
      const run = parseAutomationRunDetail(event.detail)
      return run
        ? t('tasks.historyRun', { when: formatTaskTime(run.startedAt, resolvedLocale) })
        : event.detail
    }
    if (event.kind === 'imported_folder') {
      // Main writes the source path and the three counts; the line is localized
      // here so the timeline reads in the user's language without duplicating
      // the path itself.
      const imported = parseImportedFolderDetail(event.detail)
      return imported
        ? t('tasks.importLegacy.history', {
          path: imported.source,
          files: imported.files,
          skipped: imported.skipped,
          truncated: imported.truncated,
        })
        : event.detail
    }
    return event.detail
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        minHeight: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      }}>
        <button
          type="button"
          onClick={onBack}
          title={t('tasks.back')}
          aria-label={t('tasks.back')}
          style={{ ...ICON_BUTTON, width: 28, padding: 0 }}
        >
          <ArrowLeft size={14} />
        </button>

        <input
          ref={titleRef}
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => { setTitleFocused(false); void commitTitle() }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur() }
          }}
          aria-label={t('tasks.titleLabel')}
          disabled={savingTitle}
          style={{
            minWidth: 120, flex: '1 1 220px', maxWidth: 520, height: 28,
            border: '1px solid transparent',
            borderRadius: 7, padding: '0 6px', boxSizing: 'border-box',
            color: 'var(--text-primary)', fontSize: 14, fontWeight: 700,
            outline: 'none',
            borderColor: titleFocused ? 'var(--accent-border)' : 'transparent',
            background: titleFocused ? 'var(--bg-input)' : 'transparent',
          }}
        />

        <select
          value={archived ? 'archived' : task.status}
          onChange={e => { void setStatus(e.target.value as TaskStatusData) }}
          disabled={archived}
          aria-label={t('tasks.status')}
          style={{
            height: 26, borderRadius: 8, padding: '0 8px', fontSize: 11, fontWeight: 600,
            color: statusColor(task.status),
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
            cursor: archived ? 'default' : 'pointer', flexShrink: 0,
          }}
        >
          {archived && <option value="archived">{t('tasks.statusLabel.archived')}</option>}
          {EDITABLE_STATUSES.map(status => (
            <option key={status} value={status}>{t(statusLabelKey(status))}</option>
          ))}
        </select>

        {/* A due date is a local calendar day. Overdue and today are the only
            states painted in the warning tone; future days and "no due date"
            stay quiet so the header never cries wolf. The clear button only
            exists when there is something to clear. */}
        <span
          title={t('tasks.due.label')}
          data-task-due-control
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 26,
            padding: '0 4px 0 7px', borderRadius: 8, flexShrink: 0,
            border: `1px solid ${dueFocused ? 'var(--accent-border)' : 'var(--border)'}`,
            background: 'var(--bg-hover)',
            color: dueWarning ? 'var(--warning)' : 'var(--text-secondary)',
            fontSize: 11,
          }}
        >
          <CalendarDays size={12} style={{ flexShrink: 0 }} />
          <span
            data-task-due-label
            style={{ fontWeight: dueWarning ? 600 : 500, whiteSpace: 'nowrap' }}
          >
            {dueLabel}
          </span>
          <input
            type="date"
            value={task.dueOn ?? ''}
            min="2000-01-01"
            max="2100-12-31"
            disabled={savingDue}
            onFocus={() => setDueFocused(true)}
            onBlur={() => setDueFocused(false)}
            onChange={e => { void setDueOn(e.target.value || null) }}
            aria-label={t('tasks.due.label')}
            data-task-due-input
            style={{
              width: 112, height: 22, boxSizing: 'border-box',
              border: 'none', outline: 'none', background: 'transparent',
              color: 'inherit', fontSize: 10.5, colorScheme: 'dark',
              cursor: savingDue ? 'default' : 'pointer',
            }}
          />
          {task.dueOn && (
            <button
              type="button"
              onClick={() => { void setDueOn(null) }}
              disabled={savingDue}
              title={t('tasks.due.clear')}
              aria-label={t('tasks.due.clear')}
              data-task-due-clear
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, padding: 0, border: 'none', borderRadius: 5,
                background: 'transparent', color: 'inherit',
                cursor: savingDue ? 'default' : 'pointer', opacity: savingDue ? 0.5 : 1,
              }}
            >
              <X size={10} />
            </button>
          )}
        </span>

        {/* Department is explicit attribution, never a working directory. The
            empty option is a real choice: a task can be dispatched without a
            department. A missing id is shown as missing rather than silently
            rounded to the first department. */}
        <span
          title={t('tasks.departmentAttribution')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 26,
            padding: '0 4px 0 8px', borderRadius: 8, flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
            color: 'var(--text-secondary)', fontSize: 11,
          }}
        >
          {routing
            ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <Building2 size={12} />}
          <select
            value={task.departmentId ?? ''}
            onChange={e => { void setDepartment(e.target.value) }}
            disabled={routing}
            aria-label={t('tasks.department')}
            title={t('tasks.departmentAttribution')}
            style={{
              maxWidth: 190, height: 24, border: 'none', outline: 'none',
              background: 'transparent', color: 'inherit', fontSize: 11,
              cursor: routing ? 'default' : 'pointer',
            }}
          >
            <option value="">{t('tasks.departmentNone')}</option>
            {deptOptions.map(option => (
              <option key={option.id} value={option.id}>
                {deptTreeOptionText(option)}
              </option>
            ))}
            {task.departmentId && !deptOptions.some(option => option.id === task.departmentId) && (
              <option value={task.departmentId}>{t('tasks.departmentNotFound')}</option>
            )}
          </select>
        </span>

        {suggestion && suggestion.departmentId !== task.departmentId && (
          <DepartmentSuggestionChip
            suggestion={suggestion}
            disabled={routing}
            onAccept={() => { void acceptSuggestion(suggestion.departmentId) }}
          />
        )}

        <span style={{ flex: 1 }} />

        <button
          type="button"
          onClick={reveal}
          title={t('tasks.reveal')}
          aria-label={t('tasks.reveal')}
          style={ICON_BUTTON}
        >
          <FolderOpen size={13} />
          {t('tasks.reveal')}
        </button>

        {archived ? (
          <button type="button" onClick={restore} title={t('tasks.restore')} aria-label={t('tasks.restore')} style={ICON_BUTTON}>
            <RotateCcw size={13} />
            {t('tasks.restore')}
          </button>
        ) : (
          <button type="button" onClick={archive} title={t('tasks.archive')} aria-label={t('tasks.archive')} style={ICON_BUTTON}>
            <Archive size={13} />
            {t('tasks.archive')}
          </button>
        )}

        <button
          type="button"
          onClick={() => onRequestDelete(task)}
          title={t('tasks.delete')}
          aria-label={t('tasks.delete')}
          style={{ ...ICON_BUTTON, color: 'var(--error)' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Why the task is waiting. The engine's last turn failed; this sits
          directly under the header so the reason is visible without scrolling,
          and reads as a decision to make rather than an error to fix. */}
      {waitingReason && (
        <div
          role="status"
          data-task-waiting-reason
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0,
            padding: '8px 16px', background: 'rgba(251,191,36,0.06)',
            borderBottom: '1px solid rgba(251,191,36,0.22)',
            fontSize: 11, lineHeight: 1.5,
          }}
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
            color: 'var(--warning)', fontWeight: 600,
          }}>
            <Clock size={12} />
            {t('tasks.waitingReason.title')}
          </span>
          <span title={waitingReason} style={{ minWidth: 0, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
            {waitingReason}
          </span>
        </div>
      )}

      {task.missing && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '8px 16px', background: 'rgba(251,191,36,0.08)',
          borderBottom: '1px solid rgba(251,191,36,0.25)', color: 'var(--warning)',
          fontSize: 11,
        }}>
          <AlertTriangle size={13} />
          <span>{t('tasks.missingHint', { path: task.directory })}</span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Materials rail */}
        <aside
          onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
          onDragLeave={e => {
            e.preventDefault()
            e.stopPropagation()
            if (e.currentTarget === e.target) setDragOver(false)
          }}
          onDrop={handleDrop}
          style={{
            width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)',
            position: 'relative', minHeight: 0,
          }}
        >
          <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={RAIL_HEADING}>
              <Paperclip size={12} />
              {t('tasks.materials')}
              <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>
                {task.materials.length}
              </span>
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={pickFiles}
              disabled={importing || task.missing}
              title={t('tasks.addMaterials')}
              aria-label={t('tasks.addMaterials')}
              style={{ ...ICON_BUTTON, height: 24, padding: '0 7px', opacity: importing || task.missing ? 0.5 : 1 }}
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen(open => !open)}
              disabled={task.missing}
              title={t('tasks.pastePath')}
              aria-label={t('tasks.pastePath')}
              style={{ ...ICON_BUTTON, height: 24, padding: '0 7px', opacity: task.missing ? 0.5 : 1 }}
            >
              <Upload size={12} />
            </button>
          </div>

          {pasteOpen && (
            <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <input
                ref={pasteRef}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); void submitPaste() }
                }}
                placeholder={t('tasks.pastePathPlaceholder')}
                aria-label={t('tasks.pastePath')}
                style={{
                  height: 26, boxSizing: 'border-box', padding: '0 8px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-primary)', fontSize: 11, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('tasks.pastePathHint')}
                </span>
                <button
                  type="button"
                  onClick={submitPaste}
                  disabled={importing || pasteText.trim().length === 0}
                  style={{ ...ICON_BUTTON, height: 22, padding: '0 8px', opacity: importing || !pasteText.trim() ? 0.5 : 1 }}
                >
                  {t('tasks.add')}
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
            {task.materials.length === 0 ? (
              <div style={{
                margin: '6px 4px', padding: '14px 10px', borderRadius: 9,
                border: '1px dashed var(--border)', color: 'var(--text-muted)',
                fontSize: 11, lineHeight: 1.5, textAlign: 'center',
              }}>
                {task.missing ? t('tasks.error.missing') : t('tasks.materialsEmpty')}
              </div>
            ) : (
              task.materials.map(material => (
                <div
                  key={material.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 6px', borderRadius: 7, minWidth: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <FileText size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div title={material.name} style={{
                      fontSize: 11, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {material.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-subtle)' }}>
                      {formatBytes(material.size)}
                    </div>
                  </div>
                  {pendingRemove === material.id ? (
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => { void confirmRemove(material.id) }}
                        title={t('tasks.remove')}
                        style={{ ...ICON_BUTTON, height: 20, padding: '0 5px', color: 'var(--error)' }}
                      >
                        {t('tasks.remove')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRemove(null)}
                        title={t('tasks.cancel')}
                        style={{ ...ICON_BUTTON, height: 20, padding: '0 5px' }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingRemove(material.id)}
                      disabled={task.missing}
                      title={t('tasks.removeMaterial')}
                      aria-label={t('tasks.removeMaterial')}
                      style={{
                        ...ICON_BUTTON, width: 20, height: 20, padding: 0,
                        border: 'none', background: 'transparent',
                        opacity: task.missing ? 0.4 : 1,
                      }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {dragOver && (
            <div style={{
              position: 'absolute', inset: 6, borderRadius: 10,
              border: '1px dashed var(--accent)', background: 'var(--accent-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: 16, color: 'var(--accent-text)',
              fontSize: 11, fontWeight: 600, pointerEvents: 'none',
            }}>
              {t('tasks.dropHere')}
            </div>
          )}
        </aside>

        {/* Conversations and dispatch. Dispatch only fills the composer; the
            send happens in the chat view, by the user. */}
        <section style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-chat)', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 24px' }}>
            <div style={{
              width: '100%', maxWidth: 680, margin: '0 auto',
              display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={RAIL_HEADING}>
                    <MessageSquare size={12} />
                    {t('tasks.conversations')}
                    <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>
                      {task.sessions.length}
                    </span>
                  </span>
                </div>
                {task.sessions.length === 0 ? (
                  <div style={{
                    padding: '14px 12px', borderRadius: 9, border: '1px dashed var(--border)',
                    color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.6,
                  }}>
                    {t('tasks.conversationsEmpty')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {task.sessions.slice().reverse().map(ref => {
                      const state = presence[ref.sessionId] ?? 'checking'
                      const openable = state === 'present'
                      const listed = sessionList.find(session => session.sessionId === ref.sessionId)
                      const title = taskConversationTitle(listed?.title, task.title)
                      return (
                        <button
                          key={ref.sessionId}
                          type="button"
                          disabled={!openable}
                          onClick={() => { void openConversation(ref) }}
                          title={openable ? t('tasks.conversationOpen') : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 9,
                            width: '100%', padding: '8px 10px', borderRadius: 9,
                            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                            textAlign: 'left', cursor: openable ? 'pointer' : 'default',
                            opacity: state === 'missing' ? 0.8 : 1,
                          }}
                        >
                          <span style={{
                            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid var(--border)',
                            background: state === 'missing' ? 'rgba(251,191,36,0.10)' : 'var(--accent-bg)',
                            color: state === 'missing' ? 'var(--warning)' : 'var(--accent-text)',
                          }}>
                            {state === 'present'
                              ? <CheckCircle2 size={13} />
                              : state === 'checking'
                                ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                : <AlertTriangle size={13} />}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: 'block', fontSize: 11.5, fontWeight: 600,
                              color: 'var(--text-primary)', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {title}
                            </span>
                            <span style={{
                              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                              marginTop: 2, fontSize: 9, color: 'var(--text-subtle)',
                            }}>
                              <span style={{
                                border: '1px solid var(--border)', borderRadius: 5,
                                padding: '0 4px', fontWeight: 600,
                              }}>
                                {t(`tasks.sessionPurpose.${ref.purpose}`)}
                              </span>
                              <span>{formatTaskTime(ref.startedAt, resolvedLocale)}</span>
                              {state === 'checking' && <span>{t('tasks.conversationChecking')}</span>}
                              {state === 'missing' && (
                                <span style={{ color: 'var(--warning)' }}>{t('tasks.conversationMissing')}</span>
                              )}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* What the task's conversations cost. Quiet by design: the
                  same card grammar as dispatch, no new colour, and no block at
                  all for a task that has never run a conversation. Unknown spend
                  is named as unknown instead of being rounded to zero. */}
              {task.sessions.length > 0 && (
                <div
                  data-task-spend
                  style={{
                    padding: '14px 16px 12px', borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <span style={RAIL_HEADING}>
                    <Coins size={12} />
                    {t('tasks.spend.title')}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                    <div
                      title={spend.costPartial ? t('tasks.spend.partial') : undefined}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span style={SPEND_LABEL}>{t('tasks.spend.cost')}</span>
                      <span data-task-spend-total style={SPEND_VALUE}>{spendCost}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={SPEND_LABEL}>{t('tasks.spend.turns')}</span>
                      <span style={SPEND_VALUE}>{spendTurns}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={SPEND_LABEL}>{t('tasks.spend.output')}</span>
                      <span style={SPEND_VALUE}>{spendOutput}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {task.sessions.slice().reverse().map((ref, index) => {
                      const entry = usageEntries.get(ref.sessionId)
                      const label = conversationLabel(ref)
                      return (
                        <div
                          key={ref.sessionId}
                          data-task-spend-session={ref.sessionId}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                            padding: '6px 0',
                            borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                          }}
                        >
                          <span style={{
                            flexShrink: 0, border: '1px solid var(--border)', borderRadius: 5,
                            padding: '0 4px', fontSize: 9, fontWeight: 600,
                            color: 'var(--text-muted)',
                          }}>
                            {t(`tasks.sessionPurpose.${ref.purpose}`)}
                          </span>
                          <span title={label} style={{
                            flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {label}
                          </span>
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontVariantNumeric: 'tabular-nums',
                            color: entry ? 'var(--text-secondary)' : 'var(--text-subtle)',
                          }}>
                            {conversationSpend(ref)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{
                padding: '16px 16px 14px', borderRadius: 12,
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                  }}>
                    <Send size={13} color="var(--accent-text)" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)',
                    }}>
                      {purpose === 'dispatch' ? t('tasks.dispatch') : t('tasks.dispatchFollowup')}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {purpose === 'dispatch' ? t('tasks.dispatchHint') : t('tasks.dispatchFollowupHint')}
                    </span>
                  </span>
                </div>

                <div>
                  <div style={{ ...RAIL_HEADING, marginBottom: 5 }}>
                    {t('tasks.briefPreview')}
                  </div>
                  <pre
                    aria-label={t('tasks.briefPreview')}
                    style={{
                      margin: 0, padding: '9px 10px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg-chat)',
                      color: 'var(--text-secondary)', fontSize: 10.5, lineHeight: 1.55,
                      fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      maxHeight: 210, overflowY: 'auto',
                    }}
                  >
                    {brief}
                  </pre>
                </div>

                {purpose === 'followup' && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('tasks.dispatchFollowupNew')}
                  </div>
                )}

                {task.missing ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px',
                    borderRadius: 7, background: 'rgba(251,191,36,0.08)',
                    color: 'var(--warning)', fontSize: 10.5,
                  }}>
                    <AlertTriangle size={12} />
                    {t('tasks.dispatchBlockedMissing')}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={dispatch}
                    aria-label={purpose === 'dispatch' ? t('tasks.dispatch') : t('tasks.dispatchFollowup')}
                    style={{
                      alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center',
                      gap: 6, height: 30, padding: '0 13px', borderRadius: 8,
                      border: '1px solid var(--accent-border)', background: 'var(--accent-bg)',
                      color: 'var(--accent-text)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <Send size={12} />
                    {purpose === 'dispatch' ? t('tasks.dispatch') : t('tasks.dispatchFollowup')}
                  </button>
                )}

                <div style={{ fontSize: 9.5, color: 'var(--text-subtle)', lineHeight: 1.5 }}>
                  {t('tasks.dispatchDepartmentOptional')}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* History timeline */}
        <aside style={{
          width: 236, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border)',
          minHeight: 0,
        }}>
          <div style={{ padding: '12px 12px 8px' }}>
            <span style={RAIL_HEADING}>
              <History size={12} />
              {t('tasks.history')}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
            {task.history.length === 0 ? (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 2px' }}>
                {t('tasks.historyEmpty')}
              </div>
            ) : (
              task.history.map((event, index) => {
                // A status change carried a reason for a needs_you transition.
                // Split it from the transition so the history never prints the
                // store's ` | ` separator as noise; the reason gets its own
                // muted, wrapping line with a localized label.
                const statusChange = event.kind === 'status_changed'
                  ? parseStatusChangeDetail(event.detail)
                  : null
                const detail = statusChange ? undefined : historyDetail(event)
                return (
                  <div key={`${event.at}-${index}`} style={{
                    display: 'flex', gap: 7, padding: '5px 0',
                    borderBottom: index === task.history.length - 1 ? 'none' : '1px solid var(--border)',
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                      background: event.kind === 'folder_missing' ? 'var(--warning)' : 'var(--accent)',
                    }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                        {t(`tasks.event.${event.kind}`)}
                      </div>
                      {statusChange && (
                        <>
                          <div title={statusChange.transition} style={{
                            fontSize: 9, color: 'var(--text-subtle)', marginTop: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {statusChange.transition}
                          </div>
                          {statusChange.reason && (
                            <div title={statusChange.reason} style={{
                              fontSize: 9, color: 'var(--text-muted)', marginTop: 1,
                              lineHeight: 1.4, overflowWrap: 'anywhere',
                            }}>
                              {t('tasks.historyReason', { reason: statusChange.reason })}
                            </div>
                          )}
                        </>
                      )}
                      {detail && (
                        // The automation key is kept on the row's tooltip: the
                        // line reads as a time, the provenance stays checkable.
                        <div title={event.kind === 'from_automation' && event.detail ? event.detail : detail} style={{
                          fontSize: 9, color: 'var(--text-subtle)', marginTop: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {detail}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, fontSize: 9, color: 'var(--text-subtle)' }}>
                        <Clock size={8} />
                        {formatTaskTime(event.at, resolvedLocale)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
