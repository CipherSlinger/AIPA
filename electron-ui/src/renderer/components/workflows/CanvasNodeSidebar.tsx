import React from 'react'
import { X } from 'lucide-react'
import { WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import type { StepStatus } from './useWorkflowExecution'

interface CanvasNodeSidebarProps {
  step: WorkflowStep
  status: StepStatus
  onClose: () => void
}

export default function CanvasNodeSidebar({ step, status, onClose }: CanvasNodeSidebarProps) {
  const t = useT()

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
          {step.title}
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
            {step.prompt}
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
            color: status === 'running' ? 'var(--text-muted)' : 'var(--text-secondary)',
            lineHeight: 1.5,
            padding: '6px 8px',
            background: 'var(--input-field-bg)',
            borderRadius: 4,
            border: '1px solid var(--border)',
            fontStyle: status === 'running' ? 'italic' : 'normal',
          }}>
            {status === 'running' && t('workflow.canvasRunning')}
            {status === 'pending' && t('workflow.canvasPending')}
            {status === 'completed' && t('workflow.canvasStepDone')}
            {status === 'idle' && t('workflow.canvasNotStarted')}
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
      }}>
        {status === 'completed' && t('workflow.canvasStepDone')}
        {status === 'running' && t('workflow.canvasRunning')}
        {status === 'pending' && t('workflow.canvasPending')}
        {status === 'idle' && t('workflow.canvasNotStarted')}
      </div>
    </div>
  )
}
