// When the job runs: the schedule-kind chips and the fields behind each one,
// the next-run preview, and the two schedule-side switches (missed runs and
// quiet success).
//
// The trigger object itself is built in the coordinator, because Save and the
// preview effect both need it; this module only edits the fields and renders
// the answer. Extracted verbatim from `AutomationDialog.tsx`.

import { useCallback } from 'react'
import { AlertTriangle, File, FolderOpen } from 'lucide-react'
import { useI18n } from '../../../i18n'
import type {
  AutomationJobData,
  AutomationLimitsData,
  AutomationTriggerData,
} from '../../../../preload'
import { INPUT_STYLE } from '../../settings/settingsConstants'
import { SECONDARY, WARNING, smallButtonStyle } from '../automationStyles'
import {
  clockText,
  dayOfMonthText,
  scheduleText,
  watchWarningText,
} from '../scheduleText'
import {
  WATCH_DEBOUNCE_MAX,
  WATCH_DEBOUNCE_MIN,
  type ScheduleKind,
  type SchedulePreviewState,
} from './types'
import { Hint, ToggleField, WarningNote, isAbsolutePath, labelStyle } from './shared'

export interface TriggerFieldsProps {
  scheduleKind: ScheduleKind
  onScheduleKindChange: (kind: ScheduleKind) => void
  cronIsCustom: boolean
  job: AutomationJobData | null
  trigger: AutomationTriggerData
  limits: AutomationLimitsData | null
  preview: SchedulePreviewState
  errorText: (code: string, detail?: string) => string
  watchPath: string
  onWatchPathChange: (value: string) => void
  watchRecursive: boolean
  onWatchRecursiveChange: (value: boolean) => void
  watchDebounce: number
  onWatchDebounceChange: (value: number) => void
  intervalMinutes: number
  onIntervalMinutesChange: (value: number) => void
  cronExpr: string
  onCronExprChange: (value: string) => void
  weekday: number
  onWeekdayChange: (value: number) => void
  dayOfMonthInput: string
  onDayOfMonthInputChange: (value: string) => void
  hour: number
  onHourChange: (value: number) => void
  minute: number
  onMinuteChange: (value: number) => void
  dayOfMonth: number
  dayOutOfRange: boolean
  dayFieldValid: boolean
  missedRunPolicy: 'run' | 'skip'
  onMissedRunPolicyChange: (value: 'run' | 'skip') => void
  quietOnSuccess: boolean
  onQuietOnSuccessChange: (value: boolean) => void
  alertPolicy: 'always' | 'after_streak'
  onAlertPolicyChange: (value: 'always' | 'after_streak') => void
}

