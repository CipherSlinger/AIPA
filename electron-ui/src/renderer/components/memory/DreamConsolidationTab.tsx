/**
 * DreamConsolidationTab — review and control background memory passes.
 *
 * The list is the pass log kept by the main process, not a filesystem scan:
 * a pass that found nothing (or could not reach a model) still appears here,
 * which is the only way the user can tell "nothing to remember" from "never
 * ran". Deleting a written pass removes exactly the file that pass created.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Moon, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'
import type { DreamPassData, DreamStatusData } from '../../../preload/index'
import { HighlightedText, scrollToFirstHighlight } from './MemoryHighlight'
import { findHighlightRanges, type MemoryOpenFocus } from './memorySearch'

const STATUS_COLORS: Record<DreamPassData['status'], string> = {
  written: '#4ade80',
  empty: '#94a3b8',
  junk: '#fbbf24',
  unavailable: '#fb923c',
  error: '#f87171',
}

const STATUS_KEYS: Record<DreamPassData['status'], string> = {
  written: 'dream.statusWritten',
  empty: 'dream.statusEmpty',
  junk: 'dream.statusJunk',
  unavailable: 'dream.statusUnavailable',
  error: 'dream.statusError',
}

function fileNameOf(filePath: string): string {
  if (!filePath) return ''
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

export default function DreamConsolidationTab({
  focus,
}: {
  focus?: Pick<MemoryOpenFocus, 'documentId' | 'query' | 'nonce'>
}) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const enabled = prefs.dreamConsolidationEnabled !== false

  const [passes, setPasses] = useState<DreamPassData[]>([])
  const [status, setStatus] = useState<DreamStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, nextStatus] = await Promise.all([
        window.electronAPI.memoryDreamList(),
        window.electronAPI.memoryDreamStatus(),
      ])
      setPasses(Array.isArray(list) ? list : [])
      setStatus(nextStatus && !('error' in nextStatus) ? nextStatus : null)
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // A search hit names a pass; open its statements so the match is visible.
  useEffect(() => {
    if (!focus?.documentId) return
    setExpanded(focus.documentId)
  }, [focus?.documentId, focus?.nonce])

  useEffect(() => {
    if (!focus?.query || expanded !== focus.documentId) return
    const frame = requestAnimationFrame(() => {
      const selector = `[data-dream-pass="${encodeURIComponent(focus.documentId)}"]`
      const element = listRef.current?.querySelector<HTMLElement>(selector) ?? null
      element?.scrollIntoView({ block: 'center' })
      scrollToFirstHighlight(element)
    })
    return () => cancelAnimationFrame(frame)
  }, [focus?.nonce, focus?.query, focus?.documentId, expanded, passes.length])

  // A scheduled pass can complete while the console is open. Prepending the
  // record here keeps the list live without polling the store file.
  useEffect(() => {
    return window.electronAPI.onMemoryDreamPass(record => {
      setPasses(current => {
        if (current.some(row => row.id === record.id)) return current
        return [record, ...current].slice(0, 50)
      })
      setStatus(current => current
        ? { ...current, passes: current.passes + 1, running: false }
        : current)
    })
  }, [])

  const toggle = () => {
    const next = !enabled
    setPrefs({ dreamConsolidationEnabled: next })
    window.electronAPI.prefsSet('dreamConsolidationEnabled', next)
    setNotice(null)
    setError(null)
  }

  const runNow = async () => {
    if (running) return
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.electronAPI.memoryDreamRunNow()
      if (!result.ok) {
        const reason = result.error || ''
        if (reason === 'disabled') setError(t('dream.disabled'))
        else if (reason === 'busy' || reason === 'running') setError(t('dream.busy'))
        else if (reason === 'no-session') setError(t('dream.noSession'))
        else if (reason === 'nothing-to-do') setNotice(t('dream.emptyResult'))
        else setError(t('dream.error'))
      } else if (result.record) {
        const record = result.record
        if (record.status === 'written') {
          setNotice(t('dream.writtenNow', { count: record.entryCount }))
        } else if (record.status === 'unavailable') {
          setError(t('dream.unavailable'))
        } else if (record.status === 'junk') {
          setError(t('dream.junk'))
        } else if (record.status === 'error') {
          setError(t('dream.error'))
        } else {
          setNotice(t('dream.emptyResult'))
        }
      }
      await load()
    } catch (err) {
      setError(String(err))
    }
    setRunning(false)
  }

  const remove = async (record: DreamPassData) => {
    if (!window.confirm(t('dream.deleteConfirm'))) return
    setError(null)
    try {
      const result = await window.electronAPI.memoryDreamDelete(record.id)
      if (!result.ok) {
        setError(String(result.error || t('dream.error')))
        return
      }
      setPasses(current => current.filter(row => row.id !== record.id))
      setNotice(t('dream.deleted'))
    } catch (err) {
      setError(String(err))
    }
  }

  const pendingLabel = useMemo(() => {
    if (!status) return ''
    return t('dream.pending', { count: status.pendingSessions })
  }, [status, t])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Feature switch */}
      <div style={{
        padding: '8px 12px 6px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Moon size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('dream.enabled')}
            </div>
            {status && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
                {pendingLabel}
              </div>
            )}
          </div>
          <button
            onClick={toggle}
            role="switch"
            aria-checked={enabled}
            aria-label={t('dream.enabled')}
            title={enabled ? t('dream.disable') : t('dream.enable')}
            style={{
              width: 30,
              height: 17,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              position: 'relative',
              background: enabled ? 'rgba(99,102,241,0.7)' : 'var(--border)',
              transition: 'background 0.15s ease',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 2,
              left: enabled ? 15 : 2,
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s ease',
              display: 'block',
            }} />
          </button>
        </div>

        <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('dream.enabledHint')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={runNow}
            disabled={!enabled || running}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: enabled ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
              border: `1px solid ${enabled ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
              borderRadius: 6,
              color: enabled ? 'var(--accent-text)' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 600,
              cursor: enabled && !running ? 'pointer' : 'not-allowed',
              padding: '3px 9px',
              opacity: enabled ? 1 : 0.6,
            }}
          >
            {running
              ? <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
              : <Play size={10} />}
            {running ? t('dream.running') : t('dream.runNow')}
          </button>
          <button
            onClick={load}
            title={t('common.refresh')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '5px 12px', fontSize: 10, color: '#fca5a5',
          background: 'rgba(239,68,68,0.08)', flexShrink: 0,
          display: 'flex', alignItems: 'flex-start', gap: 5,
        }}>
          <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div style={{
          padding: '5px 12px', fontSize: 10, color: 'var(--accent-text)',
          background: 'rgba(99,102,241,0.08)', flexShrink: 0,
        }}>
          {notice}
        </div>
      )}

      {/* Pass log */}
      <div style={{ padding: '6px 12px 2px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', flexShrink: 0 }}>
        {t('dream.recent')}
      </div>

      <div ref={listRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 8px 8px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}>
        {loading && passes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, color: 'var(--text-muted)', fontSize: 11 }}>
            <RefreshCw size={13} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
            {t('common.loading')}
          </div>
        ) : passes.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '28px 18px', textAlign: 'center', color: 'var(--text-muted)', gap: 6,
          }}>
            <Moon size={24} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12 }}>{t('dream.empty')}</span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>{t('dream.emptyHint')}</span>
          </div>
        ) : passes.map(record => {
          const color = STATUS_COLORS[record.status] || 'var(--text-muted)'
          const isOpen = expanded === record.id
          const file = fileNameOf(record.filePath)
          return (
            <div key={record.id} data-dream-pass={encodeURIComponent(record.id)} style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${color}`,
              borderRadius: 8,
              marginBottom: 5,
              overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(isOpen ? null : record.id)}
                style={{ padding: '6px 9px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: color,
                  flexShrink: 0, boxShadow: `0 0 5px ${color}80`,
                }} />
                <span style={{ fontSize: 10, fontWeight: 600, color }}>{t(STATUS_KEYS[record.status])}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(record.createdAt).toLocaleString()}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {record.status === 'written'
                    ? t('dream.entries', { count: record.entryCount })
                    : t(record.trigger === 'manual' ? 'dream.triggerManual' : 'dream.triggerIdle')}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); void remove(record) }}
                  title={t('dream.delete')}
                  aria-label={t('dream.delete')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 2, display: 'flex',
                    alignItems: 'center', flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <Trash2 size={11} />
                </button>
              </div>

              <div style={{ padding: '0 9px 6px', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span title={record.sessionId}>
                  {t('dream.session', { id: record.sessionId.slice(0, 8) })}
                </span>
                {file && <span title={record.filePath}>{file}</span>}
                {record.note && (
                  <span>
                    {focus?.query
                      ? <HighlightedText text={record.note} ranges={findHighlightRanges(record.note, focus.query)} />
                      : record.note}
                  </span>
                )}
              </div>

              {isOpen && record.statements.length > 0 && (
                <div style={{
                  padding: '4px 9px 8px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}>
                  {record.statements.map((statement, index) => (
                    <div key={index} style={{
                      fontSize: 10,
                      lineHeight: 1.5,
                      color: 'var(--text-secondary)',
                      paddingLeft: 8,
                      borderLeft: '2px solid var(--border)',
                    }}>
                      {focus?.query
                        ? <HighlightedText text={statement} ranges={findHighlightRanges(statement, focus.query)} />
                        : statement}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', flexShrink: 0, lineHeight: 1.5 }}>
        {t('dream.footer')}
      </div>

      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}
