import React from 'react'
import { X } from 'lucide-react'
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

export default function CanvasNodeSidebar({ step, stepIndex, presetKey, status, outputText, durationMs, onClose }: CanvasNodeSidebarProps) {
  const t = useT()
  const displayTitle = getPresetStepText(presetKey, stepIndex, 'title', t, step.title)
  const displayPrompt = getPresetStepText(presetKey, stepIndex, 'prompt', t, step.prompt)

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
        animation: 'canvas-sidebar-in 0.2s ease-out',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
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
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
          {displayTitle}
        </span>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: 2,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {/* Input section */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 4,
          }}>
            {t('workflow.canvasInput')}
          </div>
          <div style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
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
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 4,
          }}>
            {t('workflow.canvasOutput')}
          </div>
          <div style={{
            fontSize: 10,
            color: outputText ? 'var(--text-secondary)' : (status === 'running' ? 'var(--text-muted)' : 'var(--text-secondary)'),
            lineHeight: 1.5,
            padding: '6px 8px',
            background: 'var(--input-field-bg)',
            borderRadius: 4,
            border: '1px solid var(--border)',
            fontStyle: outputText ? 'normal' : (status === 'running' ? 'italic' : 'normal'),
            whiteSpace: outputText ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            maxHeight: 300,
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

      {/* Status indicator */}
      <div style={{
        padding: '6px 10px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        fontSize: 9,
        color: status === 'completed' ? '#22c55e' : status === 'running' ? 'var(--accent)' : 'var(--text-muted)',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>
          {status === 'completed' && t('workflow.canvasStepDone')}
          {status === 'running' && t('workflow.canvasRunning')}
          {status === 'pending' && t('workflow.canvasPending')}
          {status === 'idle' && t('workflow.canvasNotStarted')}
        </span>
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
