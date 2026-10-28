// The department a search row is filed under.
//
// Always renders something, because silence on this row reads as "belongs to no
// department". A resolved node gets a compact chip; a session that is listed
// but outside the org chart and a session missing from the local listing each
// say which of those two is true. The tooltip carries the full tree path and
// the caveats: ownership comes from the working folder (not from who did the
// work), the listing is this machine's, and search returns a capped slice.
import type { CSSProperties } from 'react'
import { Building2, HelpCircle, MapPinOff } from 'lucide-react'
import { useT } from '../../i18n'
import type { DeptAttribution } from './searchDeptAttribution'

const BASE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  maxWidth: 170,
  boxSizing: 'border-box',
  padding: '0 6px',
  borderRadius: 999,
  lineHeight: '15px',
  fontSize: 9,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
}

export default function SearchDeptBadge({ attribution }: { attribution: DeptAttribution }) {
  const t = useT()

  if (attribution.state === 'attributed') {
    const title = t('globalSearch.dept.attributedTitle', {
      path: attribution.path,
      directory: attribution.directory,
    })
    return (
      <span
        title={title}
        aria-label={t('globalSearch.dept.chipLabel', { name: attribution.label })}
        style={{
          ...BASE_STYLE,
          color: 'var(--accent-text)',
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.30)',
        }}
      >
        <Building2 size={9} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {attribution.label}
        </span>
      </span>
    )
  }

  const unlisted = attribution.state === 'unlisted'
  const label = unlisted ? t('globalSearch.dept.unlisted') : t('globalSearch.dept.unaffiliated')
  return (
    <span
      title={t(unlisted ? 'globalSearch.dept.unlistedTitle' : 'globalSearch.dept.unaffiliatedTitle')}
      style={{
        ...BASE_STYLE,
        color: 'var(--text-muted)',
        background: 'transparent',
        border: '1px dashed var(--border)',
        maxWidth: 130,
      }}
    >
      {unlisted
        ? <HelpCircle size={9} style={{ flexShrink: 0 }} aria-hidden="true" />
        : <MapPinOff size={9} style={{ flexShrink: 0 }} aria-hidden="true" />}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  )
}
