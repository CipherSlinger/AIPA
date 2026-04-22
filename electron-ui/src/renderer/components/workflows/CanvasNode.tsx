import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, Loader, ChevronUp, ChevronDown, Copy, MessageSquare, AlertCircle, GripVertical, PlusCircle, RefreshCw, Trash2, Play, Star, GitBranch, Layers, Users } from 'lucide-react'
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
  focused?: boolean
  streamingText?: string
  liveElapsedMs?: number
  stepIndex?: number
  highlighted?: boolean
  activeSubAgentCount?: number
  onSelect: (stepId: string) => void
  onDragStart: (stepId: string, e: React.MouseEvent) => void
  onToggleCollapse?: (stepId: string) => void
  onTitleChange?: (stepId: string, newTitle: string) => void
  onMultiSelect?: (stepId: string, shiftKey: boolean) => void
  onReorderDragStart?: (stepId: string, e: React.MouseEvent) => void
  onDeleteNode?: (stepId: string) => void
  onInsertBefore?: (stepId: string) => void
  onInsertAfter?: (stepId: string) => void
  onRetry?: (stepId: string) => void
  onRunFromStep?: () => void
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
@keyframes canvas-node-pulse {
  0%, 100% { box-shadow: 0 0 12px 3px rgba(99,102,241,0.3), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03); }
  50%      { box-shadow: 0 0 20px 6px rgba(99,102,241,0.5), 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03); }
}
@keyframes canvas-bar-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
@keyframes canvas-spinner {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes canvas-subagent-pulse {
  0%, 100% { opacity: 0.75; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.04); }
}
@keyframes node-complete-flash {
  0%   { filter: brightness(1); }
  30%  { filter: brightness(1.3); }
  100% { filter: brightness(1); }
}
@keyframes node-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50%      { transform: scale(1.3); opacity: 1; }
}
`

export const NODE_WIDTH = 320
export const NODE_MIN_HEIGHT = 104
export const NODE_COLLAPSED_HEIGHT = 42
export const NODE_GAP_Y = 112

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
    borderColor: 'rgba(255,255,255,0.06)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.03) inset',
    hoverBoxShadow: '0 6px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.03) inset',
  },
  pending: {
    borderColor: 'rgba(255,255,255,0.06)',
    opacity: 0.5,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.03) inset',
    hoverBoxShadow: '0 6px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.03) inset',
  },
  running: {
    borderColor: 'rgba(99,102,241,0.45)',
    animation: 'canvas-node-pulse 1.8s ease-in-out infinite',
    glowColor: 'rgba(30,30,46,0.98)',
    boxShadow: '0 0 16px 4px rgba(99,102,241,0.25), 0 4px 16px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.03) inset',
    hoverBoxShadow: '0 0 20px 5px rgba(99,102,241,0.35), 0 8px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03) inset',
  },
  completed: {
    borderColor: 'rgba(74,222,128,0.35)',
    boxShadow: '0 0 0 1px rgba(74,222,128,0.12), 0 4px 16px rgba(0,0,0,0.35)',
    hoverBoxShadow: '0 0 0 1px rgba(74,222,128,0.2), 0 8px 24px rgba(0,0,0,0.45)',
  },
  error: {
    borderColor: 'rgba(248,113,113,0.35)',
    boxShadow: '0 0 0 1px rgba(248,113,113,0.12), 0 4px 16px rgba(0,0,0,0.35)',
    hoverBoxShadow: '0 0 0 1px rgba(248,113,113,0.2), 0 8px 24px rgba(0,0,0,0.45)',
  },
}

const STATUS_DOT_COLORS: Record<string, string> = {
  idle: 'rgba(255,255,255,0.2)',
  pending: 'rgba(255,255,255,0.15)',
  running: 'rgba(99,102,241,0.9)',
  completed: '#4ade80',
  error: '#f87171',
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', top: -7, right: -7,
        width: 18, height: 18, borderRadius: '50%',
        background: '#4ade80', color: '#0f172a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 6px rgba(74,222,128,0.5), 0 0 0 2px rgba(12,12,20,0.9)',
      }}>
        <Check size={10} strokeWidth={3} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute', top: -7, right: -7,
        width: 18, height: 18, borderRadius: '50%',
        background: 'rgba(99,102,241,0.95)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'canvas-spinner 1s linear infinite',
        boxShadow: '0 0 8px rgba(99,102,241,0.6), 0 0 0 2px rgba(12,12,20,0.9)',
      }}>
        <Loader size={10} strokeWidth={2.5} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute', top: -7, right: -7,
        width: 18, height: 18, borderRadius: '50%',
        background: '#f87171', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 6px rgba(248,113,113,0.5), 0 0 0 2px rgba(12,12,20,0.9)',
      }}>
        <AlertCircle size={10} strokeWidth={2.5} />
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

  const baseItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', fontSize: 12,
    cursor: 'pointer', color: 'var(--text-primary)',
    transition: 'background 0.12s ease',
  }

  return (
    <div ref={menuRef} style={{
      position: 'fixed', left: x, top: y, zIndex: 1000,
      background: 'rgba(24,24,37,0.96)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      minWidth: 172, padding: '5px 0', userSelect: 'none',
    }} onClick={e => e.stopPropagation()}>
      <CtxItem style={baseItemStyle} onMouseDown={() => { onCopyPrompt(); onClose() }}>
        <Copy size={13} style={{ opacity: 0.6 }} />{t('canvas.copyPrompt')}
      </CtxItem>
      {hasOutput && (
        <CtxItem style={baseItemStyle} onMouseDown={() => { onCopyOutput(); onClose() }}>
          <MessageSquare size={13} style={{ opacity: 0.6 }} />{t('canvas.copyOutput')}
        </CtxItem>
      )}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
      <CtxItem style={baseItemStyle} onMouseDown={() => { onCollapse(); onClose() }}>
        {collapsed ? <ChevronDown size={13} style={{ opacity: 0.6 }} /> : <ChevronUp size={13} style={{ opacity: 0.6 }} />}
        {collapsed ? t('canvas.expandNode') : t('canvas.collapseNode')}
      </CtxItem>
      {onInsertBefore && (
        <CtxItem style={baseItemStyle} onMouseDown={() => { onInsertBefore(); onClose() }}>
          <PlusCircle size={13} style={{ opacity: 0.6 }} />{t('canvas.insertBefore')}
        </CtxItem>
      )}
      {onInsertAfter && (
        <CtxItem style={baseItemStyle} onMouseDown={() => { onInsertAfter(); onClose() }}>
          <PlusCircle size={13} style={{ opacity: 0.6 }} />{t('canvas.insertAfter')}
        </CtxItem>
      )}
      {onRetry && status === 'error' && (
        <CtxItem style={baseItemStyle} onMouseDown={() => { onRetry(); onClose() }}>
          <RefreshCw size={13} style={{ opacity: 0.6 }} />{t('canvas.retryStep')}
        </CtxItem>
      )}
      {onRunFromStep && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
          <CtxItem style={{ ...baseItemStyle, color: '#818cf8' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onMouseDown={() => { onRunFromStep(); onClose() }}>
            <Play size={12} style={{ opacity: 0.85 }} />{t('workflow.runFromStep')}
          </CtxItem>
        </>
      )}
      {onDeleteNode && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
          <CtxItem style={{ ...baseItemStyle, color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onMouseDown={() => { onDeleteNode(); onClose() }}>
            <Trash2 size={13} style={{ opacity: 0.6 }} />{t('canvas.deleteStep')}
          </CtxItem>
        </>
      )}
    </div>
  )
}

function CtxItem({ style, onMouseEnter, onMouseLeave, onMouseDown, children }: {
  style: React.CSSProperties
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseDown?: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <div
      style={style}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; onMouseEnter?.(e) }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; onMouseLeave?.(e) }}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  )
}

// B7: ProgressBar — thin bar at node bottom
function ProgressBar({ status }: { status: StepStatus }) {
  if (status === 'running') {
    return (
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        overflow: 'hidden', borderRadius: '0 0 14px 14px',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{
          width: '45%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.8), rgba(99,102,241,0.6), transparent)',
          animation: 'canvas-bar-shimmer 1.4s ease-in-out infinite',
        }} />
      </div>
    )
  }
  if (status === 'completed') {
    return (
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        overflow: 'hidden', borderRadius: '0 0 14px 14px',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #4ade80, #22c55e)' }} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        overflow: 'hidden', borderRadius: '0 0 14px 14px',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{ width: '100%', height: '100%', background: '#f87171' }} />
      </div>
    )
  }
  return null
}

// Typing dots — reusable for running state
function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'rgba(99,102,241,0.7)',
          animation: `node-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  )
}

