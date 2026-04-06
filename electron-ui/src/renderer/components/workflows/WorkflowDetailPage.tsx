// WorkflowDetailPage — main panel view for a workflow (Iteration 473)
// Shows workflow header, step list with live status, and canvas visualization

import React, { useMemo, useEffect, lazy, Suspense } from 'react'
import { ArrowLeft, Play, Edit3, Check, Loader } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { Workflow } from '../../types/app.types'
import { useWorkflowExecution } from './useWorkflowExecution'
import type { StepStatus } from './useWorkflowExecution'

const WorkflowCanvas = lazy(() => import('./WorkflowCanvas'))

const STEP_STATUS_BORDER: Record<StepStatus, string> = {
  idle: 'var(--card-border)',
  pending: 'var(--border)',
  running: 'var(--accent)',
  completed: '#22c55e',
}

const STEP_STATUS_BG: Record<StepStatus, string> = {
  idle: 'var(--card-bg)',
  pending: 'var(--card-bg)',
  running: 'rgba(var(--accent-rgb, 59,130,246), 0.06)',
  completed: 'rgba(34,197,94, 0.06)',
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: '#22c55e', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Check size={10} strokeWidth={3} />
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        animation: 'wdp-spin 1s linear infinite',
      }}>
        <Loader size={10} strokeWidth={2.5} />
      </div>
    )
  }
  return null
}

export default function WorkflowDetailPage() {
  const t = useT()
  const workflowId = useUiStore(s => s.editingWorkflowId)
  const addToast = useUiStore(s => s.addToast)
  const workflows = usePrefsStore(s => s.prefs.workflows || [])
  const workflow = useMemo(() => workflows.find(w => w.id === workflowId) || null, [workflows, workflowId])
  const execution = useWorkflowExecution(workflow)

  const goBack = () => {
    useUiStore.getState().setMainView('chat')
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        goBack()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  const runWorkflow = () => {
    if (!workflow) return
    window.dispatchEvent(new CustomEvent('aipa:runWorkflow', { detail: { workflowId: workflow.id } }))
    addToast('info', t('workflow.running'))
  }

  const openEditor = () => {
    if (workflow) {
      useUiStore.getState().openWorkflowEditor(workflow.id)
    }
  }

  if (!workflow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={18} />
          </button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('workflow.notFound')}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* CSS for spinner */}
      <style>{`
        @keyframes wdp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid var(--border)',
        background: 'var(--chat-header-bg)',
        flexShrink: 0,
      }}>
        <button
          onClick={goBack}
          aria-label={t('workflow.back')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: 22 }}>{workflow.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workflow.presetKey ? t(`workflow.preset.${workflow.presetKey}`) : workflow.name}
          </div>
          {workflow.description && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{workflow.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {/* Execution summary badge */}
          {execution.isRunning && (
            <span style={{
              fontSize: 10, color: 'var(--accent)', fontWeight: 500,
              padding: '2px 8px', borderRadius: 10,
              background: 'rgba(var(--accent-rgb,59,130,246),0.1)',
              border: '1px solid rgba(var(--accent-rgb,59,130,246),0.2)',
            }}>
              {execution.completedCount}/{execution.totalSteps}
            </span>
          )}
          {!execution.isRunning && execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && (
            <span style={{
              fontSize: 10, color: '#22c55e', fontWeight: 500,
              padding: '2px 8px', borderRadius: 10,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              {t('workflow.canvasComplete')}
            </span>
          )}
          <button onClick={openEditor} title={t('workflow.edit')} style={actionBtnStyle}>
            <Edit3 size={14} />
          </button>
          <button onClick={runWorkflow} disabled={execution.isRunning} style={{
            ...actionBtnStyle,
            background: execution.isRunning ? 'var(--border)' : 'var(--accent)',
            color: '#fff',
            opacity: execution.isRunning ? 0.6 : 1,
            cursor: execution.isRunning ? 'not-allowed' : 'pointer',
          }}>
            <Play size={14} fill="#fff" />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{t('workflow.run')}</span>
          </button>
        </div>
      </div>

      {/* Content: Steps + Canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Steps panel */}
        <div style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            {t('workflow.steps')} ({workflow.steps.length})
          </div>
          {workflow.steps.map((step, idx) => {
            const status: StepStatus = execution.stepStatuses[step.id] ?? 'idle'
            return (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '10px 12px',
                  marginBottom: 8,
                  background: STEP_STATUS_BG[status],
                  border: `1px solid ${STEP_STATUS_BORDER[status]}`,
                  borderLeft: status === 'completed'
                    ? '3px solid #22c55e'
                    : status === 'running'
                    ? '3px solid var(--accent)'
                    : '1px solid var(--card-border)',
                  borderRadius: 8,
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                }}
              >
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: status === 'completed' ? '#22c55e' : 'var(--accent)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  opacity: status === 'pending' ? 0.5 : 1,
                  transition: 'background 0.2s ease',
                }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {step.title || `Step ${idx + 1}`}
                    </span>
                    <StepStatusIcon status={status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {step.prompt ? (step.prompt.length > 150 ? step.prompt.slice(0, 150) + '...' : step.prompt) : t('workflow.noPrompt')}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Run count + metadata */}
          <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {workflow.runCount > 0 && (
              <span>{t('workflow.runCount', { count: String(workflow.runCount) })}</span>
            )}
            <span>{t('workflow.stepsLabel')}: {workflow.steps.length}</span>
          </div>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
              {t('workflow.loadingCanvas')}
            </div>
          }>
            <WorkflowCanvas workflow={workflow} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontSize: 12,
  transition: 'all 0.15s',
}
