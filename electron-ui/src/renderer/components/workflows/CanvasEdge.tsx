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
  sourceStatus?: string                        // Iter 547: source node status for animated running edges
  layoutDirection?: 'vertical' | 'horizontal'
  onHoverChange?: (hovered: boolean) => void  // D8: hover callback
  highlighted?: boolean                        // D8: highlight when connected nodes are hovered
  onAddBetween?: () => void                    // D4: insert step between nodes
  onDelete?: () => void                        // Iter 542: delete edge (removes target step)
  outputLength?: number                        // D7: upstream output char count
  durationMs?: number                          // D7: upstream step duration in ms
  sourceStepIndex?: number                     // tooltip: source step number
  targetStepIndex?: number                     // tooltip: target step number
  label?: string                               // condition/branch label shown always at midpoint
}

function formatOutputLength(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

// Iter 563: derive edge stroke style from sourceStatus for full visual differentiation
interface SourceEdgeStyle {
  color: string
  strokeDasharray?: string
  strokeWidth: number
  opacity: number
  animated: boolean
  animationName?: string
  filter?: string
}

function edgeStyleFromSourceStatus(sourceStatus: string | undefined): SourceEdgeStyle {
  switch (sourceStatus) {
    case 'running':
      return {
        color: '#6366f1',
        strokeDasharray: '8 4',
        strokeWidth: 2,
        opacity: 0.9,
        animated: true,
        animationName: 'canvas-edge-dash-flow',
        filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.6))',
      }
    case 'completed':
    case 'success':
    case 'done':
      return {
        color: '#22c55e',
        strokeWidth: 2,
        opacity: 0.8,
        animated: false,
        filter: 'drop-shadow(0 0 4px rgba(34,197,94,0.4))',
      }
    case 'error':
    case 'failed':
      return {
        color: '#ef4444',
        strokeWidth: 2,
        opacity: 0.8,
        animated: false,
        filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.4))',
      }
    case 'skipped':
      return {
        color: 'var(--text-faint)',
        strokeDasharray: '4 6',
        strokeWidth: 1.5,
        opacity: 0.5,
        animated: false,
      }
    case 'pending':
    case 'idle':
    default:
      return {
        color: 'var(--text-faint)',
        strokeDasharray: '4 6',
        strokeWidth: 1.5,
        opacity: 0.35,
        animated: false,
      }
  }
}

