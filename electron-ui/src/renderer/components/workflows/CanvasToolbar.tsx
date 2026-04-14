// CanvasToolbar — zoom + collapse controls for WorkflowCanvas (extracted Iteration 510)
// Iteration 490: added minimap toggle button
// Direction 9: context-aware abort/rerun buttons
// Iteration 528: Direction G (export), E (layout toggle), A (restart on error)
// Direction 11: JSON import button
// Direction 12: export as shell script button
// Direction 13: search box
// Iteration 530: B4 — toolbar UI refinement (search float, shadows, transitions, separators, icons)

import React, { useRef, useState, useEffect } from 'react'
import { Maximize2, ChevronsDownUp, ChevronsUpDown, Map, Download, ArrowDownUp, ArrowLeftRight, Upload, Terminal, Search, X, Square, Play, HelpCircle } from 'lucide-react'
import { useT } from '../../i18n'

const toolbarBtnStyle: React.CSSProperties = {
  background: 'var(--glass-border)',
  border: 'none',
  borderRadius: 8,
  padding: '6px 8px',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  transition: 'all 0.15s ease',
}

const toolbarZoomBtnStyle: React.CSSProperties = {
  background: 'var(--glass-border)',
  border: 'none',
  borderRadius: 8,
  padding: '1px 5px',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: 14,
  lineHeight: 1,
  fontWeight: 600,
  transition: 'all 0.15s ease',
}

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 16,
  background: 'rgba(255,255,255,0.08)',
  margin: '0 4px',
  flexShrink: 0,
}

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
  e.currentTarget.style.color = 'var(--text-primary)'
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'var(--glass-border)'
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
  // R key: run workflow for the first time (shown when not yet started)
  onRun?: () => void
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
  // Clear step outputs
  onClearOutputs?: () => void
  completedCount?: number
  // Step count indicator
  stepCount?: number
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
  onRun,
  layoutDirection = 'vertical',
  onToggleLayout,
  onExport,
  onImport,
  onExportScript,
  searchQuery,
  onSearchChange,
  onClearOutputs,
  completedCount = 0,
  stepCount,
}: CanvasToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const t = useT()

  useEffect(() => {
    if (!showShortcuts) return
    function handleOutsideClick(e: MouseEvent) {
      setShowShortcuts(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showShortcuts])

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
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {/* B4.1 — Independent floating search box — top left corner */}
      {onSearchChange && (
        <div style={{
          position: 'absolute',
          top: offsetTop ? 28 : 8,
          left: 8,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--glass-bg-raised)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 12,
          padding: '4px 8px',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.30)',
          gap: 4,
          transition: 'all 0.15s ease',
        }}>
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('workflow.searchSteps')}
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
              aria-label={t('canvas.clearSearchLabel')}
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
        background: 'var(--glass-bg-raised)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 12,
        padding: '4px 8px',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.30)',
        transition: 'all 0.15s ease',
        // needed so the shortcuts popup anchors to this element
        isolation: 'isolate',
      }}>
        {/* Direction 9: Abort button — shown when running */}
        {isRunning && onAbort && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAbort() }}
              aria-label={t('canvas.abortLabel')}
              title={t('canvas.abortTitle')}
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 6,
                padding: '3px 9px',
                cursor: 'pointer',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.28)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
              }}
            >
              <Square size={10} />
              <span>{t('workflow.abort')}</span>
            </button>
            {/* Separator */}
            <div style={separatorStyle} />
          </>
        )}

        {/* Initial Run button — shown when workflow hasn't run yet */}
        {!isRunning && !allDone && !hasError && onRun && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onRun() }}
              aria-label={t('canvas.runLabel')}
              title={t('canvas.runTitle')}
              style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 6,
                padding: '3px 9px',
                cursor: 'pointer',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.28)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.15)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
              }}
            >
              <Play size={10} />
              <span>{t('workflow.run')}</span>
              <kbd style={{
                fontSize: 9,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 3,
                padding: '0px 4px',
                lineHeight: '14px',
                fontFamily: 'monospace',
                marginLeft: 4,
              }}>
                R
              </kbd>
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
              aria-label={t('canvas.rerunLabel')}
              title={t('canvas.rerunTitle')}
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
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.28)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.15)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'
              }}
            >
              <Play size={10} />
              <span>{hasError && !allDone ? t('workflow.restart') : t('workflow.rerun')}</span>
              <kbd style={{
                fontSize: 9,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 3,
                padding: '0px 4px',
                lineHeight: '14px',
                fontFamily: 'monospace',
                marginLeft: 4,
              }}>
                R
              </kbd>
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
          aria-label={t('canvas.zoomOutLabel')}
          title={t('canvas.zoomOutTitle')}
          style={toolbarZoomBtnStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          −
        </button>
        {/* B4.6 — zoom % is clickable to reset zoom */}
        <button
          onClick={(e) => { e.stopPropagation(); onFitToView() }}
          title={t('canvas.resetZoomTitle')}
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            minWidth: 36,
            textAlign: 'center',
            userSelect: 'none',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            padding: '2px 6px',
            borderRadius: 6,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          {zoomPercent}%
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onZoomIn() }}
          aria-label={t('canvas.zoomInLabel')}
          title={t('canvas.zoomInTitle')}
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
          aria-label={t('canvas.collapseAllLabel')}
          title={t('canvas.collapseAllTitle')}
          style={toolbarBtnStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          <ChevronsDownUp size={13} />
        </button>
        {/* Expand all */}
        <button
          onClick={(e) => { e.stopPropagation(); onExpandAll() }}
          aria-label={t('canvas.expandAllLabel')}
          title={t('canvas.expandAllTitle')}
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
          aria-label={t('canvas.minimapLabel')}
          title={t('canvas.minimapTitle')}
          style={{ ...toolbarBtnStyle, background: showMinimap ? 'rgba(99,102,241,0.15)' : 'transparent', color: showMinimap ? '#818cf8' : 'var(--text-muted)', boxShadow: showMinimap ? 'inset 0 0 0 1px rgba(99,102,241,0.4)' : 'none' }}
          onMouseEnter={hoverIn}
          onMouseLeave={e => { e.currentTarget.style.background = showMinimap ? 'rgba(99,102,241,0.15)' : 'transparent'; e.currentTarget.style.color = showMinimap ? '#818cf8' : 'var(--text-muted)'; e.currentTarget.style.boxShadow = showMinimap ? 'inset 0 0 0 1px rgba(99,102,241,0.4)' : 'none' }}
        >
          <Map size={13} />
        </button>
        {/* Direction E: Layout toggle */}
        {onToggleLayout && (() => {
          const layoutActive = layoutDirection === 'horizontal'
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLayout() }}
              aria-label={t('canvas.layoutToggleLabel')}
              title={t('canvas.layoutToggleTitle')}
              style={{ ...toolbarBtnStyle, background: layoutActive ? 'rgba(99,102,241,0.15)' : 'transparent', color: layoutActive ? '#818cf8' : 'var(--text-muted)', boxShadow: layoutActive ? 'inset 0 0 0 1px rgba(99,102,241,0.4)' : 'none' }}
              onMouseEnter={hoverIn}
              onMouseLeave={e => { e.currentTarget.style.background = layoutActive ? 'rgba(99,102,241,0.15)' : 'transparent'; e.currentTarget.style.color = layoutActive ? '#818cf8' : 'var(--text-muted)'; e.currentTarget.style.boxShadow = layoutActive ? 'inset 0 0 0 1px rgba(99,102,241,0.4)' : 'none' }}
            >
              {layoutDirection === 'vertical' ? <ArrowDownUp size={13} /> : <ArrowLeftRight size={13} />}
            </button>
          )
        })()}
        {/* Direction G: Export JSON + Direction 12: Export Shell Script */}
        {(onExport || onExportScript) && (
          <>
            <div style={separatorStyle} />
            {onExport && (
              <button
                onClick={(e) => { e.stopPropagation(); onExport() }}
                aria-label={t('canvas.exportJsonLabel')}
                title={t('canvas.exportJsonTitle')}
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
                aria-label={t('canvas.exportScriptLabel')}
                title={t('canvas.exportScriptTitle')}
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
              aria-label={t('canvas.importJsonLabel')}
              title={t('canvas.importJsonTitle')}
              style={toolbarBtnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              <Upload size={13} />
            </button>
          </>
        )}
        {/* Clear outputs button — shown when not running and there are completed steps */}
        {!isRunning && completedCount > 0 && onClearOutputs && (
          <button
            onClick={onClearOutputs}
            title="Clear all step outputs"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: 'var(--text-muted)', fontSize: 11,
              cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
              e.currentTarget.style.color = '#f87171'
              e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--glass-border)'
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            ✕ Clear
          </button>
        )}
        {/* Step count indicator */}
        {stepCount !== undefined && stepCount > 0 && (
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 5,
            padding: '3px 8px',
            border: '1px solid var(--glass-border)',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
        )}
        {/* Keyboard shortcuts help button */}
        <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => setShowShortcuts(prev => !prev)}
            title="Keyboard shortcuts"
            style={{
              background: showShortcuts ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: showShortcuts ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--glass-border)',
              borderRadius: 6,
              color: showShortcuts ? '#818cf8' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px 7px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            <HelpCircle size={12} />
          </button>
          {showShortcuts && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                zIndex: 200,
                background: 'var(--glass-bg-high)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--glass-border)',
                borderRadius: 12,
                padding: '12px 16px',
                minWidth: 220,
                boxShadow: 'var(--glass-shadow)',
                animation: 'slideUp 0.15s ease',
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '0.04em' }}>
                KEYBOARD SHORTCUTS
              </div>
              {[
                { key: 'R', desc: 'Run workflow' },
                { key: 'Esc', desc: 'Stop / deselect' },
                { key: 'Del', desc: 'Delete selected node' },
                { key: 'F', desc: 'Fit to view' },
                { key: 'Ctrl+F', desc: 'Find step' },
                { key: 'Space', desc: 'Pan canvas' },
                { key: '+/-', desc: 'Zoom in/out' },
                { key: 'Ctrl+Z', desc: 'Undo (coming soon)' },
              ].map(({ key, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--glass-border)' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{desc}</span>
                  <kbd style={{ fontSize: 10, fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-secondary)', border: '1px solid var(--glass-border-md)' }}>{key}</kbd>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
