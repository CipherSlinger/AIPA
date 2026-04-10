import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, Loader, ChevronUp, ChevronDown, Copy, MessageSquare, AlertCircle, GripVertical, PlusCircle, RefreshCw, Trash2 } from 'lucide-react'
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
  onDeleteNode?: (stepId: string) => void
  onInsertBefore?: (stepId: string) => void
  onInsertAfter?: (stepId: string) => void
  onRetry?: (stepId: string) => void
  onPromptChange?: (stepId: string, newPrompt: string) => void
}

export const NODE_WIDTH = 180
export const NODE_MIN_HEIGHT = 58
export const NODE_COLLAPSED_HEIGHT = 30
export const NODE_GAP_Y = 100

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
  completed: { borderColor: '#22c55e' },
  error: { borderColor: '#ef4444' },
}

// B5: StatusBadge — right-top icon indicator, size reduced to 10
function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', top: -5, right: -5,
        width: 13, height: 13, borderRadius: '50%',
        background: '#22c55e', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 0 1.5px var(--bg-card, #1e1e1e)',
      }}>
        <Check size={8} strokeWidth={3} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute', top: -5, right: -5,
        width: 13, height: 13, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'canvas-spinner 1s linear infinite',
        boxShadow: '0 0 0 1.5px var(--bg-card, #1e1e1e)',
      }}>
        <Loader size={8} strokeWidth={2.5} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute', top: -5, right: -5,
        width: 13, height: 13, borderRadius: '50%',
        background: '#ef4444', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 0 1.5px var(--bg-card, #1e1e1e)',
      }}>
        <AlertCircle size={8} strokeWidth={2.5} />
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
  status: StepStatus
  onCollapse: () => void
  onClose: () => void
  onCopyPrompt: () => void
  onCopyOutput: () => void
  onDeleteNode?: () => void
  onInsertBefore?: () => void
  onInsertAfter?: () => void
  onRetry?: () => void
}

function NodeContextMenu({ x, y, collapsed, hasOutput, status, onCollapse, onClose, onCopyPrompt, onCopyOutput, onDeleteNode, onInsertBefore, onInsertAfter, onRetry }: ContextMenuProps) {
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

  const deleteItemStyle: React.CSSProperties = {
    ...itemStyle,
    color: '#ef4444',
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
        Copy Prompt
      </div>
      {hasOutput && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onCopyOutput(); onClose() }}
        >
          <MessageSquare size={11} style={{ opacity: 0.7 }} />
          Copy Output
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
        {collapsed ? 'Expand Node' : 'Collapse Node'}
      </div>
      {onInsertBefore && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onInsertBefore(); onClose() }}
        >
          <PlusCircle size={11} style={{ opacity: 0.7 }} />
          Insert Before
        </div>
      )}
      {onInsertAfter && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onInsertAfter(); onClose() }}
        >
          <PlusCircle size={11} style={{ opacity: 0.7 }} />
          Insert After
        </div>
      )}
      {onRetry && status === 'error' && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onRetry(); onClose() }}
        >
          <RefreshCw size={11} style={{ opacity: 0.7 }} />
          Retry Step
        </div>
      )}
      {onDeleteNode && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <div
            style={deleteItemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onMouseDown={() => { onDeleteNode(); onClose() }}
          >
            <Trash2 size={11} style={{ opacity: 0.7 }} />
            Delete Step
          </div>
        </>
      )}
    </div>
  )
}

// B6: NodeHeader — titled region with type accent border
interface NodeHeaderProps {
  nodeType: string
  displayTitle: string
  isFirst: boolean
  isLast: boolean
  isEditingTitle: boolean
  editTitleValue: string
  titleInputRef: React.RefObject<HTMLInputElement>
  onEditTitleChange: (v: string) => void
  onTitleBlur: () => void
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onTitleInputMouseDown: (e: React.MouseEvent) => void
  onTitleDoubleClick: (e: React.MouseEvent) => void
  hasReorderHandle: boolean
}

