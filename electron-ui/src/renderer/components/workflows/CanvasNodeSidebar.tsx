import React, { useCallback, useRef } from 'react'
import { Check, Copy, AlertCircle, Pencil, RefreshCw, X } from 'lucide-react'
import { WorkflowStep, StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { getPresetStepText } from './workflowConstants'
import type { StepStatus } from './useWorkflowExecution'
import { useChatStore } from '../../store'

interface CanvasNodeSidebarProps {
  step: WorkflowStep
  stepIndex: number
  presetKey?: string
  status: StepStatus
  outputText?: string
  durationMs?: number
  historyOutput?: string
  onClose: () => void
  // Direction A: retry failed step
  onRetryStep?: (stepId: string) => void
  // Direction B: prompt inline edit
  onPromptChange?: (stepId: string, newPrompt: string) => void
}

// Node type color-coded pill config
const NODE_TYPE_PILLS: Record<string, { bg: string; color: string; label: string }> = {
  action:    { bg: 'rgba(99,102,241,0.15)',  color: '#818cf8', label: 'Action' },
  condition: { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', label: 'Condition' },
  loop:      { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa', label: 'Loop' },
  tool:      { bg: 'rgba(34,211,238,0.12)',  color: '#22d3ee', label: 'Tool' },
}

function NodeTypePill({ type }: { type?: string }) {
  const cfg = NODE_TYPE_PILLS[type ?? ''] ?? NODE_TYPE_PILLS['action']
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color,
      borderRadius: 20, padding: '2px 7px',
      border: `1px solid ${cfg.color}33`,
      lineHeight: 1,
      flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  const t = useT()

  const handleCopy = () => {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      title={label}
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        padding: '2px 6px',
        cursor: 'pointer',
        color: copied ? '#22c55e' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => { if (!copied) e.currentTarget.style.color = 'var(--text-secondary)' }}
      onMouseLeave={e => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} />}
      {copied ? t('workflow.canvasCopied') : t('workflow.canvasCopy')}
    </button>
  )
}

// Micro section label
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700,
      color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      marginBottom: 6,
      borderLeft: '2px solid rgba(99,102,241,0.5)',
      paddingLeft: 6,
      lineHeight: 1.2,
    }}>
      {children}
    </div>
  )
}

