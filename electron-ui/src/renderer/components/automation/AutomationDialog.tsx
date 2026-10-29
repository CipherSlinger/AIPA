// Create / edit dialog for an automation.
//
// Extracted from SettingsAutomations so the workflow page can open it bound to
// the workflow being viewed. All scheduling and validation live in the main
// process (`src/main/automation/`); this dialog only edits the fields an
// `AutomationInputData` accepts and reports save errors verbatim.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, File, FolderOpen, GitBranch, Info } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useDepartmentStore, usePrefsStore, useUiStore } from '../../store'
// The one effort list, owned by the main process. This module imports nothing,
// so loading it here is safe; a second literal list would let the dialog offer a
// level the store's whitelist drops.
import { AUTOMATION_EFFORT_LEVELS } from '../../../main/automation/job-effort'
import { usePluginStore } from '../../store/pluginStore'
import { getPluginDisplayName } from '../plugins/pluginIcons'
import type { Persona } from '../../types/app.types'
import Toggle from '../ui/Toggle'
import { INPUT_STYLE } from '../settings/settingsConstants'
import { pushEscapeHandler } from '../ui/escapeStack'
import {
  DEFAULT_WATCH_DEBOUNCE_MINUTES,
  clockText,
  dayOfMonthText,
  describeCron,
  scheduleText,
  watchWarningText,
} from './scheduleText'
import { SECONDARY, WARNING, primaryButtonStyle, smallButtonStyle } from './automationStyles'
import {
  buildJobDepartmentOptions,
  jobDepartmentChoice,
  jobDepartmentOptionText,
  resolveJobDepartment,
} from './jobDepartment'
import { buildChainOptions } from './jobChain'
import type { ChainOption } from './jobChain'
import {
  defaultActionKindFor,
  initialSkillChoice,
  skillAction,
  skillBodyState,
  type InitialSkill,
  type SkillBodyState,
} from './skillSelection'
import type {
  AutomationInputData,
  AutomationJobData,
  AutomationLimitsData,
  AutomationTriggerData,
  SkillInfoData,
} from '../../../preload'

export interface WorkflowOption {
  id: string
  name: string
  icon?: string
  personaId?: string
}

/**
 * Mirrors `ASSISTANT_PERSONA_ID` in src/main/automation/persona-plan.ts: the
 * reserved choice meaning "plain assistant". It is distinct from the empty
 * selection, which follows the workflow's expert.
 */
export const ASSISTANT_PERSONA_ID = '__assistant__'

/**
 * The effort select's "no override" value. Not a level and never sent: main
 * stores an absent field, which reads the app preference when a run starts.
 */
const FOLLOW_APP_EFFORT = 'default'

// Stable empty array: an absent pref must not create a new reference per render.
const EMPTY_PERSONAS: Persona[] = []

type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron' | 'watch'

/** The quiet-period bounds the main process enforces, kept in the input too. */
const WATCH_DEBOUNCE_MIN = 1
const WATCH_DEBOUNCE_MAX = 1440

/** How long the dialog waits after the last schedule edit before asking main. */
const PREVIEW_DEBOUNCE_MS = 250

/**
 * The "next runs" line under the schedule fields.
 *
 * `pending` is deliberately a state of its own: a preview that describes the
 * previous trigger must not stay visible under an edited form, so an edit clears
 * the line at once rather than leaving a stale time there. `unavailable` is an
 * IPC outage, which is not a verdict on the schedule — it shows no time and does
 * not block Save, because main validates again on save.
 */
type SchedulePreviewState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'runs'; runs: number[] }
  | { kind: 'invalid'; error: string }
  | { kind: 'unavailable' }

/**
 * Whether a path looks absolute, as far as the renderer can tell. Main
 * re-validates and its refusal is final; this only stops a save that is
 * certain to be rejected. A leading `/` (POSIX), a drive letter such as
 * `C:\` or `C:/`, and a UNC prefix `\\server\share` all count.
 */
function isAbsolutePath(path: string): boolean {
  const trimmed = path.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('/') || trimmed.startsWith('\\\\')) return true
  return /^[a-zA-Z]:[\\/]/.test(trimmed)
}

export interface AutomationDialogProps {
  /** null = create a new automation. */
  job: AutomationJobData | null
  workflows: WorkflowOption[]
  limits: AutomationLimitsData | null
  /**
   * Create mode only: open pre-filled with this workflow as the action.
   * Name and trigger keep their defaults; the user can still change anything.
   */
  initialWorkflowId?: string
  /**
   * Create mode only: open pre-filled with this skill as the action. The
   * caller (a skill page) already knows the identity; the dialog still asks
   * for a name and a schedule, and saves nothing until the user does.
   */
  initialSkill?: InitialSkill
  /**
   * Create mode only: open with action "send a prompt" and this text. An empty
   * string still selects the prompt action, so the caller can prefill a
   * conversation whose first message the user has yet to write. Absence keeps
   * today's default (a workflow when one exists).
   */
  initialPrompt?: string
  /** Create mode only: prefill the name. Absent leaves the field empty. */
  initialName?: string
  /**
   * Only meaningful with `initialPrompt`: the caller had to cut the text to
   * the editor's limit. The dialog then says so rather than presenting the
   * shortened text as the user's whole message.
   */
  initialPromptClipped?: boolean
  /**
   * Create mode only: the conversation this job is being drafted from. Sent
   * with the create request so the settings row can say where the job came
   * from. Ignored when editing — an edit must never rewrite a creation fact,
   * and the edit form does not know these fields exist.
   */
  initialProvenance?: {
    sourceConversation: string
    sourceTitle?: string
    sourceDraftedAt?: string
  }
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
}

/**
 * A chosen successor that is switched off.
 *
 * The scheduler refuses to start a disabled job from a chain (`planChain`
 * answers `target_disabled`), because the switch is the user's current
 * instruction and a chain must not quietly override it. The dialog says so under
 * the select, before the choice is saved, rather than letting the user find out
 * from a history note later.
 */
function ChainDisabledNote({ name }: { name: string }) {
  const { t } = useI18n()
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 5,
      fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5,
    }}>
      <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{t('automation.chain.targetDisabled', { name })}</span>
    </div>
  )
}

