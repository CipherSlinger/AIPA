import React from 'react'

type EdgeStatus = 'idle' | 'active' | 'done'

interface CanvasEdgeProps {
  from: { x: number; y: number; width: number; height: number }
  to: { x: number; y: number; width: number; height: number }
  status?: EdgeStatus
}

function edgeColor(status: EdgeStatus): string {
  if (status === 'done') return '#22c55e'
  if (status === 'active') return 'var(--accent)'
  return 'var(--text-muted)'
}

export default function CanvasEdge({ from, to, status = 'idle' }: CanvasEdgeProps) {
  const startX = from.x + from.width / 2
  const startY = from.y + from.height
  const endX = to.x + to.width / 2
  const endY = to.y

  const midY = (startY + endY) / 2

  const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`
  const color = edgeColor(status)
  const markerId = `canvas-arrowhead-${status}`

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={status === 'active' ? 2 : 1.5}
      strokeOpacity={status === 'idle' ? 0.4 : 0.8}
      markerEnd={`url(#${markerId})`}
    />
  )
}

export function CanvasEdgeDefs() {
  return (
    <defs>
      {(['idle', 'active', 'done'] as EdgeStatus[]).map(status => (
        <marker
          key={status}
          id={`canvas-arrowhead-${status}`}
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d="M 0 0 L 8 3 L 0 6 Z"
            fill={edgeColor(status)}
            fillOpacity={status === 'idle' ? 0.4 : 0.8}
          />
        </marker>
      ))}
    </defs>
  )
}
