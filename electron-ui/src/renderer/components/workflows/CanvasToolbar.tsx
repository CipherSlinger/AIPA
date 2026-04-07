// CanvasToolbar — zoom + collapse controls for WorkflowCanvas (extracted Iteration 510)

import React from 'react'
import { Maximize2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'

const toolbarBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  padding: 3,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
}

const toolbarZoomBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  padding: '1px 5px',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: 14,
  lineHeight: 1,
  fontWeight: 600,
}

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'var(--bg-hover)'
  e.currentTarget.style.color = 'var(--text)'
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.color = 'var(--text-muted)'
}

interface CanvasToolbarProps {
  zoomPercent: number
  offsetTop: boolean
  fitToViewLabel: string
  onFitToView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onCollapseAll: () => void
  onExpandAll: () => void
}

export default function CanvasToolbar({
  zoomPercent, offsetTop,
  fitToViewLabel, onFitToView, onZoomIn, onZoomOut, onCollapseAll, onExpandAll,
}: CanvasToolbarProps) {
  return (
    <div style={{
      position: 'absolute',
      top: offsetTop ? 28 : 8,
      right: 8,
      zIndex: 10,
      display: 'flex',
      gap: 4,
      alignItems: 'center',
      background: 'rgba(var(--bg-card-rgb, 30, 30, 30), 0.8)',
      backdropFilter: 'blur(8px)',
      borderRadius: 6,
      padding: '3px 6px',
      border: '1px solid var(--border)',
      transition: 'top 0.2s ease',
    }}>
      <button
        onClick={(e) => { e.stopPropagation(); onFitToView() }}
        aria-label={fitToViewLabel}
        title={fitToViewLabel + ' (0)'}
        style={toolbarBtnStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <Maximize2 size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onZoomOut() }}
        aria-label="Zoom out"
        title="Zoom out (−)"
        style={toolbarZoomBtnStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        −
      </button>
      <span style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        minWidth: 36,
        textAlign: 'center',
        userSelect: 'none',
      }}>
        {zoomPercent}%
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onZoomIn() }}
        aria-label="Zoom in"
        title="Zoom in (+)"
        style={toolbarZoomBtnStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        +
      </button>
      {/* Separator */}
      <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
      {/* Collapse all */}
      <button
        onClick={(e) => { e.stopPropagation(); onCollapseAll() }}
        aria-label="Collapse all nodes"
        title="Collapse all"
        style={toolbarBtnStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <ChevronsDownUp size={13} />
      </button>
      {/* Expand all */}
      <button
        onClick={(e) => { e.stopPropagation(); onExpandAll() }}
        aria-label="Expand all nodes"
        title="Expand all"
        style={toolbarBtnStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <ChevronsUpDown size={13} />
      </button>
    </div>
  )
}
