/**
 * Cross-tier search results. The tab strip above stays mounted and shows the
 * per-tier counts; this list groups hits in the same tab order so a row's
 * section is the tier it will open.
 */
import React, { useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, FileText, RefreshCw, Search } from 'lucide-react'
import {
  MEMORY_TIER_LABEL_KEYS,
  isMemorySearchEmpty,
  type MemorySearchHit,
  type MemoryTierSearchGroup,
} from './memorySearch'
import { HighlightedText } from './MemoryHighlight'

type Translate = (key: string, params?: Record<string, string | number>) => string

interface Props {
  query: string
  groups: readonly MemoryTierSearchGroup[]
  selectedIndex: number
  onSelect: (index: number) => void
  onOpen: (hit: MemorySearchHit) => void
  t: Translate
}

export default function MemorySearchResults({
  query,
  groups,
  selectedIndex,
  onSelect,
  onOpen,
  t,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  const indexedGroups = useMemo(() => {
    let index = 0
    return groups.map(group => ({
      ...group,
      rows: group.hits.map(hit => ({ hit, index: index++ })),
    }))
  }, [groups])

  // Arrow keys move the selection while the input keeps focus; keep the
  // selected row in view without stealing focus from the field.
  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        ref={listRef}
        role="listbox"
        aria-label={t('memory.searchAllPlaceholder')}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2px 0 8px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border) transparent',
        }}
      >
        {indexedGroups.map(group => {
          const hasHits = group.rows.length > 0
          // A ready tier with zero hits would just be noise between the
          // sections that do have something to show.
          if (!hasHits && group.state === 'ready') return null
          return (
            <div key={group.tier}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px 3px',
              }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}>
                  {t(MEMORY_TIER_LABEL_KEYS[group.tier])}
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: group.state === 'error'
                    ? 'var(--danger-text)'
                    : group.state === 'loading' ? 'var(--text-muted)' : 'var(--accent-text)',
                  background: group.state === 'error'
                    ? 'rgba(239,68,68,0.12)'
                    : group.state === 'loading' ? 'var(--border)' : 'rgba(99,102,241,0.14)',
                  borderRadius: 8,
                  padding: '0 5px',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {group.state === 'loading'
                    ? '…'
                    : group.state === 'error' && group.rows.length === 0 ? '!' : group.rows.length}
                </span>
              </div>

              {group.state === 'loading' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 12px 7px',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}>
                  <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  {t('memory.searchLoadingTier', { tier: t(MEMORY_TIER_LABEL_KEYS[group.tier]) })}
                </div>
              )}

              {group.state === 'error' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 5,
                  margin: '0 8px 6px',
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.18)',
                  color: 'var(--danger-text)',
                  fontSize: 10,
                  lineHeight: 1.45,
                }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <span style={{ fontWeight: 600 }}>
                      {t('memory.searchTierUnavailable', { tier: t(MEMORY_TIER_LABEL_KEYS[group.tier]) })}
                    </span>
                    {' '}
                    {t('memory.searchTierUnavailableHint')}
                  </span>
                </div>
              )}

              {group.rows.map(({ hit, index }) => {
                const selected = index === selectedIndex
                // Personal facts use their first line as both title and body;
                // printing the same text twice would imply two matches.
                const showSnippet = hit.snippet.trim().length > 0 &&
                  hit.snippet.trim() !== hit.title.trim()
                return (
                  <button
                    key={`${hit.tier}-${hit.documentId}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onOpen(hit)}
                    onMouseEnter={() => onSelect(index)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderLeft: selected
                        ? '2px solid rgba(99,102,241,0.60)'
                        : '2px solid transparent',
                      background: selected ? 'rgba(99,102,241,0.14)' : 'transparent',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.12s ease, border-color 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        display: 'flex',
                        flexShrink: 0,
                        color: selected ? 'var(--accent-text)' : 'var(--text-muted)',
                      }}>
                        {hit.matchedTitle ? <Search size={12} /> : <FileText size={12} />}
                      </span>
                      <span style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        fontWeight: 500,
                        color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        <HighlightedText
                          text={hit.title || hit.documentId}
                          ranges={hit.titleRanges}
                        />
                      </span>
                      {hit.source && hit.source !== hit.title && (
                        <span
                          title={hit.source}
                          style={{
                            flexShrink: 0,
                            maxWidth: '45%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 9,
                            fontFamily: 'monospace',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {hit.source}
                        </span>
                      )}
                    </div>
                    {showSnippet && (
                      <div style={{
                        marginTop: 2,
                        paddingLeft: 18,
                        fontSize: 11,
                        lineHeight: 1.45,
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        <HighlightedText text={hit.snippet} ranges={hit.snippetRanges} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}

        {isMemorySearchEmpty(groups) && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}>
            <Search size={24} style={{ opacity: 0.35 }} />
            <span style={{ fontSize: 12 }}>
              {t('memory.searchEmpty', { query })}
            </span>
            <span style={{ fontSize: 10, opacity: 0.75, padding: '0 20px' }}>
              {t('memory.searchEmptyHint')}
            </span>
          </div>
        )}
      </div>

      <div style={{
        flexShrink: 0,
        padding: '4px 12px',
        borderTop: '1px solid var(--border)',
        fontSize: 9,
        color: 'var(--text-muted)',
      }}>
        {t('memory.searchKeyboard')}
      </div>
      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}
