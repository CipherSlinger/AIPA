import React, { useState, useRef, useEffect } from 'react'
import type { WorkflowRun } from './useWorkflowHistory'
import { useT } from '../../i18n'

interface WorkflowRunHistoryProps {
  runs: WorkflowRun[]
  selectedRunId: string | null
  onSelect: (runId: string | null) => void
  onClear: () => void
}

function formatBriefTimestamp(epochMs: number): string {
  const d = new Date(epochMs)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  if (diffWk < 5) return `${diffWk}w ago`
  const diffMo = Math.floor(diffDay / 30)
  return `${diffMo}mo ago`
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function StatusBadge({ success }: { success?: boolean }) {
  if (success === undefined) {
    // running — spinning indigo indicator
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
        color: '#818cf8', background: 'rgba(99,102,241,0.15)',
        border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: 20, padding: '1px 8px',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{
          display: 'inline-block',
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(99,102,241,0.9)',
          boxShadow: '0 0 5px rgba(99,102,241,0.6)',
          animation: 'wf-run-pulse 1.2s ease-in-out infinite',
          flexShrink: 0,
        }} />
        RUN
      </span>
    )
  }
  return success ? (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
      color: '#4ade80', background: 'rgba(34,197,94,0.12)',
      border: '1px solid rgba(34,197,94,0.25)',
      borderRadius: 20, padding: '1px 8px',
    }}>
      OK
    </span>
  ) : (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
      color: '#f87171', background: 'rgba(239,68,68,0.12)',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 20, padding: '1px 8px',
    }}>
      ERR
    </span>
  )
}

