// The two band above the list that describe the corpus: the archive snapshot
// the overlay was opened with, and the toggle that narrows the ask to the same
// corpus.
//
// Both are independent of the row filters. Turning the ask scope off asks the
// whole history while the list stays filtered, so the helper line says exactly
// which corpus will answer before the user commits. The snapshot count is the
// archive's own count; its cap (`listOmitted`) and the rows this overlay hid
// are reported separately so "these rows" never reads as "the whole list".
//
// The bands render only while the list is showing; the running/answer views
// replace the list and their receipts carry the same facts.

import { Lock } from 'lucide-react'
import { useT } from '../../../i18n'
import type { ListScope } from '../searchAskScope'
import { MAX_SCOPE_SESSIONS } from '../searchDeptAttribution'
import type { DeptScopeSource } from '../searchDeptScan'
import { GHOST_BUTTON_STYLE, stopPillActivation } from './shared'

interface Props {
  listScope: ListScope | null
  /** Rows the archive's cap left out of the snapshot. */
  listOmitted: number
  /** Rows the snapshot is keeping out of the current result set. */
  listHidden: number
  deptFilter: string | null
  deptFilterLabel: string
  deptScope: DeptScopeSource | null
  askScopeOn: boolean
  /** The archive snapshot intersected with the department scope. */
  listAskCount: number
  /** The ask entry exists at all (an authenticated engine answered the probe). */
  askAvailable: boolean
  onAskScopeChange: (checked: boolean) => void
  onClearListScope: () => void
}

export function AskScopeControls({
  listScope,
  listOmitted,
  listHidden,
  deptFilter,
  deptFilterLabel,
  deptScope,
  askScopeOn,
  listAskCount,
  askAvailable,
  onAskScopeChange,
  onClearListScope,
}: Props) {
  const t = useT()
  return (
    <>
      {/* The archive handed this overlay an exact list of rows. Say so
          instead of letting a narrowed result set look like a global
          search: the count is a snapshot, the cap may have left rows
          out, and one control drops the whole thing. */}
      {listScope && (
        <div
          role="status"
          style={{
            padding: '7px 16px 8px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              <Lock
                size={11}
                aria-hidden="true"
                style={{ flexShrink: 0, color: 'var(--accent-text)' }}
              />
              <span>{t('search.listScope.label', { count: listScope.sessionIds.length })}</span>
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)' }}>
              {t('search.listScope.snapshot')}
              {listScope.truncated && listOmitted > 0 && (
                <> {t('search.listScope.capped', { count: listOmitted })}</>
              )}
              {listHidden > 0 && (
                <> {t(
                  listHidden === 1
                    ? 'search.listScope.rowsHiddenOne'
                    : 'search.listScope.rowsHidden',
                  { count: listHidden },
                )}</>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClearListScope}
            onKeyDown={stopPillActivation}
            style={{ ...GHOST_BUTTON_STYLE, flexShrink: 0 }}
          >
            {t('search.listScope.clear')}
          </button>
        </div>
      )}

      {/* With a department filter or an archive snapshot active the ask
          can be narrowed to the same corpus. The scope is independent
          of the row filter: turning it off asks the whole history while
          the list stays filtered, so the helper line says exactly which
          corpus will answer before the user commits. */}
      {askAvailable && ((deptFilter && deptScope) || listScope) && (
        <div
          style={{
            padding: '7px 16px 8px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flexShrink: 0,
          }}
        >
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={askScopeOn}
              onChange={e => onAskScopeChange(e.target.checked)}
              onKeyDown={stopPillActivation}
              style={{ margin: 0, accentColor: 'var(--accent-text)', flexShrink: 0 }}
            />
            <span>
              {listScope
                ? t('search.listScope.askOnly', { count: listScope.sessionIds.length })
                : t('search.deptScope.askOnly', { dept: deptFilterLabel })}
            </span>
          </label>
          <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {askScopeOn ? (
              listScope ? (
                <>
                  {t('search.listScope.limits', { count: listScope.sessionIds.length })}
                  {deptFilter && deptScope && (
                    <> {t('search.listScope.deptNarrowed', {
                      dept: deptFilterLabel,
                      count: listAskCount,
                    })}</>
                  )}
                </>
              ) : (
                <>
                  {t('search.deptScope.limits', {
                    dept: deptFilterLabel,
                    cap: MAX_SCOPE_SESSIONS,
                  })}
                  {deptScope && deptScope.truncated && (
                    <> {t('search.deptScope.capped', { count: deptScope.ids.length })}</>
                  )}
                </>
              )
            ) : (
              listScope
                ? t('search.listScope.askOff')
                : t('search.deptScope.scopeOff', { dept: deptFilterLabel })
            )}
          </div>
        </div>
      )}
    </>
  )
}
