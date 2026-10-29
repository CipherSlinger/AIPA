// Create / edit dialog for an automation.
//
// Extracted from SettingsAutomations so the workflow page can open it bound to
// the workflow being viewed. All scheduling and validation live in the main
// process (`src/main/automation/`); this dialog only edits the fields an
// `AutomationInputData` accepts and reports save errors verbatim.
//
// This file keeps the form's state, its loads, validation and submit. The
// sections it renders live in `./automationDialog/`, one reason to exist each:
//
//   ActionFields        workflow / prompt / skill picker
//   AgentFields         expert and effort selects
//   DepartmentField     department attribution
//   CostChainFields     spend limit, retry toggle, chain successors
//   TriggerFields       schedule chips, per-kind fields, preview, missed/quiet
//   DialogChrome        info notes, error box, Cancel / Save row
//   shared              label, hint, warning note, toggle row, absolute-path test
//   useDialogData       chain list, skill list and SKILL.md body reads
//   useSchedulePreview  the debounced next-run request and its sequence
//
// The public names (`WorkflowOption`, `ASSISTANT_PERSONA_ID`,
// `AutomationDialogProps`) still resolve from this path.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import { usePluginStore } from '../../store/pluginStore'
import { getPluginDisplayName } from '../plugins/pluginIcons'
import type { Persona } from '../../types/app.types'
import Toggle from '../ui/Toggle'
import { INPUT_STYLE } from '../settings/settingsConstants'
import { pushEscapeHandler } from '../ui/escapeStack'
import { DEFAULT_WATCH_DEBOUNCE_MINUTES, describeCron, scheduleText } from './scheduleText'
import { jobDepartmentChoice } from './jobDepartment'
import {
  ASSISTANT_PERSONA_ID,
  FOLLOW_APP_EFFORT,
  WATCH_DEBOUNCE_MAX,
  WATCH_DEBOUNCE_MIN,
  type AutomationDialogProps,
  type ScheduleKind,
} from './automationDialog/types'
import { isAbsolutePath, labelStyle } from './automationDialog/shared'
import { ActionFields } from './automationDialog/ActionFields'
import { AgentFields } from './automationDialog/AgentFields'
import { DepartmentField } from './automationDialog/DepartmentField'
import { CostChainFields } from './automationDialog/CostChainFields'
import { TriggerFields } from './automationDialog/TriggerFields'
import {
  DialogErrorBox,
  DialogFooter,
  PluginOriginNote,
  PromptFreshRunHint,
} from './automationDialog/DialogChrome'
import { useInstalledSkills } from './automationDialog/useDialogData'
import { useSchedulePreview } from './automationDialog/useSchedulePreview'
import {
  defaultActionKindFor,
  initialSkillChoice,
  skillAction,
} from './skillSelection'
import type {
  AutomationInputData,
  AutomationTriggerData,
} from '../../../preload'

export type { AutomationDialogProps, WorkflowOption } from './automationDialog/types'
export { ASSISTANT_PERSONA_ID } from './automationDialog/types'

