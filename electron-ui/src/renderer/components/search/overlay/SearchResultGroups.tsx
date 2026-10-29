// The transcript rows, grouped by project.
//
// The order of `groups` is the sort's order: each group follows the sort, and
// the groups themselves follow it, so the first group holds the newest (or
// oldest) visible hit — the header the user reads first. Membership, ordering
// and filtering all happened before this component; it only draws.
//
// `flat` and `rowKeys` are the same rows in one list: `flat` locates a group's
// first row so the row index matches the keyboard selection, and `rowKeys`
// keeps React from merging two hits that share a session and match type.

import type { SessionSearchResultData } from '../../../../preload/index'
import { useT } from '../../../i18n'
import type { DeptAttribution } from '../searchDeptAttribution'
import { deptAttributionFor } from '../searchDeptAttribution'
import { searchResultOrigin, type SessionOriginMap } from '../searchOriginFilter'
import { SearchResultRow } from '../SearchResultRow'
import { projectLabel } from './shared'

interface Props {
  groups: ReadonlyArray<{ project: string; items: SessionSearchResultData[] }>
  flat: ReadonlyArray<SessionSearchResultData>
  rowKeys: readonly string[]
  /** The term to emphasise: the query the rows were searched for. */
  query: string
  active: number
  onHover: (index: number) => void
  onOpen: (hit: SessionSearchResultData) => void
  originMap: SessionOriginMap
  deptAttributions: ReadonlyMap<string, DeptAttribution>
}

export function SearchResultGroups({
  groups,
  flat,
  rowKeys,
  query,
  active,
  onHover,
  onOpen,
  originMap,
  deptAttributions,
}: Props) {
  const t = useT()
  return (
    <>
      {groups.map(group => {
        const groupStart = flat.indexOf(group.items[0])
        return (
          <div key={group.project || '__none'}>
            <div
              title={group.project || undefined}
              style={{
                padding: '8px 16px 4px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {projectLabel(group.project, t('globalSearch.unknownProject'))}
            </div>
            {group.items.map((hit, offset) => {
              const index = groupStart + offset
              return (
                <SearchResultRow
                  key={rowKeys[index] ?? `${hit.sessionId}-${hit.matchType}-${index}`}
                  hit={hit}
                  query={query}
                  index={index}
                  selected={index === active}
                  onHover={() => onHover(index)}
                  onOpen={() => onOpen(hit)}
                  origin={searchResultOrigin(hit.sessionId, originMap)}
                  attribution={deptAttributionFor(hit.sessionId, deptAttributions)}
                />
              )
            })}
          </div>
        )
      })}
    </>
  )
}
