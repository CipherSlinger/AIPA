import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  History,
  Search,
  Star,
  StarOff,
  Send,
  Trash2,
  Copy,
  Clock,
  TrendingUp,
  ChevronDown,
  X,
} from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { PromptHistoryItem } from '../../types/app.types'
import { useT } from '../../i18n'

const MAX_PROMPT_DISPLAY = 300

type SortMode = 'recent' | 'frequent' | 'alpha'

export default function PromptHistoryPanel() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToast = useUiStore(s => s.addToast)
  const addToQueue = useChatStore(s => s.addToQueue)

  const history: PromptHistoryItem[] = prefs.promptHistory || []

  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const sortLabels: Record<SortMode, string> = {
    recent: t('promptHistory.sortRecent'),
    frequent: t('promptHistory.sortFrequent'),
    alpha: t('promptHistory.sortAlpha'),
  }

  const cycleSortMode = useCallback(() => {
    setSortMode(prev => {
      const modes: SortMode[] = ['recent', 'frequent', 'alpha']
      const idx = modes.indexOf(prev)
      return modes[(idx + 1) % modes.length]
    })
  }, [])

  const filteredHistory = useMemo(() => {
    let items = history

    if (showFavoritesOnly) {
      items = items.filter(h => h.favorite)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(h => h.text.toLowerCase().includes(q))
    }

    // Sort
    if (sortMode === 'frequent') {
      items = [...items].sort((a, b) => b.count - a.count)
    } else if (sortMode === 'alpha') {
      items = [...items].sort((a, b) => a.text.localeCompare(b.text))
    } else {
      items = [...items].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    }

    return items
  }, [history, searchQuery, sortMode, showFavoritesOnly])

  const handleToggleFavorite = useCallback((id: string) => {
    const updated = history.map(h =>
      h.id === id ? { ...h, favorite: !h.favorite } : h
    )
    setPrefs({ promptHistory: updated })
  }, [history, setPrefs])

  const handleResend = useCallback((text: string) => {
    addToQueue(text)
    addToast('success', t('promptHistory.queued'))
  }, [addToQueue, addToast, t])

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      addToast('success', t('promptHistory.copied'))
    } catch {
      addToast('error', t('promptHistory.copyFailed'))
    }
  }, [addToast, t])

  const handleDelete = useCallback((id: string) => {
    setPrefs({ promptHistory: history.filter(h => h.id !== id) })
    addToast('info', t('promptHistory.deleted'))
  }, [history, setPrefs, addToast, t])

  const handleClearAll = useCallback(() => {
    if (history.length === 0) return
    setPrefs({ promptHistory: [] })
    addToast('info', t('promptHistory.cleared'))
  }, [history, setPrefs, addToast, t])

  const totalPrompts = useMemo(() =>
    history.reduce((sum, h) => sum + h.count, 0),
    [history]
  )

  const formatTimeAgo = (ts: number): string => {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('promptHistory.justNow')
    if (mins < 60) return t('promptHistory.minutesAgo').replace('{{n}}', String(mins))
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('promptHistory.hoursAgo').replace('{{n}}', String(hours))
    const days = Math.floor(hours / 24)
    return t('promptHistory.daysAgo').replace('{{n}}', String(days))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(59,130,246,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {t('promptHistory.title')}
            </span>
            <span style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 10,
              background: 'rgba(59,130,246,0.12)', color: 'var(--accent)',
              fontWeight: 500,
            }}>
              {history.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              title={t('promptHistory.favoritesOnly')}
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                background: showFavoritesOnly ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: showFavoritesOnly ? '#f59e0b' : 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Star size={14} />
            </button>
            <button
              onClick={cycleSortMode}
              title={sortLabels[sortMode]}
              style={{
                height: 28, borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                padding: '0 8px', fontSize: 10, fontWeight: 500,
              }}
            >
              <TrendingUp size={12} />
              {sortLabels[sortMode]}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
          <span>{t('promptHistory.uniquePrompts').replace('{{n}}', String(history.length))}</span>
          <span>{t('promptHistory.totalSent').replace('{{n}}', String(totalPrompts))}</span>
          <span>{t('promptHistory.favorites').replace('{{n}}', String(history.filter(h => h.favorite).length))}</span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('promptHistory.search')}
            style={{
              width: '100%', padding: '6px 8px 6px 26px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--input-field-bg)',
              color: 'var(--text-primary)', fontSize: 12, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filteredHistory.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', color: 'var(--text-muted)',
          }}>
            <History size={40} style={{ opacity: 0.3, marginBottom: 12, animation: 'wf-pulse 2s ease-in-out infinite' }} />
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {searchQuery || showFavoritesOnly ? t('promptHistory.noResults') : t('promptHistory.emptyState')}
            </div>
            {!searchQuery && !showFavoritesOnly && (
              <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.5, maxWidth: 220 }}>
                {t('promptHistory.emptyHint')}
              </div>
            )}
          </div>
        )}

        {filteredHistory.map(item => (
          <div
            key={item.id}
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                }}>
                  {item.text.length > MAX_PROMPT_DISPLAY
                    ? item.text.slice(0, MAX_PROMPT_DISPLAY) + '...'
                    : item.text
                  }
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} />
                    {formatTimeAgo(item.lastUsedAt)}
                  </span>
                  {item.count > 1 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <TrendingUp size={10} />
                      {t('promptHistory.usedCount').replace('{{n}}', String(item.count))}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginTop: 2 }}>
                <button
                  onClick={() => handleToggleFavorite(item.id)}
                  title={item.favorite ? t('promptHistory.unfavorite') : t('promptHistory.markFavorite')}
                  style={{
                    width: 24, height: 24, borderRadius: 4, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: item.favorite ? '#f59e0b' : 'var(--text-muted)',
                  }}
                >
                  {item.favorite ? <Star size={13} fill="#f59e0b" /> : <Star size={13} />}
                </button>
                <button
                  onClick={() => handleResend(item.text)}
                  title={t('promptHistory.resend')}
                  style={{
                    width: 24, height: 24, borderRadius: 4, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Send size={13} />
                </button>
                <button
                  onClick={() => handleCopy(item.text)}
                  title={t('promptHistory.copy')}
                  style={{
                    width: 24, height: 24, borderRadius: 4, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  title={t('promptHistory.delete')}
                  style={{
                    width: 24, height: 24, borderRadius: 4, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {t('promptHistory.footer')}
        </span>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{
              fontSize: 10, color: 'var(--text-muted)', border: 'none',
              background: 'transparent', cursor: 'pointer', padding: '2px 6px',
            }}
          >
            {t('promptHistory.clearAll')}
          </button>
        )}
      </div>
    </div>
  )
}
