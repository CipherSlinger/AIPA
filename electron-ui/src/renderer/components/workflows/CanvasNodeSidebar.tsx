import React from 'react'
import { Check, Copy } from 'lucide-react'
import { WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import { getPresetStepText } from './workflowConstants'
import type { StepStatus } from './useWorkflowExecution'

interface CanvasNodeSidebarProps {
  step: WorkflowStep
  stepIndex: number
  presetKey?: string
  status: StepStatus
  outputText?: string
  durationMs?: number
  onClose: () => void
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

export default function CanvasNodeSidebar({ step, stepIndex, presetKey, status, outputText, durationMs, onClose }: CanvasNodeSidebarProps) {
  const t = useT()
  const displayTitle = getPresetStepText(presetKey, stepIndex, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, stepIndex, 'prompt', t, step.prompt)

  // Esc key closes sidebar
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const statusColor = status === 'completed' ? '#22c55e'
    : status === 'running' ? 'var(--accent)'
    : 'var(--text-muted)'

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
            background: status === 'completed' ? '#22c55e' : 'var(--accent)',
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
            <CopyButton text={displayPrompt} label="Copy prompt" />
          </div>
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
        </div>

        {/* Output section */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {t('workflow.canvasOutput')}
            </div>
            {outputText && <CopyButton text={outputText} label="Copy output" />}
          </div>
          <div style={{
            fontSize: 10,
            color: outputText ? 'var(--text-secondary)' : (status === 'running' ? 'var(--text-muted)' : 'var(--text-secondary)'),
            lineHeight: 1.55,
            padding: '6px 8px',
            background: 'var(--input-field-bg)',
            borderRadius: 4,
            border: outputText ? `1px solid ${status === 'completed' ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` : '1px solid var(--border)',
            fontStyle: outputText ? 'normal' : (status === 'running' ? 'italic' : 'normal'),
            whiteSpace: outputText ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            maxHeight: 340,
            overflowY: outputText ? 'auto' : 'hidden',
          }}>
            {outputText
              ? outputText
              : status === 'running' ? t('workflow.canvasRunning')
              : status === 'pending' ? t('workflow.canvasPending')
              : status === 'completed' ? t('workflow.canvasStepDone')
              : t('workflow.canvasNotStarted')}
          </div>
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
          <span>
            {status === 'completed' && t('workflow.canvasStepDone')}
            {status === 'running' && t('workflow.canvasRunning')}
            {status === 'pending' && t('workflow.canvasPending')}
            {status === 'idle' && t('workflow.canvasNotStarted')}
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
