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
            padding: '4px 10px',
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              borderRadius: 10,
              padding: '0 8px',
              background: !activeTagFilter ? 'rgba(100,100,100,0.3)' : 'rgba(100,100,100,0.1)',
              border: `1px solid ${!activeTagFilter ? 'rgba(100,100,100,0.6)' : 'rgba(100,100,100,0.3)'}`,
              cursor: 'pointer',
              fontSize: 10,
              color: !activeTagFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: !activeTagFilter ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 20,
                  borderRadius: 10,
                  padding: '0 8px',
                  background: isActive ? `${tag.color}30` : `${tag.color}1a`,
                  border: `1px solid ${isActive ? `${tag.color}80` : `${tag.color}40`}`,
                  cursor: 'pointer',
                  fontSize: 10,
                  color: isActive ? tag.color : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                {getTagName(idx)}
                <span style={{ opacity: 0.6, fontSize: 9 }}>({count})</span>
              </button>
            )
          })}
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
            padding: '4px 10px',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
        >
          <button
            role="radio"
            aria-checked={!activeProjectFilter}
            onClick={() => onProjectFilterChange(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              borderRadius: 10,
              padding: '0 8px',
              background: !activeProjectFilter ? 'rgba(100,100,100,0.3)' : 'rgba(100,100,100,0.1)',
              border: `1px solid ${!activeProjectFilter ? 'rgba(100,100,100,0.6)' : 'rgba(100,100,100,0.3)'}`,
              cursor: 'pointer',
              fontSize: 10,
              color: !activeProjectFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: !activeProjectFilter ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 20,
                  borderRadius: 10,
                  padding: '0 8px',
                  background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.08)',
                  border: `1px solid ${isActive ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.25)'}`,
                  cursor: 'pointer',
                  fontSize: 10,
                  color: isActive ? '#3b82f6' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {shortName}
                <span style={{ opacity: 0.6, fontSize: 9 }}>({proj.count})</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
