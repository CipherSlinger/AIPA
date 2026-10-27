import React, { useMemo } from 'react'
import { X } from 'lucide-react'
import type { StepStatus } from './useWorkflowExecution'
import type { WorkflowStep } from '../../types/app.types'
import { formatDuration } from '../layout/statusBarConstants'
import { countWords } from '../../utils/stringUtils'
import { useT } from '../../i18n'

export interface CanvasTimelineProps {
  steps: WorkflowStep[]
  stepDurations: Record<string, number>
  stepStatuses: Record<string, StepStatus>
  stepOutputs: Record<string, string>
  onClose: () => void
  onStepClick?: (stepId: string) => void
}

function getBarColor(status: StepStatus): string {
  switch (status) {
    case 'completed': return 'var(--success)'
    case 'error':     return 'var(--error)'
    case 'running':   return 'var(--accent)'
    default:          return 'var(--border-strong, #374151)'
  }
}

export default function CanvasTimeline({
  steps,
  stepDurations,
  stepStatuses,
  stepOutputs,
  onClose,
  onStepClick,
}: CanvasTimelineProps) {
  const t = useT()
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

  const totalWords = useMemo(
    () => Object.values(stepOutputs).reduce((sum, text) => sum + countWords(text), 0),
    [stepOutputs]
  )

  // Pre-build step index map for O(1) lookup
  const stepIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    steps.forEach((s, i) => m.set(s.id, i))
    return m
  }, [steps])

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        background: 'var(--bg-secondary)',
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 60%)',
        borderTop: '1px solid var(--glass-border-md)',
        boxShadow: '0 -8px 24px -12px rgba(0,0,0,0.55)',
        height: 120,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 30,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, letterSpacing: '0.01em' }}>
          {t('canvas.timelineHeading')}
        </span>
        {totalWords > 0 && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            padding: '2px 6px',
            border: '1px solid var(--glass-border)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            ~{totalWords}w
          </span>
        )}
        {totalMs > 0 && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            padding: '2px 6px',
            border: '1px solid var(--glass-border)',
          }}>
            {formatDuration(totalMs)}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          aria-label={t('canvas.timelineClose')}
          title={t('canvas.timelineClose')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 14,
            lineHeight: 1,
            padding: '3px',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s ease, background 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Gantt chart area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {validSteps.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontSize: 11,
            color: 'var(--text-faint)',
          }}>
            {t('canvas.timelineEmpty')}
          </div>
        ) : (
          <div style={{ padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {validSteps.map(step => {
              const dur = stepDurations[step.id]
              const status = stepStatuses[step.id] ?? 'idle'
              const widthPct = (dur / maxDuration) * 100
              const barColor = getBarColor(status)
              const isRunning = status === 'running'
              const stepNum = (stepIndexMap.get(step.id) ?? 0) + 1

              return (
                <div
                  key={step.id}
                  onClick={onStepClick ? () => onStepClick(step.id) : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: 22,
                    gap: 0,
                    cursor: onStepClick ? 'pointer' : 'default',
                    borderRadius: 4,
                    transition: 'background 0.12s ease',
                    paddingLeft: 3,
                    paddingRight: 3,
                  }}
                  onMouseEnter={e => { if (onStepClick) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (onStepClick) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
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
                      color: 'var(--text-secondary)',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: 4,
                      padding: '1px 4px',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                      border: '1px solid var(--glass-border)',
                    }}>
                      {String(stepNum).padStart(2, '0')}
                    </span>
                    <span
                      title={step.title}
                      style={{
                        fontSize: 10,
                        color: 'var(--text-secondary)',
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
                  <div style={{
                    flex: 1,
                    position: 'relative',
                    height: 10,
                    background: 'rgba(255,255,255,0.045)',
                    borderRadius: 5,
                    overflow: 'hidden',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
                  }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${widthPct}%`,
                        background: barColor,
                        borderRadius: 5,
                        opacity: isRunning ? 1 : 0.8,
                        boxShadow: isRunning ? `0 0 8px ${barColor}` : 'none',
                        transition: 'width 0.3s ease',
                        minWidth: 4,
                      }}
                    />
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

                  {/* Duration label */}
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
