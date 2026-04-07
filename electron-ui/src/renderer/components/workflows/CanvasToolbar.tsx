// CanvasToolbar — zoom + collapse controls for WorkflowCanvas (extracted Iteration 510)
// Iteration 490: added minimap toggle button
// Direction 9: context-aware abort/rerun buttons

import React from 'react'
import { Maximize2, ChevronsDownUp, ChevronsUpDown, Map } from 'lucide-react'

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
  showMinimap: boolean
  onFitToView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onCollapseAll: () => void
  onExpandAll: () => void
  onToggleMinimap: () => void
  // Direction 9: execution state props
  isRunning?: boolean
  allDone?: boolean
  onAbort?: () => void
  onRerun?: () => void
}

export default function CanvasToolbar({
  zoomPercent, offsetTop,
  fitToViewLabel, showMinimap,
  onFitToView, onZoomIn, onZoomOut, onCollapseAll, onExpandAll, onToggleMinimap,
  isRunning = false,
  allDone = false,
  onAbort,
  onRerun,
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
      {/* Direction 9: Abort button — left side, shown when running */}
      {isRunning && onAbort && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onAbort() }}
            aria-label="中止执行"
            title="中止执行 (Abort)"
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 4,
              padding: '2px 7px',
              cursor: 'pointer',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.28)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
            }}
          >
            <span style={{ fontSize: 10 }}>⏹</span>
            <span>中止</span>
          </button>
          {/* Separator */}
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
        </>
      )}

      {/* Direction 9: Rerun button — shown when all done and not running */}
      {allDone && !isRunning && onRerun && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onRerun() }}
            aria-label="再次运行"
            title="再次运行 (Rerun)"
            style={{
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.4)',
              borderRadius: 4,
              padding: '2px 7px',
              cursor: 'pointer',
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(34,197,94,0.28)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(34,197,94,0.15)'
            }}
          >
            <span style={{ fontSize: 10 }}>▶</span>
            <span>再次运行</span>
          </button>
          {/* Separator */}
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
        </>
      )}

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
        title="Collapse all (C)"
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
        title="Expand all (E)"
        style={toolbarBtnStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <ChevronsUpDown size={13} />
      </button>
      {/* Separator */}
      <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
      {/* Minimap toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMinimap() }}
        aria-label="Toggle minimap"
        title="Toggle minimap (M)"
        style={{ ...toolbarBtnStyle, background: showMinimap ? 'var(--bg-hover)' : 'transparent', color: showMinimap ? 'var(--text)' : 'var(--text-muted)' }}
        onMouseEnter={hoverIn}
        onMouseLeave={e => { e.currentTarget.style.background = showMinimap ? 'var(--bg-hover)' : 'transparent'; e.currentTarget.style.color = showMinimap ? 'var(--text)' : 'var(--text-muted)' }}
      >
        <Map size={13} />
      </button>
    </div>
  )
}