function NodeHeader({
  nodeType,
  displayTitle,
  isFirst,
  isLast,
  isEditingTitle,
  editTitleValue,
  titleInputRef,
  onEditTitleChange,
  onTitleBlur,
  onTitleKeyDown,
  onTitleInputMouseDown,
  onTitleDoubleClick,
  hasReorderHandle,
}: NodeHeaderProps) {
  // B9: header left accent border color by node type
  const headerBorderLeft =
    nodeType === 'condition' ? '3px solid #f59e0b'
    : nodeType === 'parallel' ? '3px solid #a855f7'
    : '3px solid var(--accent)'

  // B9: node type icon prefix
  const typeIcon =
    nodeType === 'condition' ? '🔀 '
    : nodeType === 'parallel' ? '⚡ '
    : ''

  return (
    <div style={{
      padding: '5px 8px 4px',
      borderBottom: '1px solid var(--border)',
      borderLeft: headerBorderLeft,
      borderRadius: '8px 8px 0 0',
      flexShrink: 0,
      background: 'rgba(255,255,255,0.02)',
    }}>
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          value={editTitleValue}
          onChange={e => onEditTitleChange(e.target.value)}
          onBlur={onTitleBlur}
          onKeyDown={onTitleKeyDown}
          onMouseDown={onTitleInputMouseDown}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text)',
            width: '100%',
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
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingRight: 16,
            paddingLeft: hasReorderHandle ? 12 : 0,
            width: '100%',
            cursor: 'text',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
          onDoubleClick={onTitleDoubleClick}
        >
          {typeIcon && (
            <span style={{ fontSize: 9, flexShrink: 0, opacity: 0.8 }}>{typeIcon}</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayTitle}
          </span>
        </div>
      )}
    </div>
  )
}

