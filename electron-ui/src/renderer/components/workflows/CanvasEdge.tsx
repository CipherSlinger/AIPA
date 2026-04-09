import React, { useState } from 'react'

// D8: edge hover highlights related nodes
type EdgeStatus = 'idle' | 'active' | 'done'

interface CanvasEdgeProps {
  from: { x: number; y: number; width: number; height: number }
  to: { x: number; y: number; width: number; height: number }
  status?: EdgeStatus
  layoutDirection?: 'vertical' | 'horizontal'
  onHoverChange?: (hovered: boolean) => void  // D8: hover callback
  highlighted?: boolean                        // D8: highlight when connected nodes are hovered
  onAddBetween?: () => void                    // D4: insert step between nodes
  outputLength?: number                        // D7: upstream output char count
  durationMs?: number                          // D7: upstream step duration in ms
}

function edgeColor(status: EdgeStatus): string {
  if (status === 'done') return '#22c55e'
  if (status === 'active') return 'var(--accent)'
  return 'var(--text-muted)'
}

function formatOutputLength(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export default function CanvasEdge({ from, to, status = 'idle', layoutDirection = 'vertical', onHoverChange, highlighted, onAddBetween, outputLength, durationMs }: CanvasEdgeProps) {
  const [isHoveredLocally, setIsHoveredLocally] = useState(false)

  let startX: number, startY: number, endX: number, endY: number, d: string
  let midX: number, midY: number

  if (layoutDirection === 'horizontal') {
    startX = from.x + from.width
    startY = from.y + from.height / 2
    endX = to.x
    endY = to.y + to.height / 2
    midX = (startX + endX) / 2
    midY = (startY + endY) / 2
    d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
  } else {
    startX = from.x + from.width / 2
    startY = from.y + from.height
    endX = to.x + to.width / 2
    endY = to.y
    midX = (startX + endX) / 2
    midY = (startY + endY) / 2
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

  // D7: info label content
  const showInfoLabel = status === 'done' && (outputLength !== undefined || durationMs !== undefined)
  let infoText = ''
  if (showInfoLabel) {
    const parts: string[] = []
    if (outputLength !== undefined) parts.push(formatOutputLength(outputLength))
    if (durationMs !== undefined) parts.push(formatDuration(durationMs))
    infoText = parts.join(' · ')
  }

  // D7: label position offset from midpoint
  const labelX = layoutDirection === 'horizontal' ? midX - 20 : midX
  const labelY = layoutDirection === 'horizontal' ? midY : midY - 20

  const handleMouseEnter = () => {
    setIsHoveredLocally(true)
    if (onHoverChange) onHoverChange(true)
  }
  const handleMouseLeave = () => {
    setIsHoveredLocally(false)
    if (onHoverChange) onHoverChange(false)
  }

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ pointerEvents: (onHoverChange || onAddBetween) ? 'stroke' : 'none' }}
    >
      {/* D8: invisible wide hit area for easier hover detection */}
      {(onHoverChange || onAddBetween) && (
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

      {/* D4: add-between button at midpoint */}
      {onAddBetween && (
        <g
          style={{
            opacity: isHoveredLocally ? 1 : 0,
            transition: 'opacity 0.15s',
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
          onClick={(e) => { e.stopPropagation(); onAddBetween() }}
        >
          <circle
            cx={midX}
            cy={midY}
            r={9}
            fill="white"
            stroke="var(--accent)"
            strokeWidth={1}
          />
          <text
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              fill: 'var(--accent)',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            +
          </text>
        </g>
      )}

      {/* D7: info label at midpoint (offset to avoid overlap with + button) */}
      {showInfoLabel && (
        <g style={{ pointerEvents: 'none' }}>
          {/* Background rect for info label */}
          <rect
            x={labelX - 20}
            y={labelY - 7}
            width={40}
            height={14}
            rx={3}
            ry={3}
            fill="rgba(34,197,94,0.08)"
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '9px',
              fill: '#22c55e',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {infoText}
          </text>
        </g>
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
