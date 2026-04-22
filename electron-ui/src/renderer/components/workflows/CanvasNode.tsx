import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Check, Loader, ChevronDown, Copy, AlertCircle, GripVertical, RefreshCw, Trash2, Play, PlusCircle, ChevronUp, Star, GitBranch, Layers, MessageSquare } from 'lucide-react'
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

const CSS = `
@keyframes ndot {
  0%,80%,100%{transform:translateY(0);opacity:.3}
  40%{transform:translateY(-3px);opacity:1}
}
@keyframes nfadein {
  from{opacity:0;transform:translateY(3px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes nglow {
  0%,100%{box-shadow:0 0 0 1px rgba(99,102,241,.2)}
  50%{box-shadow:0 0 0 2px rgba(99,102,241,.35)}
}
@keyframes nspin {
  from{transform:rotate(0deg)}
  to{transform:rotate(360deg)}
}
@keyframes nbar {
  0%{transform:translateX(-100%)}
  100%{transform:translateX(400%)}
}
`

export const NODE_WIDTH = 220
export const NODE_MIN_HEIGHT = 60
export const NODE_COLLAPSED_HEIGHT = 26
export const NODE_GAP_Y = 80

// Type accent colors
const TYPE_COLORS: Record<string, string> = {
  prompt: '#6366f1',
  condition: '#f59e0b',
  parallel: '#a78bfa',
}

// Status colors
const STAT: Record<string, string> = {
  idle: '#94a3b8',
  pending: '#94a3b8',
  running: '#6366f1',
  completed: '#22c55e',
  error: '#ef4444',
}

