// WorkflowDetailPage — main panel view for a workflow (Iteration 478)
// Shows workflow header, step list with live status + search, and canvas visualization

import React, { useMemo, useEffect, useState, lazy, Suspense } from 'react'
import { ArrowLeft, Play, Edit3, Check, Loader, Search, X as XIcon } from 'lucide-react'
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
  const [searchQuery, setSearchQuery] = useState('')

  // Compute matching step IDs for search filter
  const matchingStepIds = useMemo(() => {
    if (!workflow || !searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return new Set(
      workflow.steps
        .filter(s =>
          (s.title || '').toLowerCase().includes(q) ||
          (s.prompt || '').toLowerCase().includes(q)
        )
        .map(s => s.id)
    )
  }, [workflow, searchQuery])

  // Initialize editable state from workflow
  useEffect(() => {
    if (workflow) {
      setEditName(workflow.presetKey ? t(`workflow.preset.${workflow.presetKey}`) : workflow.name)
      setEditDesc(workflow.description || '')
      setEditIcon(workflow.icon)
      setEditSteps(workflow.steps.map(s => ({ id: s.id, title: s.title, prompt: s.prompt })))
      setHasUnsavedChanges(false)
    }
  }, [workflow?.id]) // Only re-init when workflow ID changes

  // Build a "preview" workflow object for the canvas (reflects edits in real-time)
  const previewWorkflow = useMemo((): Workflow | null => {
    if (!workflow) return null
    return {
      ...workflow,
      name: editName,
      description: editDesc,
      icon: editIcon,
      steps: editSteps.map(s => ({ id: s.id, title: s.title || 'Untitled', prompt: s.prompt })),
    }
  }, [workflow, editName, editDesc, editIcon, editSteps])

  const goBack = useCallback(() => {
    if (hasUnsavedChanges) {
      // Show confirmation via double-click pattern
      const now = Date.now()
      if ((window as any).__lastBackPress && now - (window as any).__lastBackPress < 1500) {
        useUiStore.getState().setMainView('chat')
          ; (window as any).__lastBackPress = 0
      } else {
        (window as any).__lastBackPress = now
        addToast('warning', t('workflow.unsavedWarning'), 1500)
      }
    } else {
      useUiStore.getState().setMainView('chat')
    }
  }, [hasUnsavedChanges, addToast, t])

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
  }, [goBack])

  // Save with Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editName, editDesc, editIcon, editSteps])

  const markDirty = () => {
    setHasUnsavedChanges(true)
    setJustSaved(false)
  }

  const runWorkflow = () => {
    if (!workflow) return
    window.dispatchEvent(new CustomEvent('aipa:runWorkflow', { detail: { workflowId: workflow.id } }))
    addToast('info', t('workflow.running', { name: displayName, count: String(workflow.steps.length) }))
  }

  const handleSave = () => {
    if (!workflow) return
    const name = editName.trim()
    if (!name) {
      addToast('error', t('workflow.nameRequired'))
      return
    }
    const validSteps: WorkflowStep[] = editSteps
      .filter(s => s.prompt.trim())
      .map((s, idx) => ({
        id: s.id,
        title: s.title.trim() || `Step ${idx + 1}`,
        prompt: s.prompt.trim(),
      }))

    if (validSteps.length === 0) {
      addToast('error', t('workflow.stepsRequired'))
      return
    }

    const prefs = usePrefsStore.getState()
    const currentWorkflows = prefs.prefs.workflows || []
    const updated = currentWorkflows.map(w =>
      w.id === workflow.id
        ? {
          ...w,
          name: workflow.presetKey ? w.name : name, // Don't overwrite preset name
          description: editDesc.trim(),
          icon: editIcon,
          steps: validSteps,
          updatedAt: Date.now(),
        }
        : w
    )
    prefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
    setHasUnsavedChanges(false)
    setJustSaved(true)
    addToast('success', t('workflow.updated'))
    // Clear "just saved" indicator after 2s
    setTimeout(() => setJustSaved(false), 2000)
  }

  const duplicateWorkflow = () => {
    if (!workflow) return
    const prefs = usePrefsStore.getState()
    const currentWorkflows = prefs.prefs.workflows || []
    if (currentWorkflows.length >= 50) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const newWf: Workflow = {
      ...workflow,
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${workflow.name} (copy)`,
      presetKey: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
    }
    const updated = [...currentWorkflows, newWf]
    prefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
    addToast('success', t('workflow.duplicated'))
    // Open the duplicate
    useUiStore.getState().openWorkflowDetail(newWf.id)
  }

  const addStep = () => {
    if (editSteps.length >= 20) return
    setEditSteps([...editSteps, {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: '',
      prompt: '',
    }])
    markDirty()
  }

  const removeStep = (idx: number) => {
    if (editSteps.length <= 1) return
    setEditSteps(editSteps.filter((_, i) => i !== idx))
    markDirty()
  }

  const updateStep = (idx: number, field: 'title' | 'prompt', value: string) => {
    setEditSteps(editSteps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
    markDirty()
  }

  const updateName = (v: string) => { setEditName(v); markDirty() }
  const updateDesc = (v: string) => { setEditDesc(v); markDirty() }
  const updateIcon = (emoji: string) => { setEditIcon(emoji); setShowIconPicker(false); markDirty() }

  if (!workflow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => useUiStore.getState().setMainView('chat')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={18} />
          </button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('workflow.notFound')}</span>
        </div>
      </div>
    )
  }

  const canSave = editName.trim() && editSteps.some(s => s.prompt.trim())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* CSS for spinner */}
      <style>{`
        @keyframes wdp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        background: 'var(--chat-header-bg)',
        flexShrink: 0,
      }}>
        <button
          onClick={goBack}
          aria-label={t('workflow.back')}
          style={iconBtnStyle}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft size={18} />
        </button>

        {/* Icon (clickable to pick) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowIconPicker(!showIconPicker)}
            style={{
              fontSize: 22, background: 'none', border: '1px solid transparent',
              borderRadius: 6, cursor: 'pointer', padding: '2px 4px',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
            title={t('workflow.changeIcon')}
          >
            {editIcon}
          </button>
          {showIconPicker && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
              borderRadius: 8, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4,
              boxShadow: 'var(--popup-shadow)', zIndex: 20, width: 200,
              animation: 'popup-in 0.12s ease',
            }}>
              {WORKFLOW_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => updateIcon(emoji)}
                  style={{
                    width: 32, height: 32, border: editIcon === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 6, background: editIcon === emoji ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'transparent',
                    cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
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
          <button
            onClick={handleSave}
            disabled={!canSave || !hasUnsavedChanges}
            style={{
              ...actionBtnStyle,
              background: hasUnsavedChanges && canSave ? 'var(--accent)' : justSaved ? '#22c55e' : 'var(--card-bg)',
              color: hasUnsavedChanges && canSave ? '#fff' : justSaved ? '#fff' : 'var(--text-muted)',
              opacity: hasUnsavedChanges && canSave ? 1 : justSaved ? 1 : 0.6,
              cursor: hasUnsavedChanges && canSave ? 'pointer' : 'default',
            }}
            title={hasUnsavedChanges ? `${t('workflow.save')} (Ctrl+S)` : t('workflow.saved')}
          >
            {justSaved ? <Check size={14} /> : <Save size={14} />}
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              {justSaved ? t('workflow.saved') : t('workflow.save')}
            </span>
          </button>
        </div>
      </div>

      {/* Description bar */}
      <div style={{
        padding: '6px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--chat-header-bg)',
        flexShrink: 0,
      }}>
        <input
          value={editDesc}
          onChange={e => updateDesc(e.target.value)}
          placeholder={t('workflow.descPlaceholder')}
          maxLength={200}
          style={{
            width: '100%', fontSize: 11, color: 'var(--text-muted)',
            background: 'transparent', border: 'none', outline: 'none',
            padding: '2px 0',
          }}
        />
      </div>

      {/* Content: Steps editor + Canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Steps editor panel */}
        <div style={{
          width: 340,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Steps header + search */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {t('workflow.steps')} ({workflow.steps.length}){matchingStepIds ? ` — ${matchingStepIds.size} match` : ''}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Filter steps..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '5px 28px 5px 26px',
                  fontSize: 11,
                  background: 'var(--input-field-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                >
                  <XIcon size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Step list */}
          <div style={{ flex: 1 }}>
            {workflow.steps.map((step, idx) => {
              const status: StepStatus = execution.stepStatuses[step.id] ?? 'idle'
              const isFiltered = matchingStepIds !== null && !matchingStepIds.has(step.id)
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
                    transition: 'border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease',
                    opacity: isFiltered ? 0.3 : 1,
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

            {/* Step cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
              {editSteps.map((step, idx) => (
                <div
                  key={step.id}
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    transition: 'border-color 0.15s',
                  }}
                >
                  {/* Step number + title + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>
                    <input
                      value={step.title}
                      onChange={e => updateStep(idx, 'title', e.target.value)}
                      placeholder={t('workflow.stepTitlePlaceholder')}
                      maxLength={50}
                      style={{
                        flex: 1, fontSize: 12, fontWeight: 500,
                        color: 'var(--text-primary)', background: 'var(--input-field-bg)',
                        border: '1px solid var(--border)', borderRadius: 4,
                        padding: '4px 8px', outline: 'none',
                        transition: 'border-color 0.15s',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                    {editSteps.length > 1 && (
                      <button
                        onClick={() => removeStep(idx)}
                        style={iconBtnStyle}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title={t('workflow.removeStep')}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {/* Prompt textarea */}
                  <textarea
                    value={step.prompt}
                    onChange={e => updateStep(idx, 'prompt', e.target.value)}
                    placeholder={t('workflow.stepPromptPlaceholder')}
                    maxLength={2000}
                    rows={3}
                    style={{
                      width: '100%', fontSize: 11, color: 'var(--text-primary)',
                      background: 'var(--input-field-bg)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '6px 8px', outline: 'none',
                      resize: 'vertical', minHeight: 50, fontFamily: 'inherit',
                      lineHeight: 1.5, boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>
              ))}
            </div>

            {/* Footer metadata */}
            <div style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border)',
              fontSize: 10,
              color: 'var(--text-muted)',
              display: 'flex',
              gap: 12,
              flexShrink: 0,
            }}>
              {workflow.runCount > 0 && (
                <span>{t('workflow.runCount', { count: String(workflow.runCount) })}</span>
              )}
              {hasUnsavedChanges && (
                <span style={{ color: 'var(--warning)' }}>{t('workflow.unsavedChanges')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
              {t('workflow.loadingCanvas')}
            </div>
          }>
            <WorkflowCanvas workflow={workflow} highlightStepIds={matchingStepIds} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
  padding: 4, borderRadius: 4,
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
