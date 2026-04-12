import React, { useState } from 'react'

// D8: edge hover highlights related nodes
type EdgeStatus = 'idle' | 'active' | 'done' | 'running' | 'completed' | 'error'

function measureTextWidth(text: string, fontSize = 9): number {
  let width = 0
  for (const ch of text) {
    // CJK Unified Ideographs and common fullwidth ranges
    const cp = ch.codePointAt(0) ?? 0
    const isWide = (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK Unified
                   (cp >= 0x3000 && cp <= 0x303F) ||  // CJK Symbols
                   (cp >= 0xFF00 && cp <= 0xFFEF)     // Fullwidth
    width += isWide ? fontSize * 1.2 : fontSize * 0.65
  }
  return Math.ceil(width) + 16  // padding
}

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
  sourceStepIndex?: number                     // tooltip: source step number
  targetStepIndex?: number                     // tooltip: target step number
  label?: string                               // condition/branch label shown always at midpoint
}

function edgeColor(status: EdgeStatus): string {
  if (status === 'done' || status === 'completed') return 'rgba(34,197,94,0.6)'
  if (status === 'active') return '#6366f1'
  if (status === 'running') return 'rgba(99,102,241,0.8)'
  if (status === 'error') return 'rgba(239,68,68,0.6)'
  return 'rgba(255,255,255,0.15)'
}

