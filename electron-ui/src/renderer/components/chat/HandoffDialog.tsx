// Hand a conversation to another department.
//
// A department is a processor, not a folder. If the conversation belongs to a
// task, confirming routes that task to the chosen department: `departmentId`
// changes, main records the routing event, and every file and conversation
// stays exactly where it is. A conversation with no task starts a follow-up
// task in the chosen department instead: same excerpts, new task folder, note
// prefilled in the composer, nothing sent.
//
// The note never names a target directory. Naming one would tell the receiver to
// work somewhere the task does not own.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Info } from 'lucide-react'
import { useI18n } from '../../i18n'
import {
  useChatStore,
  useDepartmentStore,
  usePrefsStore,
  useSessionStore,
  useTaskStore,
  useUiStore,
} from '../../store'
import {
  deptDisplayName,
  deptTreeOptionText,
  deptTreeOptions,
  deptTreePath,
} from '../departments/deptUtils'
import { buildDeptLookup, resolveDeptForSession } from '../departments/sessionFiling'
import { bindPersonaToNewSession } from '../departments/personaBinding'
import { dispatchTask } from '../../lib/taskDispatch'
import { suggestDepartment } from '../../lib/taskRouting'
import DepartmentSuggestionChip from '../tasks/DepartmentSuggestionChip'
import {
  HANDOFF_MAX_CHARS,
  buildHandoffDraft,
  renderHandoffText,
  type HandoffLabels,
} from './handoffDraft'
import SessionReuseDialogShell from './SessionReuseDialogShell'
import { resolveWorkingDir } from '../../lib/workingDir'
import type { StandardChatMessage } from '../../types/app.types'

interface Props {
  /** The header's resolved title for the conversation being handed off. */
  sessionTitle: string | null
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 12,
  background: 'var(--bg-hover)',
  border: '1px solid var(--bg-active)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s ease',
}

