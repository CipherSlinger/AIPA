import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, Loader, ChevronUp, ChevronDown, Copy, MessageSquare, AlertCircle, GripVertical } from 'lucide-react'
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
  isFirst?: boolean
  isLast?: boolean
  multiSelected?: boolean
  focused?: boolean         // D4: keyboard focus visual ring
  streamingText?: string    // D2: live streaming output text
  liveElapsedMs?: number    // D5: real-time step execution timer
  onSelect: (stepId: string) => void
  onDragStart: (stepId: string, e: React.MouseEvent) => void
  onToggleCollapse?: (stepId: string) => void
  onTitleChange?: (stepId: string, newTitle: string) => void
  onMultiSelect?: (stepId: string, shiftKey: boolean) => void
  onReorderDragStart?: (stepId: string, e: React.MouseEvent) => void  // D6: drag to reorder
}

export const NODE_WIDTH = 220
export const NODE_MIN_HEIGHT = 70
export const NODE_COLLAPSED_HEIGHT = 36
export const NODE_GAP_Y = 120

const STATUS_STYLES: Record<string, {
  borderColor: string
  borderLeft?: string
  opacity?: number
  animation?: string
  glowColor?: string
}> = {
  idle: { borderColor: 'var(--border)' },
  pending: { borderColor: 'var(--border)', opacity: 0.55 },
  running: {
    borderColor: 'var(--accent)',
    animation: 'canvas-node-pulse 1.5s ease-in-out infinite',
    glowColor: 'rgba(var(--accent-rgb, 59,130,246), 0.08)',
  },
  completed: { borderColor: '#22c55e', borderLeft: '3px solid #22c55e' },
  error: { borderColor: '#ef4444', borderLeft: '3px solid #ef4444' },
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: '50%',
        background: '#22c55e', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 0 2px var(--bg-card, #1e1e1e)',
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
        boxShadow: '0 0 0 2px var(--bg-card, #1e1e1e)',
      }}>
        <Loader size={11} strokeWidth={2.5} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: '50%',
        background: '#ef4444', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 0 2px var(--bg-card, #1e1e1e)',
      }}>
        <AlertCircle size={11} strokeWidth={2.5} />
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
    boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
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
        复制提示词
      </div>
      {hasOutput && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onCopyOutput(); onClose() }}
        >
          <MessageSquare size={11} style={{ opacity: 0.7 }} />
          复制输出内容
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
        {collapsed ? '展开节点' : '折叠节点'}
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
  isFirst = false,
  isLast = false,
  multiSelected = false,
  focused = false,
  streamingText,
  liveElapsedMs,
  onSelect,
  onDragStart,
  onToggleCollapse,
  onTitleChange,
  onMultiSelect,
  onReorderDragStart,
}: CanvasNodeProps) {
  const t = useT()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Reset output expansion when node changes status
  useEffect(() => {
    if (status !== 'completed') setOutputExpanded(false)
  }, [status])

  // Auto-focus title input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitleValue(step.title || '')
    setIsEditingTitle(true)
  }, [step.title])

  const commitTitleEdit = useCallback(() => {
    const trimmed = editTitleValue.trim()
    if (trimmed && trimmed !== step.title) {
      onTitleChange?.(step.id, trimmed)
    }
    setIsEditingTitle(false)
  }, [editTitleValue, step.id, step.title, onTitleChange])

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false)
  }, [])

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit() }
  }, [commitTitleEdit, cancelTitleEdit])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.shiftKey && onMultiSelect) {
        onMultiSelect(step.id, true)
        return
      }
      onSelect(step.id)
      onDragStart(step.id, e)
    },
    [step.id, onSelect, onDragStart, onMultiSelect]
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
    displayPrompt.length > 60 ? displayPrompt.slice(0, 60) + '…' : displayPrompt

  // Truncated output inline preview (shows on completed nodes)
  const outputPreview = outputText
    ? (outputText.length > 80 ? outputText.slice(0, 80) + '…' : outputText)
    : null

  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.idle
  const isActive = selected || status === 'running'
  const isMulti = multiSelected && !selected

  // D4: focused but not selected — dashed outline
  const isFocusedOnly = focused && !selected && !isMulti

  // Dynamic height: expand when showing output preview
  const nodeHeight = collapsed
    ? NODE_COLLAPSED_HEIGHT
    : (status === 'completed' && outputExpanded && outputText)
      ? NODE_MIN_HEIGHT + 56
      : NODE_MIN_HEIGHT

  const badgeColor = status === 'completed' ? '#22c55e' : status === 'running' ? 'var(--accent)' : 'var(--text-muted)'

  // D5: format elapsed time
  const elapsedSec = liveElapsedMs !== undefined ? Math.floor(liveElapsedMs / 1000) : 0

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
        onMouseEnter={() => setIsNodeHovered(true)}
        onMouseLeave={() => setIsNodeHovered(false)}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: width,
          height: nodeHeight,
          background: status === 'running'
            ? (statusStyle.glowColor || 'var(--bg-card, var(--bg-sessionpanel))')
            : isMulti
              ? 'rgba(var(--accent-rgb, 59,130,246), 0.06)'
              : 'var(--bg-card, var(--bg-sessionpanel))',
          border: isActive
            ? '1.5px solid var(--accent)'
            : isMulti
              ? '2px solid var(--accent)'
              : `1.5px solid ${statusStyle.borderColor}`,
          borderLeft: (() => {
            if (isActive) return undefined
            if (statusStyle.borderLeft) return statusStyle.borderLeft
            if (isFirst) return '3px solid #6366f1'
            if (isLast) return '3px solid #f59e0b'
            return undefined
          })(),
          borderRadius: 8,
          padding: collapsed ? '0 12px' : '10px 12px 8px',
          cursor: 'grab',
          boxShadow: isActive
            ? '0 4px 16px rgba(0,0,0,0.25)'
            : status === 'completed'
              ? '0 2px 8px rgba(34,197,94,0.08)'
              : '0 1px 3px rgba(0,0,0,0.12)',
          // D4: focus ring — dashed outline when focused but not selected
          outline: isFocusedOnly ? '2px dashed rgba(var(--accent-rgb, 59,130,246), 0.55)' : 'none',
          outlineOffset: 3,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, height 0.2s ease, background 0.2s ease',
          userSelect: 'none',
          boxSizing: 'border-box',
          opacity: dimmed ? 0.2 : (statusStyle.opacity ?? 1),
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
            background: status === 'completed' ? '#22c55e' : status === 'running' ? 'var(--accent)' : status === 'error' ? '#ef4444' : 'var(--text-muted)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            transition: 'background 0.2s ease',
            boxShadow: '0 0 0 2px var(--bg-main, #141414)',
          }}
        >
          {index + 1}
        </div>

        {/* Status badge (top-right) */}
        <StatusBadge status={status} />

        {/* D6: Reorder drag handle — shown on left side */}
        {onReorderDragStart && !collapsed && (
          <div
            onMouseDown={e => { e.stopPropagation(); onReorderDragStart(step.id, e) }}
            title="Drag to reorder"
            style={{
              position: 'absolute',
              left: 2,
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'ns-resize',
              color: 'var(--text-muted)',
              opacity: isNodeHovered ? 0.65 : 0,
              padding: '4px 3px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 2,
              transition: 'opacity 0.15s',
            }}
          >
            <GripVertical size={12} />
          </div>
        )}

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
              opacity: 0.5,
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        )}

        {/* Step title — double-click to inline edit */}
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={editTitleValue}
            onChange={e => setEditTitleValue(e.target.value)}
            onBlur={commitTitleEdit}
            onKeyDown={handleTitleKeyDown}
            onMouseDown={e => e.stopPropagation()}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: collapsed ? 0 : 4,
              width: '100%',
              paddingRight: 20,
              background: 'var(--input-field-bg, rgba(255,255,255,0.06))',
              border: '1px solid var(--accent)',
              borderRadius: 3,
              outline: 'none',
              padding: '1px 4px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: collapsed ? 0 : 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              paddingRight: 20,
              paddingLeft: onReorderDragStart ? 14 : 0,
              width: '100%',
              cursor: 'text',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            onDoubleClick={handleTitleDoubleClick}
          >
            {isFirst && (
              <span style={{ color: '#6366f1', fontSize: 10, flexShrink: 0 }}>▶</span>
            )}
            {isLast && !isFirst && (
              <span style={{ color: '#f59e0b', fontSize: 10, flexShrink: 0 }}>⚑</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayTitle}
            </span>
          </div>
        )}

        {/* Prompt preview / output preview / streaming text — hidden when collapsed */}
        {!collapsed && (
          <>
            {status === 'completed' && outputText ? (
              /* Completed: show output text */
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.45, width: '100%' }}>
                <div style={{
                  display: outputExpanded ? 'block' : '-webkit-box',
                  WebkitLineClamp: outputExpanded ? undefined : 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  whiteSpace: outputExpanded ? 'pre-wrap' : undefined,
                  wordBreak: 'break-word',
                }}>
                  {outputText}
                </div>
                {outputText.length > 80 && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setOutputExpanded(v => !v) }}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      cursor: 'pointer', fontSize: 9, color: 'var(--accent)',
                      marginTop: 2,
                    }}
                  >
                    {outputExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            ) : status === 'running' && streamingText ? (
              /* D2: Running with streaming text — show live output */
              <div style={{
                fontSize: 9,
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                opacity: 0.85,
                fontStyle: 'italic',
                width: '100%',
              }}>
                {streamingText}
              </div>
            ) : (
              /* Default: show prompt preview */
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {promptPreview}
              </div>
            )}
          </>
        )}

        {/* D5: Live step timer — shown on running nodes after 1s */}
        {!collapsed && status === 'running' && elapsedSec >= 1 && (
          <div style={{
            position: 'absolute',
            bottom: 6,
            right: 10,
            fontSize: 9,
            color: 'var(--accent)',
            opacity: 0.8,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            pointerEvents: 'none',
          }}>
            ⏱ {elapsedSec}s
          </div>
        )}

        {/* Duration chip — shown on completed nodes */}
        {!collapsed && status === 'completed' && durationMs !== undefined && (
          <div style={{
            marginTop: 'auto',
            paddingTop: 4,
            fontSize: 9,
            color: '#22c55e',
            opacity: 0.75,
            fontWeight: 500,
            alignSelf: 'flex-end',
          }}>
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </div>
        )}

        {/* Running shimmer line */}
        {status === 'running' && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            borderRadius: '0 0 8px 8px',
            background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
            animation: 'canvas-shimmer 1.6s ease-in-out infinite',
          }} />
        )}
      </div>

      {/* Context menu */}
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
