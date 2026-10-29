// Skill detail view — extracted from SkillsPanel.tsx (Iteration 199)
import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Copy,
  History,
  Pencil,
  Play,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { scheduleText } from '../automation/scheduleText'
import AutomationDialog, { type WorkflowOption } from '../automation/AutomationDialog'
import { WARNING } from '../automation/automationStyles'
import { skillBodyState } from '../automation/skillSelection'
import { skillSlashCommand } from './skillCommand'
import {
  buildSkillRunSummary,
  matchesSkillAction,
  skillRunSummaryText,
} from './skillRunSummary'
import ProvenanceLine from '../provenance/ProvenanceLine'
import {
  parseSkillMd,
  rewriteSkillMd,
  SKILL_DESCRIPTION_MAX,
} from '../../../main/skills/skillMd'
import type { AutomationJobData, AutomationLimitsData } from '../../../preload'
import type { SkillInfo } from './skillsShared'
import {
  createSkillEditState,
  isSkillEditDirty,
  skillEditReducer,
  type SkillEditDraft,
} from './skillEditState'

interface SkillDetailProps {
  skill: SkillInfo
  skillContent: string
  deletingSkillPath: string | null
  onBack: () => void
  onUseSkill: (name: string) => void
  onDeleteSkill: (dirPath: string) => void
}

/**
 * One schedule that runs this skill, as a quiet row.
 *
 * Read-only on purpose: the row's job is "this runs without me", so it opens
 * the automations page where the schedule can be changed, paused or deleted in
 * the same place as every other job. Mirrors the strip a workflow page shows,
 * but with no per-row actions — a skill has no run of its own to start.
 */
function SkillScheduleRow({ job, onOpen }: { job: AutomationJobData; onOpen: () => void }) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={t('skills.schedules.openHint')}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
        padding: '5px 7px', textAlign: 'left', cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        border: 'none', borderRadius: 6,
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 11, transition: 'background 0.15s ease',
      }}
    >
      <CalendarClock size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={{
        fontWeight: 600, flexShrink: 0, maxWidth: '45%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{job.name}</span>
      <span style={{
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', opacity: 0.85,
      }}>{scheduleText(t, job.trigger)}</span>
      <ChevronRight size={11} style={{ flexShrink: 0, marginLeft: 'auto', opacity: 0.5 }} />
    </button>
  )
}

/** Inline edit banners share the create page's warning shape, at page width. */
function bannerStyle(background: string, border: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    margin: '0 20px 10px',
    padding: '12px 14px',
    borderRadius: 8,
    background,
    border: `1px solid ${border}`,
    color: 'var(--text-primary)',
    fontSize: 12,
    flexShrink: 0,
  }
}