export default function HandoffDialog({ sessionTitle, onClose }: Props) {
  const { t, resolvedLocale } = useI18n()
  const departments = useDepartmentStore(s => s.departments)
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)
  const messages = useChatStore(s => s.messages)
  // `viewSessionId` is the conversation the user is looking at. `currentSessionId`
  // can be overwritten by a streaming bridge, so it is not a stable source id.
  const viewSessionId = useChatStore(s => s.viewSessionId)
  const activeTabCwd = useChatStore(s => s.tabs.find(tab => tab.id === s.activeTabId)?.cwd ?? '')
  const activeTabTask = useChatStore(s => s.tabs.find(tab => tab.id === s.activeTabId)?.task)
  const prefsWorkingDir = usePrefsStore(s => s.prefs.workingDir)
  const personas = usePrefsStore(s => s.prefs.personas)
  const tasks = useTaskStore(s => s.tasks)

  const [selectedId, setSelectedId] = useState('')
  const [note, setNote] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastTargetRef = useRef<string | null>(null)

  const options = useMemo(
    () => deptTreeOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  const lookup = useMemo(
    () => buildDeptLookup(departments, homeDir, tasks),
    [departments, homeDir, tasks],
  )
  const filings = useDepartmentStore(s => s.filings)

  const target = selectedId ? departments.find(d => d.id === selectedId) ?? null : null

  // Which task owns this handoff. A task tab may not have linked its session
  // yet (its first turn has not finished), so its binding is evidence too.
  const sourceTask = useMemo(() => {
    if (activeTabTask) {
      const bound = tasks.find(task => task.id === activeTabTask.taskId)
      if (bound) return bound
    }
    if (!viewSessionId) return null
    return tasks.find(task =>
      task.sessions.some(ref => ref.sessionId === viewSessionId)) ?? null
  }, [activeTabTask, tasks, viewSessionId])

  // The listing is the only authority on which department owns a conversation.
  // A manual filing wins over the folder. A filing whose node was deleted keeps
  // the remembered name — the only honest label left — rather than falling back
  // to the folder in the note; a session absent from the listing is unfiled and
  // we never invent an owner from a path.
  const sourceDeptPath = useMemo(() => {
    if (!viewSessionId) return null
    const session = sessions.find(item => item.sessionId === viewSessionId)
    if (!session) return null
    const resolution = resolveDeptForSession(session, lookup, filings)
    if (resolution.source === 'removed') {
      // The note goes to the receiving department, so the name alone would
      // imply a department that still exists. Say it was removed; do not fall
      // back to the folder.
      const name = resolution.filing.deptName.trim()
      return name ? t('chat.handoff.deptRemoved', { name }) : null
    }
    return resolution.dept
      ? deptTreePath(resolution.dept, lookup.byId, resolvedLocale)
      : null
  }, [viewSessionId, sessions, lookup, filings, resolvedLocale, t])

  const sourceDirectory = useMemo(() => {
    // A task's folder is where the work happened; its transcript cwd may
    // predate the task or merely be the folder the engine resumed in.
    if (sourceTask) return sourceTask.directory
    const session = viewSessionId
      ? sessions.find(item => item.sessionId === viewSessionId)
      : undefined
    // The transcript's own record wins: it is where the work happened, even if
    // the tab was moved afterwards. Otherwise the same folder the send path
    // would use for this conversation — the active tab, then the default. No
    // home fallback here: the note has always said "not recorded" rather than
    // naming a folder nobody chose for this work.
    // `project` is deliberately not a fallback either: it is the decoded folder
    // label, not the folder (separators and dots were lost in the slug), so
    // printing it as a working folder would name a path that does not exist.
    return session?.cwd || resolveWorkingDir({ tabCwd: activeTabCwd, globalDir: prefsWorkingDir }).dir
  }, [sourceTask, viewSessionId, sessions, activeTabCwd, prefsWorkingDir])

  const labels: HandoffLabels = useMemo(() => ({
    heading: t('chat.handoff.heading'),
    sourceTitle: t('chat.handoff.sourceTitle'),
    untitled: t('chat.handoff.untitled'),
    sourceSession: t('chat.handoff.sourceSession'),
    sourceDept: t('chat.handoff.sourceDept'),
    unfiled: t('chat.handoff.unfiled'),
    sourceFolder: t('chat.handoff.sourceFolder'),
    folderUnknown: t('chat.handoff.folderUnknown'),
    date: t('chat.handoff.date'),
    firstRequest: t('chat.handoff.firstRequest'),
    latestRequest: t('chat.handoff.latestRequest'),
    latestReply: t('chat.handoff.latestReply'),
    closing: t('chat.handoff.closing'),
    noContext: t('chat.handoff.noContext'),
    cutNote: t('chat.handoff.cutNote'),
  }), [t])

  const draft = useMemo(() => {
    // Routing an existing task carries no note: the task already has its
    // context, and its conversations stay open. Only the follow-up path opens a
    // new conversation that needs the excerpts.
    if (!target || sourceTask) return null
    return buildHandoffDraft({
      messages,
      sourceTitle: sessionTitle,
      sourceSessionId: viewSessionId,
      sourceDirectory,
      sourceDeptPath,
      targetLabel: deptDisplayName(target, resolvedLocale),
    })
  }, [
    target,
    sourceTask,
    messages,
    sessionTitle,
    viewSessionId,
    sourceDirectory,
    sourceDeptPath,
    resolvedLocale,
  ])

  const generated = useMemo(
    () => (draft ? renderHandoffText(draft, labels) : ''),
    [draft, labels],
  )

  // Edits win for the target they were typed for. A new target always
  // regenerates the note (its heading and folder must change); while the target
  // stays put, an unedited note follows the freshly generated text.
  useEffect(() => {
    if (!draft) return
    const targetChanged = lastTargetRef.current !== selectedId
    lastTargetRef.current = selectedId
    if (targetChanged) {
      setNote(generated)
      setEdited(false)
      return
    }
    if (!edited) setNote(generated)
  }, [draft, generated, selectedId, edited])

  // The same local heuristic the task surfaces use. A task's own title and
  // materials are the evidence when it has them; a plain conversation borrows
  // its title and the latest messages so the chip is not blind. It never sets
  // `selectedId` — only the click does.
  const routingSuggestion = useMemo(() => {
    const title = sourceTask?.title ?? (sessionTitle ?? '').trim()
    const excerpts = sourceTask
      ? []
      : (messages
        .filter(message => message.role === 'user' || message.role === 'assistant') as StandardChatMessage[])
        .slice(-4)
        .map(message => message.content.slice(0, 800))
    return suggestDepartment({
      title,
      materialNames: sourceTask?.materials.map(material => material.name),
      excerpts,
      departments,
    })
  }, [sourceTask, sessionTitle, messages, departments])

  const acceptRoutingSuggestion = () => {
    if (!routingSuggestion) return
    // Deleted between render and click: say so and keep the picker open.
    if (!departments.some(dept => dept.id === routingSuggestion.departmentId)) {
      useUiStore.getState().addToast('warning', t('tasks.suggest.stale'))
      return
    }
    setSelectedId(routingSuggestion.departmentId)
  }

  const targetPersona = target?.defaultPersonaId
    ? personas?.find(persona => persona.id === target.defaultPersonaId)
    : undefined
  const targetName = target ? deptDisplayName(target, resolvedLocale) : ''

  const handleConfirm = useCallback(async () => {
    if (!target || busy) return
    const targetName = deptDisplayName(target, resolvedLocale)
    setBusy(true)
    try {
      if (sourceTask) {
        // Routing is attribution only: the task keeps its folder, materials and
        // conversations. A manual filing would outrank the new route, so the
        // task's existing conversations are un-filed first — the route must be
        // what the user sees afterwards.
        const routed = await useTaskStore.getState().routeTask(sourceTask.id, target.id)
        if (!routed.ok) {
          useUiStore.getState().addToast('error', routed.error || t('tasks.error.route'))
          return
        }
        const department = useDepartmentStore.getState()
        for (const ref of sourceTask.sessions) department.clearSessionFiling(ref.sessionId)
        useUiStore.getState().addToast('success', t('chat.handoff.routed', { name: targetName }))
        onClose()
        return
      }

      // No task owns this conversation: start a follow-up task in the target
      // department. The task owns the new folder; nothing is sent until the
      // user presses send in the composer.
      const title = (sessionTitle || '').trim() || t('chat.handoff.followupTitle')
      const created = await useTaskStore.getState().createTask(title)
      if (!created.ok || !created.task) {
        useUiStore.getState().addToast('error', created.error || t('tasks.error.create'))
        return
      }
      const routed = await useTaskStore.getState().routeTask(created.task.id, target.id)
      if (!routed.ok || !routed.task) {
        useUiStore.getState().addToast('error', routed.error || t('tasks.error.route'))
        return
      }
      const outcome = dispatchTask(routed.task, t)
      if (!outcome.ok) {
        useUiStore.getState().addToast('error', outcome.error)
        return
      }
      // `dispatchTask` prefilled the task brief; the handoff note replaces it, so
      // the receiver opens the same task with the excerpts in front of them.
      useUiStore.getState().prefillComposer(note)
      bindPersonaToNewSession(target.defaultPersonaId)
      useUiStore.getState().addToast('success', t('chat.handoff.opened'))
      onClose()
    } finally {
      setBusy(false)
    }
  }, [target, busy, sourceTask, note, sessionTitle, resolvedLocale, t, onClose])

  // Routing a task needs no note. A follow-up whose note the user emptied on
  // purpose is not a handoff: opening a blank conversation would look like the
  // handoff happened while carrying nothing the receiver could act on.
  const canConfirm = !!target && !busy && (!!sourceTask || note.trim().length > 0)

  return (
    <SessionReuseDialogShell
      title={t('chat.handoff.title')}
      subtitle={t('chat.handoff.subtitle')}
      icon={<Building2 size={16} />}
      width={560}
      onClose={onClose}
      testId="handoff"
      footer={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <div style={{
            flex: 1,
            minWidth: 0,
            fontSize: 10.5,
            lineHeight: 1.45,
            color: 'var(--text-muted)',
          }}>
            <div data-handoff-nothing-sent>{t('chat.handoff.nothingSent')}</div>
            {!sourceTask && (
              <div style={{ marginTop: 2 }}>{t('chat.handoff.footerNoContext')}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
              color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0,
            }}
          >
            {t('chat.handoff.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-handoff-confirm
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              background: canConfirm
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-hover)',
              border: 'none', color: 'var(--text-bright)', fontWeight: 600,
              opacity: canConfirm ? 1 : 0.5, flexShrink: 0,
            }}
          >
            {sourceTask ? t('chat.handoff.routeConfirm') : t('chat.handoff.confirm')}
          </button>
        </div>
      )}
    >
      {departments.length === 0 ? (
        <div
          data-handoff-no-departments
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.22)',
          }}
        >
          <Info size={14} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('chat.handoff.noDepartments')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
              {t('chat.handoff.noDepartmentsHint')}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="handoff-department">
                {t('chat.handoff.targetLabel')}
              </label>
              {routingSuggestion && routingSuggestion.departmentId !== selectedId && (
                <DepartmentSuggestionChip
                  suggestion={routingSuggestion}
                  onAccept={acceptRoutingSuggestion}
                />
              )}
            </div>
            <select
              id="handoff-department"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              data-handoff-target
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              <option value="" disabled>
                {t('chat.handoff.targetPlaceholder')}
              </option>
              {options.map(option => (
                <option key={option.id} value={option.id} title={option.path}>
                  {deptTreeOptionText(option)}
                </option>
              ))}
            </select>
            {targetPersona && (
              <div
                data-handoff-persona
                style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.45 }}
              >
                {t('chat.handoff.runAs', { name: targetPersona.name })}
              </div>
            )}
          </div>

          {sourceTask ? (
            <div
              data-handoff-route
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.22)',
              }}
            >
              <Info size={14} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('chat.handoff.routeTitle')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                  {t('chat.handoff.routeHint', {
                    title: sourceTask.title,
                    name: targetName || t('chat.handoff.targetPlaceholder'),
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginBottom: 6, gap: 8,
              }}>
                <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="handoff-note">
                  {t('chat.handoff.noteLabel')}
                </label>
                <span
                  data-handoff-count
                  style={{
                    fontSize: 10, color: 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}
                >
                  {note.length}/{HANDOFF_MAX_CHARS}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.45 }}>
                {t('chat.handoff.noteHint')}
              </div>
              <textarea
                id="handoff-note"
                value={note}
                onChange={e => {
                  setNote(e.target.value)
                  setEdited(true)
                }}
                maxLength={HANDOFF_MAX_CHARS}
                rows={14}
                data-handoff-note
                style={{
                  ...fieldStyle,
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  resize: 'vertical',
                  minHeight: 220,
                  maxHeight: '46vh',
                  whiteSpace: 'pre-wrap',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
              />
            </div>
          )}
        </>
      )}
    </SessionReuseDialogShell>
  )
}
