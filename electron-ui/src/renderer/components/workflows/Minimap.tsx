import React from 'react'
import type { NodePosition } from './useCanvasLayout'

const MINIMAP_W = 120
const MINIMAP_H = 80

interface MinimapProps {
  nodePositions: Record<string, NodePosition>
  stepIds: string[]
  stepStatuses: Record<string, string>
  panX: number
  panY: number
  zoom: number
  containerW: number
  containerH: number
  onClickNode?: (stepId: string) => void
  onViewportDrag?: (newPanX: number, newPanY: number) => void
}

export default function Minimap({ nodePositions, stepIds, stepStatuses, panX, panY, zoom, containerW, containerH, onClickNode, onViewportDrag }: MinimapProps) {
  const vpDragRef = React.useRef<{ mouseX: number; mouseY: number; startPanX: number; startPanY: number } | null>(null)

  if (stepIds.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of stepIds) {
    const p = nodePositions[id]
    if (!p) continue
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + p.width); maxY = Math.max(maxY, p.y + p.height)
  }
  if (!isFinite(minX)) return null

  const pad = 10
  const contentW = maxX - minX + pad * 2
  const contentH = maxY - minY + pad * 2
  const scaleX = MINIMAP_W / contentW
  const scaleY = MINIMAP_H / contentH
  const scale = Math.min(scaleX, scaleY)

  const vpX = (-panX / zoom - minX + pad) * scale
  const vpY = (-panY / zoom - minY + pad) * scale
  const vpW = (containerW / zoom) * scale
  const vpH = (containerH / zoom) * scale

  const handleVpMouseDown = onViewportDrag ? (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    vpDragRef.current = { mouseX: e.clientX, mouseY: e.clientY, startPanX: panX, startPanY: panY }
    const handleMove = (me: MouseEvent) => {
      if (!vpDragRef.current) return
      const dx = me.clientX - vpDragRef.current.mouseX
      const dy = me.clientY - vpDragRef.current.mouseY
      const newPanX = vpDragRef.current.startPanX - (dx / scale) * zoom
      const newPanY = vpDragRef.current.startPanY - (dy / scale) * zoom
      onViewportDrag(newPanX, newPanY)
    }
    const handleUp = () => {
      vpDragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  } : undefined

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 40,
        right: 8,
        zIndex: 10,
        background: 'var(--glass-bg-mid)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        width: MINIMAP_W,
        height: MINIMAP_H,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H} style={{ display: 'block' }}>
        {stepIds.map(id => {
          const p = nodePositions[id]
          if (!p) return null
          const st = stepStatuses[id] ?? 'idle'
          const fill = st === 'completed' ? '#22c55e'
            : st === 'running' ? '#6366f1'
            : st === 'pending' ? 'var(--text-faint)'
            : 'var(--text-faint)'
          const nodeIdx = stepIds.indexOf(id)
          const rectW = Math.max(2, p.width * scale)
          const rectH = Math.max(2, p.height * scale)
          const rx = (p.x - minX + pad) * scale
          const ry = (p.y - minY + pad) * scale
          return (
            <g key={id}>
              <rect
                x={rx} y={ry}
                width={rectW} height={rectH}
                rx={2}
                fill={fill}
                fillOpacity={0.9}
                style={{ cursor: onClickNode ? 'pointer' : 'default' }}
                onClick={onClickNode ? (e) => { e.stopPropagation(); onClickNode(id) } : undefined}
              />
              {rectW > 10 && rectH > 6 && (
                <text
                  x={rx + rectW / 2}
                  y={ry + rectH / 2 + 3}
                  textAnchor="middle"
                  fontSize={Math.max(4, Math.min(7, rectW * 0.35))}
                  fill="var(--text-secondary)"
                  fontWeight="800"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {nodeIdx + 1}
                </text>
              )}
            </g>
          )
        })}
        <rect
          x={vpX} y={vpY}
          width={Math.max(4, vpW)} height={Math.max(4, vpH)}
          fill="var(--bg-hover)"
          stroke="var(--text-faint)"
          strokeWidth={0.8}
          rx={1}
          style={{ pointerEvents: onViewportDrag ? 'all' : 'none', cursor: onViewportDrag ? 'grab' : 'default' }}
          onMouseDown={handleVpMouseDown}
        />
      </svg>
    </div>
  )
}