export function TriggerFields({
  scheduleKind,
  onScheduleKindChange,
  cronIsCustom,
  job,
  trigger,
  limits,
  preview,
  errorText,
  watchPath,
  onWatchPathChange,
  watchRecursive,
  onWatchRecursiveChange,
  watchDebounce,
  onWatchDebounceChange,
  intervalMinutes,
  onIntervalMinutesChange,
  cronExpr,
  onCronExprChange,
  weekday,
  onWeekdayChange,
  dayOfMonthInput,
  onDayOfMonthInputChange,
  hour,
  onHourChange,
  minute,
  onMinuteChange,
  dayOfMonth,
  dayOutOfRange,
  dayFieldValid,
  missedRunPolicy,
  onMissedRunPolicyChange,
  quietOnSuccess,
  onQuietOnSuccessChange,
  alertPolicy,
  onAlertPolicyChange,
}: TriggerFieldsProps) {
  const { t, resolvedLocale } = useI18n()

  /**
   * The two pickers only fill the path field: the field stays editable, so a
   * pasted path works without either dialog. Both resolve to null when the
   * user cancels, which must leave whatever was typed in place.
   */
  const pickFolder = async () => {
    try {
      const picked = await window.electronAPI.fsShowOpenDialog()
      if (picked) onWatchPathChange(picked)
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
      if (picked && picked.length > 0) onWatchPathChange(picked[0])
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

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{t('automation.field.schedule')}</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['daily', 'weekly', 'monthly', 'interval', 'watch'] as const).map(kind => (
          <button
            key={kind}
            onClick={() => onScheduleKindChange(kind)}
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
            onClick={() => onScheduleKindChange('cron')}
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
            onChange={e => onWatchPathChange(e.target.value)}
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
            <WarningNote>
              {missingWarning}
            </WarningNote>
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
          <ToggleField
            value={watchRecursive}
            onChange={onWatchRecursiveChange}
            ariaLabel={t('automation.watch.recursive')}
            label={t('automation.watch.recursive')}
            hint={t('automation.watch.recursiveHint')}
            marginTop={10}
          />

          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>{t('automation.watch.quiet')}</label>
            <input
              type="number"
              min={WATCH_DEBOUNCE_MIN}
              max={WATCH_DEBOUNCE_MAX}
              value={watchDebounce}
              onChange={e => onWatchDebounceChange(Number(e.target.value))}
              style={{ ...INPUT_STYLE, width: 140 }}
            />
            <Hint>
              {t('automation.watch.quietHint')}
            </Hint>
          </div>

          {/* A watch job has no next run to name. Saying so here, where the
              schedule is decided, keeps the row's missing countdown from
              reading as a bug. */}
          <Hint marginTop={8}>
            {t('automation.watch.eventHint')}
          </Hint>
        </div>
      ) : scheduleKind === 'interval' ? (
        <div>
          <label style={labelStyle}>{t('automation.field.interval')}</label>
          <input
            type="number"
            min={limits?.minIntervalMinutes ?? 5}
            max={10080}
            value={intervalMinutes}
            onChange={e => onIntervalMinutesChange(Number(e.target.value))}
            style={{ ...INPUT_STYLE, width: 140 }}
          />
        </div>
      ) : scheduleKind === 'cron' ? (
        <div>
          <label style={labelStyle}>{t('automation.field.cron')}</label>
          <input
            value={cronExpr}
            onChange={e => onCronExprChange(e.target.value)}
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
                  onChange={e => onWeekdayChange(Number(e.target.value))}
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
                  onChange={e => onDayOfMonthInputChange(e.target.value)}
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
                  if (h !== undefined) onHourChange(Number(h))
                  if (m !== undefined) onMinuteChange(Number(m))
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
            <Hint style={{ color: WARNING }}>
              {t('automation.monthly.dayRange', { day: dayOfMonthText(t, dayOfMonth) })}
            </Hint>
          )}
          {scheduleKind === 'monthly' && dayFieldValid && dayOfMonth >= 29 && (
            <Hint>
              {t('automation.monthly.shortMonth', { day: dayOfMonthText(t, dayOfMonth) })}
            </Hint>
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
            onChange={e => onMissedRunPolicyChange(e.target.value === 'skip' ? 'skip' : 'run')}
            style={INPUT_STYLE}
          >
            <option value="run">{t('automation.missedPolicy.run')}</option>
            <option value="skip">{t('automation.missedPolicy.skip')}</option>
          </select>
          <Hint>
            {t('automation.missedPolicy.hint')}
          </Hint>
        </div>
      )}

      {/* Lives with the schedule because it is about when the app calls
          the user, not about what the job does. */}
      <ToggleField
        value={quietOnSuccess}
        onChange={onQuietOnSuccessChange}
        ariaLabel={t('automation.field.quietOnSuccess')}
        label={t('automation.field.quietOnSuccess')}
        hint={t('automation.quietOnSuccess.hint')}
        marginTop={10}
      />

      {/* Beside quiet mode: both are about when the app calls the user.
          The select keeps the existing field shape rather than adding a
          second toggle, because "every failure" and "after two" are one
          choice, not two independent switches. */}
      <div style={{ marginTop: 10 }}>
        <label style={labelStyle}>{t('automation.field.alertPolicy')}</label>
        <select
          value={alertPolicy}
          onChange={e => onAlertPolicyChange(e.target.value === 'after_streak' ? 'after_streak' : 'always')}
          style={INPUT_STYLE}
        >
          <option value="always">{t('automation.alertPolicy.always')}</option>
          <option value="after_streak">{t('automation.alertPolicy.afterStreak')}</option>
        </select>
        <Hint>
          {t('automation.alertPolicy.hint')}
        </Hint>
      </div>
    </div>
  )
}
