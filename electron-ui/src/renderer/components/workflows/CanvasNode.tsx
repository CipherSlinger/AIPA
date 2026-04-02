import React, { useCallback } from 'react'
import { Check, X, Loader } from 'lucide-react'
import { WorkflowStep } from '../../types/app.types'
import type { StepStatus } from './useWorkflowExecution'

interface CanvasNodeProps {
  step: WorkflowStep
  index: number
  x: number
  y: number
  width: number
  selected: boolean
  status?: StepStatus
  onSelect: (stepId: string) => void
  onDragStart: (stepId: string, e: React.MouseEvent) => void
}

export const NODE_WIDTH = 220
export const NODE_MIN_HEIGHT = 70
export const NODE_GAP_Y = 120

const STATUS_STYLES: Record<StepStatus, {
  borderColor: string
  borderLeft?: string
  opacity?: number
  animation?: string
  badgeBg?: string
}> = {
  idle: { borderColor: 'var(--border)' },
  pending: { borderColor: 'var(--border)', opacity: 0.6 },
  running: { borderColor: 'var(--accent)', animation: 'canvas-node-pulse 1.5s ease-in-out infinite' },
  completed: { borderColor: 'var(--border)', borderLeft: '3px solid #22c55e' },
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: '50%',
        background: '#22c55e', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={11} strokeWidth={3} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'canvas-spinner 1s linear infinite',
      }}>
        <Loader size={11} strokeWidth={2.5} />
      </div>
    )
  }
  return null
}

export default function CanvasNode({
  step,
  index,
  x,
  y,
  width,
  selected,
  status = 'idle',
  onSelect,
  onDragStart,
}: CanvasNodeProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelect(step.id)
      onDragStart(step.id, e)
    },
    [step.id, onSelect, onDragStart]
  )

  const promptPreview =
    step.prompt.length > 60 ? step.prompt.slice(0, 60) + '...' : step.prompt

  const statusStyle = STATUS_STYLES[status]
  const isActive = selected || status === 'running'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Step ${index + 1}: ${step.title}${status !== 'idle' ? ` (${status})` : ''}`}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(step.id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(step.id)
      }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: width,
        minHeight: NODE_MIN_HEIGHT,
        background: 'var(--bg-card, var(--bg-sessionpanel))',
        border: isActive
          ? '1.5px solid var(--accent)'
          : `1.5px solid ${statusStyle.borderColor}`,
        borderLeft: statusStyle.borderLeft || undefined,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        boxShadow: isActive
          ? '0 2px 8px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.12)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
        opacity: statusStyle.opacity ?? 1,
        animation: statusStyle.animation || 'none',
      }}
    >
      {/* Step number badge */}
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: -8,
          width: 20,
          height: 20,
          background: status === 'completed' ? '#22c55e' : 'var(--accent)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          transition: 'background 0.2s ease',
        }}
      >
        {index + 1}
      </div>

      {/* Status badge (top-right) */}
      <StatusBadge status={status} />

      {/* Step title */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {step.title}
      </div>

      {/* Prompt preview */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {promptPreview}
      </div>
    </div>
  )
}
