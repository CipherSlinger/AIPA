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
    <g>
      {/* Base path */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={status === 'active' ? 2 : 1.5}
        strokeOpacity={status === 'idle' ? 0.35 : 0.85}
        markerEnd={`url(#${markerId})`}
      />
      {/* Flowing dash animation for active edges */}
      {status === 'active' && (
        <path
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={2}
          strokeDasharray="6 12"
          strokeLinecap="round"
          style={{ animation: 'canvas-edge-flow 0.7s linear infinite' }}
        />
      )}
      {/* Done glow */}
      {status === 'done' && (
        <path
          d={d}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.5}
          strokeOpacity={0.15}
          style={{ filter: 'blur(2px)' }}
        />
      )}
    </g>
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
          refX="7"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d="M 0 0 L 8 3 L 0 6 Z"
            fill={edgeColor(status)}
            fillOpacity={status === 'idle' ? 0.35 : 0.85}
          />
        </marker>
      ))}
    </defs>
  )
}
