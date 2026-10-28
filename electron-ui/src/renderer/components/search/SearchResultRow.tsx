import React from 'react'
import { MessageSquareText, Search } from 'lucide-react'
import type { SessionSearchResultData } from '../../../preload/index'
import type { SessionOrigin } from '../../types/app.types'
import { useT } from '../../i18n'
import SessionOriginBadge from '../shared/SessionOriginBadge'
import SearchDeptBadge from './SearchDeptBadge'
import type { DeptAttribution } from './searchDeptAttribution'

interface Props {
  hit: SessionSearchResultData
  query: string
  index: number
  selected: boolean
  onHover: () => void
  onOpen: () => void
  /**
   * Absent for both user-started and unknown sessions. The shared badge draws
   * nothing in that case; the filter, not the row, knows the difference.
   */
  origin?: SessionOrigin
  /** Always present: "cannot attribute" is an answer, not a missing badge. */
  attribution: DeptAttribution
}

/** Split the snippet around every case-insensitive occurrence of the query. */
function emphasise(snippet: string, query: string): React.ReactNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [snippet]
  const haystack = snippet.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    if (at > from) parts.push(snippet.slice(from, at))
    parts.push(
      <mark
        key={`${at}-${parts.length}`}
        style={{
          background: 'rgba(99,102,241,0.32)',
          color: 'inherit',
          borderRadius: 3,
          padding: '0 1px',
        }}
      >
        {snippet.slice(at, at + needle.length)}
      </mark>,
    )
    from = at + needle.length
  }
  if (from < snippet.length) parts.push(snippet.slice(from))
  return parts.length > 0 ? parts : [snippet]
}

/** Shared with the ask-answer source list, so both surfaces date rows alike. */
export function relativeTime(timestamp: number, t: ReturnType<typeof useT>): string {
  const diff = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t('message.justNow')
  if (minutes < 60) return t('message.minsAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('message.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('message.daysAgo', { count: days })
  return new Date(timestamp).toLocaleDateString()
}

export function SearchResultRow({ hit, query, index, selected, onHover, onOpen, origin, attribution }: Props) {
  const t = useT()
  return (
    <div
      id={`global-search-row-${index}`}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '9px 16px',
        cursor: 'pointer',
        background: selected ? 'rgba(99,102,241,0.14)' : 'transparent',
        borderLeft: selected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
    >
      <span
        style={{
          color: selected ? 'var(--accent-text)' : 'var(--text-muted)',
          display: 'flex',
          paddingTop: 2,
          flexShrink: 0,
        }}
      >
        {hit.matchType === 'title'
          ? <Search size={14} />
          : <MessageSquareText size={14} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            title={hit.title || t('globalSearch.untitled')}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {hit.title || t('globalSearch.untitled')}
          </span>
          {/* Who started the conversation, quiet enough that the title still
              reads first. Nothing renders for user-started or unknown hits. */}
          <SessionOriginBadge origin={origin} />
          {/* Which org node would file this conversation. Beside, not instead
              of, the origin: who started it and where it was filed are two
              different facts, and neither replaces the other. */}
          <SearchDeptBadge attribution={attribution} />
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginLeft: 'auto',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}
          >
            {relativeTime(hit.timestamp, t)}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '1px 4px',
              flexShrink: 0,
            }}
          >
            {hit.engine === 'codex' ? t('globalSearch.engineCodex') : t('globalSearch.engineClaude')}
          </span>
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {hit.matchType === 'title'
            ? t('globalSearch.titleMatch')
            : emphasise(hit.snippet, query)}
        </div>
      </div>
    </div>
  )
}
