import React from 'react'
import { useT } from '../../i18n'
import { TAG_PRESETS } from './sessionUtils'

interface SessionFiltersProps {
  // Tag filter
  sessionTags: Record<string, string[]>
  tagNames: string[]
  activeTagFilter: string | null
  onTagFilterChange: (tagId: string | null) => void
  // Project filter
  uniqueProjects: { name: string; count: number }[]
  activeProjectFilter: string | null
  onProjectFilterChange: (project: string | null) => void
}

export default function SessionFilters({
  sessionTags,
  tagNames,
  activeTagFilter,
  onTagFilterChange,
  uniqueProjects,
  activeProjectFilter,
  onProjectFilterChange,
}: SessionFiltersProps) {
  const t = useT()
  const hasAnyTags = Object.keys(sessionTags).length > 0
  const hasMultipleProjects = uniqueProjects.length > 1
  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  // Count sessions per tag
  const tagCounts = TAG_PRESETS.reduce<Record<string, number>>((acc, tag) => {
    acc[tag.id] = Object.values(sessionTags).filter(tags => tags.includes(tag.id)).length
    return acc
  }, {})

  // Shared chip style factory
  const chipStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 22,
    borderRadius: 20,
    padding: '0 10px',
    background: isActive
      ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
      : 'rgba(255,255,255,0.06)',
    border: isActive
      ? '1px solid rgba(99,102,241,0.45)'
      : '1px solid rgba(255,255,255,0.09)',
    cursor: 'pointer',
    fontSize: 11,
    color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.60)',
    fontWeight: isActive ? 600 : 400,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    transition: 'all 0.15s ease',
    boxShadow: isActive ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
  })

  const chipHoverEnter = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
    if (!isActive) {
      e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
      e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'
    }
  }

  const chipHoverLeave = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
    if (!isActive) {
      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
    }
  }

  return (
    <>
      {/* Tag filter bar */}
      {hasAnyTags && (
        <div
          role="radiogroup"
          aria-label={t('tags.assign')}
          style={{
            display: 'flex',
            gap: 6,
            padding: '6px 8px',
            flexWrap: 'wrap',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
        >
          {/* "All" chip — always first */}
          <button
            role="radio"
            aria-checked={!activeTagFilter}
            onClick={() => onTagFilterChange(null)}
            style={chipStyle(!activeTagFilter)}
            onMouseEnter={e => chipHoverEnter(e, !activeTagFilter)}
            onMouseLeave={e => chipHoverLeave(e, !activeTagFilter)}
          >
            {t('session.tagFilterAll')}
          </button>
          {TAG_PRESETS.map((tag, idx) => {
            const count = tagCounts[tag.id] || 0
            if (count === 0) return null
            const isActive = activeTagFilter === tag.id
            return (
              <button
                key={tag.id}
                role="radio"
                aria-checked={isActive}
                onClick={() => onTagFilterChange(isActive ? null : tag.id)}
                style={chipStyle(isActive)}
                onMouseEnter={e => chipHoverEnter(e, isActive)}
                onMouseLeave={e => chipHoverLeave(e, isActive)}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                {getTagName(idx)}
                <span style={{
                  opacity: isActive ? 0.75 : 0.55,
                  fontSize: 9,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                }}>({count})</span>
              </button>
            )
          })}
          {/* Clear tag filter — shown only when a tag is active */}
          {activeTagFilter && (
            <button
              onClick={() => onTagFilterChange(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)',
                padding: '0 4px',
                transition: 'all 0.15s ease',
                flexShrink: 0,
                borderRadius: 6,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.60)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
            >
              {t('session.clearFilter') || '×'}
            </button>
          )}
        </div>
      )}

      {/* Project filter bar */}
      {hasMultipleProjects && (
        <div
          role="radiogroup"
          aria-label={t('session.projectFilter')}
          style={{
            display: 'flex',
            gap: 6,
            padding: '6px 8px',
            flexWrap: 'wrap',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
        >
          <button
            role="radio"
            aria-checked={!activeProjectFilter}
            onClick={() => onProjectFilterChange(null)}
            style={chipStyle(!activeProjectFilter)}
            onMouseEnter={e => chipHoverEnter(e, !activeProjectFilter)}
            onMouseLeave={e => chipHoverLeave(e, !activeProjectFilter)}
          >
            {t('session.allProjects')}
          </button>
          {uniqueProjects.map(proj => {
            const isActive = activeProjectFilter === proj.name
            const shortName = proj.name.split(/[/\\]/).pop() || proj.name
            return (
              <button
                key={proj.name}
                role="radio"
                aria-checked={isActive}
                onClick={() => onProjectFilterChange(isActive ? null : proj.name)}
                title={proj.name}
                style={{
                  ...chipStyle(isActive),
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => chipHoverEnter(e, isActive)}
                onMouseLeave={e => chipHoverLeave(e, isActive)}
              >
                {shortName}
                <span style={{
                  opacity: isActive ? 0.75 : 0.55,
                  fontSize: 9,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                }}>({proj.count})</span>
              </button>
            )
          })}
          {/* Clear project filter */}
          {activeProjectFilter && (
            <button
              onClick={() => onProjectFilterChange(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)',
                padding: '0 4px',
                transition: 'all 0.15s ease',
                flexShrink: 0,
                borderRadius: 6,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.60)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
            >
              {t('session.clearFilter') || '×'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