export default function CanvasEdge({ from, to, status = 'idle', sourceStatus, layoutDirection = 'vertical', onHoverChange, highlighted, onAddBetween, onDelete, outputLength, durationMs, sourceStepIndex, targetStepIndex, label }: CanvasEdgeProps) {
  const [isHoveredLocally, setIsHoveredLocally] = useState(false)
  // Iter 563: full source-status-driven style replaces the old binary isRunningFromSource approach
  const srcStyle = edgeStyleFromSourceStatus(sourceStatus)

  let startX: number, startY: number, endX: number, endY: number, d: string
  let midX: number, midY: number

  if (layoutDirection === 'horizontal') {
    startX = from.x + from.width
    startY = from.y + from.height / 2
    endX = to.x
    endY = to.y + to.height / 2
    midX = (startX + endX) / 2
    midY = (startY + endY) / 2
    const cpX1 = startX + (endX - startX) * 0.4
    const cpX2 = endX - (endX - startX) * 0.4
    d = `M ${startX} ${startY} C ${cpX1} ${startY}, ${cpX2} ${endY}, ${endX} ${endY}`
  } else {
    startX = from.x + from.width / 2
    startY = from.y + from.height
    endX = to.x + to.width / 2
    endY = to.y
    midX = (startX + endX) / 2
    midY = (startY + endY) / 2
    const cpY1 = startY + (endY - startY) * 0.4
    const cpY2 = endY - (endY - startY) * 0.4
    d = `M ${startX} ${startY} C ${startX} ${cpY1}, ${endX} ${cpY2}, ${endX} ${endY}`
  }
  const markerId = `canvas-arrowhead-${status}`

  // B3.4: done 状态主线加粗为 2 — still used by the highlighted glow path
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
      style={{ pointerEvents: (onHoverChange || onAddBetween || onDelete) ? 'stroke' : 'none' }}
    >
      {/* D8: invisible wide hit area for easier hover detection — wider when highlighted */}
      {(onHoverChange || onAddBetween || onDelete) && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={highlighted ? 20 : 16}
          style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
        />
      )}

      {/* Base path — Iter 563: use srcStyle (sourceStatus-driven) unless highlighted overrides */}
      <path
        d={d}
        fill="none"
        stroke={highlighted ? 'rgba(99,102,241,0.8)' : srcStyle.color}
        strokeWidth={highlighted ? 2.5 : srcStyle.strokeWidth}
        strokeOpacity={highlighted ? 0.95 : srcStyle.opacity}
        strokeDasharray={highlighted ? undefined : srcStyle.strokeDasharray}
        strokeDashoffset={(!highlighted && srcStyle.animated) ? '0' : undefined}
        markerEnd={`url(#${markerId})`}
        style={{
          pointerEvents: 'none',
          ...(!highlighted && srcStyle.animated
            ? { animation: `${srcStyle.animationName ?? 'canvas-edge-dash-flow'} 1.2s linear infinite` }
            : {}),
          ...(highlighted
            ? { filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.5))' }
            : srcStyle.filter
              ? { filter: srcStyle.filter }
              : {}),
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

      {/* P1.4: particle dot flowing along active/running edges */}
      {(status === 'active' || sourceStatus === 'running') && (
        <circle r={2.5} fill="#818cf8" opacity={0.95} style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 4px rgba(129,140,248,0.8))' }}>
          <animateMotion dur="1.8s" repeatCount="indefinite" path={d} />
        </circle>
      )}

      {/* P1.4: connection endpoint dots — always visible at start and end */}
      <circle cx={startX} cy={startY} r={3} fill={srcStyle.color} opacity={0.5} style={{ pointerEvents: 'none' }} />
      <circle cx={endX} cy={endY} r={3} fill={srcStyle.color} opacity={0.5} style={{ pointerEvents: 'none' }} />

      {/* B3.4 + Iter 563: Done/success glow — also triggered by sourceStatus */}
      {((status === 'done' || status === 'completed') || (sourceStatus === 'completed' || sourceStatus === 'success' || sourceStatus === 'done')) && !highlighted && (
        <path
          d={d}
          fill="none"
          stroke="rgba(34,197,94,0.6)"
          strokeWidth={2.5}
          strokeOpacity={0.2}
          style={{ filter: 'blur(2px)', pointerEvents: 'none' }}
        />
      )}

      {/* Iter 563: Error/failed glow */}
      {(sourceStatus === 'error' || sourceStatus === 'failed') && !highlighted && (
        <path
          d={d}
          fill="none"
          stroke="rgba(239,68,68,0.6)"
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
            transition: 'all 0.15s ease',
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
              fill: 'var(--text-primary)',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            +
          </text>
        </g>
      )}

      {/* Iter 542: delete edge button — shown on hover at midpoint (offset right when add-between present) */}
      {onDelete && (
        <g
          style={{
            opacity: isHoveredLocally ? 1 : 0,
            transition: 'all 0.15s ease',
            cursor: 'pointer',
            pointerEvents: 'all',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <circle
            cx={onAddBetween ? midX + 24 : midX}
            cy={midY}
            r={8}
            fill="rgba(239,68,68,0.85)"
            stroke="none"
            style={{ transition: 'fill 0.15s ease' }}
          />
          {/* X icon drawn as two crossing lines */}
          <line
            x1={(onAddBetween ? midX + 24 : midX) - 4}
            y1={midY - 4}
            x2={(onAddBetween ? midX + 24 : midX) + 4}
            y2={midY + 4}
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
          <line
            x1={(onAddBetween ? midX + 24 : midX) + 4}
            y1={midY - 4}
            x2={(onAddBetween ? midX + 24 : midX) - 4}
            y2={midY + 4}
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
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
              fill="var(--glass-bg-low)"
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
                fill: 'var(--text-secondary)',
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
            background: 'var(--glass-bg-card)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 11,
            color: 'var(--text-secondary)',
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
            fill="var(--bg-secondary)"
            stroke="var(--bg-active)"
            strokeWidth={1}
          />
          <text
            x={startX}
            y={startY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 7, fontWeight: 700, fill: 'var(--text-muted)', fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}
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
            fill="var(--bg-secondary)"
            stroke="var(--bg-active)"
            strokeWidth={1}
          />
          <text
            x={endX}
            y={endY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 7, fontWeight: 700, fill: 'var(--text-muted)', fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}
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
    return 'var(--text-muted)'
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