export default function CanvasNode({
  step, index, x, y, width, selected, status = 'idle', presetKey,
  collapsed = false, outputText, dimmed = false, durationMs, stepDuration,
  multiSelected = false, focused = false, streamingText, liveElapsedMs,
  stepIndex, highlighted = false, activeSubAgentCount = 0,
  onSelect, onDragStart, onToggleCollapse, onTitleChange, onMultiSelect,
  onReorderDragStart, onDeleteNode, onInsertBefore, onInsertAfter,
  onRetry, onRunFromStep, onPromptChange, onHeightChange, onDuplicate,
  onMoveUp, onMoveDown, onRetryStep,
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
  const prevRef = useRef<string|undefined>(undefined)
  const titleRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  const togglePin = () => {
    const n = !pinned; setPinned(n)
    try { n ? localStorage.setItem(`aipa:step-pin:${step.id}`, '1') : localStorage.removeItem(`aipa:step-pin:${step.id}`) } catch {}
  }
  const saveNote = (v: string) => {
    setNoteText(v)
    try { v.trim() ? localStorage.setItem(`aipa:step-note:${step.id}`, v) : localStorage.removeItem(`aipa:step-note:${step.id}`) } catch {}
  }

  useEffect(() => { if (status !== 'completed') setOutputExpanded(false) }, [status])
  useEffect(() => {
    if (prevRef.current === 'running' && status === 'completed') { setJustDone(true); setTimeout(() => setJustDone(false), 500) }
    prevRef.current = status
  }, [status])
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

  // Border: subtle colored left accent + light overall border
  const border = `1px solid ${selected ? 'rgba(99,102,241,.45)' : status === 'completed' ? 'rgba(34,197,94,.2)' : status === 'error' ? 'rgba(239,68,68,.2)' : 'var(--border)'}`
  const borderLeft = `3px solid ${typeColor}`
  const shadow = justDone ? '0 0 0 2px rgba(34,197,94,.4)'
    : highlighted ? '0 0 0 1.5px rgba(99,102,241,.35)'
    : selected ? '0 0 0 1.5px rgba(99,102,241,.3)'
    : status === 'running' ? '0 0 0 1px rgba(99,102,241,.2)'
    : '0 1px 2px rgba(0,0,0,.06)'

  const h = collapsed ? NODE_COLLAPSED_HEIGHT : undefined
  const mh = collapsed ? undefined : NODE_MIN_HEIGHT

  const typeIcon = nodeType === 'condition' ? <GitBranch size={10} /> : nodeType === 'parallel' ? <Layers size={10} /> : null
  const typeLabel = nodeType === 'condition' ? 'IF' : nodeType === 'parallel' ? 'PAR' : ''

  return (
    <>
      <style>{CSS}</style>
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
          animation: `nfadein .12s ease-out${status === 'running' ? ',nglow 2s ease-in-out infinite' : ''}`,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'stretch',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {/* Running indicator bar */}
        {status === 'running' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, overflow: 'hidden' }}>
            <div style={{ width: '30%', height: '100%', background: 'linear-gradient(90deg,transparent,rgba(99,102,241,.6),transparent)', animation: 'nbar 1.2s linear infinite' }} />
          </div>
        )}

        {/* Status indicator — small dot left of title */}
        {collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', overflow: 'hidden', paddingRight: 16 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: statColor,
              ...(status === 'running' ? { animation: 'nspin 1s linear infinite', width: 6, height: 6, borderRadius: 2 } : {}),
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
                background: statColor,
                ...(status === 'running' ? { animation: 'nspin 1s linear infinite', borderRadius: 1.5 } : {}),
              }} />
              {/* Type badge */}
              {typeIcon && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  fontSize: 8, fontWeight: 700, letterSpacing: '.04em',
                  color: typeColor, background: `${typeColor}12`,
                  borderRadius: 3, padding: '1px 4px', flexShrink: 0,
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
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, background: 'var(--bg-hover)', border: '1px solid rgba(99,102,241,.4)', borderRadius: 3, outline: 'none', padding: '1px 4px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
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
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 9, color: '#818cf8', marginTop: 1 }}>
                      {outputExpanded ? t('canvas.showLess') : t('canvas.showMore')}
                    </button>
                  )}
                </div>
              ) : status === 'running' && streamingText ? (
                <div ref={streamRef} style={{ fontSize: 9, color: 'rgba(99,102,241,.7)', lineHeight: 1.4, overflowY: 'auto', maxHeight: 120, fontStyle: 'italic' }}>
                  {streamingText}
                  <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'rgba(99,102,241,.5)', animation: `ndot 1.2s ease-in-out ${i*.2}s infinite` }} />)}
                  </div>
                </div>
              ) : nodeType === 'condition' ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{step.condition || prompt}</div>
                </div>
              ) : nodeType === 'parallel' ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 2 }}>{prompt}</div>
                  {step.parallelPrompts?.length ? <span style={{ fontSize: 8, color: '#a78bfa' }}>{step.parallelPrompts.length} sub</span> : null}
                </div>
              ) : editPrompt ? (
                <div onMouseDown={e => e.stopPropagation()}>
                  <textarea ref={promptRef} value={editPromptVal} onChange={e => setEditPromptVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditPrompt(false) } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitPrompt() } }}
                    onBlur={commitPrompt}
                    style={{ width: '100%', minHeight: 30, fontSize: 9, color: 'var(--text-primary)', background: 'var(--bg-hover)', border: '1px solid rgba(99,102,241,.4)', borderRadius: 3, padding: '2px 4px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.4 }} />
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
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(step.prompt).then(() => { setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1000) }) }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ position: 'absolute', top: 1, right: 1, background: copiedPrompt ? 'rgba(34,197,94,.1)' : 'transparent', border: `1px solid ${copiedPrompt ? 'rgba(34,197,94,.25)' : 'transparent'}`, borderRadius: 3, padding: '1px 3px', cursor: 'pointer', color: copiedPrompt ? '#22c55e' : 'var(--text-muted)', fontSize: 8, display: 'flex', alignItems: 'center' }}>
                      {copiedPrompt ? <Check size={8} /> : <Copy size={8} />}
                    </button>
                  )}
                </div>
              )}

              {/* Typing dots */}
              {status === 'running' && !streamingText && (
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'rgba(99,102,241,.5)', animation: `ndot 1.2s ease-in-out ${i*.2}s infinite` }} />)}
                </div>
              )}

              {/* Error */}
              {status === 'error' && outputText && (
                <div style={{ marginTop: 3, paddingLeft: 5, borderLeft: '2px solid rgba(239,68,68,.3)' }}>
                  <div style={{ fontSize: 8, color: '#f87171', opacity: .7, lineHeight: 1.3, display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                    <AlertCircle size={8} style={{ flexShrink: 0 }} />
                    <span>{outputText.slice(0, 50)}</span>
                  </div>
                  {onRetryStep && (
                    <button onClick={e => { e.stopPropagation(); onRetryStep!() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 5px', borderRadius: 3, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.05)', color: '#f87171', fontSize: 8, cursor: 'pointer', marginTop: 2 }}>
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
                <span style={{ flex: 1 }} />
                {durationMs !== undefined && <span style={{ fontSize: 7, color: 'var(--text-muted)', fontFamily: 'monospace', opacity: .4 }}>{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs/1000).toFixed(1)}s`}</span>}
                {status === 'running' && liveElapsedMs && Math.floor(liveElapsedMs/1000) >= 1 && <span style={{ fontSize: 7, color: '#818cf8', fontFamily: 'monospace' }}>{Math.floor(liveElapsedMs/1000)}s</span>}
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
              <div style={{ borderTop: '1px solid rgba(34,197,94,.12)', padding: '4px 6px', background: 'rgba(34,197,94,.03)', position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(outputText).then(() => { setCopiedOut(true); setTimeout(() => setCopiedOut(false), 1000) }) }}
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

        {/* Connection dots */}
        <div style={{ position: 'absolute', left: -3, top: '50%', transform: 'translateY(-50%)', width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid var(--bg-primary)', opacity: hovered && !selected ? .6 : 0, transition: 'opacity .12s', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -3, top: '50%', transform: 'translateY(-50%)', width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid var(--bg-primary)', opacity: hovered && !selected ? .6 : 0, transition: 'opacity .12s', pointerEvents: 'none' }} />
      </div>

      {ctxMenu && <CtxMenu x={ctxMenu.x} y={ctxMenu.y} collapsed={collapsed} hasOutput={!!outputText} displayPrompt={prompt} status={status}
        onCollapse={() => onToggleCollapse?.(step.id)} onClose={() => setCtxMenu(null)}
        onCopyPrompt={() => navigator.clipboard?.writeText(displayPrompt)} onCopyOutput={() => outputText && navigator.clipboard?.writeText(outputText)}
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
      {onRunFromStep && <><div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} /><Item s={{ color: '#818cf8' }} d={() => { onRunFromStep(); onClose() }}><Play size={10} style={{ opacity: .6 }} />{t('workflow.runFromStep')}</Item></>}
      {onDeleteNode && <><div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} /><Item s={{ color: '#f87171' }} d={() => { onDeleteNode(); onClose() }}><Trash2 size={11} style={{ opacity: .5 }} />{t('canvas.deleteStep')}</Item></>}
    </div>
  )
}
