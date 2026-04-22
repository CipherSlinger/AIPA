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

const CSS_ANIM = `
@keyframes node-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40%           { transform: translateY(-3px); opacity: 1; }
}
@keyframes node-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(99,102,241,0.25), 0 1px 3px rgba(0,0,0,0.15); }
  50%      { box-shadow: 0 0 0 2px rgba(99,102,241,0.4), 0 2px 8px rgba(0,0,0,0.2); }
}
@keyframes spinner {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes running-bar {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
`

export const NODE_WIDTH = 240
export const NODE_MIN_HEIGHT = 72
export const NODE_COLLAPSED_HEIGHT = 30
export const NODE_GAP_Y = 90

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
  const streamingRef = useRef<HTMLDivElement>(null)

  const togglePin = () => {
    const next = !pinned; setPinned(next)
    try { next ? localStorage.setItem(`aipa:step-pin:${step.id}`, '1') : localStorage.removeItem(`aipa:step-pin:${step.id}`) } catch {}
  }
  const saveNote = (v: string) => { setNoteText(v); try { v.trim() ? localStorage.setItem(`aipa:step-note:${step.id}`, v) : localStorage.removeItem(`aipa:step-note:${step.id}`) } catch {} }

  useEffect(() => { if (status !== 'completed') setOutputExpanded(false) }, [status])
  useEffect(() => {
    if (prevStatusRef.current === 'running' && status === 'completed') { setJustCompleted(true); setTimeout(() => setJustCompleted(false), 600) }
    prevStatusRef.current = status
  }, [status])
  useEffect(() => { if (isEditingTitle && titleInputRef.current) { titleInputRef.current.focus(); titleInputRef.current.select() } }, [isEditingTitle])
  useEffect(() => { if (isEditingPrompt && promptTextareaRef.current) { promptTextareaRef.current.focus(); promptTextareaRef.current.select() } }, [isEditingPrompt])
  useEffect(() => {
    if (!onHeightChange || !nodeRef.current) return
    const ro = new ResizeObserver(e => { if (e[0]) onHeightChange(step.id, e[0].contentRect.height) })
    ro.observe(nodeRef.current); return () => ro.disconnect()
  }, [step.id, onHeightChange])
  useEffect(() => { if (streamingRef.current && status === 'running') streamingRef.current.scrollTop = streamingRef.current.scrollHeight }, [streamingText, status])

  const commitTitleEdit = useCallback(() => {
    const v = editTitleValue.trim(); if (v && v !== step.title) onTitleChange?.(step.id, v); setIsEditingTitle(false)
  }, [editTitleValue, step.id, step.title, onTitleChange])
  const commitPromptEdit = useCallback(() => {
    const v = editPromptValue.trim(); if (v && v !== step.prompt) onPromptChange?.(step.id, v); setIsEditingPrompt(false)
  }, [editPromptValue, step.id, step.prompt, onPromptChange])

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setIsEditingPrompt(false) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitPromptEdit() }
  }, [commitPromptEdit])

  const nodeType = step.nodeType ?? 'prompt'
  const displayTitle = getPresetStepText(presetKey, index, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, index, 'prompt', t, step.prompt)

  // Color scheme by node type (left accent border color)
  const typeColor = nodeType === 'condition' ? '#f59e0b' : nodeType === 'parallel' ? '#a78bfa' : '#6366f1'

  // Color by status
  const statusColor = status === 'completed' ? '#22c55e' : status === 'running' ? '#6366f1' : status === 'error' ? '#ef4444' : status === 'pending' ? '#94a3b8' : '#64748b'

  const isActive = selected || status === 'running'

  // --- Styles ---
  const borderLeft = `3px solid ${typeColor}`
  const borderColor = status === 'idle' || status === 'pending'
    ? 'var(--border)'
    : selected ? 'rgba(99,102,241,0.5)'
    : isActive ? 'rgba(99,102,241,0.4)'
    : `rgba(${status === 'completed' ? '34,197,94' : status === 'error' ? '239,68,68' : '100,116,139'},0.3)`

  const boxShadow = justCompleted
    ? '0 0 0 2px rgba(34,197,94,0.5), 0 2px 8px rgba(0,0,0,0.2)'
    : highlighted ? '0 0 0 2px rgba(99,102,241,0.4), 0 1px 3px rgba(0,0,0,0.15)'
    : selected ? '0 0 0 1.5px rgba(99,102,241,0.4), 0 1px 3px rgba(0,0,0,0.12)'
    : status === 'running' ? '0 0 0 1px rgba(99,102,241,0.25), 0 1px 3px rgba(0,0,0,0.15)'
    : dimmed ? '0 1px 2px rgba(0,0,0,0.08)'
    : '0 1px 3px rgba(0,0,0,0.1)'

  const bg = status === 'running' ? 'var(--bg-hover)' : 'var(--bg-secondary)'
  const opacity = dimmed ? 0.25 : status === 'pending' ? 0.5 : 1

  const nodeHeight = collapsed ? NODE_COLLAPSED_HEIGHT : undefined
  const nodeMinHeight = collapsed ? undefined : NODE_MIN_HEIGHT

  // Type badge
  const typeBadge = nodeType !== 'prompt' ? {
    condition: { icon: <GitBranch size={11} />, label: 'IF', color: '#f59e0b' },
    parallel: { icon: <Layers size={11} />, label: 'PAR', color: '#a78bfa' },
  }[nodeType] : undefined

  return (
    <>
      <style>{CSS_ANIM}</style>
      <div
        ref={nodeRef}
        role="button"
        tabIndex={0}
        aria-label={`Step ${index + 1}: ${displayTitle}`}
        onMouseDown={e => {
          e.stopPropagation()
          if (e.shiftKey && onMultiSelect) { onMultiSelect(step.id, true); return }
          onSelect(step.id); onDragStart(step.id, e)
        }}
        onClick={e => { e.stopPropagation(); onSelect(step.id) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSelect(step.id); if (!isEditingPrompt && !collapsed) { e.preventDefault(); setEditPromptValue(step.prompt || ''); setIsEditingPrompt(true) } }
          if (e.key === 'Escape' && isEditingPrompt) { e.preventDefault(); setIsEditingPrompt(false); setEditPromptValue(step.prompt || '') }
        }}
        onMouseEnter={() => setIsNodeHovered(true)}
        onMouseLeave={() => setIsNodeHovered(false)}
        style={{
          position: 'absolute', left: x, top: y, width,
          height: nodeHeight, minHeight: nodeMinHeight,
          background: bg, border: `1px solid ${borderColor}`, borderLeft,
          borderRadius: 8, padding: collapsed ? '0 8px' : 0,
          cursor: 'grab', boxShadow,
          outline: focused && !selected ? '2px dashed rgba(99,102,241,0.5)' : 'none',
          outlineOffset: 2,
          transition: 'box-shadow 0.15s ease, opacity 0.15s ease, transform 0.12s ease',
          transform: (isNodeHovered && !dimmed && !selected && !isActive) ? 'translateY(-1px)' : undefined,
          userSelect: 'none', boxSizing: 'border-box', opacity,
          animation: `node-in 0.15s ease-out${status === 'running' ? ', node-pulse 2s ease-in-out infinite' : ''}`,
          overflow: 'hidden', display: 'flex', alignItems: collapsed ? 'center' : 'flex-start',
          flexDirection: 'column',
          ...(pinned ? { borderTop: '2px solid #f59e0b' } : {}),
        }}
      >
        {/* Running bottom bar */}
        {status === 'running' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, overflow: 'hidden' }}>
            <div style={{ width: '35%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.7), transparent)', animation: 'running-bar 1.2s linear infinite' }} />
          </div>
        )}

        {/* Status dot — right side */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 7, height: 7, borderRadius: '50%',
          background: statusColor,
          boxShadow: status === 'running' ? `0 0 6px ${statusColor}80` : 'none',
          ...(status === 'running' ? { animation: 'spinner 1s linear infinite' } : {}),
        }} />

        {/* Drag reorder handle */}
        {onReorderDragStart && !collapsed && (
          <div
            onMouseDown={e => { e.stopPropagation(); onReorderDragStart(step.id, e) }}
            style={{
              position: 'absolute', left: 4, top: 6,
              cursor: 'grab', color: 'var(--text-muted)',
              opacity: isNodeHovered ? 0.4 : 0, transition: 'opacity 0.12s ease', zIndex: 2,
            }}>
            <GripVertical size={10} />
          </div>
        )}

        {/* Collapse toggle */}
        {onToggleCollapse && (
          <button
            onClick={e => { e.stopPropagation(); onToggleCollapse!(step.id) }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 4, top: collapsed ? '50%' : 6,
              transform: collapsed ? 'translateY(-50%)' : undefined,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 1, borderRadius: 3,
              display: 'flex', alignItems: 'center',
              opacity: isNodeHovered ? 0.4 : 0, transition: 'opacity 0.12s ease', zIndex: 2,
            }}>
            {collapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} style={{ transform: 'rotate(180deg)' }} />}
          </button>
        )}

        {/* Move up/down */}
        {isNodeHovered && !collapsed && (onMoveUp || onMoveDown) && (
          <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', right: 18, top: 5, display: 'flex', gap: 1, zIndex: 2 }}>
            {onMoveUp && <button onClick={e => { e.stopPropagation(); onMoveUp!() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 2px', borderRadius: 2, fontSize: 9, display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#818cf8')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>▲</button>}
            {onMoveDown && <button onClick={e => { e.stopPropagation(); onMoveDown!() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '1px 2px', borderRadius: 2, fontSize: 9, display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#818cf8')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>▼</button>}
          </div>
        )}

        {/* ===== Collapsed ===== */}
        {collapsed && (
          <div style={{ width: '100%', overflow: 'hidden', paddingRight: 20, paddingLeft: onReorderDragStart ? 14 : 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {step.title || `Step ${(stepIndex ?? 0) + 1}`}
            </span>
          </div>
        )}

        {/* ===== Expanded ===== */}
        {!collapsed && (
          <>
            {/* Header */}
            <div style={{ padding: '7px 24px 5px 10', width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 5 }}>
              {typeBadge && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: typeBadge.color, background: `${typeBadge.color}15`,
                  borderRadius: 4, padding: '1px 4px', border: `1px solid ${typeBadge.color}25`, flexShrink: 0,
                }}>
                  {typeBadge.icon}{typeBadge.label}
                </span>
              )}
              {isEditingTitle ? (
                <input ref={titleInputRef} value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)}
                  onBlur={commitTitleEdit} onKeyDown={e => { if (e.key === 'Enter') commitTitleEdit(); if (e.key === 'Escape') setIsEditingTitle(false) }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, background: 'var(--bg-hover)', border: '1px solid rgba(99,102,241,0.5)', borderRadius: 3, outline: 'none', padding: '1px 4px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              ) : (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text',
                }} onDoubleClick={e => { e.stopPropagation(); setEditTitleValue(step.title || ''); setIsEditingTitle(true) }}>
                  {displayTitle}
                </span>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '0 10px 8px', flex: 1, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              {status === 'completed' && outputText ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{
                    whiteSpace: outputExpanded ? 'pre-wrap' : undefined, wordBreak: 'break-word',
                    display: outputExpanded ? 'block' : '-webkit-box', WebkitLineClamp: outputExpanded ? undefined : 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {outputExpanded ? outputText.slice(0, 2000) : outputText.slice(0, 100)}
                    {!outputExpanded && outputText.length > 100 && '…'}
                  </div>
                  {outputText.length > 100 && (
                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setOutputExpanded(v => !v) }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 9, color: '#818cf8', marginTop: 2 }}>
                      {outputExpanded ? t('canvas.showLess') : t('canvas.showMore')}
                    </button>
                  )}
                </div>
              ) : status === 'running' && streamingText ? (
                <div ref={streamingRef} style={{ fontSize: 9, color: 'rgba(99,102,241,0.8)', lineHeight: 1.4, overflowY: 'auto', maxHeight: 150, fontStyle: 'italic' }}>
                  {streamingText}
                  <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(99,102,241,0.6)', animation: `node-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                  </div>
                </div>
              ) : nodeType === 'condition' ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 3 }}>{step.condition || displayPrompt}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 600 }}>Yes</span>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 600 }}>No</span>
                  </div>
                </div>
              ) : nodeType === 'parallel' ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 3 }}>{displayPrompt}</div>
                  {step.parallelPrompts && step.parallelPrompts.length > 0 && (
                    <span style={{ fontSize: 8, background: 'rgba(167,139,250,0.1)', color: '#a78bfa', borderRadius: 8, padding: '1px 5px', fontWeight: 600 }}>
                      {step.parallelPrompts.length} sub
                    </span>
                  )}
                </div>
              ) : isEditingPrompt ? (
                <div onMouseDown={e => e.stopPropagation()}>
                  <textarea ref={promptTextareaRef} value={editPromptValue} onChange={e => setEditPromptValue(e.target.value)}
                    onKeyDown={handlePromptKeyDown} onBlur={commitPromptEdit}
                    style={{ width: '100%', minHeight: 36, fontSize: 9, color: 'var(--text-primary)', background: 'var(--bg-hover)', border: '1px solid rgba(99,102,241,0.5)', borderRadius: 3, padding: '2px 4px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.4 }} />
                  <div style={{ textAlign: 'right', fontSize: 8, color: 'var(--text-muted)', opacity: 0.5, marginTop: 2, fontFamily: 'monospace' }}>{editPromptValue.length} / 2000</div>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div
                    style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.75, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor: onPromptChange ? 'text' : undefined }}
                    onDoubleClick={onPromptChange ? e => { e.stopPropagation(); setEditPromptValue(step.prompt || ''); setIsEditingPrompt(true) } : undefined}
                  >
                    {displayPrompt}
                  </div>
                  {isNodeHovered && onPromptChange && (
                    <button
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(step.prompt).then(() => { setPromptCopied(true); setTimeout(() => setPromptCopied(false), 1200) }) }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ position: 'absolute', top: 2, right: 2, background: promptCopied ? 'rgba(34,197,94,0.12)' : 'var(--bg-hover)', border: `1px solid ${promptCopied ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius: 3, padding: '1px 4px', cursor: 'pointer', color: promptCopied ? '#22c55e' : 'var(--text-muted)', fontSize: 9, display: 'flex', alignItems: 'center' }}>
                      {promptCopied ? <Check size={9} /> : <Copy size={9} />}
                    </button>
                  )}
                </div>
              )}

              {/* Typing dots — running, no streaming */}
              {status === 'running' && !streamingText && (
                <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(99,102,241,0.6)', animation: `node-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                </div>
              )}

              {/* Error */}
              {status === 'error' && outputText && (
                <div style={{ marginTop: 4, borderLeft: '2px solid rgba(239,68,68,0.4)', paddingLeft: 5 }}>
                  <div style={{ fontSize: 9, color: '#f87171', opacity: 0.7, lineHeight: 1.3, display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                    <AlertCircle size={9} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{outputText.slice(0, 60)}</span>
                  </div>
                  {onRetryStep && (
                    <button onClick={e => { e.stopPropagation(); onRetryStep!() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: 9, cursor: 'pointer', marginTop: 3 }}>
                      <RefreshCw size={9} /> Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer — actions + meta */}
            {(isNodeHovered || durationMs !== undefined || (status === 'running' && liveElapsedMs)) && (
              <div style={{
                borderTop: '1px solid var(--border)', padding: '3px 6px',
                display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box', minHeight: 22,
              }}>
                {onDuplicate && (
                  <button onClick={e => { e.stopPropagation(); onDuplicate!(step.id) }} onMouseDown={e => e.stopPropagation()}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: 'var(--text-muted)', display: 'flex', borderRadius: 2 }}>
                    <Copy size={10} />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); togglePin() }} onMouseDown={e => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: pinned ? '#f59e0b' : 'var(--text-muted)', display: 'flex', borderRadius: 2 }}>
                  <Star size={10} fill={pinned ? '#f59e0b' : 'none'} />
                </button>
                <button onClick={e => { e.stopPropagation(); setShowNote(v => !v) }} onMouseDown={e => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: noteText ? '#f59e0b' : 'var(--text-muted)', fontSize: 10, borderRadius: 2 }}>
                  📝
                </button>

                {durationMs !== undefined && (
                  <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--text-muted)', fontFamily: 'monospace', opacity: 0.5 }}>
                    {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
                {status === 'running' && liveElapsedMs && Math.floor(liveElapsedMs / 1000) >= 1 && (
                  <span style={{ marginLeft: 'auto', fontSize: 8, color: '#818cf8', fontFamily: 'monospace' }}>
                    {Math.floor(liveElapsedMs / 1000)}s
                  </span>
                )}
              </div>
            )}

            {/* Note zone */}
            {showNote && (
              <div style={{ borderTop: '1px solid rgba(245,158,11,0.15)', padding: '4px 8px', width: '100%', boxSizing: 'border-box', background: 'rgba(245,158,11,0.03)' }}
                onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                <textarea value={noteText} onChange={e => saveNote(e.target.value)} placeholder="Note..."
                  style={{ width: '100%', minHeight: 32, background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'rgba(245,158,11,0.8)', fontSize: 9, lineHeight: 1.4, boxSizing: 'border-box', fontFamily: 'inherit', padding: 0 }} />
              </div>
            )}

            {/* Completed output expanded zone */}
            {status === 'completed' && outputExpanded && outputText && (
              <div style={{ borderTop: '1px solid rgba(34,197,94,0.15)', padding: '6px 8px', width: '100%', boxSizing: 'border-box', background: 'rgba(34,197,94,0.04)', position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(outputText).then(() => { setOutputCopied(true); setTimeout(() => setOutputCopied(false), 1200) }) }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: 5, right: 5, background: outputCopied ? 'rgba(34,197,94,0.1)' : 'var(--bg-hover)', border: `1px solid ${outputCopied ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius: 3, padding: '2px 5px', cursor: 'pointer', color: outputCopied ? '#22c55e' : 'var(--text-muted)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {outputCopied ? <Check size={9} /> : <Copy size={9} />} {outputCopied ? t('workflow.canvasCopied') : t('canvas.copyOutput')}
                </button>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: 50 }}>
                  {outputText.slice(0, 200)}
                </div>
              </div>
            )}
          </>
        )}

        {/* Connection ports */}
        <div style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-primary)', opacity: isNodeHovered && !selected ? 0.8 : 0, transition: 'opacity 0.12s ease', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-primary)', opacity: isNodeHovered && !selected ? 0.8 : 0, transition: 'opacity 0.12s ease', zIndex: 2, pointerEvents: 'none' }} />
      </div>

      {/* Context menu */}
      {ctxMenu && <NodeContextMenu x={ctxMenu.x} y={ctxMenu.y} collapsed={collapsed} hasOutput={!!outputText} displayPrompt={displayPrompt} status={status}
        onCollapse={() => onToggleCollapse?.(step.id)} onClose={() => setCtxMenu(null)}
        onCopyPrompt={() => navigator.clipboard?.writeText(displayPrompt)} onCopyOutput={() => outputText && navigator.clipboard?.writeText(outputText)}
        onDeleteNode={onDeleteNode ? () => onDeleteNode(step.id) : undefined} onInsertBefore={onInsertBefore ? () => onInsertBefore(step.id) : undefined}
        onInsertAfter={onInsertAfter ? () => onInsertAfter(step.id) : undefined} onRetry={onRetry ? () => onRetry(step.id) : undefined}
        onRunFromStep={onRunFromStep} />}
    </>
  )
}

// Context menu (same as before, simplified)
function NodeContextMenu({ x, y, collapsed, hasOutput, status, onCollapse, onClose, onCopyPrompt, onCopyOutput, onDeleteNode, onInsertBefore, onInsertAfter, onRetry, onRunFromStep }: {
  x: number; y: number; collapsed: boolean; hasOutput: boolean; displayPrompt: string; status: StepStatus
  onCollapse: () => void; onClose: () => void; onCopyPrompt: () => void; onCopyOutput: () => void
  onDeleteNode?: () => void; onInsertBefore?: () => void; onInsertAfter?: () => void; onRetry?: () => void; onRunFromStep?: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h)
  }, [onClose])

  const itemS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)', transition: 'background 0.1s' }

  const Item = ({ s, d, children }: { s?: React.CSSProperties; d?: () => void; children: React.ReactNode }) => (
    <div style={{ ...itemS, ...s }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onMouseDown={d}>{children}</div>
  )

  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 1000, background: 'var(--glass-bg-deep)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minWidth: 150, padding: '3px 0', userSelect: 'none' }} onClick={e => e.stopPropagation()}>
      <Item d={() => { onCopyPrompt(); onClose() }}><Copy size={11} style={{ opacity: 0.6 }} />{t('canvas.copyPrompt')}</Item>
      {hasOutput && <Item d={() => { onCopyOutput(); onClose() }}><MessageSquare size={11} style={{ opacity: 0.6 }} />{t('canvas.copyOutput')}</Item>}
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
      <Item d={() => { onCollapse(); onClose() }}>{collapsed ? <ChevronDown size={11} style={{ opacity: 0.6 }} /> : <ChevronUp size={11} style={{ opacity: 0.6 }} />}{collapsed ? t('canvas.expandNode') : t('canvas.collapseNode')}</Item>
      {onInsertBefore && <Item d={() => { onInsertBefore(); onClose() }}><PlusCircle size={11} style={{ opacity: 0.6 }} />{t('canvas.insertBefore')}</Item>}
      {onInsertAfter && <Item d={() => { onInsertAfter(); onClose() }}><PlusCircle size={11} style={{ opacity: 0.6 }} />{t('canvas.insertAfter')}</Item>}
      {onRetry && status === 'error' && <Item d={() => { onRetry(); onClose() }}><RefreshCw size={11} style={{ opacity: 0.6 }} />{t('canvas.retryStep')}</Item>}
      {onRunFromStep && <><div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} /><Item s={{ color: '#818cf8' }} d={() => { onRunFromStep(); onClose() }}><Play size={10} style={{ opacity: 0.7 }} />{t('workflow.runFromStep')}</Item></>}
      {onDeleteNode && <><div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} /><Item s={{ color: '#f87171' }} d={() => { onDeleteNode(); onClose() }}><Trash2 size={11} style={{ opacity: 0.6 }} />{t('canvas.deleteStep')}</Item></>}
    </div>
  )
}