// Stable empty array: an absent pref must not create a new reference per render.
const EMPTY_PERSONAS: Persona[] = []

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

  // `null` means "not read yet"; an empty array is the real answer "no skills
  // are installed", which the picker must say instead of showing an empty box.
  const { skills, skillsUnreadable } = useInstalledSkills(workingDir)

  const [name, setName] = useState(job?.name ?? initialName ?? '')
  const [enabled, setEnabled] = useState(job?.enabled ?? true)
  const [actionKind, setActionKind] = useState<'workflow' | 'prompt' | 'skill'>(defaultActionKind)
  // Kept as the two stored fields, never as a joined string: main validates the
  // pair, and a "source:dir" round-trip here would be a second parser to keep
  // in step with the one that matters.
  const [skillSource, setSkillSource] = useState<'' | 'personal' | 'project'>(initialChoice.source)
  const [skillDir, setSkillDir] = useState(initialChoice.dir)
  const [skillQuery, setSkillQuery] = useState('')
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
  // Every failure by default. Only the deliberate `'after_streak'` is a stored
  // choice; an absent or unknown value opens as the default, never as held.
  const [alertPolicy, setAlertPolicy] = useState<'always' | 'after_streak'>(
    job?.alertPolicy === 'after_streak' ? 'after_streak' : 'always',
  )
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => pushEscapeHandler(onClose), [onClose])

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

  const preview = useSchedulePreview(trigger)

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
      // Same shape: only the non-default policy is sent, so choosing "every
      // failure" on an edit clears a previous `'after_streak'` instead of
      // writing an explicit default.
      ...(alertPolicy === 'after_streak' ? { alertPolicy: 'after_streak' as const } : {}),
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

  const changeActionKind = (kind: 'workflow' | 'prompt' | 'skill') => {
    setActionKind(kind)
    // Each action has its own default: a prompt or skill job cannot follow a
    // workflow, and a workflow should inherit its expert after a mode switch
    // rather than silently keep an implicit override.
    if (kind === 'workflow') {
      setPersonaChoice(prev => prev === ASSISTANT_PERSONA_ID ? '' : prev)
    } else {
      setPersonaChoice(prev => prev === '' ? ASSISTANT_PERSONA_ID : prev)
    }
  }

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
          <PluginOriginNote pluginName={originPluginName} />
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

        <ActionFields
          actionKind={actionKind}
          onActionKindChange={changeActionKind}
          workflows={workflows}
          workflowId={workflowId}
          onWorkflowIdChange={setWorkflowId}
          prompt={prompt}
          onPromptChange={setPrompt}
          initialPromptClipped={initialPromptClipped}
          editing={editing}
          skillQuery={skillQuery}
          onSkillQueryChange={setSkillQuery}
          skills={skills}
          skillsUnreadable={skillsUnreadable}
          skillList={skillList}
          skillSource={skillSource}
          skillDir={skillDir}
          setSkillSource={setSkillSource}
          setSkillDir={setSkillDir}
        />

        <AgentFields
          actionKind={actionKind}
          personas={personas}
          personaChoice={personaChoice}
          onPersonaChoiceChange={setPersonaChoice}
          workflows={workflows}
          workflowId={workflowId}
          effortChoice={effortChoice}
          onEffortChoiceChange={setEffortChoice}
          globalEffort={globalEffort}
        />

        <DepartmentField
          departmentChoice={departmentChoice}
          onDepartmentChoiceChange={setDepartmentChoice}
        />

        <CostChainFields
          spendLimitText={spendLimitText}
          onSpendLimitTextChange={setSpendLimitText}
          retryOnFailure={retryOnFailure}
          onRetryOnFailureChange={setRetryOnFailure}
          limits={limits}
          job={job}
          chainSuccess={chainSuccess}
          onChainSuccessChange={setChainSuccess}
          chainFailure={chainFailure}
          onChainFailureChange={setChainFailure}
        />

        <TriggerFields
          scheduleKind={scheduleKind}
          onScheduleKindChange={setScheduleKind}
          cronIsCustom={cronIsCustom}
          job={job}
          trigger={trigger}
          limits={limits}
          preview={preview}
          errorText={errorText}
          watchPath={watchPath}
          onWatchPathChange={setWatchPath}
          watchRecursive={watchRecursive}
          onWatchRecursiveChange={setWatchRecursive}
          watchDebounce={watchDebounce}
          onWatchDebounceChange={setWatchDebounce}
          intervalMinutes={intervalMinutes}
          onIntervalMinutesChange={setIntervalMinutes}
          cronExpr={cronExpr}
          onCronExprChange={setCronExpr}
          weekday={weekday}
          onWeekdayChange={setWeekday}
          dayOfMonthInput={dayOfMonthInput}
          onDayOfMonthInputChange={setDayOfMonthInput}
          hour={hour}
          onHourChange={setHour}
          minute={minute}
          onMinuteChange={setMinute}
          dayOfMonth={dayOfMonth}
          dayOutOfRange={dayOutOfRange}
          dayFieldValid={dayFieldValid}
          missedRunPolicy={missedRunPolicy}
          onMissedRunPolicyChange={setMissedRunPolicy}
          quietOnSuccess={quietOnSuccess}
          onQuietOnSuccessChange={setQuietOnSuccess}
          alertPolicy={alertPolicy}
          onAlertPolicyChange={setAlertPolicy}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Toggle value={enabled} onChange={setEnabled} aria-label={t('automation.field.enabled')} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('automation.field.enabled')}</span>
        </div>

        {actionKind === 'prompt' && (
          <PromptFreshRunHint />
        )}

        {error && (
          <DialogErrorBox error={error} />
        )}

        <DialogFooter
          canSave={canSave}
          saving={saving}
          preview={preview}
          errorText={errorText}
          onSave={save}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
