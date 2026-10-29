// What a run may spend, whether it runs again, and what follows it.
//
// These three sit together in the dialog: the retry toggle answers "and then
// what" beside the successor selects, and the spend limit is the cost of
// opting into either. The chain's own job list is read here rather than taken
// as a prop, because Settings, a workflow page and the chat header all mount
// this dialog and must offer the same list.

import { useMemo } from 'react'
import { GitBranch } from 'lucide-react'
import { useI18n } from '../../../i18n'
import type { AutomationJobData, AutomationLimitsData } from '../../../../preload'
import { INPUT_STYLE } from '../../settings/settingsConstants'
import { buildChainOptions, type ChainOption } from '../jobChain'
import { Hint, ToggleField, WarningNote, labelStyle } from './shared'
import { useChainJobs } from './useDialogData'

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
    <WarningNote>
      {t('automation.chain.targetDisabled', { name })}
    </WarningNote>
  )
}

export interface CostChainFieldsProps {
  spendLimitText: string
  onSpendLimitTextChange: (value: string) => void
  retryOnFailure: boolean
  onRetryOnFailureChange: (value: boolean) => void
  limits: AutomationLimitsData | null
  job: AutomationJobData | null
  chainSuccess: string
  onChainSuccessChange: (value: string) => void
  chainFailure: string
  onChainFailureChange: (value: string) => void
}

export function CostChainFields({
  spendLimitText,
  onSpendLimitTextChange,
  retryOnFailure,
  onRetryOnFailureChange,
  limits,
  job,
  chainSuccess,
  onChainSuccessChange,
  chainFailure,
  onChainFailureChange,
}: CostChainFieldsProps) {
  const { t } = useI18n()
  const { chainJobs, chainJobsUnreadable } = useChainJobs()

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

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{t('automation.field.spendLimit')}</label>
        {/* Text rather than a number input: a number input normalizes a
            half-typed value to '' on some browsers, and an empty field here
            means "clear the limit" — Save must not do that by accident. */}
        <input
          type="text"
          inputMode="decimal"
          value={spendLimitText}
          onChange={e => onSpendLimitTextChange(e.target.value)}
          placeholder={t('automation.field.spendLimitPlaceholder')}
          style={{ ...INPUT_STYLE, width: 160 }}
        />
        {/* The blind spot and the manual bypass are named once, here, where
            the user decides the number. */}
        <Hint>
          {t('automation.spend.limitHint')}
        </Hint>
      </div>

      <div style={{ marginBottom: 12 }}>
        {/* Beside the spend limit because that is the cost of opting in: the
            hint says plainly that each retry runs and spends again. */}
        <ToggleField
          value={retryOnFailure}
          onChange={onRetryOnFailureChange}
          ariaLabel={t('automation.field.retryOnFailure')}
          label={t('automation.field.retryOnFailure')}
          hint={t('automation.retryOnFailure.hint', {
            count: limits?.retry?.maxRetries ?? 2,
            first: limits?.retry?.delaysMinutes?.[0] ?? 10,
            second: limits?.retry?.delaysMinutes?.[1] ?? 30,
          })}
        />
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
              onChange={e => onChainSuccessChange(e.target.value)}
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
              onChange={e => onChainFailureChange(e.target.value)}
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
        <Hint>
          {/* The depth cap and the switched-off rule, said once where the choice
              is made. The number is main's, not a copy. */}
          {t('automation.chain.hint', { depth: limits?.chainMaxDepth ?? 4 })}
        </Hint>
      </div>
    </>
  )
}
