import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, Loader, ChevronUp, ChevronDown, Copy, MessageSquare, AlertCircle, GripVertical, PlusCircle, RefreshCw, Trash2, Play, Star, GitBranch, Layers } from 'lucide-react'
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
  stepDuration?: number
  isFirst?: boolean
  isLast?: boolean
  multiSelected?: boolean
  focused?: boolean         // D4: keyboard focus visual ring
  streamingText?: string    // D2: live streaming output text
  liveElapsedMs?: number    // D5: real-time step execution timer
  stepIndex?: number        // V7: step number shown in collapsed state
  highlighted?: boolean     // V10: search match glow
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
  onRunFromStep?: () => void  // Run workflow starting from this step
  onPromptChange?: (stepId: string, newPrompt: string) => void
  onHeightChange?: (stepId: string, height: number) => void
  onDuplicate?: (stepId: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRetryStep?: () => void
}

const NODE_DOT_BOUNCE_STYLE = `
@keyframes node-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-4px); opacity: 1; }
}
@keyframes canvas-node-in {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes canvas-running-bar {
  0%   { opacity: 0.5; transform: scaleX(0.6); }
  50%  { opacity: 1;   transform: scaleX(1); }
  100% { opacity: 0.5; transform: scaleX(0.6); }
}
`

export const NODE_WIDTH = 260
export const NODE_MIN_HEIGHT = 68
export const NODE_COLLAPSED_HEIGHT = 30
export const NODE_GAP_Y = 100

const STATUS_STYLES: Record<string, {
  borderColor: string
  borderLeft?: string
  opacity?: number
  animation?: string
  glowColor?: string
  boxShadow?: string
  hoverBoxShadow?: string
}> = {
  idle: {
    borderColor: 'var(--border)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 var(--bg-hover)',
    hoverBoxShadow: '0 6px 20px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 var(--bg-hover)',
  },
  pending: {
    borderColor: 'var(--border)',
    opacity: 0.55,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 var(--bg-hover)',
    hoverBoxShadow: '0 6px 20px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 var(--bg-hover)',
  },
  running: {
    borderColor: 'rgba(99,102,241,0.5)',
    animation: 'canvas-node-pulse 1.5s ease-in-out infinite',
    glowColor: 'var(--bg-secondary)',
    boxShadow: '0 0 12px 3px rgba(99,102,241,0.35), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 var(--bg-hover)',
    hoverBoxShadow: '0 0 16px 4px rgba(99,102,241,0.45), 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 var(--bg-hover)',
  },
  completed: {
    borderColor: '#22c55e',
    borderLeft: '2px solid #22c55e',
    boxShadow: '0 0 0 2px rgba(34,197,94,0.15), 0 4px 16px rgba(0,0,0,0.4)',
    hoverBoxShadow: '0 0 0 2px rgba(34,197,94,0.25), 0 8px 24px rgba(0,0,0,0.5)',
  },
  error: {
    borderColor: '#f87171',
    boxShadow: '0 0 0 2px rgba(239,68,68,0.15), 0 4px 16px rgba(0,0,0,0.4)',
    hoverBoxShadow: '0 0 0 2px rgba(239,68,68,0.25), 0 8px 24px rgba(0,0,0,0.5)',
  },
}

// B5: StatusBadge — right-top icon indicator
function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 16, height: 16, borderRadius: '50%',
        background: '#4ade80', color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 4px rgba(74,222,128,0.6), 0 0 0 2px rgba(12,12,20,0.95)',
      }}>
        <Check size={9} strokeWidth={3} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 16, height: 16, borderRadius: '50%',
        background: 'rgba(99,102,241,0.9)', color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'canvas-spinner 1s linear infinite',
        boxShadow: '0 0 6px rgba(99,102,241,0.7), 0 0 0 2px rgba(12,12,20,0.95)',
      }}>
        <Loader size={9} strokeWidth={2.5} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute', top: -6, right: -6,
        width: 16, height: 16, borderRadius: '50%',
        background: '#f87171', color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 4px rgba(248,113,113,0.6), 0 0 0 2px rgba(12,12,20,0.95)',
      }}>
        <AlertCircle size={9} strokeWidth={2.5} />
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
  onRunFromStep?: () => void
}