export default function CanvasNodeSidebar({ step, stepIndex, presetKey, status, outputText, durationMs, historyOutput, onClose, onRetryStep, onPromptChange }: CanvasNodeSidebarProps) {
  const t = useT()
  const displayTitle = getPresetStepText(presetKey, stepIndex, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, stepIndex, 'prompt', t, step.prompt)

  // Direction B: prompt edit state
  const [isEditingPrompt, setIsEditingPrompt] = React.useState(false)
  const [editPromptValue, setEditPromptValue] = React.useState('')
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)

  const startEditPrompt = useCallback(() => {
    setEditPromptValue(step.prompt)
    setIsEditingPrompt(true)
    setTimeout(() => {
      promptTextareaRef.current?.focus()
      promptTextareaRef.current?.select()
    }, 0)
  }, [step.prompt])

  const commitPromptEdit = useCallback(() => {
    const trimmed = editPromptValue.trim()
    if (trimmed && trimmed !== step.prompt) {
      onPromptChange?.(step.id, trimmed)
    }
    setIsEditingPrompt(false)
  }, [editPromptValue, step.id, step.prompt, onPromptChange])

  const cancelPromptEdit = useCallback(() => {
    setIsEditingPrompt(false)
  }, [])

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commitPromptEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelPromptEdit() }
  }, [commitPromptEdit, cancelPromptEdit])

  // Esc key closes sidebar (but not when editing prompt)
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditingPrompt) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, isEditingPrompt])

  const statusColor = status === 'completed' ? '#22c55e'
    : status === 'running' ? '#818cf8'
    : status === 'error' ? '#f87171'
    : 'var(--text-muted)'

  // Output stats (only when outputText is present)
  const activeOutput = historyOutput ?? outputText
  const wordCount = activeOutput ? activeOutput.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = activeOutput ? activeOutput.length : 0
  const lineCount = activeOutput ? activeOutput.split('\n').length : 0

  // Duration formatting helper
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  // Derive streaming text from last streaming message in the chat store
  const streamingText = useChatStore(s => {
    if (status !== 'running') return ''
    const msgs = s.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'assistant' && (m as StandardChatMessage).isStreaming) {
        return (m as StandardChatMessage).content || ''
      }
    }
    return ''
  })

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 284,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        animation: 'canvas-sidebar-in 0.15s ease-out',
        boxShadow: '-6px 0 24px rgba(0,0,0,0.22)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {/* Step number badge */}
          <div style={{
            flexShrink: 0,
            background: 'rgba(99,102,241,0.2)',
            color: '#818cf8',
            borderRadius: 5,
            padding: '1px 6px',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {stepIndex + 1}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayTitle}
          </span>
          {/* Node type pill */}
          <NodeTypePill type={(step as any).nodeType} />
        </div>
        {/* Glass close button */}
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          title="Close (Esc)"
          style={{
            flexShrink: 0,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 4,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            lineHeight: 1,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
        {/* Input section */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <SectionLabel>{t('workflow.canvasInput')}</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Direction B: edit prompt button */}
              {onPromptChange && !presetKey && (
                <button
                  onClick={isEditingPrompt ? commitPromptEdit : startEditPrompt}
                  title={isEditingPrompt ? t('workflow.canvasSavePrompt') : t('workflow.canvasEditPrompt')}
                  style={{
                    background: isEditingPrompt
                      ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                      : 'var(--bg-hover)',
                    border: isEditingPrompt ? 'none' : '1px solid var(--border)',
                    borderRadius: 7,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    color: isEditingPrompt ? 'var(--text-primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 9,
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!isEditingPrompt) { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                  onMouseLeave={e => { if (!isEditingPrompt) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
                >
                  <Pencil size={10} />
                  {isEditingPrompt ? t('workflow.canvasSave') : t('workflow.canvasEdit')}
                </button>
              )}
              <CopyButton text={displayPrompt} label={t('workflow.canvasCopyPrompt')} />
            </div>
          </div>

          {/* Direction B: textarea when editing, read-only div otherwise */}
          {isEditingPrompt ? (
            <div>
              <textarea
                ref={promptTextareaRef}
                value={editPromptValue}
                onChange={e => setEditPromptValue(e.target.value)}
                onKeyDown={handlePromptKeyDown}
                onBlur={commitPromptEdit}
                onMouseDown={e => e.stopPropagation()}
                rows={4}
                style={{
                  width: '100%',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                  padding: '7px 9px',
                  background: 'var(--bg-hover)',
                  borderRadius: 7,
                  border: '1px solid rgba(99,102,241,0.40)',
                  boxShadow: '0 0 0 2px rgba(99,102,241,0.50)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s ease',
                }}
              />
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
                {t('workflow.canvasEditHint')}
              </div>
              {/* Save / cancel row */}
              <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                <button
                  onClick={commitPromptEdit}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    borderRadius: 7,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                    color: 'var(--text-primary)',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  {t('workflow.canvasSave')}
                </button>
                <button
                  onClick={cancelPromptEdit}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  {t('common.cancel') || 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              fontSize: 12,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              padding: '7px 9px',
              background: 'var(--bg-hover)',
              borderRadius: 7,
              border: '1px solid var(--border)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              transition: 'all 0.15s ease',
            }}>
              {displayPrompt}
            </div>
          )}
        </div>

        {/* Output section */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <SectionLabel>{t('workflow.canvasOutput')}</SectionLabel>
              {historyOutput && (
                <span style={{
                  fontSize: 8, fontWeight: 700,
                  color: '#818cf8',
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 4,
                  padding: '0px 4px',
                  letterSpacing: 0.3,
                }}>
                  {t('workflow.canvasHistory')}
                </span>
              )}
            </div>
            {(historyOutput || outputText) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CopyButton
                  text={`## Step ${stepIndex + 1}: ${displayTitle}\n\n${historyOutput ?? outputText ?? ''}`}
                  label="Copy as Markdown"
                />
                <CopyButton text={historyOutput ?? outputText ?? ''} label={t('workflow.canvasCopyOutput')} />
              </div>
            )}
          </div>
          <div style={{
            fontSize: 12,
            color: (historyOutput || outputText) ? 'var(--text-primary)' : (status === 'running' ? 'var(--text-muted)' : status === 'error' ? '#f87171' : 'var(--text-primary)'),
            lineHeight: 1.5,
            padding: '7px 9px',
            background: historyOutput
              ? 'rgba(99,102,241,0.04)'
              : status === 'error'
                ? 'rgba(239,68,68,0.06)'
                : 'var(--bg-hover)',
            borderRadius: 7,
            border: historyOutput
              ? '1px solid rgba(99,102,241,0.20)'
              : status === 'error'
                ? '1px solid rgba(239,68,68,0.25)'
                : outputText ? `1px solid ${status === 'completed' ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` : '1px solid var(--border)',
            fontFamily: 'monospace',
            fontStyle: (historyOutput || outputText || streamingText) ? 'normal' : (status === 'running' ? 'italic' : 'normal'),
            whiteSpace: (historyOutput || outputText || streamingText) ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            maxHeight: 340,
            overflowY: (historyOutput || outputText || streamingText) ? 'auto' : 'hidden',
          }}>
            {activeOutput && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                {[
                  { label: `${wordCount}w` },
                  { label: `${charCount}c` },
                  { label: `${lineCount}L` },
                ].map(({ label }) => (
                  <span key={label} style={{
                    fontSize: 9, color: 'var(--text-muted)',
                    background: 'var(--bg-hover)',
                    borderRadius: 8, padding: '1px 6px',
                    fontFamily: 'monospace', letterSpacing: '0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {label}
                  </span>
                ))}
              </div>
            )}
            {historyOutput
              ? historyOutput
              : outputText
              ? outputText
              : status === 'running' && streamingText
              ? <>{streamingText}<span style={{ display: 'inline-block', animation: 'canvas-blink 1s step-end infinite', opacity: 1, color: '#818cf8' }}>▋</span></>
              : status === 'running' ? t('workflow.canvasRunning')
              : status === 'pending' ? t('workflow.canvasPending')
              : status === 'completed' ? t('workflow.canvasStepDone')
              : status === 'error' ? t('workflow.canvasError')
              : t('workflow.canvasNotStarted')}
          </div>

          {/* Direction A: retry button for error state */}
          {status === 'error' && onRetryStep && (
            <button
              onClick={() => onRetryStep(step.id)}
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171',
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: 600,
                width: '100%',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)' }}
            >
              <RefreshCw size={11} />
              {t('workflow.canvasRetryStep')}
            </button>
          )}
        </div>
      </div>

      {/* Status footer */}
      <div style={{
        padding: '6px 10px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        fontSize: 9,
        color: statusColor,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-hover)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {status === 'completed' && <Check size={10} strokeWidth={3} />}
          {status === 'error' && <AlertCircle size={10} strokeWidth={2.5} />}
          <span>
            {status === 'completed' && t('workflow.canvasStepDone')}
            {status === 'running' && t('workflow.canvasRunning')}
            {status === 'pending' && t('workflow.canvasPending')}
            {status === 'idle' && t('workflow.canvasNotStarted')}
            {status === 'error' && <span style={{ color: '#f87171' }}>{t('workflow.canvasError')}</span>}
          </span>
        </div>
        {durationMs !== undefined && status === 'completed' && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(durationMs)}
          </span>
        )}
      </div>
    </div>
  )
}
