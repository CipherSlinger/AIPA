import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Copy, AlertCircle, GripVertical, RefreshCw, Trash2, Play, PlusCircle, ChevronUp, Star, GitBranch, Layers, MessageSquare } from 'lucide-react'
import { WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import { getPresetStepText } from './workflowConstants'
import { countWords } from '../../utils/stringUtils'
import { fmtNumber, formatDuration } from '../layout/statusBarConstants'
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
  onColorChange?: (color: string) => void
  onSelectSameType?: () => void
  staggerDelay?: number
}


export const NODE_WIDTH = 220
export const NODE_MIN_HEIGHT = 60
export const NODE_COLLAPSED_HEIGHT = 26
export const NODE_GAP_Y = 120

// Color palette for node accent color picker
const COLOR_PALETTE = ['', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4'] as const

// Type accent colors
const TYPE_COLORS: Record<string, string> = {
  prompt: 'var(--accent)',
  condition: 'var(--warning)',
  parallel: 'var(--color-violet)',
}

// Type badge backgrounds (hex-alpha trick doesn't work with CSS vars)
const TYPE_BG: Record<string, string> = {
  prompt: 'var(--accent-bg)',
  condition: 'rgba(245,158,11,0.1)',
  parallel: 'rgba(167,139,250,0.1)',
}

// Status colors
const STAT: Record<string, string> = {
  idle: 'var(--text-muted)',
  pending: 'var(--text-muted)',
  running: 'var(--accent)',
  completed: 'var(--success)',
  error: 'var(--error)',
}

export default function CanvasNode({
  step, index, x, y, width, selected, status = 'idle', presetKey,
  collapsed = false, outputText, dimmed = false, durationMs, stepDuration,
  multiSelected = false, focused = false, streamingText, liveElapsedMs,
  stepIndex, highlighted = false, activeSubAgentCount = 0, staggerDelay = 0,
  onSelect, onDragStart, onToggleCollapse, onTitleChange, onMultiSelect,
  onReorderDragStart, onDeleteNode, onInsertBefore, onInsertAfter,
  onRetry, onRunFromStep, onPromptChange, onHeightChange, onDuplicate,
  onMoveUp, onMoveDown, onRetryStep, onColorChange, onSelectSameType,
}: CanvasNodeProps) {
  const t = useT()
  const [ctxMenu, setCtxMenu] = useState<{x:number;y:number}|null>(null)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [editTitle, setEditTitle] = useState(false)
  const [editTitleVal, setEditTitleVal] = useState('')
  const [editPrompt, setEditPrompt] = useState(false)
  const [editPromptVal, setEditPromptVal] = useState('')
  const [hovered, setHovered] = useState(false)
  const [copiedOut, setCopiedOut] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [justDone, setJustDone] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [noteText, setNoteText] = useState(() => {
    try { return localStorage.getItem(`aipa:step-note:${step.id}`) ?? '' } catch { return '' }
  })
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(`aipa:step-pin:${step.id}`) === '1' } catch { return false }
  })
  const [errorExpanded, setErrorExpanded] = useState(false)
  const streamCpsRef = useRef<{ count: number; timestamp: number; cps: number | null }>({ count: 0, timestamp: Date.now(), cps: null })
  const prevRef = useRef<string|undefined>(undefined)
  const titleRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const justDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const togglePin = () => {
    const n = !pinned; setPinned(n)
    try { n ? localStorage.setItem(`aipa:step-pin:${step.id}`, '1') : localStorage.removeItem(`aipa:step-pin:${step.id}`) } catch {}
  }
  const saveNote = (v: string) => {
    setNoteText(v)
    try { v.trim() ? localStorage.setItem(`aipa:step-note:${step.id}`, v) : localStorage.removeItem(`aipa:step-note:${step.id}`) } catch {}
  }

  useEffect(() => () => {
    clearTimeout(justDoneTimerRef.current ?? undefined)
    clearTimeout(copiedPromptTimerRef.current ?? undefined)
    clearTimeout(copiedOutTimerRef.current ?? undefined)
  }, [])
  useEffect(() => { if (status !== 'completed') setOutputExpanded(false); if (status !== 'error') setErrorExpanded(false) }, [status])
  useEffect(() => {
    if (prevRef.current === 'running' && status === 'completed') { setJustDone(true); clearTimeout(justDoneTimerRef.current ?? undefined); justDoneTimerRef.current = setTimeout(() => setJustDone(false), 500) }
    prevRef.current = status
  }, [status])
  useEffect(() => {
    if (status !== 'running' || !streamingText) { streamCpsRef.current = { count: 0, timestamp: Date.now(), cps: null }; return }
    const len = streamingText.length
    const now = Date.now()
    const elapsed = (now - streamCpsRef.current.timestamp) / 1000
    if (elapsed > 0.5 && len > streamCpsRef.current.count) {
      streamCpsRef.current = { count: len, timestamp: now, cps: Math.round((len - streamCpsRef.current.count) / elapsed) }
    }
  }, [streamingText, status])
  useEffect(() => { if (editTitle && titleRef.current) { titleRef.current.focus(); titleRef.current.select() } }, [editTitle])
  useEffect(() => { if (editPrompt && promptRef.current) { promptRef.current.focus(); promptRef.current.select() } }, [editPrompt])
  useEffect(() => {
    if (!onHeightChange || !nodeRef.current) return
    const ro = new ResizeObserver(e => { if (e[0]) onHeightChange(step.id, e[0].contentRect.height) })
    ro.observe(nodeRef.current); return () => ro.disconnect()
  }, [step.id, onHeightChange])
  useEffect(() => { if (streamRef.current && status === 'running') streamRef.current.scrollTop = streamRef.current.scrollHeight }, [streamingText, status])

  const commitTitle = useCallback(() => {
    const v = editTitleVal.trim(); if (v && v !== step.title) onTitleChange?.(step.id, v); setEditTitle(false)
  }, [editTitleVal, step.id, step.title, onTitleChange])

  const commitPrompt = useCallback(() => {
    const v = editPromptVal.trim(); if (v && v !== step.prompt) onPromptChange?.(step.id, v); setEditPrompt(false)
  }, [editPromptVal, step.id, step.prompt, onPromptChange])

  const nodeType = step.nodeType ?? 'prompt'
  const title = getPresetStepText(presetKey, index, 'title', t, step.title)
  const prompt = getPresetStepText(presetKey, index, 'prompt', t, step.prompt)
  const typeColor = TYPE_COLORS[nodeType] || TYPE_COLORS.prompt
  const statColor = STAT[status] || STAT.idle
  const active = selected || status === 'running'

  const border = `1px solid ${selected ? 'rgba(99,102,241,.45)' : status === 'completed' ? 'rgba(34,197,94,.2)' : status === 'error' ? 'rgba(239,68,68,.2)' : 'var(--border)'}`
  const borderLeft = `3px solid ${step.nodeColor ? step.nodeColor : typeColor}`
  const shadow = justDone ? '0 0 0 2px rgba(34,197,94,.4), 0 4px 16px rgba(34,197,94,.12)'
    : highlighted ? '0 0 0 1.5px rgba(99,102,241,.35), 0 2px 8px rgba(99,102,241,.08)'
    : selected ? '0 0 0 1.5px rgba(99,102,241,.3), 0 4px 16px rgba(99,102,241,.08)'
    : status === 'running' ? '0 0 0 1px rgba(99,102,241,.2), 0 4px 12px rgba(99,102,241,.1)'
    : '0 2px 4px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.04)'

  const h = collapsed ? NODE_COLLAPSED_HEIGHT : undefined
  const mh = collapsed ? undefined : NODE_MIN_HEIGHT

  const typeIcon = nodeType === 'condition' ? <GitBranch size={11} /> : nodeType === 'parallel' ? <Layers size={11} /> : null
  const typeLabel = nodeType === 'condition' ? 'IF' : nodeType === 'parallel' ? 'PAR' : ''

  return (
    <>
      <div
        ref={nodeRef}
        role="button" tabIndex={0}
        onMouseDown={e => {
          e.stopPropagation()
          if (e.shiftKey && onMultiSelect) { onMultiSelect(step.id, true); return }
          onSelect(step.id); onDragStart(step.id, e)
        }}
        onClick={e => { e.stopPropagation(); onSelect(step.id) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSelect(step.id); if (!editPrompt && !collapsed) { e.preventDefault(); setEditPromptVal(step.prompt || ''); setEditPrompt(true) } }
          if (e.key === 'Escape' && editPrompt) { e.preventDefault(); setEditPrompt(false); setEditPromptVal(step.prompt || '') }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'absolute', left: x, top: y, width,
          height: h, minHeight: mh,
          background: status === 'running' ? 'var(--bg-hover)' : 'var(--bg-secondary)',
          border, borderLeft, borderRadius: 6,
          padding: collapsed ? '0 8px' : '5px 0',
          cursor: 'grab', boxShadow: shadow,
          outline: focused && !selected ? '1.5px dashed rgba(99,102,241,.4)' : 'none',
          outlineOffset: 1,
          transition: 'box-shadow .15s ease, transform .12s ease',
          transform: hovered && !dimmed && !active ? 'translateY(-1px)' : undefined,
          userSelect: 'none', boxSizing: 'border-box',
          opacity: dimmed ? .2 : status === 'pending' ? .45 : 1,
          animationDelay: staggerDelay > 0 ? `${staggerDelay}ms` : undefined,
          animation: `canvas-node-fadein .12s ease-out${status === 'running' ? ',canvas-node-glow 2s ease-in-out infinite' : ''}`,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'stretch',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {/* Running indicator bar */}
        {status === 'running' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden' }}>
            <div style={{ width: '30%', height: '100%', background: 'linear-gradient(90deg,transparent,var(--accent-muted),transparent)', animation: 'canvas-node-bar 1.2s linear infinite' }} />
          </div>
        )}

        {/* Status indicator — small dot left of title */}
        {collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', overflow: 'hidden', paddingRight: 16 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: step.nodeColor && status === 'idle' ? step.nodeColor : statColor,
              ...(status === 'running' ? { animation: 'spin 1s linear infinite', width: 6, height: 6, borderRadius: 2 } : {}),
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {step.title || `Step ${(stepIndex ?? 0) + 1}`}
            </span>
          </div>
        )}

        {!collapsed && (
          <>
            {/* Header row */}
            <div style={{ padding: '3px 8px 3px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
              {/* Status dot */}
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: step.nodeColor && status === 'idle' ? step.nodeColor : statColor,
                ...(status === 'running' ? { animation: 'spin 1s linear infinite', borderRadius: 1.5 } : {}),
              }} />
              {/* Type badge */}
              {typeIcon && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  fontSize: 8, fontWeight: 700, letterSpacing: '.04em',
                  color: typeColor, background: TYPE_BG[nodeType] || TYPE_BG.prompt,
                  borderRadius: 4, padding: '2px 5px', flexShrink: 0,
                }}>
                  {typeIcon}{typeLabel}
                </span>
              )}
              {/* Title */}
              {editTitle ? (
                <input ref={titleRef} value={editTitleVal}
                  onChange={e => setEditTitleVal(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditTitle(false) }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, background: 'var(--bg-hover)', border: '1px solid var(--accent-border)', borderRadius: 3, outline: 'none', padding: '1px 4px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              ) : (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                  onDoubleClick={e => { e.stopPropagation(); setEditTitleVal(step.title || ''); setEditTitle(true) }}>
                  {title}
                </span>
              )}
              {/* Collapse */}
              {onToggleCollapse && (
                <button onClick={e => { e.stopPropagation(); onToggleCollapse!(step.id) }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 1, display: 'flex', opacity: hovered ? .4 : 0, transition: 'opacity .12s' }}>
                  <ChevronUp size={10} style={{ transform: 'rotate(180deg)' }} />
                </button>
              )}
              {/* Move buttons */}
              {hovered && (onMoveUp || onMoveDown) && (
                <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', gap: 0 }}>
                  {onMoveUp && <button onClick={e => { e.stopPropagation(); onMoveUp!() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 1px', fontSize: 8, display: 'flex' }}>▲</button>}
                  {onMoveDown && <button onClick={e => { e.stopPropagation(); onMoveDown!() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 1px', fontSize: 8, display: 'flex' }}>▼</button>}
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '0 8px 5px', flex: 1, overflow: 'hidden' }}>
              {/* Drag handle */}
              {onReorderDragStart && (
                <div onMouseDown={e => { e.stopPropagation(); onReorderDragStart(step.id, e) }}
                  style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', cursor: 'grab', color: 'var(--text-muted)', opacity: hovered ? .3 : 0, transition: 'opacity .12s' }}>
                  <GripVertical size={9} />
                </div>
              )}

              {status === 'completed' && outputText ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)', background: 'var(--bg-hover)', borderRadius: 4, padding: '1px 6px', flexShrink: 0, display: 'inline-block', marginBottom: 2 }}>
                    {countWords(outputText)}w · {fmtNumber(outputText.length)} chars
                  </span>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        whiteSpace: outputExpanded ? 'pre-wrap' : undefined,
                        wordBreak: 'break-word',
                        display: outputExpanded ? 'block' : '-webkit-box',
                        WebkitLineClamp: outputExpanded ? undefined : 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {outputExpanded ? outputText.slice(0, 2000) : outputText.slice(0, 80)}
                        {!outputExpanded && outputText.length > 80 && '…'}
                      </div>
                      {outputText.length > 80 && (
                        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setOutputExpanded(v => !v) }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 9, color: 'var(--accent-muted)', marginTop: 1 }}>
                          {outputExpanded ? t('canvas.showLess') : t('canvas.showMore')}
                        </button>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(outputText).then(() => { setCopiedOut(true); clearTimeout(copiedOutTimerRef.current ?? undefined); copiedOutTimerRef.current = setTimeout(() => setCopiedOut(false), 1000) }) }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedOut ? 'var(--success)' : 'var(--text-muted)', padding: 1, flexShrink: 0, opacity: hovered ? 0.7 : 0, transition: 'opacity 0.15s' }}>
                      {copiedOut ? <Check size={8} /> : <Copy size={8} />}
                    </button>
                  </div>
                </div>
              ) : status === 'running' && streamingText ? (
                <div ref={streamRef} style={{ fontSize: 9, color: 'var(--accent-muted)', lineHeight: 1.4, overflowY: 'auto', maxHeight: 120, fontStyle: 'italic' }}>
                  <div style={{ height: 1, background: 'var(--accent)', opacity: 0.4, marginBottom: 3, borderRadius: 1, animation: 'canvas-node-bar 1.2s linear infinite', width: '30%' }} />
                  {streamCpsRef.current.cps !== null && streamCpsRef.current.cps > 0 && (
                    <span style={{ fontSize: 7, color: 'var(--accent-muted)', fontFamily: 'monospace', display: 'block', marginBottom: 2 }}>{streamCpsRef.current.cps} c/s</span>
                  )}
                  {streamingText}
                  <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'var(--accent)', opacity: 0.5, animation: `canvas-node-dots 1.2s ease-in-out ${i*.2}s infinite` }} />)}
                  </div>
                </div>
              ) : nodeType === 'condition' ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{step.condition || prompt}</div>
                </div>
              ) : nodeType === 'parallel' ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 2 }}>{prompt}</div>
                  {step.parallelPrompts?.length ? <span style={{ fontSize: 8, color: 'var(--color-violet)' }}>{step.parallelPrompts.length} sub</span> : null}
                </div>
              ) : editPrompt ? (
                <div onMouseDown={e => e.stopPropagation()}>
                  <textarea ref={promptRef} value={editPromptVal} onChange={e => setEditPromptVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditPrompt(false) } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitPrompt() } }}
                    onBlur={commitPrompt}
                    style={{ width: '100%', minHeight: 30, fontSize: 9, color: 'var(--text-primary)', background: 'var(--bg-hover)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '2px 4px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.4 }} />
                  <div style={{ textAlign: 'right', fontSize: 7, color: 'var(--text-muted)', opacity: .4, fontFamily: 'monospace', marginTop: 1 }}>{editPromptVal.length}/2000</div>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div
                    style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: .7, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor: onPromptChange ? 'text' : undefined }}
                    onDoubleClick={onPromptChange ? e => { e.stopPropagation(); setEditPromptVal(step.prompt || ''); setEditPrompt(true) } : undefined}
                  >
                    {prompt}
                  </div>
                  {hovered && onPromptChange && (
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(step.prompt).then(() => { setCopiedPrompt(true); clearTimeout(copiedPromptTimerRef.current ?? undefined); copiedPromptTimerRef.current = setTimeout(() => setCopiedPrompt(false), 1000) }) }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ position: 'absolute', top: 1, right: 1, background: copiedPrompt ? 'rgba(74,222,128,0.1)' : 'transparent', border: `1px solid ${copiedPrompt ? 'rgba(74,222,128,0.25)' : 'transparent'}`, borderRadius: 3, padding: '1px 3px', cursor: 'pointer', color: copiedPrompt ? 'var(--success)' : 'var(--text-muted)', fontSize: 8, display: 'flex', alignItems: 'center' }}>
                      {copiedPrompt ? <Check size={8} /> : <Copy size={8} />}
                    </button>
                  )}
                </div>
              )}

              {/* Typing dots — shown when running (inside streaming block or standalone) */}
              {status === 'running' && !streamingText && (
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'var(--accent)', opacity: 0.5, animation: `canvas-node-dots 1.2s ease-in-out ${i*.2}s infinite` }} />)}
                </div>
              )}

              {/* Error */}
              {status === 'error' && outputText && (
                <div style={{ marginTop: 3 }}>
                  <div style={{ paddingLeft: 5, borderLeft: '2px solid rgba(248,113,113,0.3)', background: errorExpanded ? 'rgba(248,113,113,0.04)' : 'transparent', borderRadius: '0 3px 3px 0', padding: '4px 6px 4px 5px' }}>
                    <div style={{ fontSize: 8, color: 'var(--error)', opacity: .7, lineHeight: 1.3, display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                      <AlertCircle size={8} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ wordBreak: 'break-word', overflowY: errorExpanded ? 'auto' : 'hidden', maxHeight: errorExpanded ? 120 : undefined, display: errorExpanded ? 'block' : '-webkit-box', WebkitLineClamp: errorExpanded ? undefined : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {errorExpanded ? outputText.slice(0, 500) : outputText.slice(0, 50)}
                      </span>
                    </div>
                    {outputText.length > 50 && (
                      <button onClick={e => { e.stopPropagation(); setErrorExpanded(v => !v) }} onMouseDown={e => e.stopPropagation()}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 8, color: 'rgba(248,113,113,0.6)', marginTop: 2 }}>
                        {errorExpanded ? '▴ less' : '▾ more'}
                      </button>
                    )}
                  </div>
                  {onRetryStep && (
                    <button onClick={e => { e.stopPropagation(); onRetryStep!() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 5px', borderRadius: 3, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)', color: 'var(--error)', fontSize: 8, cursor: 'pointer', marginTop: 2 }}>
                      <RefreshCw size={8} /> Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer — only on hover or has meta */}
            {(hovered || durationMs !== undefined) && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 1, minHeight: 18 }}>
                {onDuplicate && <Btn onClick={e => { e.stopPropagation(); onDuplicate!(step.id) }}><Copy size={9} /></Btn>}
                <Btn onClick={e => { e.stopPropagation(); togglePin() }} style={{ color: pinned ? '#f59e0b' : undefined }}>{pinned ? <Star size={9} fill="#f59e0b" /> : <Star size={9} />}</Btn>
                <Btn onClick={e => { e.stopPropagation(); setShowNote(v => !v) }} style={{ fontSize: 9 }}>📝</Btn>
                {hovered && onColorChange && (
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginLeft: 2 }} onMouseDown={e => e.stopPropagation()}>
                    {COLOR_PALETTE.map(c => (
                      <div
                        key={c || 'default'}
                        onClick={e => { e.stopPropagation(); onColorChange(c) }}
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: c || 'var(--bg-hover)',
                          border: `1px solid ${step.nodeColor === (c || undefined) ? 'var(--text-primary)' : 'var(--border)'}`,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        title={c ? c : 'Default'}
                      />
                    ))}
                  </div>
                )}
                <span style={{ flex: 1 }} />
                {durationMs !== undefined && <span style={{ fontSize: 7, color: 'var(--text-muted)', fontFamily: 'monospace', opacity: .4 }}>{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs/1000).toFixed(1)}s`}</span>}
                {status === 'running' && liveElapsedMs && liveElapsedMs >= 1000 && <span style={{ fontSize: 7, color: 'var(--accent-muted)', fontFamily: 'monospace' }}>{formatDuration(liveElapsedMs)}</span>}
              </div>
            )}

            {/* Note */}
            {showNote && (
              <div style={{ borderTop: '1px solid rgba(245,158,11,.1)', padding: '3px 6px', background: 'rgba(245,158,11,.02)' }}
                onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                <textarea value={noteText} onChange={e => saveNote(e.target.value)} placeholder="Note..."
                  style={{ width: '100%', minHeight: 24, background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'rgba(245,158,11,.7)', fontSize: 8, lineHeight: 1.4, boxSizing: 'border-box', fontFamily: 'inherit', padding: 0 }} />
              </div>
            )}

            {/* Expanded output */}
            {status === 'completed' && outputExpanded && outputText && (
              <div style={{ borderTop: '1px solid rgba(74,222,128,0.12)', padding: '4px 6px', background: 'rgba(74,222,128,0.03)', position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(outputText).then(() => { setCopiedOut(true); clearTimeout(copiedOutTimerRef.current ?? undefined); copiedOutTimerRef.current = setTimeout(() => setCopiedOut(false), 1000) }) }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: 3, right: 3, background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 8, display: 'flex', alignItems: 'center', gap: 2 }}>
                  {copiedOut ? <Check size={8} /> : <Copy size={8} />} {copiedOut ? t('workflow.canvasCopied') : t('canvas.copyOutput')}
                </button>
                <div style={{ fontSize: 8, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: 40 }}>
                  {outputText.slice(0, 150)}
                </div>
              </div>
            )}
          </>
        )}

        {/* Connection port dots */}
        <div style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: 'var(--bg-primary)', border: '1.5px solid var(--border-strong)', opacity: hovered && !selected ? .8 : .35, transition: 'all .15s ease', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%)', width: 7, height: 7, borderRadius: '50%', background: 'var(--bg-primary)', border: '1.5px solid var(--border-strong)', opacity: hovered && !selected ? .8 : .35, transition: 'all .15s ease', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: 'var(--bg-primary)', border: '1.5px solid var(--border-strong)', opacity: hovered && !selected ? .8 : .35, transition: 'all .15s ease', pointerEvents: 'none' }} />
        {pinned && <span style={{ position: 'absolute', top: 3, right: 20, fontSize: 8, color: '#f59e0b', pointerEvents: 'none', lineHeight: 1 }}>★</span>}
      </div>

      {ctxMenu && <CtxMenu x={ctxMenu.x} y={ctxMenu.y} collapsed={collapsed} hasOutput={!!outputText} status={status}
        onCollapse={() => onToggleCollapse?.(step.id)} onClose={() => setCtxMenu(null)}
        onCopyPrompt={() => navigator.clipboard?.writeText(prompt)} onCopyOutput={() => outputText && navigator.clipboard?.writeText(outputText)}
        onDeleteNode={onDeleteNode ? () => onDeleteNode(step.id) : undefined} onInsertBefore={onInsertBefore ? () => onInsertBefore(step.id) : undefined}
        onInsertAfter={onInsertAfter ? () => onInsertAfter(step.id) : undefined} onRetry={onRetry ? () => onRetry(step.id) : undefined}
        onRunFromStep={onRunFromStep} />}
    </>
  )
}

// Tiny button helper
function Btn({ children, onClick, style: s, onMouseDown }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; style?: React.CSSProperties; onMouseDown?: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} onMouseDown={onMouseDown || (e => e.stopPropagation())}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 2px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRadius: 2, ...s }}>
      {children}
    </button>
  )
}

// Context menu
function CtxMenu({ x, y, collapsed, hasOutput, status, onCollapse, onClose, onCopyPrompt, onCopyOutput, onDeleteNode, onInsertBefore, onInsertAfter, onRetry, onRunFromStep }: {
  x: number; y: number; collapsed: boolean; hasOutput: boolean; status: StepStatus
  onCollapse: () => void; onClose: () => void; onCopyPrompt: () => void; onCopyOutput: () => void
  onDeleteNode?: () => void; onInsertBefore?: () => void; onInsertAfter?: () => void; onRetry?: () => void; onRunFromStep?: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h)
  }, [onClose])

  const is: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)' }
  const Item = ({ s, d, children }: { s?: React.CSSProperties; d?: () => void; children: React.ReactNode }) => (
    <div style={{ ...is, ...s }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onMouseDown={d}>{children}</div>
  )

  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 1000, background: 'var(--glass-bg-deep)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.4)', minWidth: 140, padding: '3px 0', userSelect: 'none' }} onClick={e => e.stopPropagation()}>
      <Item d={() => { onCopyPrompt(); onClose() }}><Copy size={11} style={{ opacity: .5 }} />{t('canvas.copyPrompt')}</Item>
      {hasOutput && <Item d={() => { onCopyOutput(); onClose() }}><MessageSquare size={11} style={{ opacity: .5 }} />{t('canvas.copyOutput')}</Item>}
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
      <Item d={() => { onCollapse(); onClose() }}>{collapsed ? <ChevronDown size={11} style={{ opacity: .5 }} /> : <ChevronUp size={11} style={{ opacity: .5 }} />}{collapsed ? t('canvas.expandNode') : t('canvas.collapseNode')}</Item>
      {onInsertBefore && <Item d={() => { onInsertBefore(); onClose() }}><PlusCircle size={11} style={{ opacity: .5 }} />{t('canvas.insertBefore')}</Item>}
      {onInsertAfter && <Item d={() => { onInsertAfter(); onClose() }}><PlusCircle size={11} style={{ opacity: .5 }} />{t('canvas.insertAfter')}</Item>}
      {onRetry && status === 'error' && <Item d={() => { onRetry(); onClose() }}><RefreshCw size={11} style={{ opacity: .5 }} />{t('canvas.retryStep')}</Item>}
      {onRunFromStep && <><div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} /><Item s={{ color: 'var(--accent-muted)' }} d={() => { onRunFromStep(); onClose() }}><Play size={10} style={{ opacity: .6 }} />{t('workflow.runFromStep')}</Item></>}
      {onDeleteNode && <><div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} /><Item s={{ color: 'var(--error)' }} d={() => { onDeleteNode(); onClose() }}><Trash2 size={11} style={{ opacity: .5 }} />{t('canvas.deleteStep')}</Item></>}
    </div>
  )
}
