// WorkflowDetailPage — integrated editor + canvas view (Iteration 469)
// Left panel: editable step list with inline editing, add/remove/reorder
// Right panel: live canvas visualization
// Replaces the read-only detail page from Iteration 460

import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react'
import { ArrowLeft, Play, Save, Plus, Trash2, GripVertical, Copy, Check } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { Workflow, WorkflowStep } from '../../types/app.types'

const WorkflowCanvas = lazy(() => import('./WorkflowCanvas'))

const WORKFLOW_EMOJIS = [
  '\u{1F4CB}', '\u{1F4CA}', '\u{1F4DD}', '\u2728', '\u{1F680}',
  '\u{1F9E0}', '\u{1F3AF}', '\u{1F50D}', '\u{1F4A1}', '\u{1F4E7}',
  '\u{1F30D}', '\u2699\uFE0F',
]

interface EditableStep {
  id: string
  title: string
  prompt: string
}

export default function WorkflowDetailPage() {
  const t = useT()
  const workflowId = useUiStore(s => s.editingWorkflowId)
  const addToast = useUiStore(s => s.addToast)
  const workflows = usePrefsStore(s => s.prefs.workflows || [])
  const workflow = useMemo(() => workflows.find(w => w.id === workflowId) || null, [workflows, workflowId])

  // Editable state — initialized from workflow
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('\u{1F4CB}')
  const [editSteps, setEditSteps] = useState<EditableStep[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

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
        ;(window as any).__lastBackPress = 0
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
    addToast('info', t('workflow.running'))
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

        {/* Name (editable) */}
        <input
          value={editName}
          onChange={e => updateName(e.target.value)}
          maxLength={50}
          style={{
            flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
            background: 'transparent', border: '1px solid transparent',
            borderRadius: 4, padding: '2px 8px', outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
        />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={duplicateWorkflow} title={t('workflow.duplicate')} style={actionBtnStyle}>
            <Copy size={14} />
          </button>
          <button onClick={runWorkflow} style={{ ...actionBtnStyle, background: 'var(--accent)', color: '#fff' }}>
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
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Steps header */}
          <div style={{
            padding: '12px 16px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('workflow.steps')} ({editSteps.length}/20)
            </span>
            <button
              onClick={addStep}
              disabled={editSteps.length >= 20}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 4, padding: '3px 8px',
                color: editSteps.length >= 20 ? 'var(--text-muted)' : 'var(--accent)',
                cursor: editSteps.length >= 20 ? 'not-allowed' : 'pointer',
                fontSize: 10, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <Plus size={11} />
              {t('workflow.addStep')}
            </button>
          </div>

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

        {/* Canvas area */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
              {t('workflow.loadingCanvas')}
            </div>
          }>
            <WorkflowCanvas workflow={previewWorkflow} />
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