function bannerButtonStyle(
  background: string,
  border: string,
  color: string,
): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${border}`,
    background,
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

function getSourceBadgeStyle(source: string): React.CSSProperties {
  if (source === 'personal') {
    return {
      background: 'rgba(99,102,241,0.15)',
      border: '1px solid rgba(99,102,241,0.25)',
      color: '#a5b4fc',
    }
  }
  if (source === 'project') {
    return {
      background: 'rgba(34,197,94,0.12)',
      border: '1px solid rgba(34,197,94,0.25)',
      color: '#4ade80',
    }
  }
  return {
    background: 'var(--border)',
    border: '1px solid var(--bg-active)',
    color: 'var(--text-secondary)',
  }
}

export default function SkillDetail({
  skill,
  skillContent,
  deletingSkillPath,
  onBack,
  onUseSkill,
  onDeleteSkill,
}: SkillDetailProps) {
  const t = useT()
  const [backHovered, setBackHovered] = useState(false)
  const [useHovered, setUseHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)
  const [scheduleHovered, setScheduleHovered] = useState(false)
  const [runHovered, setRunHovered] = useState(false)
  const [copyHovered, setCopyHovered] = useState(false)
  const [editHovered, setEditHovered] = useState(false)
  const [saveHovered, setSaveHovered] = useState(false)
  const [cancelHovered, setCancelHovered] = useState(false)

  // ── Editing ─────────────────────────────────────────────────────────────
  // The page keeps its own copy of the file while it is editable: the
  // `skillContent` prop is the parent's snapshot from before the save, and
  // showing it after a successful save would be showing yesterday's file.
  const addToast = useUiStore(s => s.addToast)
  const workingDir = useChatStore(s => s.workingDir)
  const [edit, dispatchEdit] = useReducer(skillEditReducer, undefined, createSkillEditState)
  const [liveContent, setLiveContent] = useState(skillContent)
  // The raw bytes the edit started from. The preview is produced from this same
  // string by `rewriteSkillMd`, the serializer `skills:update` uses, so unknown
  // frontmatter keys appear in the preview exactly as they will on disk.
  // (`buildSkillFile` is the authority for a *new* file only.)
  const [baseContent, setBaseContent] = useState('')
  const [editUnreadable, setEditUnreadable] = useState(false)
  const [editBusy, setEditBusy] = useState(false)

  // A reopen or a different skill resets the view, not an edit in progress.
  useEffect(() => {
    setLiveContent(skillContent)
  }, [skillContent, skill.dirPath])
  // The dialog needs the same lists the workflow page hands it: the workflow
  // options it offers for a workflow action, and the scheduler's limits.
  const workflows = usePrefsStore(s => s.prefs.workflows) as WorkflowOption[] | undefined

  // Read on mount and on every scheduler broadcast, so a job created or
  // deleted in Settings shows up here without reopening the page. A failed read
  // is an empty list: showing no schedules is quieter than a broken strip, and
  // the page's real subject (the SKILL.md) is unaffected.
  const [jobs, setJobs] = useState<AutomationJobData[] | null>(null)
  const [limits, setLimits] = useState<AutomationLimitsData | null>(null)
  const refreshJobs = useCallback(async () => {
    try {
      const result = await window.electronAPI.automationList()
      setJobs(Array.isArray(result?.jobs) ? result.jobs : [])
      setLimits(result?.limits ?? null)
    } catch {
      setJobs(null)
    }
  }, [])
  useEffect(() => {
    void refreshJobs()
    const off = window.electronAPI.onAutomationChanged(() => { void refreshJobs() })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [refreshJobs])

  // Whether this skill can be scheduled at all. The page carries `skillContent`
  // for display, but that string is the read error when the read failed, so it
  // cannot answer "is the body empty"; one read of the same file through the
  // same IPC gives a truthful answer without a probe per render.
  const [runState, setRunState] = useState<'checking' | 'ready' | 'unreadable'>('checking')
  const [bodyEmpty, setBodyEmpty] = useState(false)
  useEffect(() => {
    let cancelled = false
    setRunState('checking')
    void (async () => {
      try {
        const result = await window.electronAPI.skillsRead(skill.dirPath)
        if (cancelled) return
        const content = result?.content
        if (typeof content !== 'string') {
          setRunState('unreadable')
          return
        }
        setLiveContent(content)
        setBodyEmpty(skillBodyState(content) === 'empty')
        setRunState('ready')
      } catch {
        if (!cancelled) setRunState('unreadable')
      }
    })()
    return () => { cancelled = true }
  }, [skill.dirPath])

  // Nothing is written by opening this page. The dialog saves on the user's
  // click, and closing it re-reads the list so a new schedule appears now
  // rather than on the next broadcast.
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const canSchedule = runState === 'ready' && !bodyEmpty
  const blockedReason = runState === 'unreadable'
    ? t('skills.schedules.blockedUnreadable')
    : runState === 'ready' && bodyEmpty
      ? t('skills.schedules.blockedEmpty')
      : null
  // Run now applies the same rule for a different reason: an empty or
  // unreadable file cannot produce a run, and a button that inserts a command
  // it knows will fail would only move the failure into chat.
  const runBlockedReason = runState === 'unreadable'
    ? t('skills.run.blockedUnreadable')
    : runState === 'ready' && bodyEmpty
      ? t('skills.run.blockedEmpty')
      : null

  // A job names the skill by source + directory segment, which is exactly the
  // identity this page was opened with. `skillDir` is absent only for a payload
  // from an older main process; `''` is the root-level skill, not a wildcard.
  const skillIdentity = useMemo(() => ({
    source: skill.source,
    dir: skill.skillDir ?? '',
  }), [skill.source, skill.skillDir])
  const schedules = useMemo(() => {
    const list = jobs ?? []
    return list.filter(job => matchesSkillAction(job, skillIdentity))
  }, [jobs, skillIdentity])

  // The same jobs the strip above reads. `automationList()` is the only source,
  // and the pure module owns the arithmetic: which runs belong to this skill,
  // what failed, how old the newest is and whether spend is complete. Nothing
  // here claims a chat run — a hand-started run leaves no automation record.
  const runSummary = useMemo(
    () => (jobs === null ? null : buildSkillRunSummary(jobs, skillIdentity)),
    [jobs, skillIdentity],
  )
  const runSummaryView = runSummary === null
    ? null
    : skillRunSummaryText(runSummary, t, Date.now())

  // The command the Run now action puts in the composer. One helper with the
  // marketplace's Use action, so the chip shows exactly what would be typed.
  const runCommand = useMemo(() => skillSlashCommand(skill.name), [skill.name])

  const runNow = useCallback(() => {
    if (!canSchedule) return
    const ui = useUiStore.getState()
    ui.setQuotedText(runCommand)
    ui.setActiveNavItem('chat')
    addToast('success', t('skills.run.inserted', { command: runCommand }))
  }, [canSchedule, runCommand, addToast, t])

  const copyRunCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(runCommand)
      addToast('success', t('skills.run.copied', { command: runCommand }))
    } catch {
      addToast('error', t('skills.run.copyFailed', { command: runCommand }))
    }
  }, [runCommand, addToast, t])

  // ── Editing handlers ────────────────────────────────────────────────────

  const draftFrom = useCallback((content: string): SkillEditDraft => {
    const parsed = parseSkillMd(content)
    return {
      // The name is not a field, but it is an owned key: keep the one the file
      // already declares so an ordinary edit does not rename the skill.
      name: parsed.name ?? skill.name,
      description: parsed.description ?? '',
      body: parsed.body.trim(),
    }
  }, [skill.name])

  // Re-read at the moment Edit is pressed rather than trusting the snapshot
  // from mount: the token then describes the file the user is about to edit,
  // and an unreadable file disables the button instead of opening a form.
  const beginEdit = useCallback(async () => {
    setEditBusy(true)
    try {
      const result = await window.electronAPI.skillsRead(skill.dirPath)
      const content = result?.content
      const token = result?.token
      if (typeof content !== 'string' || !token) {
        setEditUnreadable(true)
        return
      }
      setEditUnreadable(false)
      setBaseContent(content)
      setLiveContent(content)
      dispatchEdit({ type: 'start', draft: draftFrom(content), token })
    } catch {
      setEditUnreadable(true)
    } finally {
      setEditBusy(false)
    }
  }, [skill.dirPath, draftFrom])

  const draft = edit.draft
  const dirty = isSkillEditDirty(edit)
  const saving = edit.status === 'saving'
  const descriptionLength = draft.description.replace(/\s*\n\s*/g, ' ').trim().length
  const descriptionOverLimit = descriptionLength > SKILL_DESCRIPTION_MAX

  // The real serializer, fed the file as it was read. If it refuses, the same
  // refusal would come back from main, so Save is blocked here and the reason
  // is shown instead of pretending the preview is complete.
  const preview = useMemo(() => {
    if (edit.mode !== 'editing') return null
    return rewriteSkillMd(baseContent, {
      name: draft.name,
      description: draft.description,
      body: draft.body,
    })
  }, [edit.mode, baseContent, draft])
  const previewBlocked = preview !== null && !preview.ok
  const previewContent = preview?.ok ? preview.content : null
  // A save that already came back `unparsable` must not look clickable: the
  // same bytes would fail the same way. The textarea stays editable.
  const saveBlocked = previewBlocked || edit.status === 'unparsable'

  const save = useCallback(async (force: boolean) => {
    if (saveBlocked) return
    dispatchEdit({ type: 'saveStart', force })
    try {
      const result = await window.electronAPI.skillsUpdate({
        source: skill.source,
        dir: skill.skillDir ?? '',
        name: draft.name,
        description: draft.description,
        body: draft.body,
        ...(edit.token ? { token: edit.token } : {}),
        ...(force ? { force: true } : {}),
        ...(workingDir ? { workingDir } : {}),
      })
      if (result.success) {
        dispatchEdit({ type: 'saveSuccess', token: result.token })
        setBaseContent(result.content)
        setLiveContent(result.content)
        setBodyEmpty(skillBodyState(result.content) === 'empty')
        addToast('success', t('skills.edit.saved'))
      } else {
        dispatchEdit({
          type: 'saveFailure',
          code: result.code,
          message: result.error,
          ...(typeof result.currentMtimeMs === 'number'
            ? { currentMtimeMs: result.currentMtimeMs }
            : {}),
          ...(result.token ? { token: result.token } : {}),
        })
      }
    } catch (err) {
      dispatchEdit({ type: 'saveFailure', code: 'write_failed', message: String(err) })
    }
  }, [saveBlocked, skill.source, skill.skillDir, draft, edit.token, workingDir, addToast, t])

  const reloadFromDisk = useCallback(async () => {
    try {
      const result = await window.electronAPI.skillsRead(skill.dirPath)
      const content = result?.content
      const token = result?.token
      if (typeof content !== 'string' || !token) {
        dispatchEdit({
          type: 'saveFailure',
          code: 'unreadable',
          message: t('skills.readError'),
        })
        return
      }
      setBaseContent(content)
      setLiveContent(content)
      dispatchEdit({ type: 'reload', draft: draftFrom(content), token })
    } catch (err) {
      dispatchEdit({ type: 'saveFailure', code: 'unreadable', message: String(err) })
    }
  }, [skill.dirPath, draftFrom, t])

  const sourceBadge = getSourceBadgeStyle(skill.source)
  const editing = edit.mode === 'editing'
  const conflictTime = edit.conflictMtimeMs !== null
    ? new Date(edit.conflictMtimeMs).toLocaleString()
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <button
          onClick={onBack}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
          style={{
            background: backHovered ? 'var(--border)' : 'none',
            border: 'none',
            color: backHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 12,
            gap: 4,
            transition: 'all 0.15s ease',
          }}
          aria-label={t('skills.back')}
        >
          <ArrowLeft size={14} />
        </button>
        <span style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skill.name}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: 20,
          flexShrink: 0,
          ...sourceBadge,
        }}>
          {skill.source === 'personal'
            ? t('skills.personal')
            : skill.source === 'project'
              ? t('skills.project')
              : 'global'}
        </span>
      </div>

      {/* Hero / description section */}
      <div style={{
        margin: '16px 20px 0',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            overflow: 'hidden',
            flexShrink: 0,
            background: 'rgba(99,102,241,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Play size={22} style={{ color: '#818cf8' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.07em',
                }}>
                  {t('skills.edit.descriptionLabel')}
                </label>
                <textarea
                  value={draft.description}
                  onChange={(e) => dispatchEdit({
                    type: 'change',
                    field: 'description',
                    value: e.target.value,
                  })}
                  disabled={saving}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: saving ? 0.6 : 1,
                  }}
                />
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginTop: 4,
                  fontSize: 11,
                  color: descriptionOverLimit ? '#fbbf24' : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                }}>
                  <span>{t('skill.descHint')}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {descriptionLength}/{SKILL_DESCRIPTION_MAX}
                  </span>
                </div>
                {descriptionOverLimit && (
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, lineHeight: 1.5 }}>
                    {t('skill.descOverLimit', { max: SKILL_DESCRIPTION_MAX })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 10,
                lineHeight: 1.5,
              }}>
                {skill.description}
              </div>
            )}
            {/* Metadata */}
            <div>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 2,
              }}>
                Path
              </span>
              <span style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                wordBreak: 'break-all' as const,
              }}>
                {skill.dirPath}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons. Editing replaces the run/schedule/delete row: while
          there are unsaved bytes, a second writer on the same file is exactly
          what the token guard exists to prevent. The schedule strip below
          stays put either way. */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        flexShrink: 0,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {editing ? (
          <>
            {edit.status === 'conflict' ? (
              <>
                <button
                  onClick={() => void reloadFromDisk()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '9px 20px',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <CalendarClock size={14} />
                  {t('skills.edit.reload')}
                </button>
                <button
                  onClick={() => void save(true)}
                  disabled={saveBlocked || saving}
                  title={saveBlocked ? t('skills.edit.unparsable') : t('skills.edit.overwriteWarning')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '9px 20px',
                    background: saveBlocked || saving
                      ? 'var(--bg-hover)'
                      : 'rgba(245,158,11,0.16)',
                    color: saveBlocked || saving ? 'var(--text-muted)' : '#fbbf24',
                    border: saveBlocked || saving
                      ? '1px solid var(--border)'
                      : '1px solid rgba(245,158,11,0.45)',
                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: saveBlocked || saving ? 'not-allowed' : 'pointer',
                    opacity: saveBlocked || saving ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Save size={14} />
                  {saving && edit.forcing ? t('skills.edit.overwriting') : t('skills.edit.overwrite')}
                </button>
              </>
            ) : (
              <button
                onClick={() => void save(false)}
                disabled={!dirty || saving || saveBlocked}
                onMouseEnter={() => setSaveHovered(true)}
                onMouseLeave={() => setSaveHovered(false)}
                title={saveBlocked ? t('skills.edit.unparsable') : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 20px',
                  background: !dirty || saving || saveBlocked
                    ? 'var(--bg-hover)'
                    : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                  color: !dirty || saving || saveBlocked ? 'var(--text-muted)' : 'var(--text-bright)',
                  border: !dirty || saving || saveBlocked
                    ? '1px solid var(--border)'
                    : 'none',
                  borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: !dirty || saving || saveBlocked ? 'not-allowed' : 'pointer',
                  opacity: !dirty || saving || saveBlocked ? 0.65 : 1,
                  transform: saveHovered && dirty && !saving && !saveBlocked
                    ? 'translateY(-1px)'
                    : 'translateY(0)',
                  boxShadow: saveHovered && dirty && !saving && !saveBlocked
                    ? '0 4px 16px rgba(99,102,241,0.40)'
                    : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Save size={14} />
                {saving ? t('skills.edit.saving') : t('skills.edit.save')}
              </button>
            )}

            <button
              onClick={() => dispatchEdit({ type: 'cancel' })}
              disabled={saving}
              onMouseEnter={() => setCancelHovered(true)}
              onMouseLeave={() => setCancelHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px',
                background: cancelHovered ? 'var(--border)' : 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              <X size={14} />
              {t('skills.edit.cancel')}
            </button>

            {dirty && (
              <span style={{
                fontSize: 11,
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#fbbf24', flexShrink: 0,
                }} />
                {t('skills.edit.dirty')}
              </span>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => onUseSkill(skill.name)}
              onMouseEnter={() => setUseHovered(true)}
              onMouseLeave={() => setUseHovered(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 20px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                color: 'var(--text-bright)',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transform: useHovered ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: useHovered ? '0 4px 16px rgba(99,102,241,0.40)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Play size={14} />
              {t('skills.useSkill')}
            </button>

            {/* Run now inserts the command; it never sends. The same gating as
                scheduling: an empty or unreadable file has nothing to run. */}
            <button
              onClick={runNow}
              disabled={!canSchedule}
              onMouseEnter={() => setRunHovered(true)}
              onMouseLeave={() => setRunHovered(false)}
              title={runBlockedReason ?? t('skills.run.nowHint')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 20px',
                background: !canSchedule
                  ? 'var(--bg-hover)'
                  : runHovered
                    ? 'rgba(99,102,241,0.16)'
                    : 'var(--bg-hover)',
                color: canSchedule ? 'var(--accent-text)' : 'var(--text-muted)',
                border: canSchedule
                  ? '1px solid rgba(99,102,241,0.35)'
                  : '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: canSchedule ? 'pointer' : 'not-allowed',
                opacity: canSchedule ? 1 : 0.6,
                transition: 'all 0.15s ease',
              }}
            >
              <Play size={14} />
              {t('skills.run.now')}
            </button>

            {/* The command the action inserts, shown as text so the next run can
                be typed without opening this page. Copying is independent of the
                disabled Run now: the command is still worth knowing. */}
            <span
              title={t('skills.run.commandHint')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 6px 5px 9px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                maxWidth: '100%',
                minWidth: 0,
              }}
            >
              <code style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{runCommand}</code>
              <button
                onClick={() => void copyRunCommand()}
                onMouseEnter={() => setCopyHovered(true)}
                onMouseLeave={() => setCopyHovered(false)}
                title={t('skills.run.copy')}
                aria-label={t('skills.run.copy')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 3,
                  border: 'none',
                  borderRadius: 4,
                  background: copyHovered ? 'var(--border)' : 'transparent',
                  color: copyHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Copy size={12} />
              </button>
            </span>

            {/* Scheduling from the page a skill lives on. It only opens the same
                dialog the workflow page opens, pre-filled with this identity; the
                save is the user's. Disabled — never present-and-failing — when the
                run could not start: an unreadable file, or one with no body. */}
            <button
              onClick={() => setShowScheduleDialog(true)}
              disabled={!canSchedule}
              onMouseEnter={() => setScheduleHovered(true)}
              onMouseLeave={() => setScheduleHovered(false)}
              title={blockedReason ?? t('skills.schedules.scheduleHint')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 20px',
                background: !canSchedule
                  ? 'var(--bg-hover)'
                  : scheduleHovered
                    ? 'rgba(99,102,241,0.16)'
                    : 'var(--bg-hover)',
                color: canSchedule ? 'var(--accent-text)' : 'var(--text-muted)',
                border: canSchedule
                  ? '1px solid rgba(99,102,241,0.35)'
                  : '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: canSchedule ? 'pointer' : 'not-allowed',
                opacity: canSchedule ? 1 : 0.6,
                transition: 'all 0.15s ease',
              }}
            >
              <CalendarPlus size={14} />
              {t('skills.schedules.schedule')}
            </button>

            {/* Edit is absent, not a dead form, when the file cannot be read:
                an editor with nothing to edit is a lie about what happened. */}
            <button
              onClick={() => void beginEdit()}
              disabled={runState !== 'ready' || editBusy}
              onMouseEnter={() => setEditHovered(true)}
              onMouseLeave={() => setEditHovered(false)}
              title={runState === 'unreadable' ? t('skills.edit.unreadable') : t('skills.edit.editHint')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 20px',
                background: runState === 'ready' && editHovered
                  ? 'rgba(99,102,241,0.16)'
                  : 'var(--bg-hover)',
                color: runState === 'ready' ? 'var(--accent-text)' : 'var(--text-muted)',
                border: runState === 'ready'
                  ? '1px solid rgba(99,102,241,0.35)'
                  : '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: runState === 'ready' && !editBusy ? 'pointer' : 'not-allowed',
                opacity: runState === 'ready' && !editBusy ? 1 : 0.55,
                transition: 'all 0.15s ease',
              }}
            >
              <Pencil size={14} />
              {t('skills.edit.edit')}
            </button>

            {skill.source === 'personal' && (
              <button
                onClick={() => onDeleteSkill(skill.dirPath)}
                onMouseEnter={() => setDeleteHovered(true)}
                onMouseLeave={() => setDeleteHovered(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 20px',
                  background: deletingSkillPath === skill.dirPath
                    ? 'rgba(239,68,68,0.25)'
                    : deleteHovered
                      ? 'rgba(239,68,68,0.12)'
                      : 'var(--bg-hover)',
                  color: '#fca5a5',
                  border: deletingSkillPath === skill.dirPath
                    ? '1px solid rgba(239,68,68,0.45)'
                    : '1px solid rgba(239,68,68,0.20)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Trash2 size={14} />
                {deletingSkillPath === skill.dirPath ? t('skills.confirmDelete') : t('skills.deleteSkill')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Editing banners: the inline discard prompt, a conflict, a blocked
          frontmatter or a failed save. None of them is a browser dialog, and
          none of them clears the textarea. */}
      {editing && edit.confirmCancel && (
        <div style={bannerStyle('rgba(245,158,11,0.10)', 'rgba(245,158,11,0.30)')}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#fbbf24' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('skills.edit.discardTitle')}</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('skills.edit.discardBody')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => dispatchEdit({ type: 'cancelConfirmed' })}
                style={bannerButtonStyle('rgba(245,158,11,0.16)', 'rgba(245,158,11,0.45)', '#fbbf24')}
              >
                {t('skills.edit.discard')}
              </button>
              <button
                onClick={() => dispatchEdit({ type: 'cancelKept' })}
                style={bannerButtonStyle('var(--bg-hover)', 'var(--border)', 'var(--text-primary)')}
              >
                {t('skills.edit.keepEditing')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && edit.status === 'conflict' && (
        <div style={bannerStyle('rgba(245,158,11,0.10)', 'rgba(245,158,11,0.30)')}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#fbbf24' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('skills.edit.changedTitle')}</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('skills.edit.changedBody', { time: conflictTime })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              {t('skills.edit.reloadWarning')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>
              {t('skills.edit.overwriteWarning')}
            </div>
          </div>
        </div>
      )}

      {editing && previewBlocked && (
        <div style={bannerStyle('rgba(239,68,68,0.12)', 'rgba(239,68,68,0.25)')}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#fca5a5' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ lineHeight: 1.5 }}>{t('skills.edit.unparsable')}</div>
            {edit.message && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                {edit.message}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && edit.status === 'error' && edit.message && (
        <div style={bannerStyle('rgba(239,68,68,0.12)', 'rgba(239,68,68,0.25)')}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#fca5a5' }} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
            {t('skills.edit.saveFailed', { error: edit.message })}
          </div>
        </div>
      )}

      {!editing && (editUnreadable || runState === 'unreadable') && (
        <div style={{ padding: '0 20px 10px', fontSize: 11, color: WARNING, lineHeight: 1.5, flexShrink: 0 }}>
          {t('skills.edit.unreadable')}
        </div>
      )}

      {/* Why the action is unavailable, in place rather than on hover only. */}
      {blockedReason && (
        <div style={{
          padding: '0 20px 10px',
          fontSize: 11,
          color: WARNING,
          lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {blockedReason}
        </div>
      )}

      {/* Schedules that run this skill. Nothing at all when there are none:
          an empty section header would suggest a feature that is missing
          rather than a schedule that was never made. */}
      {schedules.length > 0 && (
        <div style={{ padding: '0 20px 10px', flexShrink: 0 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 6,
          }}>
            {t('skills.schedules.title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {schedules.map(job => (
              <SkillScheduleRow
                key={job.id}
                job={job}
                onOpen={() => useUiStore.getState().openSettingsAt('automations')}
              />
            ))}
          </div>
        </div>
      )}

      {/* What the schedules above have actually done with this skill. It is
          built from the same `automationList()` read as the strip, never from a
          chat history: a run started by hand leaves no record here, and every
          state says so. `title` carries the per-schedule breakdown and the
          limits of the window, so the line itself stays one line. */}
      {runSummaryView && (
        <div style={{ padding: '0 20px 10px', flexShrink: 0 }}>
          <div
            title={runSummaryView.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              lineHeight: 1.5,
              color: runSummaryView.tone === 'warn' ? WARNING : 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <History size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>{runSummaryView.text}</span>
          </div>
        </div>
      )}

      {/* Skill content preview */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        {/* One shared line: quiet text when the conversation is gone from the
            list, a link back to it when it is still there. */}
        <ProvenanceLine
          sessionId={skill.sourceConversation}
          title={skill.sourceTitle}
          date={skill.createdAt}
          surface="skill"
          className="mb-2.5"
        />
        <div style={{
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}>
            SKILL.md
          </div>
          {editing ? (
            <>
              <label style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                marginBottom: 6,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.07em',
              }}>
                {t('skills.edit.bodyLabel')}
              </label>
              <textarea
                value={draft.body}
                onChange={(e) => dispatchEdit({
                  type: 'change',
                  field: 'body',
                  value: e.target.value,
                })}
                disabled={saving}
                rows={14}
                style={{
                  width: '100%',
                  minHeight: 220,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--code-bg)',
                  color: '#a5b4fc',
                  fontSize: 12,
                  lineHeight: 1.5,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                  opacity: saving ? 0.6 : 1,
                }}
              />

              {/* The preview is produced by `rewriteSkillMd` — the same
                  serializer main writes with — from the bytes the edit read,
                  so unknown frontmatter keys, comments and order appear here
                  exactly as they will survive the save. `buildSkillFile` is
                  only the authority for a brand-new file. */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                margin: '16px 0 8px',
              }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}>
                  {t('skills.edit.previewTitle')}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                  wordBreak: 'break-all',
                  textAlign: 'right',
                }}>
                  {t('skills.edit.previewPath', { path: skill.dirPath })}
                </span>
              </div>
              {previewContent !== null ? (
                <pre style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                  margin: 0,
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  maxHeight: 260,
                  overflow: 'auto',
                }}>
                  {previewContent}
                </pre>
              ) : (
                <div style={{ fontSize: 11, color: '#fca5a5', lineHeight: 1.5 }}>
                  {t('skills.edit.unparsable')}
                </div>
              )}
            </>
          ) : (
            <pre style={{
              fontSize: 12,
              color: '#a5b4fc',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
              margin: 0,
              fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
              background: 'var(--code-bg)',
              borderRadius: 8,
              padding: '12px 14px',
              border: '1px solid var(--bg-hover)',
            }}>
              {liveContent}
            </pre>
          )}
        </div>
      </div>

      {/* The same dialog the workflow page opens; the only difference is the
          pre-filled action. `skillDir ?? ''` mirrors the schedules strip: an
          older payload without the segment names the root SKILL.md. */}
      {showScheduleDialog && (
        <AutomationDialog
          job={null}
          initialSkill={{ source: skill.source, dir: skill.skillDir ?? '' }}
          workflows={workflows ?? []}
          limits={limits}
          onClose={() => {
            setShowScheduleDialog(false)
            void refreshJobs()
          }}
        />
      )}
    </div>
  )
}
