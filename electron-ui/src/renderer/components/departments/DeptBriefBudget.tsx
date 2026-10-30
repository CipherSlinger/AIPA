// The daily cap on unattended spend, split out of `DeptBrief` so the panel's
// file keeps to its size ceiling. Presentation only: the numbers and the
// verdicts beside them come from `deptBudget.data.ts`.
//
// The one honesty addition here is the sync line: the background membership
// refresh can fail without failing the cap itself, and when it does this
// surface says the coverage was not saved rather than letting the Brief read as
// current.

import { useState, type ReactNode } from 'react'
import type { Department } from '../../store'
import type { AutomationDeptBudgetReportData } from '../../../preload'
import { useI18n } from '../../i18n'
import { briefSubtree } from './deptBrief.data'
import { describeDeptBudget, parseBudgetInput } from './deptBudget.data'
import DeptBudgetFrees from './DeptBudgetFrees'
import DeptSyncNotice from './DeptSyncNotice'
import { publishDeptSyncOutcome } from './deptSyncStatus'
import { SAVED_OUTCOME } from './syncOutcome'
import { costText } from '../workflows/scheduleSummary'

export default function DeptBriefBudget({
  dept,
  departments,
  scheduleCount,
  status,
  report,
  onChanged,
}: {
  dept: Department
  departments: Department[]
  scheduleCount: number | null
  status: 'loading' | 'ready' | 'error'
  report: AutomationDeptBudgetReportData | null
  onChanged: () => void
}) {
  const { t } = useI18n()
  const facts = describeDeptBudget(report, status)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<'saved' | 'cleared' | null>(null)

  // A known empty job list is the only evidence that a cap would cover nothing.
  // Loading or a failed jobs read leaves the control usable rather than guessing.
  const noSchedules = scheduleCount === 0

  // Hooks must run before any early return.
  if (facts.state === 'loading') return null

  const openEditor = () => {
    setDraft(report && facts.capUsd !== undefined ? String(facts.capUsd) : '')
    setError(null)
    setNotice(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft('')
    setError(null)
  }

  const parseError = (reason: 'empty' | 'nan' | 'negative' | 'zero' | 'tooLarge'): string =>
    reason === 'tooLarge' ? t('dept.budget.tooLarge') : t('dept.budget.invalidLimit')

  // Main's refusal is a string, not a code contract; map the common reasons and
  // fall back to the generic failure rather than printing raw IPC text.
  const refusalText = (reason?: string): string => {
    const text = (reason || '').toLowerCase()
    if (text.includes('member') || text.includes('node') || text.includes('cover')) {
      return t('dept.budget.noMembers')
    }
    if (text.includes('usd') || text.includes('amount') || text.includes('limit')
      || text.includes('number') || text.includes('positive')) {
      return t('dept.budget.invalidLimit')
    }
    return t('dept.budget.saveFailed')
  }

  // Never optimistic: the line changes only after main says the cap changed.
  const submit = (usd: number | null): void => {
    if (pending) return
    const api = window.electronAPI
    if (!api?.automationDeptBudgetSet) {
      setError(t('dept.budget.saveFailed'))
      return
    }

    const memberIds = briefSubtree(departments, dept.id).map(node => node.id)
    setPending(true)
    setError(null)
    setNotice(null)

    let call: Promise<{ ok: boolean; error?: string }>
    try {
      call = api.automationDeptBudgetSet({ departmentId: dept.id, usd, memberIds })
    } catch {
      setPending(false)
      setError(t('dept.budget.saveFailed'))
      return
    }

    Promise.resolve(call)
      .then(result => {
        if (result?.ok) {
          setEditing(false)
          setDraft('')
          setNotice(usd === null ? 'cleared' : 'saved')
          // This call carried this department's coverage, so an earlier warning
          // about the background refresh no longer describes this cap. A later
          // tree edit re-evaluates the channel and may raise it again.
          publishDeptSyncOutcome('cap', SAVED_OUTCOME)
          // The server's answer is the new cap; re-read it rather than trusting
          // the typed number, which main may have rounded or refused.
          onChanged()
        } else {
          // Keep the input open with what the user typed.
          setError(refusalText(result?.error))
        }
      })
      .catch(() => setError(t('dept.budget.saveFailed')))
      .finally(() => setPending(false))
  }

  const saveDraft = () => {
    const parsed = parseBudgetInput(draft)
    if (!parsed.ok) {
      setError(parseError(parsed.reason))
      return
    }
    submit(parsed.usd)
  }

  const editor = editing && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px',
          background: 'var(--bg-primary)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginRight: 2 }}>$</span>
          <input
            autoFocus
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveDraft() }
              else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
            }}
            inputMode="decimal"
            placeholder={t('dept.budget.placeholder')}
            disabled={pending}
            aria-label={t('dept.budget.setAction')}
            style={{
              width: 112, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--text-primary)', fontSize: 11,
              fontVariantNumeric: 'tabular-nums', padding: 0,
            }}
          />
        </span>
        <TextButton
          disabled={pending || noSchedules}
          title={noSchedules ? t('dept.budget.noSchedules') : undefined}
          onClick={saveDraft}
        >
          {pending ? t('dept.budget.saving') : t('dept.budget.saveAction')}
        </TextButton>
        <TextButton disabled={pending} onClick={() => submit(null)}>
          {t('dept.budget.clearAction')}
        </TextButton>
        <TextButton disabled={pending} onClick={cancelEdit}>
          {t('dept.budget.cancelAction')}
        </TextButton>
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 2 }}>
        {t('dept.budget.windowNote')}
      </div>
    </>
  )

  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {t('dept.budget.label')}
        </span>

        {facts.state === 'error' && (
          <>
            <span style={{ fontSize: 10.5, color: 'var(--warning-text)', lineHeight: 1.5 }}>
              {t('dept.budget.readError')}
            </span>
            <TextButton onClick={onChanged}>{t('dept.budget.retry')}</TextButton>
          </>
        )}

        {facts.state === 'none' && !editing && (
          <TextButton
            disabled={noSchedules}
            title={noSchedules ? t('dept.budget.noSchedules') : undefined}
            onClick={openEditor}
          >
            {t('dept.budget.setAction')}
          </TextButton>
        )}

        {facts.state === 'set' && facts.capUsd !== undefined && (
          <>
            {facts.spentUsd !== undefined ? (
              <span
                title={facts.floor ? t('dept.budget.floorNote') : undefined}
                style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
                  cursor: facts.floor ? 'help' : 'default',
                }}
              >
                {facts.floor ? '≥ ' : ''}
                {t('dept.budget.spentOfCap', {
                  spent: costText(facts.spentUsd),
                  cap: costText(facts.capUsd),
                })}
              </span>
            ) : (
              <span
                title={facts.floor ? t('dept.budget.floorNote') : undefined}
                style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}
              >
                {t('dept.budget.spentUnmeasured')}
              </span>
            )}
            {!editing && (
              <>
                <TextButton
                  disabled={noSchedules}
                  title={noSchedules ? t('dept.budget.noSchedules') : undefined}
                  onClick={openEditor}
                >
                  {t('dept.budget.editAction')}
                </TextButton>
                <TextButton disabled={pending} onClick={() => submit(null)}>
                  {t('dept.budget.clearAction')}
                </TextButton>
              </>
            )}
          </>
        )}

        {notice === 'saved' && (
          <span role="status" style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>
            {t('dept.budget.saved')}
          </span>
        )}
        {notice === 'cleared' && (
          <span role="status" style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>
            {t('dept.budget.cleared')}
          </span>
        )}
      </div>

      {facts.state === 'set' && (
        facts.coversNodes === 0 ? (
          <div style={{ fontSize: 9.5, color: 'var(--warning-text)', lineHeight: 1.5 }}>
            {t('dept.budget.coversNone')}
          </div>
        ) : (
          <div style={{ fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {t('dept.budget.coversSchedules', { count: facts.coversNodes })}
          </div>
        )
      )}

      {facts.state === 'set' && facts.heldRuns > 0 && (
        <div
          role="status"
          title={t('dept.budget.manualExempt')}
          style={{
            fontSize: 10, color: 'var(--warning-text)', lineHeight: 1.5,
            cursor: 'help',
          }}
        >
          {t('dept.budget.heldNote', { count: facts.heldRuns })}
        </div>
      )}

      {/* The cap's own forecast, in the words the popover uses too. Nothing is
          printed under the cap, and a time is only ever main's. */}
      {facts.state === 'set' && <DeptBudgetFrees report={report} />}

      {/* The background membership refresh, when it did not reach main. */}
      {facts.state === 'set' && <DeptSyncNotice subject="cap" />}

      {editor}

      {error && (
        <div role="alert" style={{ fontSize: 9.5, color: 'var(--danger-text)', lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  )
}

/** A text-sized action, kept at the panel's label scale rather than a button chip. */
function TextButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: 0, border: 'none', background: 'none',
        fontSize: 10, lineHeight: 1.4,
        color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textDecoration: disabled ? 'none' : 'underline',
        textUnderlineOffset: 2,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}
