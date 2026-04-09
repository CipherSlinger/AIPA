import React from 'react'

// D8: edge hover highlights related nodes
type EdgeStatus = 'idle' | 'active' | 'done'

interface CanvasEdgeProps {
  from: { x: number; y: number; width: number; height: number }
  to: { x: number; y: number; width: number; height: number }
  status?: EdgeStatus
  layoutDirection?: 'vertical' | 'horizontal'
  onHoverChange?: (hovered: boolean) => void  // D8: hover callback
  highlighted?: boolean                        // D8: highlight when connected nodes are hovered
}

function edgeColor(status: EdgeStatus): string {
  if (status === 'done') return '#22c55e'
  if (status === 'active') return 'var(--accent)'
  return 'var(--text-muted)'
}

export default function CanvasEdge({ from, to, status = 'idle', layoutDirection = 'vertical', onHoverChange, highlighted }: CanvasEdgeProps) {
  let startX: number, startY: number, endX: number, endY: number, d: string

  if (layoutDirection === 'horizontal') {
    startX = from.x + from.width
    startY = from.y + from.height / 2
    endX = to.x
    endY = to.y + to.height / 2
    const midX = (startX + endX) / 2
    d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
  } else {
    startX = from.x + from.width / 2
    startY = from.y + from.height
    endX = to.x + to.width / 2
    endY = to.y
    const midY = (startY + endY) / 2
    d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`
  }
  const color = edgeColor(status)
  const markerId = `canvas-arrowhead-${status}`

  // D8: boost visibility when highlighted
  const strokeOpacity = highlighted
    ? 0.95
    : status === 'idle' ? 0.35 : 0.85
  const strokeWidth = highlighted
    ? (status === 'active' ? 2.5 : 2)
    : (status === 'active' ? 2 : 1.5)

  return (
    <g
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
      style={{ pointerEvents: onHoverChange ? 'stroke' : 'none' }}
    >
      {/* D8: invisible wide hit area for easier hover detection */}
      {onHoverChange && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
        />
      )}

      {/* Base path */}
      <path
        d={d}
        fill="none"
        stroke={highlighted ? color : color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: 'none' }}
      />

      {/* D8: highlight glow when hovered */}
      {highlighted && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 3}
          strokeOpacity={0.15}
          style={{ pointerEvents: 'none', filter: 'blur(2px)' }}
        />
      )}

      {/* Flowing dash animation for active edges */}
      {status === 'active' && (
        <path
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={2}
          strokeDasharray="6 12"
          strokeLinecap="round"
          style={{ animation: 'canvas-edge-flow 0.7s linear infinite', pointerEvents: 'none' }}
        />
      )}

      {/* Done glow */}
      {status === 'done' && !highlighted && (
        <path
          d={d}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.5}
          strokeOpacity={0.15}
          style={{ filter: 'blur(2px)', pointerEvents: 'none' }}
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