function NodeContextMenu({ x, y, collapsed, hasOutput, status, onCollapse, onClose, onCopyPrompt, onCopyOutput, onDeleteNode, onInsertBefore, onInsertAfter, onRetry, onRunFromStep }: ContextMenuProps) {
  const t = useT()
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
    background: 'rgba(18,18,30,0.97)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px var(--bg-hover)',
    minWidth: 168,
    padding: '4px 0',
    userSelect: 'none',
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px',
    fontSize: 12,
    cursor: 'pointer',
    color: 'var(--text-primary)',
    transition: 'all 0.15s ease',
  }

  const deleteItemStyle: React.CSSProperties = {
    ...itemStyle,
    color: '#f87171',
  }

  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: 'var(--border)',
    margin: '3px 0',
  }

  return (
    <div ref={menuRef} style={menuStyle} onClick={e => e.stopPropagation()}>
      <div
        style={itemStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onMouseDown={() => { onCopyPrompt(); onClose() }}
      >
        <Copy size={12} style={{ opacity: 0.7 }} />
        {t('canvas.copyPrompt')}
      </div>
      {hasOutput && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onCopyOutput(); onClose() }}
        >
          <MessageSquare size={12} style={{ opacity: 0.7 }} />
          {t('canvas.copyOutput')}
        </div>
      )}
      <div style={dividerStyle} />
      <div
        style={itemStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onMouseDown={() => { onCollapse(); onClose() }}
      >
        {collapsed ? <ChevronDown size={12} style={{ opacity: 0.7 }} /> : <ChevronUp size={12} style={{ opacity: 0.7 }} />}
        {collapsed ? t('canvas.expandNode') : t('canvas.collapseNode')}
      </div>
      {onInsertBefore && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onInsertBefore(); onClose() }}
        >
          <PlusCircle size={12} style={{ opacity: 0.7 }} />
          {t('canvas.insertBefore')}
        </div>
      )}
      {onInsertAfter && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onInsertAfter(); onClose() }}
        >
          <PlusCircle size={12} style={{ opacity: 0.7 }} />
          {t('canvas.insertAfter')}
        </div>
      )}
      {onRetry && status === 'error' && (
        <div
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={() => { onRetry(); onClose() }}
        >
          <RefreshCw size={12} style={{ opacity: 0.7 }} />
          {t('canvas.retryStep')}
        </div>
      )}
      {/* Run from this step */}
      {onRunFromStep && (
        <>
          <div style={dividerStyle} />
          <div
            style={{ ...itemStyle, color: '#818cf8' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onMouseDown={() => { onRunFromStep(); onClose() }}
          >
            <Play size={11} style={{ opacity: 0.85 }} />
            {t('workflow.runFromStep')}
          </div>
        </>
      )}
      {onDeleteNode && (
        <>
          <div style={dividerStyle} />
          <div
            style={deleteItemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onMouseDown={() => { onDeleteNode(); onClose() }}
          >
            <Trash2 size={12} style={{ opacity: 0.7 }} />
            {t('canvas.deleteStep')}
          </div>
        </>
      )}
    </div>
  )
}

// B6: NodeHeader — titled region with type accent border
interface NodeHeaderProps {
  nodeType: string
  nodeTypeColor: string
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
  nodeTypeColor,
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
  const headerBorderLeft = `3px solid ${nodeTypeColor}`

  // B9: node type icon badge config
  const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    condition: { icon: <GitBranch size={9} />, color: '#fbbf24', label: 'IF' },
    parallel: { icon: <Layers size={9} />, color: '#6366f1', label: '∥' },
    loop: { icon: <RefreshCw size={9} />, color: '#a78bfa', label: 'LOOP' },
  }
  const typeBadgeConfig = (nodeType && nodeType !== 'standard') ? typeConfig[nodeType] : undefined

  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      borderLeft: headerBorderLeft,
      borderRadius: '12px 12px 0 0',
      flexShrink: 0,
      background: 'rgba(255,255,255,0.03)',
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
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            width: '100%',
            background: 'var(--bg-hover)',
            border: '1px solid rgba(99,102,241,0.6)',
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
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
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
          {typeBadgeConfig && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: typeBadgeConfig.color,
              background: `${typeBadgeConfig.color}22`,
              borderRadius: 6,
              padding: '2px 7px',
              border: `1px solid ${typeBadgeConfig.color}40`,
              flexShrink: 0,
            }}>
              {typeBadgeConfig.icon}
              {typeBadgeConfig.label}
            </span>
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
        height: 3,
        borderRadius: '0 0 12px 12px',
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.2)',
      }}>
        <div style={{
          width: '40%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.9), rgba(99,102,241,0.7), transparent)',
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
        height: 3,
        borderRadius: '0 0 12px 12px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, #22c55e, #4ade80)',
          transition: 'all 0.15s ease',
        }} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 3,
        borderRadius: '0 0 12px 12px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: '#f87171',
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
  stepDuration,
  isFirst = false,
  isLast = false,
  multiSelected = false,
  focused = false,
  streamingText,
  liveElapsedMs,
  stepIndex,
  highlighted = false,
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
  onRunFromStep,
  onPromptChange,
  onHeightChange,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onRetryStep,
}: CanvasNodeProps) {
  const t = useT()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editPromptValue, setEditPromptValue] = useState('')
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const [outputCopied, setOutputCopied] = useState(false)   // F7: copy button state
  const [promptCopied, setPromptCopied] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)  // F8: flash on complete
  const [showNote, setShowNote] = useState(false)
  const [noteText, setNoteText] = useState(() => {
    try { return localStorage.getItem(`aipa:step-note:${step.id}`) ?? '' } catch { return '' }
  })
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(`aipa:step-pin:${step.id}`) === '1' } catch { return false }
  })
  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    try {
      if (next) localStorage.setItem(`aipa:step-pin:${step.id}`, '1')
      else localStorage.removeItem(`aipa:step-pin:${step.id}`)
    } catch {}
  }
  const prevStatusRef = useRef<string | undefined>(undefined) // F8: track previous status

  const saveNote = (text: string) => {
    setNoteText(text)
    try {
      if (text.trim()) localStorage.setItem(`aipa:step-note:${step.id}`, text)
      else localStorage.removeItem(`aipa:step-note:${step.id}`)
    } catch {}
  }
  const titleInputRef = useRef<HTMLInputElement>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const streamingContainerRef = useRef<HTMLDivElement>(null)

  // Reset output expansion when node changes status
  useEffect(() => {
    if (status !== 'completed') setOutputExpanded(false)
  }, [status])

  // F8: Flash animation when step transitions running -> completed
  useEffect(() => {
    if (prevStatusRef.current === 'running' && status === 'completed') {
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 700)
    }
    prevStatusRef.current = status
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

  // Report height changes via ResizeObserver
  useEffect(() => {
    if (!onHeightChange || !nodeRef.current) return
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) onHeightChange(step.id, entry.contentRect.height)
    })
    ro.observe(nodeRef.current)
    return () => ro.disconnect()
  }, [step.id, onHeightChange])

  // Auto-scroll streaming text container to bottom as new text arrives
  useEffect(() => {
    if (streamingContainerRef.current && status === 'running') {
      streamingContainerRef.current.scrollTop = streamingContainerRef.current.scrollHeight
    }
  }, [streamingText, status])

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

  const nodeTypeColor = nodeType === 'condition'
    ? '#fbbf24'
    : nodeType === 'parallel'
    ? '#a78bfa'
    : '#818cf8'

  const displayTitle = getPresetStepText(presetKey, index, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, index, 'prompt', t, step.prompt)

  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.idle
  const isActive = selected || status === 'running'
  const isMulti = multiSelected && !selected

  // D4: focused but not selected — dashed outline
  const isFocusedOnly = focused && !selected && !isMulti

  // Box shadow by selection state — richer glows; hover lifts the shadow
  const baseBoxShadow = isMulti
    ? '0 0 0 1.5px #fbbf24, 0 4px 16px rgba(0,0,0,0.4)'
    : selected
      ? '0 0 0 2px rgba(99,102,241,0.25), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 var(--bg-hover)'
      : isActive
        ? `0 0 12px 3px rgba(99,102,241,0.35), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 var(--bg-hover)`
        : (isNodeHovered && !isMulti && !selected && !isActive)
          ? (statusStyle.hoverBoxShadow ?? statusStyle.boxShadow ?? '0 6px 20px rgba(0,0,0,0.45), inset 0 1px 0 var(--bg-hover)')
          : statusStyle.boxShadow ?? '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 var(--bg-hover)'

  // F8: flash glow when just completed; V10: highlighted glow for search match
  const boxShadow = justCompleted
    ? '0 0 0 2px rgba(34,197,94,0.6), 0 0 20px rgba(34,197,94,0.3)'
    : highlighted
      ? `${baseBoxShadow}, 0 0 0 2px #818cf8, 0 0 16px rgba(99,102,241,0.35)`
      : baseBoxShadow

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
  const charCountLabel = charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k ${t('canvas.chars')}` : `${charCount} ${t('canvas.chars')}`

  // B5: step number badge label — "01", "02", etc.
  const stepNumberLabel = String(index + 1).padStart(2, '0')

  // B5: step number badge background color by status
  const stepBadgeBg =
    status === 'running' ? 'rgba(99,102,241,0.9)'
    : status === 'completed' ? '#4ade80'
    : status === 'error' ? '#f87171'
    : 'var(--text-muted)'

  const stepBadgeColor =
    (status === 'idle' || status === 'pending') ? 'var(--text-muted)' : 'var(--text-primary)'

  const nodeBorder = selected
    ? '1px solid rgba(99,102,241,0.60)'
    : isActive
      ? `1px solid rgba(99,102,241,0.5)`
      : isMulti
        ? `1.5px solid ${nodeTypeColor}`
        : `1px solid ${statusStyle.borderColor}`

  // Node background — use var(--bg-secondary) as base card background
  const nodeBackground = status === 'running'
    ? (statusStyle.glowColor || 'var(--bg-secondary)')
    : isMulti
      ? 'rgba(99,102,241,0.06)'
      : 'var(--bg-secondary)'

  // Improvement 1: output word count for Zone 3
  const outputWordCount = outputText ? outputText.trim().split(/\s+/).filter(Boolean).length : 0
  const outputTokenEstimate = outputWordCount > 0 ? Math.round(outputWordCount * 1.3) : 0

  return (
    <>
      <style>{NODE_DOT_BOUNCE_STYLE}</style>
      <div
        ref={nodeRef}
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
          if (e.key === 'Enter') {
            onSelect(step.id)
            if (!isEditingPrompt && !collapsed) {
              e.preventDefault()
              setEditPromptValue(step.prompt || '')
              setIsEditingPrompt(true)
            }
          }
          if (e.key === 'Escape' && isEditingPrompt) {
            e.preventDefault()
            setIsEditingPrompt(false)
            setEditPromptValue(step.prompt || '')
          }
        }}
        onMouseEnter={() => setIsNodeHovered(true)}
        onMouseLeave={() => setIsNodeHovered(false)}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: width,
          height: nodeHeight,
          background: nodeBackground,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: nodeBorder,
          borderRadius: 12,
          padding: collapsed ? '0 10px' : 0,
          cursor: 'grab',
          boxShadow,
          // D4: focus ring; V10: highlighted outline for search match
          outline: highlighted
            ? '2px solid rgba(99,102,241,0.6)'
            : isFocusedOnly ? '2px dashed rgba(99,102,241,0.55)' : 'none',
          outlineOffset: 3,
          // B1: transition + hover-lift
          transition: 'all 0.15s ease',
          transform: (isNodeHovered && !dimmed && !selected && !isActive && !isMulti) ? 'translateY(-2px)' : undefined,
          userSelect: 'none',
          boxSizing: 'border-box',
          opacity: dimmed ? 0.2 : (statusStyle.opacity ?? 1),
          animation: statusStyle.animation
            ? `canvas-node-in 0.18s ease-out both, ${statusStyle.animation}`
            : 'canvas-node-in 0.18s ease-out both',
          overflow: 'hidden',
          display: 'flex',
          alignItems: collapsed ? 'center' : 'flex-start',
          flexDirection: 'column',
          justifyContent: collapsed ? 'center' : 'flex-start',
          ...(pinned ? { borderTop: '2px solid #fbbf24' } : {}),
        }}
      >
        {/* Top color accent strip by node type */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: nodeTypeColor,
          borderRadius: '12px 12px 0 0',
          opacity: 0.85,
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        {/* Running pulse overlay on top strip */}
        {status === 'running' && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 3,
            borderRadius: '12px 12px 0 0',
            background: `linear-gradient(90deg, transparent, rgba(99,102,241,0.9), transparent)`,
            animation: 'canvas-running-bar 1.4s ease-in-out infinite',
            transformOrigin: 'center',
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        )}

        {/* Step number badge — left-top, outside the node */}
        <div
          style={{
            position: 'absolute',
            top: -7,
            left: -8,
            width: 18,
            height: 18,
            background: stepBadgeBg,
            color: stepBadgeColor,
            fontSize: 9,
            fontWeight: 800,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          transition: 'all 0.15s ease',
            boxShadow: '0 0 0 2px rgba(12,12,20,0.95)',
            zIndex: 2,
          }}
        >
          {stepNumberLabel}
        </div>

        {/* B5: Status badge (top-right) — spinner/check/error icon */}
        <StatusBadge status={status} />

        {/* Reorder drag handle — shown on left side */}
        {onReorderDragStart && !collapsed && (
          <div
            onMouseDown={e => { e.stopPropagation(); onReorderDragStart(step.id, e) }}
            title={t('canvas.dragToReorder')}
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
              transition: 'all 0.15s ease',
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
              transition: 'all 0.15s ease',
              zIndex: 3,
            }}
            title={collapsed ? t('canvas.expandNode') : t('canvas.collapseNode')}
          >
            {collapsed ? (
              <ChevronDown size={9} style={{ transform: 'rotate(0deg)', transition: 'all 0.15s ease' }} />
            ) : (
              <ChevronUp size={9} style={{ transform: 'rotate(180deg)', transition: 'all 0.15s ease' }} />
            )}
          </button>
        )}

        {/* Reorder buttons */}
        {isNodeHovered && !collapsed && (onMoveUp || onMoveDown) && (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 3,
              right: onToggleCollapse ? 20 : 4,
              display: 'flex',
              gap: 1,
              flexShrink: 0,
              zIndex: 3,
            }}
          >
            <button
              onClick={e => { e.stopPropagation(); onMoveUp?.() }}
              disabled={!onMoveUp}
              title="Move step up"
              style={{
                background: 'none', border: 'none', cursor: onMoveUp ? 'pointer' : 'not-allowed',
                color: onMoveUp ? 'var(--text-muted)' : 'rgba(255,255,255,0.15)',
                padding: '1px 3px', borderRadius: 3, fontSize: 10, lineHeight: 1,
                display: 'flex', alignItems: 'center', transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (onMoveUp) e.currentTarget.style.color = '#818cf8' }}
              onMouseLeave={e => { e.currentTarget.style.color = onMoveUp ? 'var(--text-muted)' : 'rgba(255,255,255,0.15)' }}
            >▲</button>
            <button
              onClick={e => { e.stopPropagation(); onMoveDown?.() }}
              disabled={!onMoveDown}
              title="Move step down"
              style={{
                background: 'none', border: 'none', cursor: onMoveDown ? 'pointer' : 'not-allowed',
                color: onMoveDown ? 'var(--text-muted)' : 'rgba(255,255,255,0.15)',
                padding: '1px 3px', borderRadius: 3, fontSize: 10, lineHeight: 1,
                display: 'flex', alignItems: 'center', transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (onMoveDown) e.currentTarget.style.color = '#818cf8' }}
              onMouseLeave={e => { e.currentTarget.style.color = onMoveDown ? 'var(--text-muted)' : 'rgba(255,255,255,0.15)' }}
            >▼</button>
          </div>
        )}

        {/* Collapsed state: show step number, status dot, title, and prompt preview */}
        {collapsed && (
          <div style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            paddingRight: 20,
            paddingLeft: onReorderDragStart ? 12 : 0,
            width: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              {stepIndex !== undefined && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#818cf8',
                  background: 'rgba(99,102,241,0.2)', borderRadius: 4,
                  padding: '1px 5px', flexShrink: 0,
                }}>
                  {stepIndex + 1}
                </span>
              )}
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: stepBadgeBg,
                boxShadow: status === 'completed'
                  ? '0 0 4px rgba(74,222,128,0.6)'
                  : status === 'running'
                    ? '0 0 4px rgba(99,102,241,0.6)'
                    : status === 'error'
                      ? '0 0 4px rgba(248,113,113,0.6)'
                      : 'none',
              }} />
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {step.title || `Step ${(stepIndex ?? 0) + 1}`}
              </span>
            </div>
            {step.prompt && (
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                opacity: 0.55,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 3,
                lineHeight: 1.4,
              }}>
                {step.prompt.slice(0, 70)}
              </div>
            )}
          </div>
        )}

        {/* Note toggle button */}
        {!collapsed && (
          <button
            onClick={e => { e.stopPropagation(); setShowNote(v => !v) }}
            onMouseDown={e => e.stopPropagation()}
            title={noteText ? 'Edit note' : 'Add note'}
            style={{
              position: 'absolute',
              top: 20,
              right: 26,
              background: noteText ? 'rgba(234,179,8,0.15)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: noteText ? '#fbbf24' : 'var(--text-muted)',
              padding: 2,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              opacity: (isNodeHovered || !!noteText) ? 0.8 : 0,
              transition: 'all 0.15s ease',
              fontSize: 11,
              zIndex: 4,
            }}
          >
            📝
          </button>
        )}

        {/* Pin/bookmark toggle */}
        {!collapsed && (isNodeHovered || pinned) && (
          <button
            onClick={e => { e.stopPropagation(); togglePin() }}
            onMouseDown={e => e.stopPropagation()}
            title={pinned ? 'Unpin step' : 'Pin step'}
            style={{
              position: 'absolute',
              top: 20,
              right: 46,
              background: pinned ? 'rgba(251,191,36,0.15)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 4,
              color: pinned ? '#fbbf24' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              opacity: isNodeHovered || pinned ? 1 : 0,
              transition: 'all 0.15s ease',
              zIndex: 5,
            }}
          >
            <Star size={11} fill={pinned ? '#fbbf24' : 'none'} />
          </button>
        )}

        {/* Duplicate step button */}
        {!collapsed && isNodeHovered && onDuplicate && (
          <button
            onClick={e => { e.stopPropagation(); onDuplicate(step.id) }}
            onMouseDown={e => e.stopPropagation()}
            title="Duplicate step"
            style={{
              position: 'absolute',
              top: 20,
              right: 66,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 4,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              opacity: isNodeHovered ? 1 : 0,
              transition: 'all 0.15s ease',
              zIndex: 5,
            }}
          >
            <Copy size={11} />
          </button>
        )}

        {/* B6: Three-zone layout — only when not collapsed */}
        {!collapsed && (
          <>
            {/* Zone 1: Header */}
            <NodeHeader
              nodeType={nodeType}
              nodeTypeColor={nodeTypeColor}
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
              padding: '8px 12px',
              flex: 1,
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              {status === 'completed' && outputText ? (
                /* Completed: show output text */
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, width: '100%' }}>
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
                      background: 'rgba(34,197,94,0.12)',
                      color: '#22c55e',
                      fontSize: 9,
                      borderRadius: 10,
                      padding: '2px 7px',
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
                        cursor: 'pointer', fontSize: 9, color: '#818cf8',
                        marginTop: 2, display: 'block',
                      }}
                    >
                      {outputExpanded ? t('canvas.showLess') : t('canvas.showMore')}
                    </button>
                  )}
                </div>
              ) : status === 'running' && streamingText ? (
                /* D2: Running with streaming text */
                <div
                  ref={streamingContainerRef}
                  style={{
                    fontSize: 10,
                    color: 'rgba(99,102,241,0.85)',
                    lineHeight: 1.4,
                    overflowY: 'auto',
                    maxHeight: 200,
                    opacity: 0.9,
                    fontStyle: 'italic',
                    width: '100%',
                  }}>
                  {streamingText}
                  {/* Improvement 1: typing dots below streaming text */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'rgba(99,102,241,0.8)',
                          animation: `node-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : nodeType === 'condition' ? (
                /* Condition node body — condition text + Yes/No chips */
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, width: '100%' }}>
                  <div style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    marginBottom: 3,
                    fontSize: 10,
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
                      background: 'rgba(239,68,68,0.12)', color: '#f87171',
                      fontWeight: 600,
                    }}>
                      No
                    </span>
                  </div>
                </div>
              ) : nodeType === 'parallel' ? (
                /* Parallel node body — prompt preview + sub-task count */
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, width: '100%' }}>
                  <div style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    marginBottom: 3,
                    fontSize: 10,
                    lineHeight: 1.4,
                  }}>
                    {displayPrompt}
                  </div>
                  {step.parallelPrompts && step.parallelPrompts.length > 0 && (
                    <span style={{ fontSize: 9, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>
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
                        fontSize: 10,
                        color: 'var(--text-primary)',
                        background: 'var(--bg-hover)',
                        border: '1px solid rgba(99,102,241,0.6)',
                        borderRadius: 3,
                        padding: '3px 5px',
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        lineHeight: 1.4,
                      }}
                    />
                    <div style={{
                      textAlign: 'right',
                      fontSize: 10,
                      color: editPromptValue.length > 1800 ? 'rgba(239,68,68,0.7)' : 'var(--text-muted)',
                      opacity: 0.7,
                      marginTop: 2,
                      transition: 'all 0.15s ease',
                    }}>
                      {editPromptValue.length} / 2000
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t('canvas.promptEditHint')}
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        opacity: 0.8,
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        cursor: onPromptChange ? 'text' : undefined,
                      }}
                      onDoubleClick={handlePromptDoubleClick}
                      title={onPromptChange ? t('canvas.doubleClickToEdit') : undefined}
                    >
                      {displayPrompt}
                    </div>
                    {step.prompt && step.prompt.length > 0 && (
                      <span style={{
                        display: 'block',
                        textAlign: 'right',
                        marginTop: 4,
                        fontSize: 9,
                        color: 'var(--text-muted)',
                        opacity: 0.45,
                        fontFamily: 'monospace',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}>
                        {step.prompt.length < 500
                          ? `${step.prompt.length}c`
                          : `~${Math.round(step.prompt.length / 100) * 100}c`}
                      </span>
                    )}
                    {isNodeHovered && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(step.prompt).then(() => {
                            setPromptCopied(true)
                            setTimeout(() => setPromptCopied(false), 1500)
                          })
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        title={promptCopied ? t('workflow.canvasCopied') : t('canvas.copyOutput')}
                        style={{
                          position: 'absolute',
                          top: 4, right: 4,
                          background: promptCopied ? 'rgba(34,197,94,0.15)' : 'var(--bg-hover)',
                          border: `1px solid ${promptCopied ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                          borderRadius: 4,
                          padding: '2px 5px',
                          cursor: 'pointer',
                          color: promptCopied ? '#22c55e' : 'var(--text-muted)',
                          fontSize: 10,
                          display: 'flex', alignItems: 'center', gap: 3,
                          zIndex: 3,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {promptCopied ? <Check size={9} /> : <Copy size={9} />}
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Improvement 1: Typing dots for running state (no streaming text) */}
              {status === 'running' && !streamingText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'rgba(99,102,241,0.8)',
                        animation: `node-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Error output summary */}
              {status === 'error' && outputText && (
                <div style={{
                  marginTop: 4,
                  borderLeft: '3px solid rgba(239,68,68,0.6)',
                  paddingLeft: 6,
                }}>
                  <div style={{ fontSize: 10, color: '#f87171', opacity: 0.8, lineHeight: 1.4, wordBreak: 'break-word', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                    <AlertCircle size={10} style={{ flexShrink: 0, marginTop: 1, color: '#f87171' }} />
                    <span>{outputText.slice(0, 80)}</span>
                  </div>
                  {onRetryStep ? (
                    <button
                      onClick={e => { e.stopPropagation(); onRetryStep() }}
                      title="Retry this step"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 5,
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#f87171',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        marginTop: 4,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      ↻ Retry
                    </button>
                  ) : (
                    <div style={{
                      fontSize: 10,
                      color: 'rgba(239,68,68,0.5)',
                      marginTop: 4,
                      letterSpacing: '0.03em',
                    }}>
                      {t('canvas.retryStep')} ↩
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Note zone */}
            {showNote && (
              <div
                style={{
                  borderTop: '1px solid rgba(234,179,8,0.2)',
                  padding: '6px 10px',
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'rgba(234,179,8,0.04)',
                  flexShrink: 0,
                }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <textarea
                  value={noteText}
                  onChange={e => saveNote(e.target.value)}
                  placeholder="Add a note..."
                  style={{
                    width: '100%',
                    minHeight: 48,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    color: 'rgba(234,179,8,0.9)',
                    fontSize: 10,
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    padding: 0,
                  }}
                />
                {noteText && (
                  <div style={{ fontSize: 9, color: 'rgba(234,179,8,0.5)', textAlign: 'right', marginTop: 2 }}>
                    {noteText.length}c
                  </div>
                )}
              </div>
            )}

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
                position: 'relative',
              }}>
                {/* Zone 3 header row: "Completed" label + duration badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'rgba(34,197,94,0.65)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    <Check size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    Completed
                  </span>
                  {stepDuration != null && stepDuration > 0 && (
                    <span style={{
                      fontSize: 9,
                      color: 'rgba(34,197,94,0.7)',
                      background: 'rgba(34,197,94,0.08)',
                      border: '1px solid rgba(34,197,94,0.2)',
                      borderRadius: 8,
                      padding: '1px 6px',
                      fontWeight: 500,
                      marginLeft: 4,
                    }}>
                      {stepDuration >= 60000
                        ? `${Math.floor(stepDuration / 60000)}m ${Math.round((stepDuration % 60000) / 1000)}s`
                        : stepDuration >= 1000
                        ? `${(stepDuration / 1000).toFixed(1)}s`
                        : `${stepDuration}ms`}
                    </span>
                  )}
                  {/* Improvement 2: output word count */}
                  {outputWordCount > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      opacity: 0.6,
                    }}>
                      {outputWordCount}w
                    </span>
                  )}
                  {outputTokenEstimate > 0 && (
                    <span style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      opacity: 0.5,
                      marginLeft: 2,
                    }}>
                      ~{outputTokenEstimate}tok
                    </span>
                  )}
                </div>
                {/* F7: Copy button in completed output zone */}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(outputText || '').then(() => {
                      setOutputCopied(true)
                      setTimeout(() => setOutputCopied(false), 1500)
                    })
                  }}
                  title={outputCopied ? t('workflow.canvasCopied') : t('canvas.copyOutput')}
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 6, right: 6,
                    background: outputCopied ? 'rgba(34,197,94,0.15)' : 'var(--bg-hover)',
                    border: `1px solid ${outputCopied ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                    borderRadius: 4,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    color: outputCopied ? '#22c55e' : 'var(--text-muted)',
                    fontSize: 10,
                    display: 'flex', alignItems: 'center', gap: 3,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {outputCopied ? <Check size={9} /> : <Copy size={9} />}
                  <span>{outputCopied ? t('workflow.canvasCopied') : t('canvas.copyOutput')}</span>
                </button>
                <div style={{
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.5,
                  paddingRight: 60,
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
                color: '#818cf8',
                opacity: 0.8,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                pointerEvents: 'none',
              }}>
                ⏱ {elapsedSec}s
              </div>
            )}

            {/* Duration chip — shown on completed nodes, pill style */}
            {status === 'completed' && durationMs !== undefined && (
              <div style={{
                marginTop: 'auto',
                paddingBottom: 8,
                paddingRight: 10,
                alignSelf: 'flex-end',
              }}>
                <span style={{
                  display: 'inline-block',
                  background: 'rgba(34,197,94,0.12)',
                  color: '#22c55e',
                  borderRadius: 10,
                  padding: '2px 7px',
                  fontSize: 9,
                  fontWeight: 600,
                }}>
                  {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                </span>
              </div>
            )}
          </>
        )}

        {/* B7: Progress bar at node bottom */}
        <ProgressBar status={status} />

        {/* Port circles — top (input) and bottom (output) connection indicators */}
        {!collapsed && (
          <>
            <div
              style={{
                position: 'absolute',
                top: -5,
                left: '50%',
                transform: isNodeHovered ? 'translateX(-50%) scale(1.2)' : 'translateX(-50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '2px solid var(--border)',
                background: 'rgba(15,15,25,0.9)',
                zIndex: 4,
                pointerEvents: 'none',
                transition: 'all 0.15s ease',
                ...(isNodeHovered ? {
                  borderColor: 'rgba(99,102,241,0.6)',
                  background: 'rgba(99,102,241,0.15)',
                } : {}),
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -5,
                left: '50%',
                transform: isNodeHovered ? 'translateX(-50%) scale(1.2)' : 'translateX(-50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '2px solid var(--border)',
                background: 'rgba(15,15,25,0.9)',
                zIndex: 4,
                pointerEvents: 'none',
                transition: 'all 0.15s ease',
                ...(isNodeHovered ? {
                  borderColor: 'rgba(99,102,241,0.6)',
                  background: 'rgba(99,102,241,0.15)',
                } : {}),
              }}
            />
          </>
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
          status={status}
          onCollapse={() => onToggleCollapse?.(step.id)}
          onClose={() => setCtxMenu(null)}
          onCopyPrompt={() => navigator.clipboard?.writeText(displayPrompt)}
          onCopyOutput={() => outputText && navigator.clipboard?.writeText(outputText)}
          onDeleteNode={onDeleteNode ? () => onDeleteNode(step.id) : undefined}
          onInsertBefore={onInsertBefore ? () => onInsertBefore(step.id) : undefined}
          onInsertAfter={onInsertAfter ? () => onInsertAfter(step.id) : undefined}
          onRetry={onRetry ? () => onRetry(step.id) : undefined}
          onRunFromStep={onRunFromStep}
        />
      )}
    </>
  )
}
