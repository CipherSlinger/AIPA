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

  // Close on Escape
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
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isEditMode, exitEditMode, navigateBack, showUnsavedDialog, handleDialogStay])

  // Save with Ctrl+S (only in edit mode)
  useEffect(() => {
    if (!isEditMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditMode, editName, editDesc, editIcon, editSteps])

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
      <style>{`@keyframes wdp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <WorkflowDetailHeader
        editIcon={isEditMode ? editIcon : workflow.icon}
        editDesc={isEditMode ? editDesc : (workflow.description || '')}
        hasUnsavedChanges={hasUnsavedChanges}
        justSaved={justSaved}
        canSave={!!canSave}
        execution={execution}
        isEditMode={isEditMode}
        saveFlash={saveFlash}
        onGoBack={goBack}
        onOpenEditor={openEditor}
        onEnterEditMode={enterEditMode}
        onExitEditMode={exitEditMode}
        onSave={handleSave}
        onUpdateIcon={updateIcon}
        onUpdateDesc={updateDesc}
        t={t}
      />

      {/* Canvas fills the full content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
              {t('workflow.loadingCanvas')}
            </div>
          }>
            <WorkflowCanvas
              workflow={workflow}
              onRetryStep={handleRetryStep}
              onRerun={handleRerun}
              onStepUpdate={handleStepUpdate}
              onStepReorder={handleStepReorder}
            />
          </Suspense>
        </div>
      </div>

      {/* Unsaved changes modal dialog */}
      {showUnsavedDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={handleDialogStay}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--popup-bg, #252526)',
              border: '1px solid var(--popup-border, #3a3a3a)',
              borderRadius: 12,
              padding: '20px 24px',
              width: 380,
              maxWidth: '90vw',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              animation: 'popup-in 0.15s ease',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              {t('workflow.unsavedDialogTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              {t('workflow.unsavedDialogDesc')}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleDialogStay}
                style={{
                  padding: '7px 16px', fontSize: 12,
                  background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                  borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {t('workflow.unsavedStay')}
              </button>
              <button
                onClick={handleDialogDiscard}
                style={{
                  padding: '7px 16px', fontSize: 12,
                  background: 'var(--card-bg)', border: '1px solid #ef4444',
                  borderRadius: 6, color: '#ef4444', cursor: 'pointer',
                }}
              >
                {t('workflow.unsavedDiscard')}
              </button>
              <button
                onClick={handleDialogSaveAndLeave}
                style={{
                  padding: '7px 16px', fontSize: 12,
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 500,
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