// Direction D: Run summary card showing total time + per-step duration bar chart
function RunSummaryCard({ run }: { run: WorkflowRun }) {
  const t = useT()
  const totalMs = run.finishedAt - run.startedAt
  const durations = Object.entries(run.stepDurations)
  const maxDuration = durations.length > 0 ? Math.max(...durations.map(([, ms]) => ms)) : 0

  return (
    <div style={{
      background: 'rgba(8,8,16,0.80)',
      borderBottom: '1px solid var(--border)',
      padding: '8px 12px',
    }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {t('workflow.runSummary')}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: run.success ? '#4ade80' : '#f87171',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {formatDuration(totalMs)} {t('workflow.totalLabel')}
        </span>
      </div>

      {/* Per-step duration bar chart */}
      {durations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {durations.map(([stepId, ms]) => {
            const pct = maxDuration > 0 ? (ms / maxDuration) * 100 : 0
            const label = run.stepTitles?.[stepId] ?? stepId.slice(0, 20)
            return (
              <div key={stepId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                    {formatDuration(ms)}
                  </span>
                </div>
                <div style={{ height: 3, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, rgba(99,102,241,0.70), rgba(139,92,246,0.55))',
                    borderRadius: 2,
                    transition: 'all 0.15s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function WorkflowRunHistory({
  runs,
  selectedRunId,
  onSelect,
  onClear,
}: WorkflowRunHistoryProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const isReplay = selectedRunId !== null
  const activeRun = selectedRunId ? runs.find(r => r.runId === selectedRunId) : null

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', userSelect: 'none' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title={t('workflow.executionHistory')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          background: isReplay
            ? 'rgba(99,102,241,0.18)'
            : 'var(--bg-secondary)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: isReplay
            ? '1px solid rgba(99,102,241,0.5)'
            : '1px solid var(--border)',
          borderRadius: 6,
          cursor: 'pointer',
          color: isReplay ? '#818cf8' : 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 500,
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => {
          if (!isReplay) { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.borderColor = 'var(--border)' }
        }}
        onMouseLeave={e => {
          if (!isReplay) { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.borderColor = 'var(--border)' }
        }}
      >
        <span style={{ fontSize: 12 }}>&#128336;</span>
        {isReplay && activeRun
          ? formatBriefTimestamp(activeRun.startedAt)
          : runs.length > 0 ? `${t('workflow.history')} (${runs.length})` : t('workflow.history')}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            minWidth: 240,
            background: 'rgba(14,14,24,0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
            zIndex: 100,
            overflow: 'hidden',
            animation: 'wf-history-in 0.15s ease-out',
          }}
        >
          <style>{`
            @keyframes wf-history-in {
              from { opacity: 0; transform: translateY(6px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(6px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes wf-run-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50%       { opacity: 0.4; transform: scale(0.7); }
            }
            .wf-history-scroll::-webkit-scrollbar { width: 4px; }
            .wf-history-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
          `}</style>

          {/* Section header */}
          <div style={{
            padding: '7px 12px 5px',
            borderBottom: '1px solid var(--bg-hover)',
            borderLeft: '2px solid rgba(99,102,241,0.5)',
            paddingLeft: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.07em',
              textTransform: 'uppercase' as const,
              color: 'var(--text-muted)',
            }}>
              {t('workflow.history')}
            </span>
            {runs.length > 0 && (
              <span style={{
                fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {runs.length} {runs.length === 1 ? 'run' : 'runs'}
              </span>
            )}
          </div>

          {/* Current execution option */}
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '7px 12px',
              background: selectedRunId === null ? 'rgba(99,102,241,0.12)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--bg-hover)',
              cursor: 'pointer',
              color: selectedRunId === null ? '#818cf8' : 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 600,
              textAlign: 'left',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { if (selectedRunId !== null) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (selectedRunId !== null) e.currentTarget.style.background = 'transparent' }}
          >
            <span>{t('workflow.currentExecution')}</span>
            {selectedRunId === null && (
              <span style={{ fontSize: 9, opacity: 0.7 }}>{t('workflow.activeLabel')}</span>
            )}
          </button>

          {/* Direction D: Summary card for selected run */}
          {activeRun && <RunSummaryCard run={activeRun} />}

          {/* History items */}
          {runs.length === 0 ? (
            <div style={{
              padding: '28px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              textAlign: 'center',
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 16,
                padding: 16,
                fontSize: 22,
                lineHeight: 1,
              }}>
                🕐
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('workflow.noHistory')}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Run this workflow to see history here
              </span>
            </div>
          ) : (() => {
            const maxRunDuration = Math.max(...runs.map(r => r.finishedAt - r.startedAt), 1)
            return (
              <div className="wf-history-scroll" style={{ maxHeight: 210, overflowY: 'auto', scrollbarWidth: 'thin' }}>
                {runs.map(run => {
                  const runDurationMs = run.finishedAt - run.startedAt
                  const durationPct = (runDurationMs / maxRunDuration) * 100
                  const stepCount = Object.keys(run.stepDurations || {}).length
                  const isSelected = selectedRunId === run.runId
                  return (
                    <button
                      key={run.runId}
                      onClick={() => { onSelect(run.runId); setOpen(false) }}
                      title={formatBriefTimestamp(run.startedAt)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 0,
                        background: isSelected
                          ? 'rgba(99,102,241,0.1)'
                          : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: run.success === undefined
                          ? '3px solid rgba(99,102,241,0.6)'
                          : run.success
                            ? '3px solid rgba(34,197,94,0.6)'
                            : '3px solid rgba(239,68,68,0.6)',
                        cursor: 'pointer',
                        color: isSelected ? '#818cf8' : 'var(--text-secondary)',
                        fontSize: 10,
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected)
                          e.currentTarget.style.background = 'var(--bg-hover)'
                      }}
                      onMouseLeave={e => {
                        if (!isSelected)
                          e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {/* Top row: relative time + badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: 11, flexShrink: 0, color: isSelected ? '#818cf8' : 'var(--text-primary)' }}>
                            {formatRelativeTime(run.startedAt)}
                          </span>
                          <span style={{
                            fontSize: 9, color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                            fontFeatureSettings: '"tnum"',
                          }}>
                            {formatBriefTimestamp(run.startedAt)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          {stepCount > 0 && (
                            <span style={{
                              fontSize: 9,
                              color: 'var(--text-muted)',
                              background: 'var(--bg-hover)',
                              borderRadius: 10,
                              padding: '1px 5px',
                              fontWeight: 600,
                            }}>
                              {stepCount}s
                            </span>
                          )}
                          <span style={{
                            color: 'var(--text-muted)', fontSize: 11,
                            fontVariantNumeric: 'tabular-nums',
                            fontFeatureSettings: '"tnum"',
                          }}>
                            {formatDuration(runDurationMs)}
                          </span>
                          <StatusBadge success={run.success} />
                        </div>
                      </div>
                      {/* Duration bar */}
                      <div style={{ height: 3, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${durationPct}%`,
                          background: run.success
                            ? (isSelected ? '#818cf8' : 'rgba(34,197,94,0.55)')
                            : 'rgba(248,113,113,0.55)',
                          borderRadius: 2,
                          transition: 'all 0.15s ease',
                        }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Clear history */}
          {runs.length > 0 && (
            <button
              onClick={() => { onClear(); onSelect(null); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid var(--bg-hover)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 9,
                textAlign: 'center',
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
                e.currentTarget.style.color = '#f87171'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              {t('workflow.clearHistory')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
