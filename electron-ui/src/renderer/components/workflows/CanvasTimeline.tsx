// CanvasTimeline — P4.3: Gantt-style execution timeline panel for WorkflowCanvas
// Fixed at canvas bottom as a flex row sibling; shows per-step duration bars
// relative to the longest step (maxDuration approach).

import React, { useMemo } from 'react'
import { X } from 'lucide-react'
import type { StepStatus } from './useWorkflowExecution'
import type { WorkflowStep } from '../../types/app.types'

export interface CanvasTimelineProps {
  steps: WorkflowStep[]
  stepDurations: Record<string, number>   // stepId -> ms
  stepStatuses: Record<string, StepStatus>
  stepOutputs: Record<string, string>
  onClose: () => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getBarColor(status: StepStatus): string {
  switch (status) {
    case 'completed': return 'var(--color-success, #22c55e)'
    case 'error':     return 'var(--color-error, #f87171)'
    case 'running':   return 'var(--accent, #6366f1)'
    default:          return 'var(--border-strong, #374151)'
  }
}

export default function CanvasTimeline({
  steps,
  stepDurations,
  stepStatuses,
  stepOutputs: _stepOutputs,
  onClose,
}: CanvasTimelineProps) {
  // Filter to steps that have actually run (duration > 0)
  const validSteps = useMemo(
    () => steps.filter(s => (stepDurations[s.id] ?? 0) > 0),
    [steps, stepDurations]
  )

  const maxDuration = useMemo(
    () => validSteps.length > 0 ? Math.max(...validSteps.map(s => stepDurations[s.id])) : 1,
    [validSteps, stepDurations]
  )

  const totalMs = useMemo(
    () => validSteps.reduce((sum, s) => sum + stepDurations[s.id], 0),
    [validSteps, stepDurations]
  )

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        height: 120,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Title bar — 28px */}
      <div
        style={{
          height: 28,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          Execution Timeline
        </span>
        {totalMs > 0 && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            background: 'var(--bg-hover)',
            borderRadius: 8,
            padding: '1px 6px',
            border: '1px solid var(--border)',
          }}>
            total: {formatDuration(totalMs)}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          aria-label="Close timeline"
          title="Close timeline"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 14,
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Gantt chart area — flex-1 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {validSteps.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            No completed steps yet
          </div>
        ) : (
          <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {validSteps.map(step => {
              const dur = stepDurations[step.id]
              const status = stepStatuses[step.id] ?? 'idle'
              const widthPct = (dur / maxDuration) * 100
              const barColor = getBarColor(status)
              const isRunning = status === 'running'
              const stepNum = steps.findIndex(s => s.id === step.id) + 1

              return (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: 22,
                    gap: 0,
                  }}
                >
                  {/* Left label column — fixed 80px */}
                  <div
                    style={{
                      width: 80,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      paddingRight: 6,
                    }}
                  >
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      background: 'var(--border)',
                      borderRadius: 8,
                      padding: '1px 4px',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {String(stepNum).padStart(2, '0')}
                    </span>
                    <span
                      title={step.title}
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {step.title}
                    </span>
                  </div>

                  {/* Bar track */}
                  <div style={{ flex: 1, position: 'relative', height: 10, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                    {/* Actual duration bar */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${widthPct}%`,
                        background: barColor,
                        borderRadius: 4,
                        opacity: isRunning ? 0.9 : 0.75,
                        transition: 'width 0.3s ease',
                        minWidth: 4,
                      }}
                    />
                    {/* Running shimmer */}
                    {isRunning && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
                          backgroundSize: '200% 100%',
                          animation: 'canvas-bar-shimmer 1.2s ease-in-out infinite',
                        }}
                      />
                    )}
                  </div>

                  {/* Duration label — right side */}
                  <span style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    marginLeft: 6,
                    fontVariantNumeric: 'tabular-nums',
                    fontFeatureSettings: '"tnum"',
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: 'right',
                  }}>
                    {formatDuration(dur)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
