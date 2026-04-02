import React, { useCallback } from 'react'
import { WorkflowStep } from '../../types/app.types'

interface CanvasNodeProps {
  step: WorkflowStep
  index: number
  x: number
  y: number
  width: number
  selected: boolean
  onSelect: (stepId: string) => void
  onDragStart: (stepId: string, e: React.MouseEvent) => void
}

export const NODE_WIDTH = 220
export const NODE_MIN_HEIGHT = 70
export const NODE_GAP_Y = 120

export default function CanvasNode({
  step,
  index,
  x,
  y,
  width,
  selected,
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Step ${index + 1}: ${step.title}`}
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
        border: selected
          ? '1.5px solid var(--accent)'
          : '1.5px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        boxShadow: selected
          ? '0 2px 8px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.12)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        userSelect: 'none',
        boxSizing: 'border-box',
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
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {index + 1}
      </div>

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