export default function CanvasNode({
  step, index, x, y, width, selected, status = 'idle', presetKey,
  collapsed = false, outputText, dimmed = false, durationMs, stepDuration,
  isFirst = false, isLast = false, multiSelected = false, focused = false,
  streamingText, liveElapsedMs, stepIndex, highlighted = false,
  activeSubAgentCount = 0, onSelect, onDragStart, onToggleCollapse, onTitleChange,
  onMultiSelect, onReorderDragStart, onDeleteNode, onInsertBefore, onInsertAfter,
  onRetry, onRunFromStep, onPromptChange, onHeightChange, onDuplicate, onMoveUp, onMoveDown, onRetryStep,
}: CanvasNodeProps) {
  const t = useT()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editPromptValue, setEditPromptValue] = useState('')
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const [outputCopied, setOutputCopied] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [noteText, setNoteText] = useState(() => {
    try { return localStorage.getItem(`aipa:step-note:${step.id}`) ?? '' } catch { return '' }
  })
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(`aipa:step-pin:${step.id}`) === '1' } catch { return false }
  })
  const prevStatusRef = useRef<string | undefined>(undefined)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const streamingContainerRef = useRef<HTMLDivElement>(null)

  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    try {
      if (next) localStorage.setItem(`aipa:step-pin:${step.id}`, '1')
      else localStorage.removeItem(`aipa:step-pin:${step.id}`)
    } catch {}
  }

  const saveNote = (text: string) => {
    setNoteText(text)
    try {
      if (text.trim()) localStorage.setItem(`aipa:step-note:${step.id}`, text)
      else localStorage.removeItem(`aipa:step-note:${step.id}`)
    } catch {}
  }

  useEffect(() => { if (status !== 'completed') setOutputExpanded(false) }, [status])
  useEffect(() => {
    if (prevStatusRef.current === 'running' && status === 'completed') {
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 700)
    }
    prevStatusRef.current = status
  }, [status])
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) { titleInputRef.current.focus(); titleInputRef.current.select() }
  }, [isEditingTitle])
  useEffect(() => {
    if (isEditingPrompt && promptTextareaRef.current) { promptTextareaRef.current.focus(); promptTextareaRef.current.select() }
  }, [isEditingPrompt])
  useEffect(() => {
    if (!onHeightChange || !nodeRef.current) return
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) onHeightChange(step.id, entry.contentRect.height)
    })
    ro.observe(nodeRef.current)
    return () => ro.disconnect()
  }, [step.id, onHeightChange])
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
    if (trimmed && trimmed !== step.title) onTitleChange?.(step.id, trimmed)
    setIsEditingTitle(false)
  }, [editTitleValue, step.id, step.title, onTitleChange])

  const cancelTitleEdit = useCallback(() => { setIsEditingTitle(false) }, [])

  const handlePromptDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!onPromptChange) return
    e.stopPropagation()
    setEditPromptValue(step.prompt || '')
    setIsEditingPrompt(true)
  }, [step.prompt, onPromptChange])

  const commitPromptEdit = useCallback(() => {
    const trimmed = editPromptValue.trim()
    if (trimmed && trimmed !== step.prompt) onPromptChange?.(step.id, trimmed)
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
      if (e.shiftKey && onMultiSelect) { onMultiSelect(step.id, true); return }
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
  const nodeTypeColor = nodeType === 'condition' ? '#fbbf24' : nodeType === 'parallel' ? '#a78bfa' : '#818cf8'
  const displayTitle = getPresetStepText(presetKey, index, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, index, 'prompt', t, step.prompt)
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.idle
  const isActive = selected || status === 'running'
  const isMulti = multiSelected && !selected
  const isFocusedOnly = focused && !selected && !isMulti

  const baseBoxShadow = isMulti
    ? '0 0 0 1.5px rgba(251,191,36,0.7), 0 4px 16px rgba(0,0,0,0.35)'
    : selected
      ? '0 0 0 2px rgba(99,102,241,0.3), 0 4px 16px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.03) inset'
      : isActive
        ? `0 0 14px 4px rgba(99,102,241,0.25), 0 4px 16px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.03) inset`
        : (isNodeHovered && !isMulti && !selected && !isActive)
          ? (statusStyle.hoverBoxShadow ?? statusStyle.boxShadow ?? '0 6px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.03) inset')
          : statusStyle.boxShadow ?? '0 2px 8px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.03) inset'

  const boxShadow = justCompleted
    ? '0 0 0 2px rgba(74,222,128,0.5), 0 0 24px rgba(74,222,128,0.3)'
    : highlighted
      ? `${baseBoxShadow}, 0 0 0 2px rgba(129,140,248,0.5), 0 0 18px rgba(99,102,241,0.3)`
      : baseBoxShadow

  const nodeHeight = collapsed ? NODE_COLLAPSED_HEIGHT : undefined
  const nodeMinHeight = collapsed ? undefined : NODE_MIN_HEIGHT
  const elapsedSec = liveElapsedMs !== undefined ? Math.floor(liveElapsedMs / 1000) : 0
  const charCount = outputText ? outputText.length : 0
  const charCountLabel = charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k ${t('canvas.chars')}` : `${charCount} ${t('canvas.chars')}`
  const stepNumberLabel = String(index + 1).padStart(2, '0')
  const stepBadgeBg = status === 'running' ? 'rgba(99,102,241,0.95)' : status === 'completed' ? '#4ade80' : status === 'error' ? '#f87171' : 'rgba(255,255,255,0.15)'
  const stepBadgeColor = (status === 'idle' || status === 'pending') ? 'rgba(255,255,255,0.4)' : '#fff'

  const nodeBorder = selected
    ? '1px solid rgba(99,102,241,0.5)'
    : isActive
      ? '1px solid rgba(99,102,241,0.4)'
      : isMulti
        ? '1.5px solid rgba(251,191,36,0.5)'
        : `1px solid ${statusStyle.borderColor}`

  const nodeBackground = status === 'running'
    ? (statusStyle.glowColor || 'rgba(22,22,35,0.97)')
    : isMulti
      ? 'rgba(99,102,241,0.04)'
      : 'rgba(22,22,35,0.95)'

  const outputWordCount = outputText ? outputText.trim().split(/\s+/).filter(Boolean).length : 0
  const outputTokenEstimate = outputWordCount > 0 ? Math.round(outputWordCount * 1.3) : 0

  // Type badge config
  const typeBadgeConfig = nodeType !== 'prompt' ? {
    condition: { icon: <GitBranch size={10} />, color: '#fbbf24', label: 'IF' },
    parallel: { icon: <Layers size={10} />, color: '#a78bfa', label: 'PAR' },
    loop: { icon: <RefreshCw size={10} />, color: '#c4b5fd', label: 'LOOP' },
  }[nodeType] : undefined

  return (
    <>
      <style>{NODE_DOT_BOUNCE_STYLE}</style>
      <div
        ref={nodeRef}
        role="button"
        tabIndex={0}
        aria-label={`Step ${index + 1}: ${displayTitle}${status !== 'idle' ? ` (${status})` : ''}`}
        onMouseDown={handleMouseDown}
        onClick={(e) => { e.stopPropagation(); onSelect(step.id) }}
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
          position: 'absolute', left: x, top: y, width,
          height: nodeHeight, minHeight: nodeMinHeight,
          background: nodeBackground,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: nodeBorder,
          borderRadius: 14,
          padding: collapsed ? '0 12px' : 0,
          cursor: 'grab',
          boxShadow,
          outline: highlighted ? '2px solid rgba(99,102,241,0.5)' : isFocusedOnly ? '2px dashed rgba(99,102,241,0.45)' : 'none',
          outlineOffset: 3,
          transition: 'box-shadow 0.2s ease, opacity 0.2s ease, transform 0.15s ease, border-color 0.2s ease',
          transform: (isNodeHovered && !dimmed && !selected && !isActive && !isMulti) ? 'translateY(-2px)' : undefined,
          userSelect: 'none',
          boxSizing: 'border-box',
          opacity: dimmed ? 0.2 : (statusStyle.opacity ?? 1),
          animation: statusStyle.animation
            ? `canvas-node-in 0.2s ease-out both, ${statusStyle.animation}`
            : 'canvas-node-in 0.2s ease-out both',
          ...(justCompleted ? { animation: 'canvas-node-in 0.2s ease-out both, node-complete-flash 0.7s ease-out' } : {}),
          overflow: 'hidden',
          display: 'flex',
          alignItems: collapsed ? 'center' : 'flex-start',
          flexDirection: 'column',
          justifyContent: collapsed ? 'center' : 'flex-start',
          ...(pinned ? { borderTop: '2px solid rgba(251,191,36,0.6)' } : {}),
        }}
      >
        {/* Top accent strip */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${nodeTypeColor}88, ${nodeTypeColor}44, transparent)`,
          borderRadius: '14px 14px 0 0',
          pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Running pulse on top strip */}
        {status === 'running' && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, rgba(99,102,241,0.8), transparent)`,
            animation: 'canvas-running-bar 1.4s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />
        )}

        {/* Step number badge */}
        <div style={{
          position: 'absolute', top: -8, left: -9,
          width: 20, height: 20,
          background: stepBadgeBg, color: stepBadgeColor,
          fontSize: 9, fontWeight: 800,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          boxShadow: '0 0 0 2px rgba(12,12,20,0.92)',
          zIndex: 2,
        }}>
          {stepNumberLabel}
        </div>

        <StatusBadge status={status} />

        {/* Sub-agent badge */}
        {activeSubAgentCount > 0 && (
          <div title={`${activeSubAgentCount} sub-agent${activeSubAgentCount > 1 ? 's' : ''} running`} style={{
            position: 'absolute', top: 12, right: -8,
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '2px 7px 2px 5px', borderRadius: 10,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: '#a5b4fc', fontSize: 9, fontWeight: 700,
            whiteSpace: 'nowrap',
            animation: 'canvas-subagent-pulse 2s ease-in-out infinite',
            zIndex: 3, pointerEvents: 'none',
          }}>
            <Users size={9} strokeWidth={2.5} />
            {activeSubAgentCount}
          </div>
        )}

        {/* Reorder drag handle */}
        {onReorderDragStart && !collapsed && (
          <div
            onMouseDown={e => { e.stopPropagation(); onReorderDragStart(step.id, e) }}
            title={t('canvas.dragToReorder')}
            style={{
              position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)',
              cursor: 'ns-resize', color: 'var(--text-muted)',
              opacity: isNodeHovered ? 0.4 : 0,
              padding: '4px 2px', display: 'flex', alignItems: 'center',
              borderRadius: 3, transition: 'opacity 0.15s ease', zIndex: 3,
            }}>
            <GripVertical size={11} />
          </div>
        )}

        {/* Collapse toggle */}
        {onToggleCollapse && (
          <button
            onClick={handleCollapseClick}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: collapsed ? undefined : 4,
              top: collapsed ? '50%' : undefined,
              right: 4,
              transform: collapsed ? 'translateY(-50%)' : undefined,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 3, borderRadius: 4,
              display: 'flex', alignItems: 'center',
              opacity: isNodeHovered ? 0.5 : 0,
              transition: 'opacity 0.15s ease', zIndex: 3,
            }}
            title={collapsed ? t('canvas.expandNode') : t('canvas.collapseNode')}
          >
            {collapsed
              ? <ChevronDown size={10} />
              : <ChevronUp size={10} style={{ transform: 'rotate(180deg)' }} />}
          </button>
        )}

        {/* Move up/down buttons */}
        {isNodeHovered && !collapsed && (onMoveUp || onMoveDown) && (
          <div onMouseDown={e => e.stopPropagation()} style={{
            position: 'absolute', top: 4, right: onToggleCollapse ? 22 : 4,
            display: 'flex', gap: 1, zIndex: 3,
          }}>
            {onMoveUp && (
              <button onClick={e => { e.stopPropagation(); onMoveUp!() }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '2px 3px', borderRadius: 3,
                  fontSize: 10, display: 'flex', alignItems: 'center',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#818cf8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                ▲
              </button>
            )}
            {onMoveDown && (
              <button onClick={e => { e.stopPropagation(); onMoveDown!() }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '2px 3px', borderRadius: 3,
                  fontSize: 10, display: 'flex', alignItems: 'center',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#818cf8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                ▼
              </button>
            )}
          </div>
        )}

        {/* Collapsed state */}
        {collapsed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingRight: 24, paddingLeft: onReorderDragStart ? 14 : 0,
            width: '100%', overflow: 'hidden',
          }}>
            {/* Status dot */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: STATUS_DOT_COLORS[status] ?? STATUS_DOT_COLORS.idle,
              boxShadow: status === 'running' ? '0 0 6px rgba(99,102,241,0.5)'
                : status === 'completed' ? '0 0 4px rgba(74,222,128,0.4)' : 'none',
              ...(status === 'pending' ? { animation: 'node-dot-pulse 2s ease-in-out infinite' } : {}),
            }} />
            {/* Title */}
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {step.title || `Step ${(stepIndex ?? 0) + 1}`}
            </span>
            {/* Status label */}
            {status !== 'idle' && (
              <span style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.04em', flexShrink: 0,
                color: status === 'running' ? '#818cf8'
                  : status === 'completed' ? '#4ade80'
                  : status === 'error' ? '#f87171'
                  : 'var(--text-muted)',
              }}>
                {status}
              </span>
            )}
            {/* Prompt preview */}
            {step.prompt && (
              <span style={{
                fontSize: 10, color: 'var(--text-muted)', opacity: 0.5,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 160,
              }}>
                {step.prompt.slice(0, 60)}
              </span>
            )}
          </div>
        )}

        {/* Expanded layout */}
        {!collapsed && (
          <>
            {/* Header zone */}
            <div style={{
              padding: '10px 14px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '14px 14px 0 0',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.015)',
              width: '100%',
              boxSizing: 'border-box',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                paddingLeft: onReorderDragStart ? 14 : 0,
              }}>
                {/* Type badge */}
                {typeBadgeConfig && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: typeBadgeConfig.color,
                    background: `${typeBadgeConfig.color}18`,
                    borderRadius: 6, padding: '2px 7px',
                    border: `1px solid ${typeBadgeConfig.color}30`,
                    flexShrink: 0,
                  }}>
                    {typeBadgeConfig.icon}
                    {typeBadgeConfig.label}
                  </span>
                )}
                {/* Title */}
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    value={editTitleValue}
                    onChange={e => setEditTitleValue(e.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={handleTitleKeyDown}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                      flex: 1, minWidth: 0,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(99,102,241,0.5)',
                      borderRadius: 4, outline: 'none',
                      padding: '2px 6px', boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
                      color: 'var(--text-primary)', flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'text',
                    }}
                    onDoubleClick={handleTitleDoubleClick}
                  >
                    {displayTitle}
                  </span>
                )}
              </div>
            </div>

            {/* Body zone */}
            <div style={{
              padding: '8px 14px',
              flex: 1, width: '100%', boxSizing: 'border-box',
              overflow: 'hidden', fontSize: 11,
              color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              {status === 'completed' && outputText ? (
                /* Output display */
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <div style={{
                    whiteSpace: outputExpanded ? 'pre-wrap' : undefined,
                    wordBreak: 'break-word',
                    display: outputExpanded ? 'block' : '-webkit-box',
                    WebkitLineClamp: outputExpanded ? undefined : 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {outputExpanded ? outputText.slice(0, 2000) : outputText.slice(0, 140)}
                    {!outputExpanded && outputText.length > 140 && '…'}
                  </div>
                  {!outputExpanded && outputText.length > 140 && (
                    <span style={{
                      display: 'inline-block',
                      background: 'rgba(74,222,128,0.1)',
                      color: '#4ade80',
                      fontSize: 9, borderRadius: 10,
                      padding: '2px 8px', marginLeft: 4,
                      verticalAlign: 'middle',
                    }}>
                      {charCountLabel}
                    </span>
                  )}
                  {outputText.length > 140 && (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setOutputExpanded(v => !v) }}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', fontSize: 9, color: '#818cf8',
                        marginTop: 3, display: 'block',
                      }}
                    >
                      {outputExpanded ? t('canvas.showLess') : t('canvas.showMore')}
                    </button>
                  )}
                </div>
              ) : status === 'running' && streamingText ? (
                /* Streaming text */
                <div ref={streamingContainerRef} style={{
                  fontSize: 10, color: 'rgba(129,140,248,0.8)',
                  lineHeight: 1.5, overflowY: 'auto', maxHeight: 200,
                  fontStyle: 'italic',
                }}>
                  {streamingText}
                  <TypingDots />
                </div>
              ) : nodeType === 'condition' ? (
                /* Condition */
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    marginBottom: 5,
                  }}>
                    {step.condition || displayPrompt}
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                      background: 'rgba(74,222,128,0.12)', color: '#4ade80',
                    }}>Yes</span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                      background: 'rgba(248,113,113,0.1)', color: '#f87171',
                    }}>No</span>
                  </div>
                </div>
              ) : nodeType === 'parallel' ? (
                /* Parallel */
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 5,
                  }}>
                    {displayPrompt}
                  </div>
                  {step.parallelPrompts && step.parallelPrompts.length > 0 && (
                    <span style={{
                      fontSize: 9, background: 'rgba(167,139,250,0.1)',
                      color: '#c4b5fd', borderRadius: 10, padding: '2px 8px', fontWeight: 600,
                    }}>
                      {step.parallelPrompts.length} sub-prompt{step.parallelPrompts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ) : (
                /* Default prompt */
                isEditingPrompt ? (
                  <div onMouseDown={e => e.stopPropagation()}>
                    <textarea
                      ref={promptTextareaRef}
                      value={editPromptValue}
                      onChange={e => setEditPromptValue(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      onBlur={commitPromptEdit}
                      style={{
                        width: '100%', minHeight: 50, fontSize: 10,
                        color: 'var(--text-primary)',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(99,102,241,0.5)',
                        borderRadius: 5, padding: '4px 6px',
                        outline: 'none', resize: 'vertical',
                        boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
                      }}
                    />
                    <div style={{
                      textAlign: 'right', fontSize: 9, marginTop: 3,
                      color: editPromptValue.length > 1800 ? 'rgba(248,113,113,0.7)' : 'var(--text-muted)',
                      opacity: 0.6, fontFamily: 'monospace',
                    }}>
                      {editPromptValue.length} / 2000
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2, opacity: 0.5 }}>
                      {t('canvas.promptEditHint')}
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        fontSize: 11, color: 'var(--text-secondary)', opacity: 0.8,
                        lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        cursor: onPromptChange ? 'text' : undefined,
                      }}
                      onDoubleClick={handlePromptDoubleClick}
                      title={onPromptChange ? t('canvas.doubleClickToEdit') : undefined}
                    >
                      {displayPrompt}
                    </div>
                    {step.prompt && step.prompt.length > 0 && (
                      <span style={{
                        display: 'block', textAlign: 'right', marginTop: 4,
                        fontSize: 9, color: 'var(--text-muted)', opacity: 0.35,
                        fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none',
                      }}>
                        {step.prompt.length < 500 ? `${step.prompt.length}c` : `~${Math.round(step.prompt.length / 100) * 100}c`}
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
                          position: 'absolute', top: 4, right: 4,
                          background: promptCopied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${promptCopied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 5, padding: '3px 6px',
                          cursor: 'pointer',
                          color: promptCopied ? '#4ade80' : 'var(--text-muted)',
                          fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
                          zIndex: 3, transition: 'all 0.12s ease',
                        }}
                      >
                        {promptCopied ? <Check size={10} /> : <Copy size={10} />}
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Typing dots for running without streaming text */}
              {status === 'running' && !streamingText && <TypingDots />}

              {/* Error output */}
              {status === 'error' && outputText && (
                <div style={{
                  marginTop: 6,
                  borderLeft: '3px solid rgba(248,113,113,0.4)',
                  paddingLeft: 8,
                }}>
                  <div style={{
                    fontSize: 10, color: '#f87171', opacity: 0.8, lineHeight: 1.4,
                    wordBreak: 'break-word', display: 'flex', alignItems: 'flex-start', gap: 5,
                  }}>
                    <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{outputText.slice(0, 80)}</span>
                  </div>
                  {onRetryStep ? (
                    <button
                      onClick={e => { e.stopPropagation(); onRetryStep() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 6,
                        border: '1px solid rgba(248,113,113,0.3)',
                        background: 'rgba(248,113,113,0.08)',
                        color: '#f87171', fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', marginTop: 5,
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.18)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.5)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)' }}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <RefreshCw size={10} /> Retry
                    </button>
                  ) : (
                    <div style={{ fontSize: 9, color: 'rgba(248,113,113,0.4)', marginTop: 4, letterSpacing: '0.03em' }}>
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
                  borderTop: '1px solid rgba(251,191,36,0.15)',
                  padding: '8px 12px', width: '100%', boxSizing: 'border-box',
                  background: 'rgba(251,191,36,0.03)', flexShrink: 0,
                }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <textarea
                  value={noteText}
                  onChange={e => saveNote(e.target.value)}
                  placeholder="Add a note..."
                  style={{
                    width: '100%', minHeight: 50,
                    background: 'transparent', border: 'none', outline: 'none',
                    resize: 'none', color: 'rgba(251,191,36,0.85)',
                    fontSize: 10, lineHeight: 1.5, fontFamily: 'inherit',
                    boxSizing: 'border-box', padding: 0,
                  }}
                />
                {noteText && (
                  <div style={{ fontSize: 9, color: 'rgba(251,191,36,0.4)', textAlign: 'right', marginTop: 2 }}>
                    {noteText.length}c
                  </div>
                )}
              </div>
            )}

            {/* Footer action bar */}
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.04)',
              padding: '5px 10px',
              display: 'flex', alignItems: 'center', gap: 2,
              width: '100%', boxSizing: 'border-box',
              flexShrink: 0, minHeight: 30,
            }}>
              {/* Note toggle */}
              <button
                onClick={e => { e.stopPropagation(); setShowNote(v => !v) }}
                onMouseDown={e => e.stopPropagation()}
                title={noteText ? 'Edit note' : 'Add note'}
                style={{
                  background: noteText ? 'rgba(251,191,36,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: noteText ? '#fbbf24' : 'var(--text-muted)',
                  padding: '3px 5px', borderRadius: 4,
                  display: 'flex', alignItems: 'center',
                  opacity: (isNodeHovered || !!noteText) ? 0.7 : 0.3,
                  transition: 'all 0.12s ease', fontSize: 11,
                }}
              >
                📝
              </button>

              {/* Pin */}
              <button
                onClick={e => { e.stopPropagation(); togglePin() }}
                onMouseDown={e => e.stopPropagation()}
                title={pinned ? 'Unpin step' : 'Pin step'}
                style={{
                  background: pinned ? 'rgba(251,191,36,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4,
                  color: pinned ? '#fbbf24' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center',
                  opacity: isNodeHovered || pinned ? 0.7 : 0.3,
                  transition: 'all 0.12s ease',
                }}
              >
                <Star size={12} fill={pinned ? '#fbbf24' : 'none'} />
              </button>

              {/* Duplicate */}
              {onDuplicate && (
                <button
                  onClick={e => { e.stopPropagation(); onDuplicate(step.id) }}
                  onMouseDown={e => e.stopPropagation()}
                  title="Duplicate step"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '3px 5px', borderRadius: 4, color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                    opacity: isNodeHovered ? 0.7 : 0.3,
                    transition: 'all 0.12s ease',
                  }}
                >
                  <Copy size={12} />
                </button>
              )}

              {/* Duration chip — completed */}
              {status === 'completed' && durationMs !== undefined && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'rgba(74,222,128,0.08)',
                  color: '#4ade80',
                  borderRadius: 8, padding: '2px 8px',
                  fontSize: 9, fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                </span>
              )}

              {/* Live timer — running */}
              {status === 'running' && elapsedSec >= 1 && (
                <span style={{
                  marginLeft: 'auto',
                  color: '#818cf8', opacity: 0.7,
                  fontSize: 9, fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  ⏱ {elapsedSec}s
                </span>
              )}
            </div>

            {/* Completed output detail zone */}
            {status === 'completed' && outputExpanded && outputText && (
              <div style={{
                background: 'rgba(74,222,128,0.04)',
                borderTop: '1px solid rgba(74,222,128,0.12)',
                padding: '8px 12px', width: '100%', boxSizing: 'border-box',
                flexShrink: 0, position: 'relative',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', marginBottom: 5,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: 'rgba(74,222,128,0.6)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <Check size={9} /> Completed
                  </span>
                  {stepDuration != null && stepDuration > 0 && (
                    <span style={{
                      fontSize: 9, color: 'rgba(74,222,128,0.6)',
                      background: 'rgba(74,222,128,0.06)',
                      border: '1px solid rgba(74,222,128,0.15)',
                      borderRadius: 8, padding: '1px 7px', fontWeight: 500, marginLeft: 5,
                    }}>
                      {stepDuration >= 60000
                        ? `${Math.floor(stepDuration / 60000)}m ${Math.round((stepDuration % 60000) / 1000)}s`
                        : stepDuration >= 1000
                        ? `${(stepDuration / 1000).toFixed(1)}s`
                        : `${stepDuration}ms`}
                    </span>
                  )}
                  {outputWordCount > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', opacity: 0.5 }}>
                      {outputWordCount}w
                    </span>
                  )}
                  {outputTokenEstimate > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.4, marginLeft: 3 }}>
                      ~{outputTokenEstimate}tok
                    </span>
                  )}
                </div>
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
                    position: 'absolute', top: 7, right: 7,
                    background: outputCopied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${outputCopied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 6, padding: '3px 8px',
                    cursor: 'pointer', color: outputCopied ? '#4ade80' : 'var(--text-muted)',
                    fontSize: 10, display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.12s ease',
                  }}
                >
                  {outputCopied ? <Check size={10} /> : <Copy size={10} />}
                  <span>{outputCopied ? t('workflow.canvasCopied') : t('canvas.copyOutput')}</span>
                </button>
                <div style={{
                  fontSize: 10, color: 'var(--text-secondary)',
                  display: '-webkit-box', WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  lineHeight: 1.5, paddingRight: 70,
                }}>
                  {outputText.slice(0, 300)}
                </div>
              </div>
            )}
          </>
        )}

        <ProgressBar status={status} />

        {/* Connection ports */}
        <div style={{
          position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: 'rgba(99,102,241,0.7)', border: '2px solid rgba(22,22,35,0.95)',
          zIndex: 5, pointerEvents: 'none',
          opacity: isNodeHovered && !selected ? 1 : 0,
          transition: 'opacity 0.15s ease',
          boxShadow: '0 0 6px rgba(99,102,241,0.4)',
        }} />
        <div style={{
          position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: 'rgba(99,102,241,0.7)', border: '2px solid rgba(22,22,35,0.95)',
          zIndex: 5, pointerEvents: 'none',
          opacity: isNodeHovered && !selected ? 1 : 0,
          transition: 'opacity 0.15s ease',
          boxShadow: '0 0 6px rgba(99,102,241,0.4)',
        }} />
      </div>

      {ctxMenu && (
        <NodeContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          collapsed={collapsed} hasOutput={!!outputText}
          displayPrompt={displayPrompt} status={status}
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