function formatOutputLength(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export default function CanvasEdge({ from, to, status = 'idle', layoutDirection = 'vertical', onHoverChange, highlighted, onAddBetween, outputLength, durationMs, sourceStepIndex, targetStepIndex, label }: CanvasEdgeProps) {
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
  // B3.4: done 状态主线加粗为 2
  const strokeWidth = highlighted
    ? (status === 'active' || status === 'running' ? 2.5 : 2)
    : (status === 'done' || status === 'completed' ? 2 : status === 'active' || status === 'running' ? 2 : 1.5)

  // D7: info label content
  const showInfoLabel = (status === 'done' || status === 'completed') && (outputLength !== undefined || durationMs !== undefined)
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

  // B3.6: dynamic rect width based on text length (CJK-aware)
  const infoRectWidth = measureTextWidth(infoText)

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
      <style>{`
        @keyframes dashFlow {
          to { stroke-dashoffset: -20; }
        }
        @keyframes edge-dash-flow {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
      {/* D8: invisible wide hit area for easier hover detection — wider when highlighted */}
      {(onHoverChange || onAddBetween) && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={highlighted ? 20 : 16}
          style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
        />
      )}

      {/* Base path — B3.1: idle 状态改为虚线 */}
      <path
        d={d}
        fill="none"
        stroke={highlighted ? 'rgba(99,102,241,0.8)' : color}
        strokeWidth={highlighted ? 2.5 : (status === 'running' ? 2 : strokeWidth)}
        strokeOpacity={strokeOpacity}
        strokeDasharray={
          status === 'idle' ? '4 6' :
          status === 'running' ? '6 4' :
          status === 'error' ? '3 3' :
          undefined
        }
        strokeDashoffset={status === 'running' ? '0' : undefined}
        markerEnd={`url(#${markerId})`}
        style={{
          pointerEvents: 'none',
          ...(status === 'running' ? { animation: 'dashFlow 1.2s linear infinite' } : {}),
          ...((highlighted || status === 'running') ? { filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.5))' } : {}),
        }}
      />

      {/* D8: highlight glow when hovered */}
      {highlighted && (
        <path
          d={d}
          fill="none"
          stroke="rgba(99,102,241,0.8)"
          strokeWidth={strokeWidth + 3}
          strokeOpacity={0.15}
          style={{ pointerEvents: 'none', filter: 'blur(2px) drop-shadow(0 0 4px rgba(99,102,241,0.5))' }}
        />
      )}

      {/* B3.3: Flowing dash animation for active edges — dotted, smooth */}
      {status === 'active' && (
        <path
          d={d}
          fill="none"
          stroke="rgba(99,102,241,0.5)"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinecap="round"
          style={{ animation: 'canvas-edge-flow 0.7s linear infinite', pointerEvents: 'none' }}
        />
      )}

      {/* B3.4: Done glow — stronger effect */}
      {(status === 'done' || status === 'completed') && !highlighted && (
        <path
          d={d}
          fill="none"
          stroke="rgba(34,197,94,0.6)"
          strokeWidth={2.5}
          strokeOpacity={0.2}
          style={{ filter: 'blur(2px)', pointerEvents: 'none' }}
        />
      )}

      {/* D4: add-between button at midpoint — B3.5: dark theme style */}
      {onAddBetween && (
        <g
          style={{
            opacity: isHoveredLocally ? 1 : 0,
            transition: 'opacity 0.15s ease',
            cursor: 'pointer',
            pointerEvents: 'all',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
          onClick={(e) => { e.stopPropagation(); onAddBetween() }}
        >
          <circle
            cx={midX}
            cy={midY}
            r={10}
            fill="#6366f1"
            stroke="none"
          />
          <text
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '14px',
              fontWeight: 700,
              fill: 'rgba(255,255,255,0.9)',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            +
          </text>
        </g>
      )}

      {/* Condition/branch label pill — always shown when label is set */}
      {label && (() => {
        const labelW = measureTextWidth(label, 8)
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={midX - labelW / 2}
              y={midY - 9}
              width={labelW}
              height={14}
              rx={6}
              ry={6}
              fill="rgba(15,15,25,0.85)"
              stroke={
                status === 'done' || status === 'completed'
                  ? 'rgba(34,197,94,0.45)'
                  : status === 'active' || status === 'running'
                    ? 'rgba(99,102,241,0.65)'
                    : status === 'error'
                      ? 'rgba(239,68,68,0.45)'
                      : 'rgba(99,102,241,0.45)'
              }
              strokeWidth={1}
            />
            <text
              x={midX}
              y={midY - 2}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontSize: 11,
                fill: 'rgba(255,255,255,0.60)',
                fontWeight: 600,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            >
              {label}
            </text>
          </g>
        )
      })()}

      {/* Hover tooltip at midpoint — shows source → target step numbers */}
      {isHoveredLocally && (sourceStepIndex !== undefined || targetStepIndex !== undefined) && (
        <foreignObject
          x={midX - 60}
          y={label ? midY + 4 : midY - 16}
          width={120}
          height={32}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(15,15,25,0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 11,
            color: 'rgba(255,255,255,0.60)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            {sourceStepIndex !== undefined ? `Step ${sourceStepIndex + 1}` : ''} → {targetStepIndex !== undefined ? `Step ${targetStepIndex + 1}` : ''}
          </div>
        </foreignObject>
      )}

      {/* Step number badges near endpoints — shown on hover */}
      {isHoveredLocally && sourceStepIndex !== undefined && (
        <g>
          <circle
            cx={startX}
            cy={startY}
            r={8}
            fill="rgba(30,30,40,0.85)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />
          <text
            x={startX}
            y={startY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 7, fontWeight: 700, fill: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}
          >
            {sourceStepIndex + 1}
          </text>
        </g>
      )}
      {isHoveredLocally && targetStepIndex !== undefined && (
        <g>
          <circle
            cx={endX}
            cy={endY}
            r={8}
            fill="rgba(30,30,40,0.85)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />
          <text
            x={endX}
            y={endY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 7, fontWeight: 700, fill: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}
          >
            {targetStepIndex + 1}
          </text>
        </g>
      )}

      {/* D7: info label at midpoint — B3.6: improved label style */}
      {showInfoLabel && (
        <g style={{ pointerEvents: 'none' }}>
          {/* Background rect for info label */}
          <rect
            x={labelX - infoRectWidth / 2}
            y={labelY - 8}
            width={infoRectWidth}
            height={16}
            rx={5}
            ry={5}
            fill="rgba(34,197,94,0.12)"
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '10px',
              fill: 'rgba(34,197,94,0.85)',
              userSelect: 'none',
              pointerEvents: 'none',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
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
  function markerColor(status: EdgeStatus): string {
    if (status === 'done' || status === 'completed') return 'rgba(34,197,94,0.7)'
    if (status === 'active') return 'rgba(99,102,241,0.8)'
    if (status === 'running') return 'rgba(99,102,241,0.8)'
    if (status === 'error') return 'rgba(239,68,68,0.7)'
    return 'rgba(255,255,255,0.45)'
  }
  return (
    <defs>
      {(['idle', 'active', 'done', 'running', 'completed', 'error'] as EdgeStatus[]).map(status => (
        <marker
          key={status}
          id={`canvas-arrowhead-${status}`}
          markerWidth="10"
          markerHeight="7"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          {/* B3.2: open arrow (描边而非填充) */}
          <path
            d="M 1 0.5 L 7 3 L 1 5.5"
            fill="none"
            stroke={markerColor(status)}
            strokeWidth={1.5}
            strokeOpacity={status === 'idle' ? 0.35 : 0.85}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      ))}
    </defs>
  )
}