// B7: ProgressBar — shown at node bottom
function ProgressBar({ status }: { status: StepStatus }) {
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 2,
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.15)',
      }}>
        <div style={{
          width: '40%',
          height: '100%',
          background: 'var(--accent)',
          animation: 'canvas-bar-shimmer 1.2s ease-in-out infinite',
        }} />
      </div>
    )
  }
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 2,
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: '#22c55e',
          transition: 'width 0.3s ease',
        }} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 2,
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: '#ef4444',
        }} />
      </div>
    )
  }
  return null
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
  onDeleteNode,
  onInsertBefore,
  onInsertAfter,
  onRetry,
  onPromptChange,
}: CanvasNodeProps) {
  const t = useT()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editPromptValue, setEditPromptValue] = useState('')
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Auto-focus prompt textarea when entering prompt edit mode
  useEffect(() => {
    if (isEditingPrompt && promptTextareaRef.current) {
      promptTextareaRef.current.focus()
      promptTextareaRef.current.select()
    }
  }, [isEditingPrompt])

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

  const handlePromptDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!onPromptChange) return
    e.stopPropagation()
    setEditPromptValue(step.prompt || '')
    setIsEditingPrompt(true)
  }, [step.prompt, onPromptChange])

  const commitPromptEdit = useCallback(() => {
    const trimmed = editPromptValue.trim()
    if (trimmed && trimmed !== step.prompt) {
      onPromptChange?.(step.id, trimmed)
    }
    setIsEditingPrompt(false)
  }, [editPromptValue, step.id, step.prompt, onPromptChange])

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setIsEditingPrompt(false) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitPromptEdit() }
  }, [commitPromptEdit])

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

  const nodeType = step.nodeType ?? 'prompt'

  const displayTitle = getPresetStepText(presetKey, index, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, index, 'prompt', t, step.prompt)

  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.idle
  const isActive = selected || status === 'running'
  const isMulti = multiSelected && !selected

  // D4: focused but not selected — dashed outline
  const isFocusedOnly = focused && !selected && !isMulti

  // Box shadow by selection state
  const boxShadow = isMulti
    ? '0 0 0 1.5px #f59e0b, 0 2px 8px rgba(0,0,0,0.25)'
    : isActive
      ? '0 0 0 1.5px var(--accent), 0 3px 12px rgba(0,0,0,0.25)'
      : '0 1px 4px rgba(0,0,0,0.2)'

  // Dynamic height: expand when showing output preview
  const nodeHeight = collapsed
    ? NODE_COLLAPSED_HEIGHT
    : (status === 'completed' && outputExpanded && outputText)
      ? NODE_MIN_HEIGHT + 48
      : NODE_MIN_HEIGHT

  // D5: format elapsed time
  const elapsedSec = liveElapsedMs !== undefined ? Math.floor(liveElapsedMs / 1000) : 0

  // Char count badge for completed output
  const charCount = outputText ? outputText.length : 0
  const charCountLabel = charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k chars` : `${charCount} chars`

  // B5: step number badge label — "01", "02", etc.
  const stepNumberLabel = String(index + 1).padStart(2, '0')

  // B5: step number badge background color by status
  const stepBadgeBg =
    status === 'running' ? 'var(--accent)'
    : status === 'completed' ? '#22c55e'
    : status === 'error' ? '#ef4444'
    : 'var(--bg-input, #2a2a2a)'

  const stepBadgeColor =
    (status === 'idle' || status === 'pending') ? 'var(--text-muted)' : '#fff'

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
            ? '1px solid var(--accent)'
            : isMulti
              ? '1.5px solid var(--accent)'
              : `1px solid ${statusStyle.borderColor}`,
          borderRadius: 8,
          padding: collapsed ? '0 10px' : 0,
          cursor: 'grab',
          // B1: layered box shadow
          boxShadow,
          // D4: focus ring
          outline: isFocusedOnly ? '2px dashed rgba(var(--accent-rgb, 59,130,246), 0.55)' : 'none',
          outlineOffset: 3,
          // B1: transition
          transition: 'box-shadow 0.15s, border-color 0.15s, opacity 0.2s ease, height 0.2s ease, background 0.2s ease',
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
        {/* Step number badge — left-top, outside the node */}
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: -7,
            width: 16,
            height: 16,
            background: stepBadgeBg,
            color: stepBadgeColor,
            fontSize: 8,
            fontWeight: 700,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            transition: 'background 0.2s ease',
            boxShadow: '0 0 0 1.5px var(--bg-primary, #1e1e1e)',
            zIndex: 2,
          }}
        >
          {stepNumberLabel}
        </div>

        {/* B5: Status badge (top-right) — spinner/check/error icon, size=10 */}
        <StatusBadge status={status} />

        {/* Reorder drag handle — shown on left side */}
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
              opacity: isNodeHovered ? 0.5 : 0,
              padding: '3px 2px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 2,
              transition: 'opacity 0.15s',
              zIndex: 3,
            }}
          >
            <GripVertical size={10} />
          </div>
        )}

        {/* Collapse toggle button */}
        {onToggleCollapse && (
          <button
            onClick={handleCollapseClick}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: collapsed ? undefined : 3,
              top: collapsed ? '50%' : undefined,
              right: 4,
              transform: collapsed ? 'translateY(-50%)' : undefined,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 2,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              opacity: isNodeHovered ? 0.6 : 0,
              transition: 'opacity 0.15s',
              zIndex: 3,
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
          </button>
        )}

        {/* Collapsed state: just show title inline */}
        {collapsed && (
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingRight: 20,
            paddingLeft: onReorderDragStart ? 12 : 0,
            width: '100%',
          }}>
            {displayTitle}
          </div>
        )}

        {/* B6: Three-zone layout — only when not collapsed */}
        {!collapsed && (
          <>
            {/* Zone 1: Header */}
            <NodeHeader
              nodeType={nodeType}
              displayTitle={displayTitle}
              isFirst={isFirst}
              isLast={isLast}
              isEditingTitle={isEditingTitle}
              editTitleValue={editTitleValue}
              titleInputRef={titleInputRef}
              onEditTitleChange={setEditTitleValue}
              onTitleBlur={commitTitleEdit}
              onTitleKeyDown={handleTitleKeyDown}
              onTitleInputMouseDown={e => e.stopPropagation()}
              onTitleDoubleClick={handleTitleDoubleClick}
              hasReorderHandle={!!onReorderDragStart}
            />

            {/* Zone 2: Body — prompt preview, streaming, condition/parallel content */}
            <div style={{
              background: 'transparent',
              padding: '5px 8px',
              flex: 1,
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}>
              {status === 'completed' && outputText ? (
                /* Completed: show output text */
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4, width: '100%' }}>
                  <div style={{
                    whiteSpace: outputExpanded ? 'pre-wrap' : undefined,
                    wordBreak: 'break-word',
                    display: outputExpanded ? 'block' : '-webkit-box',
                    WebkitLineClamp: outputExpanded ? undefined : 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {outputExpanded ? outputText.slice(0, 2000) : outputText.slice(0, 120)}
                    {!outputExpanded && outputText.length > 120 && '...'}
                  </div>
                  {!outputExpanded && outputText.length > 120 && (
                    <span style={{
                      display: 'inline-block',
                      background: 'rgba(34,197,94,0.1)',
                      color: '#22c55e',
                      fontSize: 9,
                      borderRadius: 3,
                      padding: '1px 4px',
                      marginLeft: 4,
                      verticalAlign: 'middle',
                    }}>
                      {charCountLabel}
                    </span>
                  )}
                  {outputText.length > 120 && (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setOutputExpanded(v => !v) }}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', fontSize: 9, color: 'var(--accent)',
                        marginTop: 2, display: 'block',
                      }}
                    >
                      {outputExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              ) : status === 'running' && streamingText ? (
                /* D2: Running with streaming text */
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
              ) : nodeType === 'condition' ? (
                /* Condition node body — condition text + Yes/No chips */
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4, width: '100%' }}>
                  <div style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    marginBottom: 3,
                    fontSize: 9,
                    lineHeight: 1.4,
                  }}>
                    {step.condition || displayPrompt}
                  </div>
                  {/* B9: Yes/No branch chips with borderRadius:10 */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 7px', borderRadius: 10, fontSize: 9,
                      background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      fontWeight: 600,
                    }}>
                      Yes
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 7px', borderRadius: 10, fontSize: 9,
                      background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                      fontWeight: 600,
                    }}>
                      No
                    </span>
                  </div>
                </div>
              ) : nodeType === 'parallel' ? (
                /* Parallel node body — prompt preview + sub-task count */
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4, width: '100%' }}>
                  <div style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    marginBottom: 3,
                    fontSize: 9,
                    lineHeight: 1.4,
                  }}>
                    {displayPrompt}
                  </div>
                  {step.parallelPrompts && step.parallelPrompts.length > 0 && (
                    <span style={{ fontSize: 9, background: 'rgba(168,85,247,0.12)', color: '#a855f7', borderRadius: 3, padding: '1px 5px', fontWeight: 600 }}>
                      {step.parallelPrompts.length} sub-prompt{step.parallelPrompts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ) : (
                /* Default prompt body — double-click to edit */
                isEditingPrompt ? (
                  <div onMouseDown={e => e.stopPropagation()}>
                    <textarea
                      ref={promptTextareaRef}
                      value={editPromptValue}
                      onChange={e => setEditPromptValue(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      onBlur={commitPromptEdit}
                      style={{
                        width: '100%',
                        minHeight: 48,
                        fontSize: 9,
                        color: 'var(--text-primary)',
                        background: 'var(--input-field-bg, rgba(255,255,255,0.06))',
                        border: '1px solid var(--accent)',
                        borderRadius: 3,
                        padding: '3px 5px',
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        lineHeight: 1.4,
                      }}
                    />
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                      Ctrl+Enter save · Esc cancel
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      cursor: onPromptChange ? 'text' : undefined,
                    }}
                    onDoubleClick={handlePromptDoubleClick}
                    title={onPromptChange ? 'Double-click to edit' : undefined}
                  >
                    {displayPrompt}
                  </div>
                )
              )}

              {/* Error output summary */}
              {status === 'error' && outputText && (
                <div style={{ fontSize: 9, color: '#ef4444', marginTop: 4, opacity: 0.8, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {outputText.slice(0, 80)}
                </div>
              )}
            </div>

            {/* B6: Zone 3 — Output result zone (only when completed + expanded + outputText) */}
            {status === 'completed' && outputExpanded && outputText && (
              <div style={{
                background: 'rgba(34,197,94,0.05)',
                borderTop: '1px solid rgba(34,197,94,0.15)',
                borderLeft: '3px solid #22c55e',
                padding: '6px 10px 6px 13px',
                width: '100%',
                boxSizing: 'border-box',
                flexShrink: 0,
              }}>
                <div style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.5,
                }}>
                  {outputText.slice(0, 300)}
                </div>
              </div>
            )}

            {/* D5: Live step timer — shown on running nodes after 1s */}
            {status === 'running' && elapsedSec >= 1 && (
              <div style={{
                position: 'absolute',
                bottom: 8,
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
            {status === 'completed' && durationMs !== undefined && (
              <div style={{
                marginTop: 'auto',
                paddingTop: 4,
                paddingBottom: 6,
                paddingRight: 10,
                fontSize: 9,
                color: '#22c55e',
                opacity: 0.75,
                fontWeight: 500,
                alignSelf: 'flex-end',
              }}>
                {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
              </div>
            )}
          </>
        )}

        {/* B7: Progress bar at node bottom */}
        <ProgressBar status={status} />
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <NodeContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          collapsed={collapsed}
          hasOutput={!!outputText}
          displayPrompt={displayPrompt}
          status={status}
          onCollapse={() => onToggleCollapse?.(step.id)}
          onClose={() => setCtxMenu(null)}
          onCopyPrompt={() => navigator.clipboard?.writeText(displayPrompt)}
          onCopyOutput={() => outputText && navigator.clipboard?.writeText(outputText)}
          onDeleteNode={onDeleteNode ? () => onDeleteNode(step.id) : undefined}
          onInsertBefore={onInsertBefore ? () => onInsertBefore(step.id) : undefined}
          onInsertAfter={onInsertAfter ? () => onInsertAfter(step.id) : undefined}
          onRetry={onRetry ? () => onRetry(step.id) : undefined}
        />
      )}
    </>
  )
}
