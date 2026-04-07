import React, { useState, useRef, useEffect } from 'react'
import type { WorkflowRun } from './useWorkflowHistory'

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

export default function WorkflowRunHistory({
  runs,
  selectedRunId,
  onSelect,
  onClear,
}: WorkflowRunHistoryProps) {
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
        title="Execution history"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          background: isReplay
            ? 'rgba(var(--accent-rgb, 59,130,246), 0.18)'
            : 'rgba(var(--bg-card-rgb, 30,30,30), 0.85)',
          backdropFilter: 'blur(6px)',
          border: isReplay
            ? '1px solid rgba(var(--accent-rgb, 59,130,246), 0.5)'
            : '1px solid var(--border)',
          borderRadius: 5,
          cursor: 'pointer',
          color: isReplay ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 500,
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => {
          if (!isReplay) e.currentTarget.style.background = 'rgba(var(--bg-card-rgb,30,30,30),0.95)'
        }}
        onMouseLeave={e => {
          if (!isReplay) e.currentTarget.style.background = 'rgba(var(--bg-card-rgb,30,30,30),0.85)'
        }}
      >
        <span style={{ fontSize: 12 }}>&#128336;</span>
        {isReplay && activeRun
          ? formatBriefTimestamp(activeRun.startedAt)
          : runs.length > 0
          ? `History (${runs.length})`
          : 'History'}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            minWidth: 200,
            background: 'rgba(var(--bg-card-rgb, 24,24,27), 0.97)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* Current execution option */}
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '6px 10px',
              background: selectedRunId === null ? 'rgba(var(--accent-rgb,59,130,246),0.12)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              color: selectedRunId === null ? 'var(--accent)' : 'var(--text)',
              fontSize: 10,
              fontWeight: 600,
              textAlign: 'left',
              gap: 6,
            }}
          >
            <span>Current execution</span>
            {selectedRunId === null && (
              <span style={{ fontSize: 9, opacity: 0.7 }}>active</span>
            )}
          </button>

          {/* History items */}
          {runs.length === 0 ? (
            <div style={{
              padding: '8px 10px',
              fontSize: 10,
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              No history yet
            </div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {runs.map(run => (
                <button
                  key={run.runId}
                  onClick={() => { onSelect(run.runId); setOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '5px 10px',
                    background: selectedRunId === run.runId
                      ? 'rgba(var(--accent-rgb,59,130,246),0.1)'
                      : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(var(--border-rgb,60,60,60),0.4)',
                    cursor: 'pointer',
                    color: selectedRunId === run.runId ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 10,
                    textAlign: 'left',
                    gap: 6,
                  }}
                  onMouseEnter={e => {
                    if (selectedRunId !== run.runId)
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={e => {
                    if (selectedRunId !== run.runId)
                      e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatBriefTimestamp(run.startedAt)}
                  </span>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 9,
                    fontWeight: 600,
                    color: run.success ? '#22c55e' : '#f87171',
                    background: run.success ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}>
                    {run.success ? 'OK' : 'ERR'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Clear history */}
          {runs.length > 0 && (
            <button
              onClick={() => { onClear(); onSelect(null); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 10px',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 9,
                textAlign: 'center',
                fontWeight: 500,
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
              Clear history
            </button>
          )}
        </div>
      )}
    </div>
  )
}
