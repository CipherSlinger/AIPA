// The automations page's own chrome: the global pause switch and its banner,
// the one daily budget card, the inline error banner, the filter row, and the
// three list states (loading, no jobs, no matches).
//
// Every piece below was inline in `SettingsAutomations.tsx`. They are separated
// because they are page-level furniture, not job rows: each takes only the
// state it renders and the handler it calls, and the shell keeps owning that
// state. The markup, styles and wording are the pre-split ones.

import { AlertTriangle, Pause, Play, Search, Wallet, X } from 'lucide-react'
import { INPUT_STYLE } from '../settingsConstants'
import { JOB_FILTER_STATUSES, type JobFilterStatus } from '../../automation/jobFilter'
import { JOB_SORT_MODES, type JobSortMode } from '../../automation/jobSort'
import { SECONDARY, primaryButtonStyle, smallButtonStyle } from '../../automation/automationStyles'
import type { AutomationGlobalSpendData } from '../../../../preload'
import { budgetReadout, type Translate } from './automationStatusText'
import { FILTER_LINK } from './automationSettingsStyles'

/**
 * One switch for every schedule, plus the banner that explains what the pause
 * did. Quiet by design: it sits below the page description, not above the job
 * list, and its copy says how many jobs it touches so the consequence is
 * explicit.
 */
export function AutomationPauseCard({
  t,
  pausedAll,
  enabledCount,
  pauseBusy,
  onToggle,
}: {
  t: Translate
  pausedAll: boolean
  enabledCount: number
  pauseBusy: boolean
  onToggle: () => void
}) {
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, padding: '7px 9px', borderRadius: 6,
        border: '1px solid var(--border)',
        background: pausedAll ? 'var(--bg-hover)' : 'transparent',
      }}>
        <Pause size={13} style={{ flexShrink: 0, color: pausedAll ? 'var(--accent-text)' : SECONDARY }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: SECONDARY, lineHeight: 1.45 }}>
          {pausedAll
            ? t('automation.pauseAll.activeHint', { count: enabledCount })
            : t('automation.pauseAll.idleHint', { count: enabledCount })}
        </div>
        <button
          style={{ ...(pausedAll ? primaryButtonStyle : smallButtonStyle), opacity: pauseBusy ? 0.5 : 1 }}
          disabled={pauseBusy}
          onClick={onToggle}
        >
          {pausedAll ? <Play size={11} /> : <Pause size={11} />}
          {pausedAll ? t('automation.pauseAll.resume') : t('automation.pauseAll.pause')}
        </button>
      </div>

      {pausedAll && (
        // The banner answers "why did nothing run?" without requiring the
        // user to notice a switch. It also states the two exceptions the
        // scheduler guarantees: manual runs work and in-flight runs finish.
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7,
          marginBottom: 10, padding: '7px 10px', borderRadius: 6,
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
          fontSize: 11.5, color: SECONDARY, lineHeight: 1.5,
        }}>
          <Pause size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent-text)' }} />
          <span>{t('automation.pauseAll.banner')}</span>
        </div>
      )}
    </>
  )
}

/**
 * One daily cap across every job. It sits beside Pause-all because it is the
 * other switch over the whole store rather than a property of a job; the
 * per-job fields still exist and still apply on top of it.
 */
