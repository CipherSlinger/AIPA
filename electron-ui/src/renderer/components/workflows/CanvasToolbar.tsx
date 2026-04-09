// CanvasToolbar — zoom + collapse controls for WorkflowCanvas (extracted Iteration 510)
// Iteration 490: added minimap toggle button
// Direction 9: context-aware abort/rerun buttons
// Iteration 528: Direction G (export), E (layout toggle), A (restart on error)
// Direction 11: JSON import button
// Direction 12: export as shell script button
// Direction 13: search box
// Iteration 530: B4 — toolbar UI refinement (search float, shadows, transitions, separators, icons)

import React, { useRef } from 'react'
import { Maximize2, ChevronsDownUp, ChevronsUpDown, Map, Download, ArrowDownUp, ArrowLeftRight, Upload, Terminal, Search, X, Square, Play } from 'lucide-react'

const toolbarBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  padding: 3,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  transition: 'background 0.12s, color 0.12s',
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
  transition: 'background 0.12s, color 0.12s',
}

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 16,
  background: 'var(--border)',
  margin: '0 3px',
  opacity: 0.5,
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
  hasError?: boolean
  onAbort?: () => void
  onRerun?: () => void
  // Direction E: layout direction
  layoutDirection?: 'vertical' | 'horizontal'
  onToggleLayout?: () => void
  // Direction G: export
  onExport?: () => void
  // Direction 11: JSON import
  onImport?: (jsonString: string) => void
  // Direction 12: export as shell script
  onExportScript?: () => void
  // Direction 13: search
  searchQuery?: string
  onSearchChange?: (q: string) => void
}

export default function CanvasToolbar({
  zoomPercent, offsetTop,
  fitToViewLabel, showMinimap,
  onFitToView, onZoomIn, onZoomOut, onCollapseAll, onExpandAll, onToggleMinimap,
  isRunning = false,
  allDone = false,
  hasError = false,
  onAbort,
  onRerun,
  layoutDirection = 'vertical',
  onToggleLayout,
  onExport,
  onImport,
  onExportScript,
  searchQuery,
  onSearchChange,
}: CanvasToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onImport) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result
      if (typeof content === 'string') onImport(content)
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-imported
    e.target.value = ''
  }

  return (
    <>
      {/* B4.1 — Independent floating search box — top left corner */}
      {onSearchChange && (
        <div style={{
          position: 'absolute',
          top: offsetTop ? 28 : 8,
          left: 8,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(30,30,30,0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: 6,
          padding: '3px 6px',
          border: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          gap: 4,
          transition: 'top 0.2s ease',
        }}>
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索步骤..."
            style={{
              width: 130,
              fontSize: 11,
              padding: '2px 4px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 1,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* B4.2 — Feature button group — top right corner */}
      <div style={{
        position: 'absolute',
        top: offsetTop ? 28 : 8,
        right: 8,
        zIndex: 10,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'rgba(var(--bg-card-rgb, 30, 30, 30), 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        padding: '4px 8px',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        transition: 'top 0.2s ease',
      }}>
        {/* Direction 9: Abort button — shown when running */}
        {isRunning && onAbort && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAbort() }}
              aria-label="中止执行"
              title="中止执行 (Abort)"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 6,
                padding: '3px 9px',
                cursor: 'pointer',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.28)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
              }}
            >
              <Square size={10} />
              <span>中止</span>
            </button>
            {/* Separator */}
            <div style={separatorStyle} />
          </>
        )}

        {/* Direction 9: Rerun button — shown when all done and not running */}
        {/* Direction A: also show when hasError */}
        {(allDone || hasError) && !isRunning && onRerun && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onRerun() }}
              aria-label="再次运行"
              title="再次运行 (Rerun)"
              style={{
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.4)',
                borderRadius: 6,
                padding: '3px 9px',
                cursor: 'pointer',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.28)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.15)'
              }}
            >
              <Play size={10} />
              <span>{hasError && !allDone ? '重新开始' : '再次运行'}</span>
            </button>
            {/* Separator */}
            <div style={separatorStyle} />
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
        {/* B4.6 — zoom % is clickable to reset zoom */}
        <button
          onClick={(e) => { e.stopPropagation(); onFitToView() }}
          title="点击重置缩放 (0)"
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            minWidth: 36,
            textAlign: 'center',
            userSelect: 'none',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            padding: '1px 2px',
            borderRadius: 4,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          {zoomPercent}%
        </button>
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
        <div style={separatorStyle} />
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
        <div style={separatorStyle} />
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
        {/* Direction E: Layout toggle */}
        {onToggleLayout && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleLayout() }}
            aria-label="Toggle layout direction"
            title={`Toggle layout (L) — currently ${layoutDirection}`}
            style={toolbarBtnStyle}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            {layoutDirection === 'vertical' ? <ArrowDownUp size={13} /> : <ArrowLeftRight size={13} />}
          </button>
        )}
        {/* Direction G: Export JSON + Direction 12: Export Shell Script */}
        {(onExport || onExportScript) && (
          <>
            <div style={separatorStyle} />
            {onExport && (
              <button
                onClick={(e) => { e.stopPropagation(); onExport() }}
                aria-label="Export workflow"
                title="Export JSON"
                style={toolbarBtnStyle}
                onMouseEnter={hoverIn}
                onMouseLeave={hoverOut}
              >
                <Download size={13} />
              </button>
            )}
            {onExportScript && (
              <button
                onClick={(e) => { e.stopPropagation(); onExportScript() }}
                aria-label="Export as shell script"
                title="Export as Shell Script"
                style={toolbarBtnStyle}
                onMouseEnter={hoverIn}
                onMouseLeave={hoverOut}
              >
                <Terminal size={13} />
              </button>
            )}
          </>
        )}
        {/* Direction 11: Import JSON */}
        {onImport && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              aria-label="Import workflow from JSON"
              title="Import JSON"
              style={toolbarBtnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              <Upload size={13} />
            </button>
          </>
        )}
      </div>
    </>
  )
}
