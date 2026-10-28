// Global cross-session search.
//
// Mounted from App, not from ChatPanel: the shortcut works from every view,
// and the overlay must survive the view switch that opening a hit causes.
// Rows are grouped by project in the order the main process returned them
// (newest first), so the first group is always the most recently active work.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { SessionSearchResultData } from '../../../preload/index'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import { pushEscapeHandler } from '../ui/escapeStack'
import { useGlobalSessionSearch } from './useGlobalSessionSearch'
import { SearchResultRow } from './SearchResultRow'
import { revealSessionEvidence } from './revealSessionEvidence'

function projectLabel(project: string, fallback: string): string {
  if (!project) return fallback
  const parts = project.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || project
}

export default function GlobalSearchOverlay() {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const setOpen = useUiStore(s => s.setGlobalSearchOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openingRef = useRef(false)
  const { results, status, searchedQuery } = useGlobalSessionSearch(query)

  const close = useCallback(() => setOpen(false), [setOpen])

  useEffect(() => {
    inputRef.current?.focus()
    return pushEscapeHandler(close)
  }, [close])

  const groups = useMemo(() => {
    const map = new Map<string, SessionSearchResultData[]>()
    for (const hit of results) {
      const key = hit.project || ''
      const bucket = map.get(key)
      if (bucket) bucket.push(hit)
      else map.set(key, [hit])
    }
    return [...map.entries()].map(([project, items]) => ({ project, items }))
  }, [results])

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups])

  // A new result set always starts at the best hit.
  useEffect(() => { setActive(0) }, [results])
  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1))
  }, [flat.length, active])
  // The list scrolls inside a fixed-height box; keyboard navigation must keep
  // the selected row visible without moving the focused input.
  useEffect(() => {
    document.getElementById(`global-search-row-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const openHit = useCallback(async (hit: SessionSearchResultData) => {
    if (openingRef.current) return
    openingRef.current = true
    const searched = query.trim()
    close()
    const ok = await revealSessionEvidence(hit, searched)
    openingRef.current = false
    if (!ok) addToast('error', t('globalSearch.openFailed'))
  }, [addToast, close, query, t])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      if (flat.length === 0) return
      e.preventDefault()
      setActive(prev => (prev + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      if (flat.length === 0) return
      e.preventDefault()
      setActive(prev => (prev - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[active]
      if (hit) void openHit(hit)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const trimmed = query.trim()
  const showIdle = trimmed.length < 2
  const showLoading = status === 'loading' && trimmed.length >= 2
  const showEmpty = status === 'ready' && results.length === 0 && searchedQuery.length >= 2

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'gsearch-fade 0.15s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('globalSearch.title')}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          position: 'fixed',
          top: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          maxWidth: '92vw',
          maxHeight: '72vh',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'gsearch-slide 0.18s ease',
        }}
      >
        {/* Query */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            data-global-search-input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('globalSearch.placeholder')}
            aria-label={t('globalSearch.placeholder')}
            aria-controls="global-search-results"
            aria-activedescendant={flat.length > 0 ? `global-search-row-${active}` : undefined}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          {showLoading && (
            <Loader2
              size={14}
              style={{ color: 'var(--text-muted)', flexShrink: 0, animation: 'spin 1s linear infinite' }}
            />
          )}
          <button
            onClick={close}
            title={t('globalSearch.close')}
            aria-label={t('globalSearch.close')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div
          id="global-search-results"
          role="listbox"
          aria-label={t('globalSearch.title')}
          style={{
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
            minHeight: 120,
          }}
        >
          {showIdle && (
            <div style={EMPTY_STYLE}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('globalSearch.idle')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {t('globalSearch.idleHint')}
              </div>
            </div>
          )}

          {showLoading && results.length === 0 && (
            <div style={EMPTY_STYLE}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('globalSearch.loading')}</div>
            </div>
          )}

          {showEmpty && !showLoading && (
            <div style={EMPTY_STYLE}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('globalSearch.empty')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {t('globalSearch.emptyHint')}
              </div>
            </div>
          )}

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
                      key={`${hit.sessionId}-${hit.matchType}`}
                      hit={hit}
                      query={searchedQuery || trimmed}
                      index={index}
                      selected={index === active}
                      onHover={() => setActive(index)}
                      onOpen={() => void openHit(hit)}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Keyboard legend */}
        <div
          style={{
            padding: '7px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <span>{t('globalSearch.navHint')}</span>
          {results.length > 0 && (
            <span style={{ marginLeft: 'auto' }}>
              {t('globalSearch.resultsCount', { count: results.length })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_STYLE: React.CSSProperties = {
  padding: '28px 20px',
  textAlign: 'center',
}
