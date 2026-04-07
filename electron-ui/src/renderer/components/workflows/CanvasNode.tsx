import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, Loader, ChevronUp, ChevronDown, Copy, MessageSquare } from 'lucide-react'
import { WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import { getPresetStepText } from './workflowConstants'
import type { StepStatus } from './useWorkflowExecution'

interface CanvasNodeProps {
  step: WorkflowStep
  index: number
  x: number
  y: number
  width: number
  selected: boolean
  status?: StepStatus
  presetKey?: string
  collapsed?: boolean
  outputText?: string
  dimmed?: boolean
  durationMs?: number
  onSelect: (stepId: string) => void
  onDragStart: (stepId: string, e: React.MouseEvent) => void
  onToggleCollapse?: (stepId: string) => void
}

export const NODE_WIDTH = 220
export const NODE_MIN_HEIGHT = 70
export const NODE_COLLAPSED_HEIGHT = 36
export const NODE_GAP_Y = 120

const STATUS_STYLES: Record<StepStatus, {
  borderColor: string
  borderLeft?: string
  opacity?: number
  animation?: string
}> = {
  idle: { borderColor: 'var(--border)' },
  pending: { borderColor: 'var(--border)', opacity: 0.6 },
  running: { borderColor: 'var(--accent)', animation: 'canvas-node-pulse 1.5s ease-in-out infinite' },
  completed: { borderColor: 'var(--border)', borderLeft: '3px solid #22c55e' },
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: '50%',
        background: '#22c55e', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={11} strokeWidth={3} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'canvas-spinner 1s linear infinite',
      }}>
        <Loader size={11} strokeWidth={2.5} />
      </div>
    )
  }
  return null
}

interface ContextMenuProps {
  x: number
  y: number
  collapsed: boolean
  hasOutput: boolean
  displayPrompt: string
  onCollapse: () => void
  onClose: () => void
  onCopyPrompt: () => void
  onCopyOutput: () => void
}

function NodeContextMenu({ x, y, collapsed, hasOutput, onCollapse, onClose, onCopyPrompt, onCopyOutput }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
    background: 'var(--bg-card, #1e1e1e)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    minWidth: 160,
    padding: '3px 0',
    userSelect: 'none',
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 10px',
    fontSize: 11,
    cursor: 'pointer',
    color: 'var(--text)',
  }

  return (
    <div ref={menuRef} style={menuStyle} onClick={e => e.stopPropagation()}>
      <div
        style={itemStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onMouseDown={() => { onCopyPrompt(); onClose() }}
      >
        <Copy size={11} style={{ opacity: 0.7 }} />
        Copy prompt
      </div>
      {hasOutput && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onCopyOutput(); onClose() }}
        >
          <MessageSquare size={11} style={{ opacity: 0.7 }} />
          Copy output
        </div>
      )}
      <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
      <div
        style={itemStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onMouseDown={() => { onCollapse(); onClose() }}
      >
        {collapsed ? <ChevronDown size={11} style={{ opacity: 0.7 }} /> : <ChevronUp size={11} style={{ opacity: 0.7 }} />}
        {collapsed ? 'Expand node' : 'Collapse node'}
      </div>
    </div>
  )
}

export default function CanvasNode({
  step,
  index,
  x,
  y,
  width,
  selected,
  status = 'idle',
  presetKey,
  collapsed = false,
  outputText,
  dimmed = false,
  durationMs,
  onSelect,
  onDragStart,
  onToggleCollapse,
}: CanvasNodeProps) {
  const t = useT()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelect(step.id)
      onDragStart(step.id, e)
    },
    [step.id, onSelect, onDragStart]
  )

  const handleCollapseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleCollapse?.(step.id)
  }, [step.id, onToggleCollapse])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const displayTitle = getPresetStepText(presetKey, index, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, index, 'prompt', t, step.prompt)
  const promptPreview =
    displayPrompt.length > 60 ? displayPrompt.slice(0, 60) + '...' : displayPrompt

  const statusStyle = STATUS_STYLES[status]
  const isActive = selected || status === 'running'
  const nodeHeight = collapsed ? NODE_COLLAPSED_HEIGHT : NODE_MIN_HEIGHT

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Step ${index + 1}: ${displayTitle}${status !== 'idle' ? ` (${status})` : ''}`}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(step.id)
        }}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(step.id)
        }}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: width,
          height: nodeHeight,
          background: 'var(--bg-card, var(--bg-sessionpanel))',
          border: isActive
            ? '1.5px solid var(--accent)'
            : `1.5px solid ${statusStyle.borderColor}`,
          borderLeft: statusStyle.borderLeft || undefined,
          borderRadius: 8,
          padding: collapsed ? '0 12px' : '10px 12px',
          cursor: 'grab',
          boxShadow: isActive
            ? '0 2px 8px rgba(0,0,0,0.2)'
            : '0 1px 3px rgba(0,0,0,0.12)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, height 0.2s ease',
          userSelect: 'none',
          boxSizing: 'border-box',
          opacity: dimmed ? 0.25 : (statusStyle.opacity ?? 1),
          animation: statusStyle.animation || 'none',
          overflow: 'hidden',
          display: 'flex',
          alignItems: collapsed ? 'center' : 'flex-start',
          flexDirection: 'column',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {/* Step number badge */}
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            width: 20,
            height: 20,
            background: status === 'completed' ? '#22c55e' : 'var(--accent)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            transition: 'background 0.2s ease',
          }}
        >
          {index + 1}
        </div>

        {/* Status badge (top-right) */}
        <StatusBadge status={status} />

        {/* Collapse toggle button */}
        {onToggleCollapse && (
          <button
            onClick={handleCollapseClick}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: collapsed ? undefined : 4,
              top: collapsed ? '50%' : undefined,
              right: 6,
              transform: collapsed ? 'translateY(-50%)' : undefined,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 2,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              opacity: 0.6,
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        )}

        {/* Step title */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            marginBottom: collapsed ? 0 : 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingRight: 18,
            width: '100%',
          }}
        >
          {displayTitle}
        </div>

        {/* Prompt preview — hidden when collapsed */}
        {!collapsed && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {promptPreview}
          </div>
        )}

        {/* Duration chip — shown on completed nodes when not collapsed */}
        {!collapsed && status === 'completed' && durationMs !== undefined && (
          <div style={{
            marginTop: 4,
            fontSize: 9,
            color: '#22c55e',
            opacity: 0.8,
            fontWeight: 500,
          }}>
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </div>
        )}
      </div>

      {/* Context menu (rendered outside transform div via portal-like positioning) */}
      {ctxMenu && (
        <NodeContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          collapsed={collapsed}
          hasOutput={!!outputText}
          displayPrompt={displayPrompt}
          onCollapse={() => onToggleCollapse?.(step.id)}
          onClose={() => setCtxMenu(null)}
          onCopyPrompt={() => navigator.clipboard?.writeText(displayPrompt)}
          onCopyOutput={() => outputText && navigator.clipboard?.writeText(outputText)}
        />
      )}
    </>
  )
}
