// WorkflowDetailPage -- main panel view for a workflow (Iteration 478, decomposed 511, refactored 513)
// Shows workflow header, step list with live status + search, and canvas visualization.
// Iteration 513: Separate view/edit modes, unsaved changes modal dialog.

import React, { useMemo, useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import { usePrefsStore, useUiStore, useChatStore } from '../../store'
import { useT } from '../../i18n'
import type { WorkflowStep, Workflow } from '../../types/app.types'
import { useWorkflowExecution } from './useWorkflowExecution'
import WorkflowDetailHeader from './WorkflowDetailHeader'
import { getPresetStepText } from './workflowConstants'

const WorkflowCanvas = lazy(() => import('./WorkflowCanvas'))

// Stable empty array — prevents new reference when workflows pref is absent
const EMPTY_WORKFLOWS: Workflow[] = []

export default function WorkflowDetailPage() {
  const t = useT()
  const workflowId = useUiStore(s => s.editingWorkflowId)
  const addToast = useUiStore(s => s.addToast)
  const workflows = usePrefsStore(s => s.prefs.workflows ?? EMPTY_WORKFLOWS)
  const workflow = useMemo(() => workflows.find(w => w.id === workflowId) || null, [workflows, workflowId])
  const execution = useWorkflowExecution(workflow)

  // View/Edit mode: default is 'view' (read-only)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('\u{1F4CB}')
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)

  // Unsaved changes dialog state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const pendingActionRef = useRef<'back' | 'escape' | null>(null)

  // Display name: use translated preset name if available, else workflow name
  const displayName = workflow
    ? (workflow.presetKey ? t(`workflow.preset.${workflow.presetKey}`) : workflow.name)
    : ''

  // Open the workflow editor page
  const openEditor = useCallback(() => {
    if (!workflow) return
    useUiStore.getState().openWorkflowEditor(workflow.id)
  }, [workflow])

  // Initialize editable state from workflow
  useEffect(() => {
    if (workflow) {
      setEditName(workflow.presetKey ? t(`workflow.preset.${workflow.presetKey}`) : workflow.name)
      setEditDesc(workflow.description || '')
      setEditIcon(workflow.icon)
      setEditSteps(workflow.steps.map(s => ({ ...s })))
      setHasUnsavedChanges(false)
      setIsEditMode(false) // Reset to view mode when switching workflows
    }
  }, [workflow?.id]) // Only re-init when workflow ID changes

  // Toggle into edit mode
  const enterEditMode = useCallback(() => {
    if (!workflow) return
    // Re-initialize edit state from current workflow data
    setEditName(workflow.presetKey ? t(`workflow.preset.${workflow.presetKey}`) : workflow.name)
    setEditDesc(workflow.description || '')
    setEditIcon(workflow.icon)
    setEditSteps(workflow.steps.map(s => ({ ...s })))
    setHasUnsavedChanges(false)
    setIsEditMode(true)
  }, [workflow, t])

  // Exit edit mode (with unsaved changes protection)
  const exitEditMode = useCallback(() => {
    if (hasUnsavedChanges) {
      pendingActionRef.current = 'escape'
      setShowUnsavedDialog(true)
    } else {
      setIsEditMode(false)
    }
  }, [hasUnsavedChanges])

  const navigateBack = useCallback(() => {
    useUiStore.getState().setMainView('chat')
  }, [])

  const goBack = useCallback(() => {
    if (isEditMode && hasUnsavedChanges) {
      pendingActionRef.current = 'back'
      setShowUnsavedDialog(true)
    } else if (isEditMode) {
      setIsEditMode(false) // Exit edit mode first, then back again to chat
    } else {
      navigateBack()
    }
  }, [isEditMode, hasUnsavedChanges, navigateBack])

  // Dialog actions
  const handleDialogSaveAndLeave = useCallback(() => {
    handleSave()
    setShowUnsavedDialog(false)
    if (pendingActionRef.current === 'back') {
      navigateBack()
    } else {
      setIsEditMode(false)
    }
    pendingActionRef.current = null
  }, []) // handleSave is stable because it reads from state directly

  const handleDialogDiscard = useCallback(() => {
    setHasUnsavedChanges(false)
    setShowUnsavedDialog(false)
    if (pendingActionRef.current === 'back') {
      navigateBack()
    } else {
      setIsEditMode(false)
    }
    pendingActionRef.current = null
  }, [navigateBack])

  const handleDialogStay = useCallback(() => {
    setShowUnsavedDialog(false)
    pendingActionRef.current = null
  }, [])

  // Keyboard shortcuts: Escape, and E to toggle edit mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (showUnsavedDialog) {
          handleDialogStay()
        } else if (isEditMode) {
          exitEditMode()
        } else {
          navigateBack()
        }
      } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !isEditMode) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        setIsEditMode(true)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isEditMode, exitEditMode, navigateBack, showUnsavedDialog, handleDialogStay])

  // Save with Ctrl+S / Cmd+S (only in edit mode with unsaved changes)
  useEffect(() => {
    if (!isEditMode) return
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey) && !e.shiftKey && hasUnsavedChanges) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditMode, hasUnsavedChanges, editName, editDesc, editIcon, editSteps])

  const markDirty = () => { setHasUnsavedChanges(true); setJustSaved(false) }

  const runWorkflow = () => {
    if (!workflow) return
    let queuedCount = 0
    workflow.steps.forEach((step, idx) => {
      const prompt = getPresetStepText(workflow.presetKey, idx, 'prompt', t, step.prompt)
      if (prompt.trim()) {
        useChatStore.getState().addToQueue(prompt, { workflowId: workflow.id, stepIndex: idx })
        queuedCount++
      }
    })
    if (queuedCount === 0) return
    addToast('info', t('workflow.running', { name: displayName, count: String(queuedCount) }))
  }

  // Direction A: retry a single failed step by re-queuing its prompt
  const handleRetryStep = useCallback((stepId: string) => {
    if (!workflow) return
    const stepIdx = workflow.steps.findIndex(s => s.id === stepId)
    if (stepIdx < 0) return
    const step = workflow.steps[stepIdx]
    const prompt = getPresetStepText(workflow.presetKey, stepIdx, 'prompt', t, step.prompt)
    useChatStore.getState().addToQueue(prompt, { workflowId: workflow.id, stepIndex: stepIdx })
    addToast('info', t('workflow.retryStep', { title: step.title || t('workflow.stepLabel', { n: stepIdx + 1 }) }))
  }, [workflow, t, addToast])

  // Direction A: rerun the entire workflow
  const handleRerun = useCallback(() => {
    if (!workflow) return
    runWorkflow()
  }, [workflow, runWorkflow])

  // D6: reorder steps by moving stepId to newIndex
  const handleStepReorder = useCallback((stepId: string, newIndex: number) => {
    if (!workflow) return
    const prefs = usePrefsStore.getState()
    const currentWorkflows = prefs.prefs.workflows || []
    const updated = currentWorkflows.map(w => {
      if (w.id !== workflow.id) return w
      const steps = [...w.steps]
      const fromIdx = steps.findIndex(s => s.id === stepId)
      if (fromIdx < 0 || newIndex < 0 || newIndex >= steps.length) return w
      const [moved] = steps.splice(fromIdx, 1)
      steps.splice(newIndex, 0, moved)
      return { ...w, steps, updatedAt: Date.now() }
    })
    prefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
  }, [workflow])

  // Direction 4: insert a new blank step between two existing steps
  const handleInsertBetween = useCallback((afterStepId: string, beforeStepId: string) => {
    if (!workflow) return
    const currentPrefs = usePrefsStore.getState()
    const currentWorkflows = currentPrefs.prefs.workflows || []
    const targetWorkflow = currentWorkflows.find(w => w.id === workflow.id)
    if (!targetWorkflow) return
    const afterIdx = targetWorkflow.steps.findIndex(s => s.id === afterStepId)
    if (afterIdx < 0) return
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: '',
      prompt: '',
    }
    const newSteps = [...targetWorkflow.steps]
    newSteps.splice(afterIdx + 1, 0, newStep)
    const updated = currentWorkflows.map(w =>
      w.id === workflow.id ? { ...w, steps: newSteps, updatedAt: Date.now() } : w
    )
    currentPrefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
  }, [workflow])

  // Direction B: update a step's title or prompt directly (without entering edit mode)
  const handleStepUpdate = useCallback((stepId: string, changes: { title?: string; prompt?: string }) => {
    if (!workflow) return
    const currentPrefs = usePrefsStore.getState()
    const currentWorkflows = currentPrefs.prefs.workflows || []
    const updated = currentWorkflows.map(w => {
      if (w.id !== workflow.id) return w
      return {
        ...w,
        steps: w.steps.map(s => {
          if (s.id !== stepId) return s
          return { ...s, ...(changes.title !== undefined ? { title: changes.title } : {}), ...(changes.prompt !== undefined ? { prompt: changes.prompt } : {}) }
        }),
        updatedAt: Date.now(),
      }
    })
    currentPrefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
    addToast('success', t('workflow.updated'))
  }, [workflow, addToast, t])

  // Inline workflow update (name rename from canvas header)
  const handleWorkflowUpdate = useCallback((updated: Workflow) => {
    const currentPrefs = usePrefsStore.getState()
    const currentWorkflows = currentPrefs.prefs.workflows || []
    const newWorkflows = currentWorkflows.map(w => w.id === updated.id ? updated : w)
    currentPrefs.setPrefs({ workflows: newWorkflows })
    window.electronAPI.prefsSet('workflows', newWorkflows)
    addToast('success', t('workflow.updated'))
  }, [addToast, t])

  // Delete this workflow and navigate back
  const handleDeleteWorkflow = useCallback(() => {
    if (!workflow) return
    const prefs = usePrefsStore.getState()
    const currentWorkflows = prefs.prefs.workflows || []
    const updated = currentWorkflows.filter(w => w.id !== workflow.id)
    prefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
    addToast('success', t('workflow.deleted') || 'Workflow deleted')
    navigateBack()
  }, [workflow, addToast, t, navigateBack])

  const handleSave = () => {
    if (!workflow) return
    const name = editName.trim()
    if (!name) { addToast('error', t('workflow.nameRequired')); return }
    const validSteps: WorkflowStep[] = editSteps
      .filter(s => s.prompt.trim() || (s.nodeType === 'parallel' && (s.parallelPrompts ?? []).some(p => p.trim())))
      .map((s, idx) => ({ ...s, title: s.title.trim() || t('workflow.stepLabel', { n: idx + 1 }), prompt: s.prompt.trim() }))
    if (validSteps.length === 0) { addToast('error', t('workflow.stepsRequired')); return }

    const prefs = usePrefsStore.getState()
    const currentWorkflows = prefs.prefs.workflows || []
    const updated = currentWorkflows.map(w =>
      w.id === workflow.id
        ? { ...w, name: workflow.presetKey ? w.name : name, description: editDesc.trim(), icon: editIcon, steps: validSteps, updatedAt: Date.now() }
        : w
    )
    prefs.setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
    setHasUnsavedChanges(false)
    setJustSaved(true)
    // Green flash on header for Ctrl+S save feedback
    setSaveFlash(true)
    addToast('success', t('workflow.updated'))
    setTimeout(() => { setJustSaved(false); setSaveFlash(false) }, 2000)
  }

  const updateStep = (idx: number, field: keyof WorkflowStep, value: string) => {
    setEditSteps(editSteps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
    markDirty()
  }
  const removeStep = (idx: number) => {
    if (editSteps.length <= 1) return
    setEditSteps(editSteps.filter((_, i) => i !== idx))
    markDirty()
  }
  const updateIcon = (emoji: string) => { setEditIcon(emoji); markDirty() }
  const updateDesc = (v: string) => { setEditDesc(v); markDirty() }

  if (!workflow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(8,8,16,1)' }}>
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', background: 'var(--popup-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(8,8,16,1)' }}>
      <style>{`@keyframes wdp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <WorkflowDetailHeader
        editIcon={isEditMode ? editIcon : workflow.icon}
        editName={isEditMode ? editName : displayName}
        editDesc={isEditMode ? editDesc : (workflow.description || '')}
        hasUnsavedChanges={hasUnsavedChanges}
        justSaved={justSaved}
        canSave={!!canSave}
        execution={execution}
        isEditMode={isEditMode}
        saveFlash={saveFlash}
        steps={isEditMode ? editSteps : workflow.steps}
        runCount={workflow.runCount ?? 0}
        lastRunAt={workflow.runCount > 0 ? workflow.updatedAt : undefined}
        onGoBack={goBack}
        onOpenEditor={openEditor}
        onEnterEditMode={enterEditMode}
        onExitEditMode={exitEditMode}
        onSave={handleSave}
        onRun={runWorkflow}
        onStop={() => {
          // Abort the current stream and clear pending queue items
          window.dispatchEvent(new CustomEvent('aipa:abortStream'))
          useChatStore.getState().clearQueue()
        }}
        onDelete={handleDeleteWorkflow}
        onUpdateIcon={updateIcon}
        onUpdateName={(v: string) => { setEditName(v); markDirty() }}
        onUpdateDesc={updateDesc}
        t={t}
      />

      {/* Execution progress bar — only shown when execution has started */}
      {(() => {
        const total = execution.totalSteps
        const completed = execution.completedCount
        const running = execution.isRunning
        const hasFailed = execution.hasError
        const hasStarted = total > 0 && (completed > 0 || running || hasFailed)
        if (!hasStarted) return null
        const progress = total > 0 ? (completed / total) * 100 : 0
        const barColor = hasFailed
          ? '#ef4444'
          : (completed === total && total > 0)
            ? '#22c55e'
            : '#6366f1'
        return (
          <div style={{ padding: '0 8px 4px 8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1,
                height: 3,
                background: 'var(--border)',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: 2,
                  transition: 'width 0.4s ease, background 0.3s ease',
                }} />
              </div>
              <span style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {completed}/{total} steps
              </span>
            </div>
          </div>
        )
      })()}

      {/* Canvas fills the full content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '8px', background: 'rgba(255,255,255,0.005)' }}>
        <div style={{
          flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column',
          background: 'rgba(255,255,255,0.01)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 24, opacity: 0.5 }}>⬡</span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('workflow.loadingCanvas')}</span>
            </div>
          }>
            <WorkflowCanvas
              workflow={workflow}
              onRetryStep={handleRetryStep}
              onRerun={handleRerun}
              onRun={runWorkflow}
              onStepUpdate={handleStepUpdate}
              onStepReorder={handleStepReorder}
              onInsertBetween={handleInsertBetween}
              onWorkflowUpdate={handleWorkflowUpdate}
            />
          </Suspense>
        </div>
      </div>

      {/* Unsaved changes modal dialog */}
      {showUnsavedDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
          onClick={handleDialogStay}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(15,15,25,0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '20px 24px',
              width: 380,
              maxWidth: '90vw',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6),0 4px 16px rgba(0,0,0,0.4)',
              animation: 'slideUp 0.15s ease',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
              {t('workflow.unsavedDialogTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              {t('workflow.unsavedDialogDesc')}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleDialogStay}
                style={{
                  padding: '7px 16px', fontSize: 12,
                  background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--text-secondary)', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              >
                {t('workflow.unsavedStay')}
              </button>
              <button
                onClick={handleDialogDiscard}
                style={{
                  padding: '7px 16px', fontSize: 12,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 7, color: '#fca5a5', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.22)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.40)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'
                }}
              >
                {t('workflow.unsavedDiscard')}
              </button>
              <button
                onClick={handleDialogSaveAndLeave}
                style={{
                  padding: '7px 16px', fontSize: 12,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                  border: 'none',
                  borderRadius: 7, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(99,102,241,0.30)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.filter = 'brightness(0.95)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.filter = ''
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.30)'
                }}
              >
                {t('workflow.unsavedSaveLeave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
