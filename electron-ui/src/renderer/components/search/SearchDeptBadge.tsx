// The department a search row is filed under.
//
// Always renders something, because silence on this row reads as "belongs to no
// department". A resolved node gets a compact chip; a session that is listed
// but outside the org chart and a session missing from the local listing each
// say which of those two is true. A manual filing is marked as the user's own
// assertion — a label, not a claim about where the work ran — and a filing
// whose node was deleted shows the remembered name, never the folder instead.
//
// The tooltip carries the full tree path and the caveats: ownership comes from
// the working folder unless the user filed it by hand, the listing is this
// machine's, and search returns a capped slice.
import type { CSSProperties } from 'react'
import { Building2, HelpCircle, ListTodo, MapPinOff, PenLine } from 'lucide-react'
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

const CLIP: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export default function SearchDeptBadge({ attribution }: { attribution: DeptAttribution }) {
  const t = useT()

  if (attribution.state === 'attributed') {
    // A hand-picked node must not borrow the folder tooltip: it would claim
    // the conversation ran here and that the folder is why it is filed here. A
    // task-routed conversation has the same problem: its department may own no
    // folder at all, so it gets its own explanation.
    const filedByYou = attribution.filedBy === 'you'
    const filedByTask = attribution.filedBy === 'task'
    const title = filedByYou
      ? t('search.dept.filedByYouTip', {
        path: attribution.path,
        directory: attribution.directory ?? '',
      })
      : filedByTask
        ? t('globalSearch.dept.attributedTaskTitle', { path: attribution.path })
        : t('globalSearch.dept.attributedTitle', {
          path: attribution.path,
          directory: attribution.directory ?? '',
        })
    const ariaLabel = filedByYou
      ? `${t('globalSearch.dept.chipLabel', { name: attribution.label })} · ${t('search.dept.filedByYou')}`
      : filedByTask
        ? `${t('globalSearch.dept.chipLabel', { name: attribution.label })} · ${t('search.dept.filedByTask')}`
        : t('globalSearch.dept.chipLabel', { name: attribution.label })
    return (
      <span
        title={title}
        aria-label={ariaLabel}
        style={{
          ...BASE_STYLE,
          color: 'var(--accent-text)',
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.30)',
        }}
      >
        <Building2 size={9} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={CLIP}>
          {attribution.label}
        </span>
        {/* The only visual difference for a manual filing: a small hand icon
            after the name. The chip keeps its shape and colour. */}
        {filedByYou && (
          <PenLine size={8} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden="true" />
        )}
        {filedByTask && (
          <ListTodo size={8} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden="true" />
        )}
      </span>
    )
  }

  if (attribution.state === 'removed') {
    // Remembered, not live. It is neither a current department nor
    // "unaffiliated": the user did choose a node, that node is just gone.
    return (
      <span
        title={t('search.dept.removedTip', { name: attribution.label })}
        aria-label={t('search.dept.removed', { name: attribution.label })}
        style={{
          ...BASE_STYLE,
          color: 'var(--text-muted)',
          background: 'transparent',
          border: '1px dashed var(--border)',
        }}
      >
        <Building2 size={9} style={{ flexShrink: 0, opacity: 0.5 }} aria-hidden="true" />
        <span style={CLIP}>{attribution.label}</span>
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
      <span style={CLIP}>{label}</span>
    </span>
  )
}
