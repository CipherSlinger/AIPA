import React, { useCallback, useRef } from 'react'
import { Check, Copy, AlertCircle, Pencil, RefreshCw } from 'lucide-react'
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false)

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
        borderRadius: 3,
        padding: '2px 4px',
        cursor: 'pointer',
        color: copied ? '#22c55e' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        transition: 'color 0.2s ease',
      }}
    >
      {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
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
    : status === 'running' ? 'var(--accent)'
    : status === 'error' ? '#ef4444'
    : 'var(--text-muted)'

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
        width: 280,
        background: 'var(--bg-sessionpanel)',
        borderLeft: '1px solid var(--border)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        animation: 'canvas-sidebar-in 0.18s ease-out',
        boxShadow: '-6px 0 20px rgba(0,0,0,0.18)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {/* Step number */}
          <div style={{
            flexShrink: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: status === 'completed' ? '#22c55e' : status === 'error' ? '#ef4444' : 'var(--accent)',
            color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {stepIndex + 1}
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayTitle}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          title="Close (Esc)"
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: 3,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            fontSize: 14,
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          ✕
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
            <div style={{
              fontSize: 9, fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {t('workflow.canvasInput')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Direction B: edit prompt button */}
              {onPromptChange && !presetKey && (
                <button
                  onClick={isEditingPrompt ? commitPromptEdit : startEditPrompt}
                  title={isEditingPrompt ? 'Save (Ctrl+Enter)' : 'Edit prompt'}
                  style={{
                    background: isEditingPrompt ? 'rgba(var(--accent-rgb,59,130,246),0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: 3,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    color: isEditingPrompt ? 'var(--accent)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 9,
                  }}
                >
                  <Pencil size={10} />
                  {isEditingPrompt ? 'Save' : 'Edit'}
                </button>
              )}
              <CopyButton text={displayPrompt} label="Copy prompt" />
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
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.55,
                  padding: '6px 8px',
                  background: 'var(--input-field-bg)',
                  borderRadius: 4,
                  border: '1px solid var(--accent)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
                Ctrl+Enter to save · Esc to cancel
              </div>
            </div>
          ) : (
            <div style={{
              fontSize: 10,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              padding: '6px 8px',
              background: 'var(--input-field-bg)',
              borderRadius: 4,
              border: '1px solid var(--border)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
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
              <div style={{
                fontSize: 9, fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {t('workflow.canvasOutput')}
              </div>
              {historyOutput && (
                <span style={{
                  fontSize: 8, fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'rgba(var(--accent-rgb,59,130,246),0.12)',
                  border: '1px solid rgba(var(--accent-rgb,59,130,246),0.25)',
                  borderRadius: 3,
                  padding: '0px 4px',
                  letterSpacing: 0.3,
                }}>
                  历史
                </span>
              )}
            </div>
            {(historyOutput || outputText) && (
              <CopyButton text={historyOutput ?? outputText ?? ''} label="Copy output" />
            )}
          </div>
          <div style={{
            fontSize: 10,
            color: (historyOutput || outputText) ? 'var(--text-secondary)' : (status === 'running' ? 'var(--text-muted)' : status === 'error' ? '#ef4444' : 'var(--text-secondary)'),
            lineHeight: 1.55,
            padding: '6px 8px',
            background: historyOutput
              ? 'rgba(var(--accent-rgb,59,130,246),0.04)'
              : status === 'error'
                ? 'rgba(239,68,68,0.06)'
                : 'var(--input-field-bg)',
            borderRadius: 4,
            border: historyOutput
              ? '1px solid rgba(var(--accent-rgb,59,130,246),0.2)'
              : status === 'error'
                ? '1px solid rgba(239,68,68,0.25)'
                : outputText ? `1px solid ${status === 'completed' ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` : '1px solid var(--border)',
            fontStyle: (historyOutput || outputText || streamingText) ? 'normal' : (status === 'running' ? 'italic' : 'normal'),
            whiteSpace: (historyOutput || outputText || streamingText) ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            maxHeight: 340,
            overflowY: (historyOutput || outputText || streamingText) ? 'auto' : 'hidden',
          }}>
            {historyOutput
              ? historyOutput
              : outputText
              ? outputText
              : status === 'running' && streamingText
              ? <>{streamingText}<span style={{ display: 'inline-block', animation: 'canvas-blink 1s step-end infinite', opacity: 1, color: 'var(--accent)' }}>▋</span></>
              : status === 'running' ? t('workflow.canvasRunning')
              : status === 'pending' ? t('workflow.canvasPending')
              : status === 'completed' ? t('workflow.canvasStepDone')
              : status === 'error' ? '执行失败'
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
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
                color: '#ef4444',
                borderRadius: 5,
                padding: '4px 10px',
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: 500,
                width: '100%',
                justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
            >
              <RefreshCw size={11} />
              重试此步骤
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
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {status === 'completed' && <Check size={10} strokeWidth={3} />}
          {status === 'error' && <AlertCircle size={10} strokeWidth={2.5} />}
          <span>
            {status === 'completed' && t('workflow.canvasStepDone')}
            {status === 'running' && t('workflow.canvasRunning')}
            {status === 'pending' && t('workflow.canvasPending')}
            {status === 'idle' && t('workflow.canvasNotStarted')}
            {status === 'error' && <span style={{ color: '#ef4444' }}>执行失败</span>}
          </span>
        </div>
        {durationMs !== undefined && status === 'completed' && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            {durationMs < 1000
              ? `${durationMs}ms`
              : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
    </div>
  )
}
