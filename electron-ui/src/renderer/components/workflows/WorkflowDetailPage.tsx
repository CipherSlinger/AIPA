// WorkflowDetailPage — main panel view for a workflow (Iteration 460)
// Shows workflow header, step list, and canvas visualization

import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react'
import { ArrowLeft, Play, Edit3, Trash2, Plus, GripVertical } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { Workflow, WorkflowStep } from '../../types/app.types'

const WorkflowCanvas = lazy(() => import('./WorkflowCanvas'))

export default function WorkflowDetailPage() {
  const t = useT()
  const workflowId = useUiStore(s => s.editingWorkflowId)
  const addToast = useUiStore(s => s.addToast)
  const workflows = usePrefsStore(s => s.prefs.workflows || [])
  const workflow = useMemo(() => workflows.find(w => w.id === workflowId) || null, [workflows, workflowId])

  const [showCanvas, setShowCanvas] = useState(true)

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
    // Dispatch workflow execution via custom event (same as WorkflowItem)
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
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={openEditor} title={t('workflow.edit')} style={actionBtnStyle}>
            <Edit3 size={14} />
          </button>
          <button onClick={runWorkflow} style={{ ...actionBtnStyle, background: 'var(--accent)', color: '#fff' }}>
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
          {workflow.steps.map((step, idx) => (
            <div
              key={step.id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '10px 12px',
                marginBottom: 8,
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: 8,
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {step.title || `Step ${idx + 1}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {step.prompt ? (step.prompt.length > 150 ? step.prompt.slice(0, 150) + '...' : step.prompt) : t('workflow.noPrompt')}
                </div>
              </div>
            </div>
          ))}

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
          {showCanvas && (
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
                {t('workflow.loadingCanvas')}
              </div>
            }>
              <WorkflowCanvas workflow={workflow} />
            </Suspense>
          )}
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