export function AutomationBudgetCard({
  t,
  budgetText,
  budgetBusy,
  budgetError,
  globalLimit,
  globalSpend,
  onChange,
  onSave,
  onClear,
}: {
  t: Translate
  budgetText: string
  budgetBusy: boolean
  budgetError: string | null
  globalLimit: number | undefined
  globalSpend: AutomationGlobalSpendData | undefined
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
}) {
  const readout = budgetReadout(t, globalLimit, globalSpend)
  return (
    <div style={{
      marginBottom: 10, padding: '7px 9px', borderRadius: 6,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Wallet size={13} style={{ flexShrink: 0, color: SECONDARY }} />
        <div style={{ flex: 1, minWidth: 140, fontSize: 11.5, color: SECONDARY, lineHeight: 1.45 }}>
          <div>{t('automation.budget.label')}</div>
          {readout && (
            <div style={{ marginTop: 2, fontSize: 11, color: readout.color }}>
              {readout.text}
              {readout.notes.length > 0 && (
                // Named inline, not only in a tooltip: a total that may be
                // low must not look exact on a settings page the user only
                // glances at.
                <div style={{ fontSize: 10.5, color: SECONDARY }}>
                  {readout.notes.join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={budgetText}
          onChange={e => onChange(e.target.value)}
          placeholder={t('automation.budget.placeholder')}
          aria-label={t('automation.budget.label')}
          disabled={budgetBusy}
          style={{ ...INPUT_STYLE, width: 96, fontSize: 12, padding: '4px 8px' }}
        />
        <button
          style={{ ...smallButtonStyle, opacity: budgetBusy ? 0.5 : 1 }}
          disabled={budgetBusy}
          onClick={onSave}
        >
          {t('automation.budget.save')}
        </button>
        {globalLimit !== undefined && (
          <button
            style={{ ...smallButtonStyle, opacity: budgetBusy ? 0.5 : 1 }}
            disabled={budgetBusy}
            onClick={onClear}
          >
            {t('automation.budget.clear')}
          </button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: SECONDARY, marginTop: 4, lineHeight: 1.45 }}>
        {t('automation.budget.hint')}
      </div>
      {budgetError && (
        <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 4 }}>
          {budgetError}
        </div>
      )}
    </div>
  )
}

/** The page's one inline mutation error, above the list. */
export function AutomationErrorBanner({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 10, padding: '6px 9px', borderRadius: 6,
      background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)',
      color: 'var(--danger-text)', fontSize: 11,
    }}>
      <AlertTriangle size={12} />
      <span>{error}</span>
    </div>
  )
}

/** The filter, status chips, ordering select and live count over the jobs. */
export function AutomationFilterRow({
  t,
  filterText,
  onFilterText,
  filterStatuses,
  onToggleStatus,
  statusCounts,
  sortMode,
  onSortMode,
  filtersActive,
  onClear,
  shown,
  total,
}: {
  t: Translate
  filterText: string
  onFilterText: (value: string) => void
  filterStatuses: JobFilterStatus[]
  onToggleStatus: (status: JobFilterStatus) => void
  statusCounts: Record<JobFilterStatus, number>
  sortMode: JobSortMode
  onSortMode: (mode: JobSortMode) => void
  filtersActive: boolean
  onClear: () => void
  shown: number
  total: number
}) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
      marginBottom: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, flex: '1 1 160px',
        minWidth: 140, maxWidth: 280,
        height: 24, boxSizing: 'border-box', padding: '0 9px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--bg-hover)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}>
        <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          value={filterText}
          onChange={e => onFilterText(e.target.value)}
          onKeyDown={event => {
            // Escape is the field's own reset, not the page's: with a
            // value present it clears the text and keeps the caret here;
            // with nothing to clear it does nothing.
            if (event.key === 'Escape' && filterText !== '') {
              event.preventDefault()
              onFilterText('')
            }
          }}
          placeholder={t('automation.filter.placeholder')}
          aria-label={t('automation.filter.placeholder')}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onFocus={e => {
            const bar = e.currentTarget.parentElement
            if (bar) {
              bar.style.boxShadow = '0 0 0 2px var(--accent-bg)'
              bar.style.borderColor = 'var(--accent-border)'
            }
          }}
          onBlur={e => {
            const bar = e.currentTarget.parentElement
            if (bar) {
              bar.style.boxShadow = 'none'
              bar.style.borderColor = 'var(--border)'
            }
          }}
          style={{
            flex: 1, minWidth: 0, background: 'none', border: 'none',
            color: 'var(--text-primary)', fontSize: 11,
          }}
        />
        {filterText && (
          <button
            type="button"
            onClick={() => onFilterText('')}
            aria-label={t('automation.filter.clearSearch')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', padding: 0,
            }}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* All four chips are always present with their counts, even at
          zero, so the row does not reflow as jobs start, fail, or are
          switched off. A zero-count chip is disabled: filtering to it
          could only produce the empty state, and its count already says
          why. The counts follow the text query but not the chip
          selection, so a chip advertises what toggling it would reveal. */}
      <span
        role="group"
        aria-label={t('automation.filter.status.group')}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
      >
        {JOB_FILTER_STATUSES.map(status => {
          const active = filterStatuses.includes(status)
          const count = statusCounts[status]
          const unavailable = count === 0 && !active
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              disabled={unavailable}
              onClick={() => onToggleStatus(status)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 24, boxSizing: 'border-box', padding: '0 9px',
                borderRadius: 999, fontSize: 11, lineHeight: '16px',
                cursor: unavailable ? 'default' : 'pointer',
                border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
                background: active ? 'var(--accent-bg)' : 'transparent',
                color: active ? 'var(--accent-text)' : SECONDARY,
                fontWeight: active ? 600 : 400,
                opacity: unavailable ? 0.45 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {t(`automation.filter.status.${status}`)}
              <span style={{ fontSize: 10, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                {count}
              </span>
            </button>
          )
        })}
      </span>

      {/* A native select, not four more chips: ordering is exactly one
          choice out of four, the element already gives keyboard and
          screen-reader semantics for free, and a dropdown stays as quiet
          as the chips instead of adding another row of pressable
          controls. It is styled to the same 24px height and muted text
          as its neighbours; the accessible name is separate from the
          current value so "Next run" reads as an order, not a filter. */}
      <select
        value={sortMode}
        onChange={event => onSortMode(event.target.value as JobSortMode)}
        aria-label={t('automation.sort.label')}
        title={t('automation.sort.label')}
        style={{
          height: 24, boxSizing: 'border-box', padding: '0 8px',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'transparent', color: SECONDARY, fontSize: 11,
          cursor: 'pointer', maxWidth: 170,
        }}
      >
        {JOB_SORT_MODES.map(mode => (
          <option key={mode} value={mode}>{t(`automation.sort.${mode}`)}</option>
        ))}
      </select>

      {filtersActive && (
        <button type="button" onClick={onClear} style={FILTER_LINK}>
          {t('automation.filter.clear')}
        </button>
      )}

      <span
        role="status"
        aria-live="polite"
        style={{
          marginLeft: 'auto', fontSize: 10.5, color: SECONDARY,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {t('automation.filter.count', {
          shown,
          total,
        })}
      </span>
    </div>
  )
}

/**
 * What stands in for the list: loading, no jobs at all, or a filter that
 * matched nothing. The last one carries its own reset, because a filter that
 * matches nothing must not look like an empty account.
 */
export function AutomationListState({
  t,
  loading,
  total,
  filteredCount,
  filterText,
  onClear,
}: {
  t: Translate
  loading: boolean
  total: number
  filteredCount: number
  filterText: string
  onClear: () => void
}) {
  if (loading) {
    return (
      <div style={{ fontSize: 12, color: SECONDARY, padding: '10px 0' }}>{t('common.loading')}</div>
    )
  }
  if (total === 0) {
    return (
      <div style={{ fontSize: 12, color: SECONDARY, padding: '10px 0', lineHeight: 1.5 }}>
        {t('automation.empty')}
      </div>
    )
  }
  if (filteredCount === 0) {
    // One line, with the reset beside it: a filter that matches nothing
    // must not look like an empty account.
    return (
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        fontSize: 11.5, color: SECONDARY, padding: '10px 0', lineHeight: 1.5,
      }}>
        <span>
          {filterText.trim()
            ? t('automation.filter.emptyQuery', { query: filterText.trim() })
            : t('automation.filter.empty')}
        </span>
        <button type="button" onClick={onClear} style={FILTER_LINK}>
          {t('automation.filter.clear')}
        </button>
      </div>
    )
  }
  return null
}
