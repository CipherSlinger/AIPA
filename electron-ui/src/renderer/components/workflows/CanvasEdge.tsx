import React from 'react'
import { WorkflowStep } from '../../types/app.types'

interface CanvasEdgeProps {
  from: { x: number; y: number; width: number; height: number }
  to: { x: number; y: number; width: number; height: number }
}

export default function CanvasEdge({ from, to }: CanvasEdgeProps) {
  const startX = from.x + from.width / 2
  const startY = from.y + from.height
  const endX = to.x + to.width / 2
  const endY = to.y

  const midY = (startY + endY) / 2

  const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`

  return (
    <path
      d={d}
      fill="none"
      stroke="var(--text-muted)"
      strokeWidth={1.5}
      strokeOpacity={0.5}
      markerEnd="url(#canvas-arrowhead)"
    />
  )
}

export function CanvasEdgeDefs() {
  return (
    <defs>
      <marker
        id="canvas-arrowhead"
        markerWidth="8"
        markerHeight="6"
        refX="8"
        refY="3"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path
          d="M 0 0 L 8 3 L 0 6 Z"
          fill="var(--text-muted)"
          fillOpacity={0.5}
        />
      </marker>
    </defs>
  )
}