export default function AutomationDialog({
  job,
  workflows,
  limits,
  initialWorkflowId,
  initialSkill,
  initialPrompt,
  initialName,
  initialPromptClipped,
  initialProvenance,
  onClose,
}: AutomationDialogProps) {
  const { t, resolvedLocale } = useI18n()
  const addToast = useUiStore(s => s.addToast)
  const editing = job !== null
  const personas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  // Shown in the "app default" option so the user reads the level a run would
  // actually send today instead of a bare word.
  const globalEffort = usePrefsStore(s => s.prefs.effortLevel)
  // The same directory main uses to resolve a project skill root. Reading it
  // rather than a prop keeps the picker identical in Settings, a workflow page
  // and the chat header, like the chain list below.
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  const plugins = usePluginStore(s => s.plugins)
  const departments = useDepartmentStore(s => s.departments)

  // A plugin-owned schedule is still the user's to change; the note only warns
  // that the plugin can delete or recreate it, which would overwrite an edit.
  // An uninstalled plugin falls back to the raw id so the note can still name
  // what left the job behind.
  const originPluginId = job?.originPluginId
  const originPluginName = useMemo(() => {
    if (!originPluginId) return ''
    const plugin = plugins.find(p => p.manifest.id === originPluginId)
    return plugin
      ? getPluginDisplayName(plugin.manifest, resolvedLocale)
      : originPluginId
  }, [originPluginId, plugins, resolvedLocale])

  // Only honour the preset when the workflow is actually in the list, so the
  // select and the saved id cannot disagree.
  const presetWorkflowId = initialWorkflowId && workflows.some(w => w.id === initialWorkflowId)
    ? initialWorkflowId
    : undefined

  const initialCron = job && job.trigger.kind === 'cron' ? describeCron(job.trigger.expr) : null
  const cronIsCustom = !!job && job.trigger.kind === 'cron' && !initialCron

  // An explicit prompt or skill prefill wins over the "workflows exist"
  // default: the caller (the chat header, a skill page) already decided what
  // this job should do, and inventing a workflow would be a different job.
  const defaultActionKind = defaultActionKindFor({
    job,
    initialSkill,
    presetWorkflowId,
    initialPrompt,
    workflowCount: workflows.length,
  })
  // The prefill is read once for the form's initial state. An edit keeps the
  // stored pair; otherwise a skill page's identity wins over "nothing chosen".
  const [initialChoice] = useState(() => initialSkillChoice(job, initialSkill))

  const [name, setName] = useState(job?.name ?? initialName ?? '')
  const [enabled, setEnabled] = useState(job?.enabled ?? true)
  const [actionKind, setActionKind] = useState<'workflow' | 'prompt' | 'skill'>(defaultActionKind)
  // Kept as the two stored fields, never as a joined string: main validates the
  // pair, and a "source:dir" round-trip here would be a second parser to keep
  // in step with the one that matters.
  const [skillSource, setSkillSource] = useState<'' | 'personal' | 'project'>(initialChoice.source)
  const [skillDir, setSkillDir] = useState(initialChoice.dir)
  const [skillQuery, setSkillQuery] = useState('')
  // `null` means "not read yet"; an empty array is the real answer "no skills
  // are installed", which the picker must say instead of showing an empty box.
  const [skills, setSkills] = useState<SkillInfoData[] | null>(null)
  const [skillsUnreadable, setSkillsUnreadable] = useState(false)
  const [workflowId, setWorkflowId] = useState(
    job?.action.kind === 'workflow' ? job.action.workflowId : (presetWorkflowId ?? workflows[0]?.id ?? ''),
  )
  const [prompt, setPrompt] = useState(() => {
    if (job) return job.action.kind === 'prompt' ? job.action.prompt : ''
    return initialPrompt ?? ''
  })
  // '' follows the workflow; ASSISTANT_PERSONA_ID is an explicit plain assistant;
  // anything else is a persona id.
  const [personaChoice, setPersonaChoice] = useState<string>(() => {
    const override = job?.personaId?.trim()
    if (override) return override
    // A prompt or skill job has no workflow to inherit from, so it starts as
    // the plain assistant — the only run it could have had before this field
    // existed. (A skill carries its own instructions; it does not bind an expert.)
    return defaultActionKind !== 'workflow' ? ASSISTANT_PERSONA_ID : ''
  })
  // Three states, like the expert field: FOLLOW_APP_EFFORT follows the app
  // preference at each run, `'auto'` is an explicit "let the engine decide", and
  // any other level is an explicit level. A stored level is kept verbatim; an
  // absent one opens as "follow the app", never as the level that happens to be
  // set today — otherwise opening and saving a dialog would silently pin it.
  const [effortChoice, setEffortChoice] = useState<string>(job?.effort ?? FOLLOW_APP_EFFORT)
  // Kept as text so the empty state means "no limit" rather than 0. A number
  // state would make clearing the field indistinguishable from a $0 limit,
  // which would block every scheduled run.
  const [spendLimitText, setSpendLimitText] = useState(
    job?.dailyCostLimitUsd !== undefined ? String(job.dailyCostLimitUsd) : '',
  )
  // Off unless the job opted in: existing jobs keep announcing their successes.
  const [quietOnSuccess, setQuietOnSuccess] = useState(job?.quietOnSuccess === true)
  // Off by default: a retry spends again, so it must be a deliberate choice.
  const [retryOnFailure, setRetryOnFailure] = useState(job?.retryOnFailure === true)
  // Catch up by default: every job saved before this choice existed runs once
  // on the first tick after launch, and an unread field must keep doing that.
  const [missedRunPolicy, setMissedRunPolicy] = useState<'run' | 'skip'>(
    job?.missedRunPolicy === 'skip' ? 'skip' : 'run',
  )
  // '' means "no department". A stored id is kept verbatim, including one that
  // no longer resolves: the picker shows it as a stale option and Save leaves it
  // untouched unless the user chooses another node or "No department".
  const [departmentChoice, setDepartmentChoice] = useState(
    () => jobDepartmentChoice(job?.departmentId),
  )
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(() => {
    if (!job) return 'daily'
    if (job.trigger.kind === 'watch') return 'watch'
    if (job.trigger.kind === 'interval') return 'interval'
    const parsed = describeCron(job.trigger.expr)
    if (!parsed) return 'cron'
    return parsed.kind
  })
  const [hour, setHour] = useState(initialCron?.hour ?? 9)
  const [minute, setMinute] = useState(initialCron?.minute ?? 0)
  const [weekday, setWeekday] = useState(initialCron?.weekday ?? 1)
  // Text, not a number state: a number input normalizes a half-typed value to
  // '' on some browsers, and an empty day must be visible as empty rather than
  // silently saved as the 1st.
  const [dayOfMonthInput, setDayOfMonthInput] = useState(
    initialCron?.dayOfMonth !== undefined ? String(initialCron.dayOfMonth) : '1',
  )
  const [intervalMinutes, setIntervalMinutes] = useState(
    job?.trigger.kind === 'interval' ? job.trigger.minutes : 60,
  )
  const [cronExpr, setCronExpr] = useState(
    cronIsCustom && job?.trigger.kind === 'cron' ? job.trigger.expr : '0 9 * * *',
  )
  // A watch job stores an absolute path and, for folders, whether subfolders
  // count. Kept as text so a pasted path is never normalized behind the user's
  // back; main trims and validates it.
  const [watchPath, setWatchPath] = useState(job?.trigger.kind === 'watch' ? job.trigger.path : '')
  // `recursive` defaults to true on the wire, so only an explicit false is off.
  const [watchRecursive, setWatchRecursive] = useState(
    job?.trigger.kind === 'watch' ? job.trigger.recursive !== false : true,
  )
  const [watchDebounce, setWatchDebounce] = useState(
    job?.trigger.kind === 'watch'
      ? (job.trigger.debounceMinutes ?? DEFAULT_WATCH_DEBOUNCE_MINUTES)
      : DEFAULT_WATCH_DEBOUNCE_MINUTES,
  )
  // '' means "Nothing": the chain's two sides are independent, and both empty
  // is no chain at all. A stored id is kept verbatim even when no live job uses
  // it — main keeps such an id so a restore from Recently deleted can reconnect
  // it, and the select below shows it as the job that no longer exists.
  const [chainSuccess, setChainSuccess] = useState(job?.chain?.onSuccess ?? '')
  const [chainFailure, setChainFailure] = useState(job?.chain?.onFailure ?? '')
  // The dialog opens from Settings, a workflow page and the chat header, and all
  // three must offer the same real list, so it reads the list itself instead of
  // taking it as a prop. `null` means "not read yet"; an empty array is a real
  // answer (there is no other job to chain to).
  const [chainJobs, setChainJobs] = useState<AutomationJobData[] | null>(null)
  const [chainJobsUnreadable, setChainJobsUnreadable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SchedulePreviewState>({ kind: 'idle' })
  // Monotonic request id. Only the answer to the newest request may be shown, so
  // a slow reply for an earlier trigger can never overwrite a newer one.
  const previewSeq = useRef(0)

  const departmentOptions = useMemo(
    () => buildJobDepartmentOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  // A stale id resolves to nothing in the tree but must stay selectable and
  // saveable; the warning below the field explains that it is kept, not moved.
  const departmentResolution = resolveJobDepartment(departmentChoice, departmentOptions)

  // Stable identity for the memo dependencies below; `chainJobs ?? []` would be
  // a fresh array on every render.
  const chainJobList = useMemo(() => chainJobs ?? [], [chainJobs])
  // Each list is judged against the draft as it would be saved with that side
  // chosen, so a candidate that loops only through the *other* side is disabled
  // too. Main refuses the loop either way; this is the visible half.
  const chainSuccessOptions = useMemo<ChainOption[]>(
    () => buildChainOptions(chainJobList, job?.id, 'onSuccess', chainFailure),
    [chainJobList, job?.id, chainFailure],
  )
  const chainFailureOptions = useMemo<ChainOption[]>(
    () => buildChainOptions(chainJobList, job?.id, 'onFailure', chainSuccess),
    [chainJobList, job?.id, chainSuccess],
  )
  // A stored id that no live job uses is kept — it may be in Recently deleted.
  // The label is decided by what we know: still loading, unreadable, or really gone.
  const chainMissingLabel = (value: string): string | null => {
    if (!value || chainJobList.some(j => j.id === value)) return null
    if (chainJobs === null) {
      return chainJobsUnreadable
        ? t('automation.chain.unreadableOption')
        : t('automation.chain.loadingOption')
    }
    return t('automation.chain.missingOption')
  }
  // The scheduler will not start a switched-off job from a chain (see
  // `planChain`), so the dialog says it here, before the choice is saved.
  const disabledChainTarget = (value: string): AutomationJobData | undefined => {
    if (!value) return undefined
    const target = chainJobList.find(j => j.id === value)
    return target && !target.enabled ? target : undefined
  }
  const chainSuccessDisabled = disabledChainTarget(chainSuccess)
  const chainFailureDisabled = disabledChainTarget(chainFailure)
  const chainSuccessMissing = chainMissingLabel(chainSuccess)
  const chainFailureMissing = chainMissingLabel(chainFailure)

  useEffect(() => pushEscapeHandler(onClose), [onClose])

  // One read, on open. A list that cannot be read is not an empty list: the
  // selects then show the stored choice as unidentifiable rather than as
  // "Nothing", and the chain is still sent back unchanged on save.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await window.electronAPI.automationList()
        if (cancelled) return
        setChainJobs(Array.isArray(result?.jobs) ? result.jobs : [])
      } catch {
        if (!cancelled) setChainJobsUnreadable(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Installed skills, read once per working directory. Re-read when the
  // directory changes because the project root it names is part of the list;
  // a skill installed while this dialog is open is picked up on the next open
  // rather than by polling the disk from here.
  useEffect(() => {
    let cancelled = false
    setSkills(null)
    setSkillsUnreadable(false)
    void (async () => {
      try {
        const list = await window.electronAPI.skillsList(workingDir || undefined)
        if (cancelled) return
        setSkills(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setSkillsUnreadable(true)
      }
    })()
    return () => { cancelled = true }
  }, [workingDir])

  const errorText = useCallback((code: string, detail?: string): string => {
    const key = `automation.errors.${code}`
    // `detail` is a name the message needs (today: the job that would close a
    // chain loop). Keys without that placeholder ignore it.
    const translated = detail ? t(key, { job: detail }) : t(key)
    return translated === key ? code : translated
  }, [t])

  // Digits only. Anything else (blank, "1st", a decimal) blocks Save rather
  // than being guessed at.
  const dayDigits = dayOfMonthInput.trim()
  const dayTyped = /^\d+$/.test(dayDigits) ? Number(dayDigits) : NaN
  const dayTypedValid = Number.isFinite(dayTyped)
  // Out-of-range digits are clamped, never rewritten to 28: the day stays the
  // user's intent for months that do have it, and the line under the field says
  // which day the trigger actually carries.
  const dayOfMonth = dayTypedValid ? Math.min(31, Math.max(1, dayTyped)) : 1
  const dayOutOfRange = dayTypedValid && dayTyped !== dayOfMonth
  const dayFieldValid = scheduleKind !== 'monthly' || dayTypedValid

  const trigger = useMemo<AutomationTriggerData>(() => {
    if (scheduleKind === 'watch') {
      // Clamp here only so a cleared or wild number cannot be sent as NaN; the
      // authoritative bounds live in the main process and its error is shown.
      const minutes = Number.isFinite(watchDebounce)
        ? Math.min(WATCH_DEBOUNCE_MAX, Math.max(WATCH_DEBOUNCE_MIN, Math.round(watchDebounce)))
        : DEFAULT_WATCH_DEBOUNCE_MINUTES
      return {
        kind: 'watch',
        path: watchPath.trim(),
        recursive: watchRecursive,
        debounceMinutes: minutes,
      }
    }
    if (scheduleKind === 'interval') return { kind: 'interval', minutes: Number(intervalMinutes) || 0 }
    if (scheduleKind === 'cron') return { kind: 'cron', expr: cronExpr.trim() }
    if (scheduleKind === 'weekly') return { kind: 'cron', expr: `${minute} ${hour} * * ${weekday}` }
    // A monthly preset is only a friendlier way to write the same cron the
    // Custom field accepts, so nothing new reaches the scheduler.
    if (scheduleKind === 'monthly') return { kind: 'cron', expr: `${minute} ${hour} ${dayOfMonth} * *` }
    return { kind: 'cron', expr: `${minute} ${hour} * * *` }
  }, [scheduleKind, intervalMinutes, cronExpr, minute, hour, weekday, dayOfMonth, watchPath, watchRecursive, watchDebounce])

  // Ask main what this trigger would actually do. The preview is main's own
  // next-run maths, not a renderer formula, so an interval and a cron answer
  // through the same path and neither can disagree with the save that follows.
  useEffect(() => {
    // A file change has no calendar; the watch hint under the fields says so.
    if (trigger.kind === 'watch') {
      previewSeq.current += 1
      setPreview({ kind: 'idle' })
      return
    }
    const seq = previewSeq.current + 1
    previewSeq.current = seq
    // The form no longer matches what is on screen: clear it immediately rather
    // than leave times that describe the previous schedule under the new one.
    setPreview({ kind: 'pending' })
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await window.electronAPI.automationPreviewSchedule(trigger)
          if (seq !== previewSeq.current) return
          if (result.ok) setPreview({ kind: 'runs', runs: result.runs })
          // Main says a watch trigger has no calendar; that cannot happen here
          // (the branch above returns first), but treat it as "nothing to show".
          else if (result.error === 'not_applicable') setPreview({ kind: 'idle' })
          else setPreview({ kind: 'invalid', error: result.error })
        } catch {
          if (seq !== previewSeq.current) return
          // An outage is not a verdict on the schedule. Show no time and let Save
          // through; main validates again when it saves.
          setPreview({ kind: 'unavailable' })
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      // A reply that lands after this trigger is gone must not be shown.
      if (previewSeq.current === seq) previewSeq.current = seq + 1
    }
  }, [trigger])

  // `null` only while a skill job has no skill chosen: there is no honest
  // action to send, and Save is off until there is one.
  const action = useMemo<AutomationInputData['action'] | null>(() => {
    if (actionKind === 'workflow') return { kind: 'workflow', workflowId }
    if (actionKind === 'skill') {
      if (!skillSource) return null
      // The same builder the page's prefill goes through, so "chosen here"
      // and "chosen on the skill page" cannot produce different payloads.
      return skillAction({ source: skillSource, dir: skillDir })
    }
    return { kind: 'prompt', prompt: prompt.trim() }
  }, [actionKind, workflowId, prompt, skillSource, skillDir])

  const skillList = useMemo(() => skills ?? [], [skills])
  // Matches the three facts the row shows; a user searching "weekly" is looking
  // at a description, not only at a folder name.
  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    if (!query) return skillList
    return skillList.filter(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.skillDir.toLowerCase().includes(query))
  }, [skillList, skillQuery])
  // An edit that keeps a skill the user has since deleted is not silently
  // switched to another one: the warning names what is stored, and main still
  // refuses to save an identity it cannot resolve.
  const storedSkillMissing = skillSource !== '' &&
    skills !== null &&
    !skills.some(skill => skill.source === skillSource && skill.skillDir === skillDir)

  // Whether the chosen SKILL.md has anything for a run to send. Read once per
  // chosen skill, cached for this dialog's lifetime: a keystroke in the picker
  // must never touch the disk. Unknown covers "not read yet", "read failed"
  // and "no such skill" — none of them may be reported as an empty file.
  const [skillBody, setSkillBody] = useState<SkillBodyState>('unknown')
  const skillBodyCache = useRef<Map<string, SkillBodyState>>(new Map())
  useEffect(() => {
    if (actionKind !== 'skill' || !skillSource) {
      setSkillBody('unknown')
      return
    }
    const chosen = skills?.find(skill =>
      skill.source === skillSource && skill.skillDir === skillDir)
    if (!chosen) {
      setSkillBody('unknown')
      return
    }
    const key = `${chosen.source}\u0000${chosen.skillDir}`
    const cached = skillBodyCache.current.get(key)
    if (cached) {
      setSkillBody(cached)
      return
    }
    let cancelled = false
    setSkillBody('unknown')
    void (async () => {
      try {
        const result = await window.electronAPI.skillsRead(chosen.dirPath)
        if (cancelled) return
        const state = skillBodyState(typeof result?.content === 'string' ? result.content : null)
        skillBodyCache.current.set(key, state)
        setSkillBody(state)
      } catch {
        if (!cancelled) setSkillBody('unknown')
      }
    })()
    return () => { cancelled = true }
  }, [actionKind, skillSource, skillDir, skills])

  // Empty means no limit. The upper bound is the main process's call; here we
  // only refuse a value that is not a positive amount at all, so Save cannot
  // post NaN into a rail that would then never fire.
  const spendLimitValue = spendLimitText.trim() === '' ? undefined : Number(spendLimitText)
  const spendLimitValid = spendLimitValue === undefined ||
    (Number.isFinite(spendLimitValue) && spendLimitValue > 0)

  // A watch job with no absolute path would be rejected by main anyway; the
  // dialog refuses first so the user sees the field rather than a round-trip.
  const watchPathValid = scheduleKind !== 'watch' || isAbsolutePath(watchPath)

  // An invalid preview is a schedule main would refuse: disable Save here so the
  // refusal is visible in place. `pending` and an IPC failure deliberately do not
  // block — main verifies the trigger again when the job is saved.
  const previewInvalid = preview.kind === 'invalid'

  const canSave = name.trim().length > 0 &&
    action !== null &&
    (actionKind === 'workflow'
      ? !!workflowId
      : actionKind === 'skill'
        ? skillsUnreadable || skillList.some(skill => skill.source === skillSource && skill.skillDir === skillDir)
        : prompt.trim().length > 0) &&
    spendLimitValid &&
    watchPathValid &&
    dayFieldValid &&
    !previewInvalid &&
    !saving

  const save = async () => {
    if (!canSave || !action) return
    setSaving(true)
    setError(null)
    // '' is not an id: omit it so the main process stores "follow the workflow".
    const personaId = personaChoice === '' ? undefined : personaChoice
    // "Follow the app default" is an absent field, not a level. An explicit
    // `'auto'` is sent as itself: it must outrank a non-auto app default.
    const effort = effortChoice === FOLLOW_APP_EFFORT ? undefined : effortChoice
    const input: AutomationInputData = {
      name: name.trim(), enabled, trigger, action,
      ...(personaId ? { personaId } : {}),
      ...(effort ? { effort: effort as AutomationInputData['effort'] } : {}),
      // A stale id is sent back unchanged unless the user picked another node
      // or "No department". Omitting the field is how an edit clears it, so
      // this must never be filled from a guess or from `action.cwd`.
      ...(departmentChoice ? { departmentId: departmentChoice } : {}),
      // Omitting quiet mode when it is off is what turns it off on an edit;
      // absence is the default (announce success), never `false`.
      ...(quietOnSuccess ? { quietOnSuccess: true } : {}),
      // Same for retries: omitting the flag on an edit clears it, and absent
      // means "never retry" for every job that did not opt in.
      ...(retryOnFailure ? { retryOnFailure: true } : {}),
      // Only the opt-out is stored; omitting it on an edit restores the default
      // catch-up behaviour every existing job already has.
      ...(missedRunPolicy === 'skip' ? { missedRunPolicy: 'skip' } : {}),
      // Both empty means no chain: omitting the field is what clears one on an
      // edit. Stored ids go back verbatim, a dangling one included — main keeps
      // it on purpose, and rewriting it here would disconnect a job the user may
      // be about to restore.
      ...(chainSuccess || chainFailure
        ? {
            chain: {
              ...(chainSuccess ? { onSuccess: chainSuccess } : {}),
              ...(chainFailure ? { onFailure: chainFailure } : {}),
            },
          }
        : {}),
      // Omitting a cleared limit is what removes it; sending 0 would block
      // every scheduled run.
      ...(spendLimitValue !== undefined ? { dailyCostLimitUsd: spendLimitValue } : {}),
      // Creation only. An edit that carried these would let a rename or a
      // schedule change point the job at a conversation it was never drafted
      // from — main ignores them on update anyway, so this is the second guard.
      ...(!job && initialProvenance ? initialProvenance : {}),
    }
    try {
      const result = job
        ? await window.electronAPI.automationUpdate(job.id, input)
        : await window.electronAPI.automationCreate(input)
      if (result.ok) {
        // A new job's next run is the one fact the user cannot see yet: the
        // list behind this dialog may not even be open. Name the schedule in
        // the same words the settings row uses. A watch job has no next run, so
        // its toast names the event instead of a time.
        if (!job) {
          if (trigger.kind === 'watch') {
            addToast('success', t('automation.watch.createdToast', {
              name: name.trim(),
              path: trigger.path,
            }))
          } else {
            addToast('success', t('automation.createdToast', {
              name: name.trim(),
              schedule: scheduleText(t, trigger),
            }))
          }
        }
        onClose()
      } else setError(errorText(result.error, result.errorDetail))
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * The two pickers only fill the path field: the field stays editable, so a
   * pasted path works without either dialog. Both resolve to null when the
   * user cancels, which must leave whatever was typed in place.
   */
  const pickFolder = async () => {
    try {
      const picked = await window.electronAPI.fsShowOpenDialog()
      if (picked) setWatchPath(picked)
    } catch {
      /* the dialog is unavailable or was cancelled; keep the typed path */
    }
  }

  const pickFile = async () => {
    try {
      const picked = await window.electronAPI.fsShowOpenFileDialog(
        [{ name: t('toolbar.allFiles'), extensions: ['*'] }],
        false,
      )
      if (picked && picked.length > 0) setWatchPath(picked[0])
    } catch {
      /* cancelled or unavailable; keep the typed path */
    }
  }

  const timeValue = clockText(hour, minute)

  // Same shape the background-work popover uses, plus the weekday: a run days
  // away needs a day name, and this line is where three dates sit side by side.
  const previewTimeText = useCallback((ts: number): string =>
    new Date(ts).toLocaleString(resolvedLocale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }), [resolvedLocale])

  // Only an existing job can already be missing its path; a path typed in this
  // dialog has not been checked against the disk, and main reports it after
  // save, so the dialog does not pretend to know.
  const missingWarning = job ? watchWarningText(job, t) : null

  const selectedWorkflow = workflows.find(w => w.id === workflowId)
  const workflowPersona = selectedWorkflow?.personaId
    ? personas.find(p => p.id === selectedWorkflow.personaId)
    : undefined
  const followWorkflowLabel = t('automation.expert.followWorkflow', {
    name: workflowPersona
      ? `${workflowPersona.emoji} ${workflowPersona.name}`.trim()
      : t('automation.expert.noBinding'),
  })
  // A saved override can outlive its persona. Keep it selectable so the field
  // shows what is stored instead of silently displaying a different choice.
  const orphanChoice = personaChoice !== '' &&
    personaChoice !== ASSISTANT_PERSONA_ID &&
    !personas.some(p => p.id === personaChoice)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'var(--glass-overlay)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--popup-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          width: 460, maxHeight: '82vh', overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
          {editing ? t('automation.dialog.editTitle') : t('automation.dialog.createTitle')}
        </div>

        {originPluginId && (
          // Informational only: every field below stays enabled because the
          // user owns the job. The warning exists so an edit that the plugin
          // later overwrites is not a surprise.
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            marginBottom: 12, padding: '6px 9px', borderRadius: 6,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            fontSize: 11, color: SECONDARY, lineHeight: 1.5,
          }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{t('automation.pluginOrigin.dialogNote', { plugin: originPluginName })}</span>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.name')}</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('automation.field.namePlaceholder')}
            style={INPUT_STYLE}
            maxLength={80}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.action')}</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['workflow', 'prompt', 'skill'] as const).map(kind => (
              <button
                key={kind}
                onClick={() => {
                  setActionKind(kind)
                  // Each action has its own default: a prompt or skill job
                  // cannot follow a workflow, and a workflow should inherit its
                  // expert after a mode switch rather than silently keep an
                  // implicit override.
                  if (kind === 'workflow') {
                    setPersonaChoice(prev => prev === ASSISTANT_PERSONA_ID ? '' : prev)
                  } else {
                    setPersonaChoice(prev => prev === '' ? ASSISTANT_PERSONA_ID : prev)
                  }
                }}
                style={{
                  ...smallButtonStyle,
                  borderColor: actionKind === kind ? 'rgba(99,102,241,0.55)' : 'var(--border)',
                  color: actionKind === kind ? 'var(--accent-text)' : SECONDARY,
                  background: actionKind === kind ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {kind === 'workflow'
                  ? t('automation.action.workflow')
                  : kind === 'skill'
                    ? t('automation.action.skill')
                    : t('automation.action.prompt')}
              </button>
            ))}
          </div>

          {actionKind === 'workflow' ? (
            workflows.length === 0 ? (
              <div style={{ fontSize: 11, color: WARNING, lineHeight: 1.5 }}>{t('automation.action.noWorkflows')}</div>
            ) : (
              <select
                value={workflowId}
                onChange={e => setWorkflowId(e.target.value)}
                style={INPUT_STYLE}
              >
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>
                    {`${w.icon ?? ''} ${w.name}`.trim()}
                  </option>
                ))}
              </select>
            )
          ) : actionKind === 'skill' ? (
            <div>
              <input
                value={skillQuery}
                onChange={e => setSkillQuery(e.target.value)}
                placeholder={t('automation.skill.searchPlaceholder')}
                style={INPUT_STYLE}
                spellCheck={false}
              />
              {skills === null && !skillsUnreadable ? (
                <div style={{ fontSize: 11, color: SECONDARY, marginTop: 6 }}>
                  {t('automation.skill.loading')}
                </div>
              ) : skillsUnreadable ? (
                <div style={{ fontSize: 11, color: WARNING, marginTop: 6, lineHeight: 1.5 }}>
                  {t('automation.skill.unreadable')}
                </div>
              ) : filteredSkills.length === 0 ? (
                // Two different facts, said differently: nothing is installed
                // (the dropdown would otherwise be an empty box), versus a
                // search that matched nothing among the installed skills.
                <div style={{ fontSize: 11, color: SECONDARY, marginTop: 6, lineHeight: 1.5 }}>
                  {skillList.length === 0 ? t('automation.skill.empty') : t('automation.skill.noMatch')}
                </div>
              ) : (
                <div style={{
                  maxHeight: 168, overflowY: 'auto', marginTop: 6,
                  border: '1px solid var(--border)', borderRadius: 6,
                }}>
                  {filteredSkills.map((skill, index) => {
                    const selected = skill.source === skillSource && skill.skillDir === skillDir
                    return (
                      <button
                        key={`${skill.source}:${skill.skillDir}`}
                        type="button"
                        onClick={() => { setSkillSource(skill.source); setSkillDir(skill.skillDir) }}
                        // The description is clipped to one line here; the full
                        // text is one hover away rather than a second click.
                        title={skill.description || undefined}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '6px 8px', cursor: 'pointer',
                          background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
                          border: 'none',
                          borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 600, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{skill.name}</span>
                          <span style={{ fontSize: 10, color: SECONDARY, flexShrink: 0 }}>
                            {skill.source === 'personal' ? t('skills.personal') : t('skills.project')}
                          </span>
                        </div>
                        {skill.description && (
                          <div style={{
                            fontSize: 10, color: SECONDARY, marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{skill.description}</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {storedSkillMissing && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 5,
                  fontSize: 11, color: WARNING, marginTop: 6, lineHeight: 1.5,
                }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{t('automation.skill.missingHint', { name: skillDir || 'SKILL.md' })}</span>
                </div>
              )}
              {/* A SKILL.md with no body is a legitimate draft, so this states
                  the consequence and leaves Save on: the file may be filled in
                  before the first run, and blocking the save would lose the
                  schedule the user just built. */}
              {skillBody === 'empty' && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 5,
                  fontSize: 11, color: WARNING, marginTop: 6, lineHeight: 1.5,
                }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{t('automation.skill.emptyBody')}</span>
                </div>
              )}
              <div style={{ fontSize: 11, color: SECONDARY, marginTop: 6, lineHeight: 1.5 }}>
                {t('automation.skill.hint')}
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t('automation.action.promptPlaceholder')}
                rows={4}
                maxLength={4000}
                style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              {/* The caller clips before handing the text over; the editor's own
                  maxLength cannot tell the user that the source was longer. */}
              {initialPromptClipped && !editing && (
                <div style={{ fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5 }}>
                  {t('automation.prompt.clippedHint')}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.expert')}</label>
          <select
            value={personaChoice}
            onChange={e => setPersonaChoice(e.target.value)}
            style={INPUT_STYLE}
          >
            {/* Offered only for a workflow: a prompt job has no binding to
                follow, so showing it there would promise what cannot happen. */}
            {actionKind === 'workflow' && (
              <option value="">{followWorkflowLabel}</option>
            )}
            <option value={ASSISTANT_PERSONA_ID}>{t('automation.expert.assistant')}</option>
            {personas.map(p => (
              <option key={p.id} value={p.id}>
                {`${p.emoji} ${p.name}`.trim()}
              </option>
            ))}
            {orphanChoice && (
              <option value={personaChoice}>{t('automation.expert.missingOption')}</option>
            )}
          </select>
          {actionKind === 'workflow' && (
            // The override is durable: re-binding the workflow later must not
            // quietly change who runs this job.
            <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
              {t('automation.expert.overrideHint')}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.effort')}</label>
          <select
            value={effortChoice}
            onChange={e => setEffortChoice(e.target.value)}
            style={INPUT_STYLE}
          >
            {/* The app's current level is named here, so "default" is concrete:
                a user can see that the nightly job will run at High without
                opening Settings. The value itself is not stored. */}
            <option value={FOLLOW_APP_EFFORT}>
              {t('automation.effort.followDefault', {
                level: t(`effort.${globalEffort || 'auto'}`),
              })}
            </option>
            {AUTOMATION_EFFORT_LEVELS.map(level => (
              <option key={level} value={level}>
                {t(`effort.${level}`)}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
            {t('automation.effort.hint')}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.department.field')}</label>
          <select
            value={departmentChoice}
            onChange={e => setDepartmentChoice(e.target.value)}
            style={INPUT_STYLE}
            title={t('automation.department.hint')}
          >
            <option value="">{t('automation.department.none')}</option>
            {departmentOptions.map(option => (
              // The label is the node's own name, indented by depth; the title
              // carries the whole root → node path so two similarly named teams
              // can still be told apart.
              <option key={option.id} value={option.id} title={option.path}>
                {jobDepartmentOptionText(option)}
              </option>
            ))}
            {departmentResolution.state === 'stale' && (
              // Kept selectable and selected-by-label: the job really is filed
              // under this id, even though the node is gone. Save sends it back
              // unless the user deliberately picks something else.
              <option
                value={departmentResolution.id}
                title={t('automation.department.missingTitle', { id: departmentResolution.id })}
              >
                {t('automation.department.missingOption')}
              </option>
            )}
          </select>
          <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
            {t('automation.department.hint')}
          </div>
          {departmentResolution.state === 'stale' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 5,
              fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5,
            }}>
              <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{t('automation.department.missingHint')}</span>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.spendLimit')}</label>
          {/* Text rather than a number input: a number input normalizes a
              half-typed value to '' on some browsers, and an empty field here
              means "clear the limit" — Save must not do that by accident. */}
          <input
            type="text"
            inputMode="decimal"
            value={spendLimitText}
            onChange={e => setSpendLimitText(e.target.value)}
            placeholder={t('automation.field.spendLimitPlaceholder')}
            style={{ ...INPUT_STYLE, width: 160 }}
          />
          {/* The blind spot and the manual bypass are named once, here, where
              the user decides the number. */}
          <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
            {t('automation.spend.limitHint')}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          {/* Beside the spend limit because that is the cost of opting in: the
              hint says plainly that each retry runs and spends again. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ paddingTop: 1 }}>
              <Toggle
                value={retryOnFailure}
                onChange={setRetryOnFailure}
                aria-label={t('automation.field.retryOnFailure')}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('automation.field.retryOnFailure')}
              </div>
              <div style={{ fontSize: 11, color: SECONDARY, marginTop: 2, lineHeight: 1.5 }}>
                {/* The numbers come from the scheduler's policy payload. The
                    fallbacks only cover the moment before the limits load. */}
                {t('automation.retryOnFailure.hint', {
                  count: limits?.retry?.maxRetries ?? 2,
                  first: limits?.retry?.delaysMinutes?.[0] ?? 10,
                  second: limits?.retry?.delaysMinutes?.[1] ?? 30,
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          {/* What follows this run. Next to the retry toggle because both answer
              "and then what", and below the action because a successor is read in
              the light of what this job does. */}
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
            <GitBranch size={11} />
            {t('automation.chain.field')}
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('automation.chain.onSuccess')}</label>
              <select
                value={chainSuccess}
                onChange={e => setChainSuccess(e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">{t('automation.chain.nothing')}</option>
                {chainSuccessOptions.map(option => (
                  // A loop-closing choice stays visible but unpickable: hiding it
                  // would leave the user wondering why a job is absent, and the
                  // label says exactly what would happen.
                  <option key={option.id} value={option.id} disabled={option.loops}>
                    {option.loops ? t('automation.chain.optionLoop', { name: option.name }) : option.name}
                  </option>
                ))}
                {chainSuccessMissing && (
                  // A stored id no live job uses: kept so a restore can reconnect
                  // it, shown so the user can see that the chain points nowhere.
                  <option value={chainSuccess}>{chainSuccessMissing}</option>
                )}
              </select>
              {chainSuccessDisabled && (
                <ChainDisabledNote name={chainSuccessDisabled.name} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('automation.chain.onFailure')}</label>
              <select
                value={chainFailure}
                onChange={e => setChainFailure(e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">{t('automation.chain.nothing')}</option>
                {chainFailureOptions.map(option => (
                  <option key={option.id} value={option.id} disabled={option.loops}>
                    {option.loops ? t('automation.chain.optionLoop', { name: option.name }) : option.name}
                  </option>
                ))}
                {chainFailureMissing && (
                  <option value={chainFailure}>{chainFailureMissing}</option>
                )}
              </select>
              {chainFailureDisabled && (
                <ChainDisabledNote name={chainFailureDisabled.name} />
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
            {/* The depth cap and the switched-off rule, said once where the choice
                is made. The number is main's, not a copy. */}
            {t('automation.chain.hint', { depth: limits?.chainMaxDepth ?? 4 })}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.schedule')}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['daily', 'weekly', 'monthly', 'interval', 'watch'] as const).map(kind => (
              <button
                key={kind}
                onClick={() => setScheduleKind(kind)}
                style={{
                  ...smallButtonStyle,
                  borderColor: scheduleKind === kind ? 'rgba(99,102,241,0.55)' : 'var(--border)',
                  color: scheduleKind === kind ? 'var(--accent-text)' : SECONDARY,
                  background: scheduleKind === kind ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {t(`automation.scheduleOption.${kind}`)}
              </button>
            ))}
            {/* Only offered for an existing job whose cron the picker cannot
                represent — editing must not silently rewrite it. */}
            {cronIsCustom && (
              <button
                onClick={() => setScheduleKind('cron')}
                style={{
                  ...smallButtonStyle,
                  borderColor: scheduleKind === 'cron' ? 'rgba(99,102,241,0.55)' : 'var(--border)',
                  color: scheduleKind === 'cron' ? 'var(--accent-text)' : SECONDARY,
                  background: scheduleKind === 'cron' ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {t('automation.scheduleOption.cron')}
              </button>
            )}
          </div>

          {scheduleKind === 'watch' ? (
            <div>
              <label style={labelStyle}>{t('automation.watch.path')}</label>
              <input
                value={watchPath}
                onChange={e => setWatchPath(e.target.value)}
                placeholder={t('automation.watch.pathPlaceholder')}
                style={{ ...INPUT_STYLE, fontFamily: 'monospace' }}
                spellCheck={false}
                aria-invalid={watchPath.trim() !== '' && !isAbsolutePath(watchPath)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" style={smallButtonStyle} onClick={pickFolder}>
                  <FolderOpen size={11} />
                  {t('automation.watch.chooseFolder')}
                </button>
                <button type="button" style={smallButtonStyle} onClick={pickFile}>
                  <File size={11} />
                  {t('automation.watch.chooseFile')}
                </button>
              </div>
              {watchPath.trim() !== '' && !isAbsolutePath(watchPath) && (
                // Only the case the renderer can be sure of. An existing job's
                // missing path is main's report, shown below.
                <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 4, lineHeight: 1.5 }}>
                  {t('automation.watch.pathInvalid')}
                </div>
              )}
              {missingWarning && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 5,
                  fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5,
                }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{missingWarning}</span>
                </div>
              )}

              {watchPath.trim() !== '' && (
                // The dialog is the one surface with room for the whole
                // sentence, so the subfolder and quiet-period clauses live
                // here and the settings row keeps the bare form. It previews
                // the words the row will use, including the two controls below.
                <div style={{
                  fontSize: 11, color: SECONDARY, marginTop: 6,
                  lineHeight: 1.5, overflowWrap: 'anywhere',
                }}>
                  {scheduleText(t, trigger, true)}
                </div>
              )}

              {/* Shown for every path rather than guessed from the text. A
                  trailing slash is the only folder signal a typed path gives,
                  and a wrong guess would silently drop a folder's subfolders
                  from the watch. */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
                <div style={{ paddingTop: 1 }}>
                  <Toggle
                    value={watchRecursive}
                    onChange={setWatchRecursive}
                    aria-label={t('automation.watch.recursive')}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {t('automation.watch.recursive')}
                  </div>
                  <div style={{ fontSize: 11, color: SECONDARY, marginTop: 2, lineHeight: 1.5 }}>
                    {t('automation.watch.recursiveHint')}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>{t('automation.watch.quiet')}</label>
                <input
                  type="number"
                  min={WATCH_DEBOUNCE_MIN}
                  max={WATCH_DEBOUNCE_MAX}
                  value={watchDebounce}
                  onChange={e => setWatchDebounce(Number(e.target.value))}
                  style={{ ...INPUT_STYLE, width: 140 }}
                />
                <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
                  {t('automation.watch.quietHint')}
                </div>
              </div>

              {/* A watch job has no next run to name. Saying so here, where the
                  schedule is decided, keeps the row's missing countdown from
                  reading as a bug. */}
              <div style={{ fontSize: 11, color: SECONDARY, marginTop: 8, lineHeight: 1.5 }}>
                {t('automation.watch.eventHint')}
              </div>
            </div>
          ) : scheduleKind === 'interval' ? (
            <div>
              <label style={labelStyle}>{t('automation.field.interval')}</label>
              <input
                type="number"
                min={limits?.minIntervalMinutes ?? 5}
                max={10080}
                value={intervalMinutes}
                onChange={e => setIntervalMinutes(Number(e.target.value))}
                style={{ ...INPUT_STYLE, width: 140 }}
              />
            </div>
          ) : scheduleKind === 'cron' ? (
            <div>
              <label style={labelStyle}>{t('automation.field.cron')}</label>
              <input
                value={cronExpr}
                onChange={e => setCronExpr(e.target.value)}
                placeholder="0 9 * * *"
                style={{ ...INPUT_STYLE, fontFamily: 'monospace' }}
              />
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 10 }}>
                {scheduleKind === 'weekly' && (
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>{t('automation.field.day')}</label>
                    <select
                      value={weekday}
                      onChange={e => setWeekday(Number(e.target.value))}
                      style={INPUT_STYLE}
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map(d => (
                        <option key={d} value={d}>{t(`automation.weekdays.${d}`)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {scheduleKind === 'monthly' && (
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>{t('automation.field.dayOfMonth')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dayOfMonthInput}
                      onChange={e => setDayOfMonthInput(e.target.value)}
                      placeholder="1"
                      aria-invalid={!dayFieldValid || dayOutOfRange}
                      style={INPUT_STYLE}
                    />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('automation.field.time')}</label>
                  <input
                    type="time"
                    value={timeValue}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':')
                      if (h !== undefined) setHour(Number(h))
                      if (m !== undefined) setMinute(Number(m))
                    }}
                    style={INPUT_STYLE}
                  />
                </div>
              </div>

              {/* The day-of-month caveat belongs here, not in a tooltip: the
                  user is choosing the one field whose cron expression cannot
                  hold its own meaning in a short month. */}
              {scheduleKind === 'monthly' && !dayFieldValid && (
                <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 4, lineHeight: 1.5 }}>
                  {t('automation.monthly.dayRequired')}
                </div>
              )}
              {scheduleKind === 'monthly' && dayFieldValid && dayOutOfRange && (
                <div style={{ fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5 }}>
                  {t('automation.monthly.dayRange', { day: dayOfMonthText(t, dayOfMonth) })}
                </div>
              )}
              {scheduleKind === 'monthly' && dayFieldValid && dayOfMonth >= 29 && (
                <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
                  {t('automation.monthly.shortMonth', { day: dayOfMonthText(t, dayOfMonth) })}
                </div>
              )}
            </div>
          )}

          {/* What the schedule will actually do. Read-only and computed by main
              with the same maths a save uses, so the preview and the saved job
              cannot disagree. No line for a watch trigger: it has no calendar,
              and the watch hint above already covers what starts it. */}
          {scheduleKind !== 'watch' && preview.kind === 'invalid' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 5,
              fontSize: 11, color: 'var(--danger-text)', marginTop: 6, lineHeight: 1.5,
            }}>
              <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorText(preview.error)}</span>
            </div>
          )}
          {scheduleKind !== 'watch' && preview.kind === 'runs' && (
            <div style={{
              fontSize: 11, color: SECONDARY, marginTop: 6,
              lineHeight: 1.5, overflowWrap: 'anywhere',
            }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                {t('automation.preview.label')}
              </span>
              {' '}
              {/* Fewer than three is the honest answer for a rare schedule; none
                  at all must say so rather than render a blank line. */}
              {preview.runs.length > 0
                ? preview.runs.map(previewTimeText).join(' · ')
                : t('automation.preview.none')}
            </div>
          )}
          {scheduleKind !== 'watch' && preview.kind === 'unavailable' && (
            // No time at all: a failed preview is not a time and inventing one
            // would be worse than an empty line. The tooltip is where it explains.
            <div
              title={t('automation.preview.unavailable')}
              style={{ minHeight: 14, marginTop: 6 }}
            />
          )}

          {/* Only a calendar can be missed while the app is closed; a watch job
              fires from a live event, so the question does not apply. */}
          {scheduleKind !== 'watch' && (
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>{t('automation.field.missedRunPolicy')}</label>
              <select
                value={missedRunPolicy}
                onChange={e => setMissedRunPolicy(e.target.value === 'skip' ? 'skip' : 'run')}
                style={INPUT_STYLE}
              >
                <option value="run">{t('automation.missedPolicy.run')}</option>
                <option value="skip">{t('automation.missedPolicy.skip')}</option>
              </select>
              <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
                {t('automation.missedPolicy.hint')}
              </div>
            </div>
          )}

          {/* Lives with the schedule because it is about when the app calls
              the user, not about what the job does. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
            <div style={{ paddingTop: 1 }}>
              <Toggle
                value={quietOnSuccess}
                onChange={setQuietOnSuccess}
                aria-label={t('automation.field.quietOnSuccess')}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('automation.field.quietOnSuccess')}
              </div>
              <div style={{ fontSize: 11, color: SECONDARY, marginTop: 2, lineHeight: 1.5 }}>
                {t('automation.quietOnSuccess.hint')}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Toggle value={enabled} onChange={setEnabled} aria-label={t('automation.field.enabled')} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('automation.field.enabled')}</span>
        </div>

        {actionKind === 'prompt' && (
          // A scheduled run opens its own session. Saying so here, where the
          // schedule is decided, keeps anyone from expecting the assistant to
          // remember the conversation this prompt was lifted from.
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            marginBottom: 12, padding: '6px 9px', borderRadius: 6,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            fontSize: 11, color: SECONDARY, lineHeight: 1.5,
          }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{t('automation.prompt.freshRunHint')}</span>
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: 12, padding: '6px 9px', borderRadius: 6, fontSize: 11,
            background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)', color: 'var(--danger-text)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={smallButtonStyle} onClick={onClose} disabled={saving}>
            {t('automation.cancel')}
          </button>
          <button
            style={{ ...primaryButtonStyle, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
            onClick={save}
            disabled={!canSave}
            // When the schedule is the reason Save is off, hovering names it in
            // the same words the line above shows.
            title={preview.kind === 'invalid' ? errorText(preview.error) : undefined}
          >
            {saving ? t('automation.saving') : t('automation.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
