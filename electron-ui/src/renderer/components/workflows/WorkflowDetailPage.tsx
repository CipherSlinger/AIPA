// WorkflowDetailPage -- main panel view for a workflow (Iteration 478, decomposed 511, refactored 513)
// Shows workflow header, step list with live status + search, and canvas visualization.
// Iteration 513: Separate view/edit modes, unsaved changes modal dialog.

import React, { useMemo, useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { Check, Loader, Search, X as XIcon, Trash2, ArrowLeft } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { WorkflowStep, Workflow } from '../../types/app.types'
import { useWorkflowExecution } from './useWorkflowExecution'
import type { StepStatus } from './useWorkflowExecution'
import WorkflowDetailHeader from './WorkflowDetailHeader'

const WorkflowCanvas = lazy(() => import('./WorkflowCanvas'))

// Stable empty array — prevents new reference when workflows pref is absent
const EMPTY_WORKFLOWS: Workflow[] = []

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

const stepIconStyle = (bg: string, anim?: string): React.CSSProperties => ({
  width: 16, height: 16, borderRadius: '50%', background: bg, color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  ...(anim ? { animation: anim } : {}),
})

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === 'completed') return <div style={stepIconStyle('#22c55e')}><Check size={10} strokeWidth={3} /></div>
  if (status === 'running') return <div style={stepIconStyle('var(--accent)', 'wdp-spin 1s linear infinite')}><Loader size={10} strokeWidth={2.5} /></div>
  return null
}

export default function WorkflowDetailPage() {
  const t = useT()
  const workflowId = useUiStore(s => s.editingWorkflowId)
  const addToast = useUiStore(s => s.addToast)
  const workflows = usePrefsStore(s => s.prefs.workflows ?? EMPTY_WORKFLOWS)
  const workflow = useMemo(() => workflows.find(w => w.id === workflowId) || null, [workflows, workflowId])
  const execution = useWorkflowExecution(workflow)
  const [searchQuery, setSearchQuery] = useState('')

  // View/Edit mode: default is 'view' (read-only)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('\u{1F4CB}')
  const [editSteps, setEditSteps] = useState<{id: string; title: string; prompt: string}[]>([])
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
    setEditSteps(workflow.steps.map(s => ({ id: s.id, title: s.title, prompt: s.prompt })))
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
    window.dispatchEvent(new CustomEvent('aipa:runWorkflow', { detail: { workflowId: workflow.id } }))
    addToast('info', t('workflow.running', { name: displayName, count: String(workflow.steps.length) }))
  }

  const handleSave = () => {
    if (!workflow) return
    const name = editName.trim()
    if (!name) { addToast('error', t('workflow.nameRequired')); return }
    const validSteps: WorkflowStep[] = editSteps
      .filter(s => s.prompt.trim())
      .map((s, idx) => ({ id: s.id, title: s.title.trim() || `Step ${idx + 1}`, prompt: s.prompt.trim() }))
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

  const updateStep = (idx: number, field: 'title' | 'prompt', value: string) => {
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
        onRunWorkflow={runWorkflow}
        onSave={handleSave}
        onUpdateIcon={updateIcon}
        onUpdateDesc={updateDesc}
        t={t}
      />

      {/* Content: Steps list + Canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Steps panel */}
        <div style={{
          width: 340, flexShrink: 0, borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '12px 16px',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Steps header + search */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {t('workflow.steps')} ({workflow.steps.length}){matchingStepIds ? ` -- ${matchingStepIds.size} match` : ''}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Filter steps..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '5px 28px 5px 26px', fontSize: 11,
                  background: 'var(--input-field-bg)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text)', outline: 'none',
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

          {/* Step list: view mode = read-only, edit mode = editable fields */}
          <div style={{ flex: 1 }}>
            {isEditMode ? (
              // --- EDIT MODE: Editable step cards ---
              <>
                {editSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                      borderRadius: 8, padding: 12, marginBottom: 8, transition: 'border-color 0.15s',
                    }}
                  >
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
                          padding: '4px 8px', outline: 'none', transition: 'border-color 0.15s',
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
                        lineHeight: 1.5, boxSizing: 'border-box', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                  </div>
                ))}
              </>
            ) : (
              // --- VIEW MODE: Read-only step list with execution status ---
              workflow.steps.map((step, idx) => {
                const status: StepStatus = execution.stepStatuses[step.id] ?? 'idle'
                const isFiltered = matchingStepIds !== null && !matchingStepIds.has(step.id)
                return (
                  <div
                    key={step.id}
                    style={{
                      display: 'flex', gap: 10, padding: '10px 12px', marginBottom: 8,
                      background: STEP_STATUS_BG[status],
                      border: `1px solid ${STEP_STATUS_BORDER[status]}`,
                      borderLeft: status === 'completed' ? '3px solid #22c55e'
                        : status === 'running' ? '3px solid var(--accent)' : '1px solid var(--card-border)',
                      borderRadius: 8,
                      transition: 'border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease',
                      opacity: isFiltered ? 0.3 : 1,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: status === 'completed' ? '#22c55e' : 'var(--accent)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
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
              })
            )}
          </div>

          {/* Footer metadata */}
          <div style={{
            padding: '8px 16px', borderTop: '1px solid var(--border)',
            fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 12, flexShrink: 0,
          }}>
            {workflow.runCount > 0 && (
              <span>{t('workflow.runCount', { count: String(workflow.runCount) })}</span>
            )}
            {isEditMode && (
              <span style={{ color: hasUnsavedChanges ? 'var(--warning)' : 'var(--text-muted)' }}>
                {hasUnsavedChanges ? t('workflow.unsavedChanges') : t('workflow.editModeLabel')}
              </span>
            )}
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

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
  padding: 4, borderRadius: 4,
}
