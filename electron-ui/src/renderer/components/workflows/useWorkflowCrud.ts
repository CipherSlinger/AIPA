import { useState, useMemo, useCallback } from 'react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { Workflow, WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import { MAX_WORKFLOWS, MAX_NAME_LENGTH, MAX_DESC_LENGTH, PRESET_WORKFLOWS, PRESET_TEAMWORK_WORKFLOWS, getPresetStepText } from './workflowConstants'

export function useWorkflowCrud() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToQueue = useChatStore(s => s.addToQueue)
  const addToast = useUiStore(s => s.addToast)

  const workflows: Workflow[] = prefs.workflows || []

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('🔄')
  const [newTeamwork, setNewTeamwork] = useState(false)
  const [newSteps, setNewSteps] = useState<WorkflowStep[]>(() => [
    { id: `step-${Date.now()}`, title: t('workflow.stepLabel', { n: 1 }), prompt: '' },
  ])

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('🔄')
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>([])

  const saveWorkflows = useCallback((updated: Workflow[]) => {
    setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
  }, [setPrefs])

  const runWorkflow = useCallback((wf: Workflow) => {
    if (wf.steps.length === 0) return
    let queuedCount = 0
    wf.steps.forEach((step, idx) => {
      const nodeType = step.nodeType ?? 'prompt'
      if (nodeType === 'parallel' && step.parallelPrompts && step.parallelPrompts.length > 0) {
        // Queue all parallel prompts simultaneously
        step.parallelPrompts.forEach((pp, pi) => {
          if (pp.trim()) {
            addToQueue(pp.trim(), { workflowId: wf.id, stepIndex: idx * 100 + pi })
            queuedCount++
          }
        })
      } else {
        // For condition nodes: queue the main prompt (condition question)
        // Branches are display-only hints in the MVP
        const prompt = getPresetStepText(wf.presetKey, idx, 'prompt', t, step.prompt)
        if (prompt.trim()) {
          addToQueue(prompt, { workflowId: wf.id, stepIndex: idx })
          queuedCount++
        }
      }
    })
    if (queuedCount === 0) return
    saveWorkflows(workflows.map(w =>
      w.id === wf.id ? { ...w, runCount: w.runCount + 1, updatedAt: Date.now() } : w
    ))
    addToast('success', t('workflow.running', { name: wf.presetKey ? t(`workflow.preset.${wf.presetKey}`) : wf.name, count: String(queuedCount) }))
  }, [addToQueue, workflows, saveWorkflows, addToast, t])

  const createWorkflow = useCallback(() => {
    if (!newName.trim() || newSteps.every(s => !s.prompt.trim())) return
    if (workflows.length >= MAX_WORKFLOWS) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const validSteps = newSteps.filter(s => s.prompt.trim())
    const wf: Workflow = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim().slice(0, MAX_NAME_LENGTH),
      description: newDesc.trim().slice(0, MAX_DESC_LENGTH),
      icon: newIcon,
      steps: validSteps,
      teamwork: newTeamwork || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
    }
    saveWorkflows([wf, ...workflows])
    setShowCreateForm(false)
    setNewName('')
    setNewDesc('')
    setNewIcon('🔄')
    setNewTeamwork(false)
    setNewSteps([{ id: `step-${Date.now()}`, title: t('workflow.stepLabel', { n: 1 }), prompt: '' }])
    addToast('success', t('workflow.created'))
  }, [newName, newDesc, newIcon, newSteps, workflows, saveWorkflows, addToast, t])

  const deleteWorkflow = useCallback((id: string) => {
    saveWorkflows(workflows.filter(w => w.id !== id))
    if (expandedId === id) setExpandedId(null)
    // Clean up per-workflow localStorage keys
    localStorage.removeItem(`aipa:canvas-vp:${id}`)
    localStorage.removeItem(`aipa:canvas-collapsed:${id}`)
    localStorage.removeItem(`aipa:canvas-pos:${id}`)
    localStorage.removeItem(`aipa:canvas-dir:${id}`)
    addToast('info', t('workflow.deleted'))
  }, [workflows, saveWorkflows, expandedId, addToast, t])

  const duplicateWorkflow = useCallback((wf: Workflow) => {
    if (workflows.length >= MAX_WORKFLOWS) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const copy: Workflow = {
      ...wf,
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${wf.name} (copy)`.slice(0, MAX_NAME_LENGTH),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      steps: wf.steps.map(s => ({ ...s, id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}` })),
    }
    saveWorkflows([copy, ...workflows])
    addToast('success', t('workflow.duplicated'))
  }, [workflows, saveWorkflows, addToast, t])

  const startEdit = useCallback((wf: Workflow) => {
    setEditingId(wf.id)
    setEditName(wf.name)
    setEditDesc(wf.description)
    setEditIcon(wf.icon)
    setEditSteps([...wf.steps])
    setExpandedId(wf.id)
  }, [])

  const saveEdit = useCallback(() => {
    if (!editingId || !editName.trim()) return
    const validSteps = editSteps.filter(s => s.prompt.trim())
    saveWorkflows(workflows.map(w =>
      w.id === editingId
        ? { ...w, name: editName.trim(), description: editDesc.trim(), icon: editIcon, steps: validSteps, updatedAt: Date.now() }
        : w
    ))
    setEditingId(null)
    addToast('success', t('workflow.updated'))
  }, [editingId, editName, editDesc, editIcon, editSteps, workflows, saveWorkflows, addToast, t])

  const installPreset = useCallback((preset: typeof PRESET_WORKFLOWS[number]) => {
    if (workflows.length >= MAX_WORKFLOWS) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const wf: Workflow = {
      ...preset,
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      steps: preset.steps.map(s => ({ ...s, id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}` })),
    }
    saveWorkflows([wf, ...workflows])
    addToast('success', t('workflow.installed', { name: preset.presetKey ? t(`workflow.preset.${preset.presetKey}`) : preset.name }))
  }, [workflows, saveWorkflows, addToast, t])

  const updateStepPositions = useCallback((workflowId: string, positions: Record<string, { x: number; y: number }>) => {
    saveWorkflows(workflows.map(w => {
      if (w.id !== workflowId) return w
      return {
        ...w,
        steps: w.steps.map(step => ({
          ...step,
          canvasPos: positions[step.id] ?? step.canvasPos,
        })),
        updatedAt: Date.now(),
      }
    }))
  }, [workflows, saveWorkflows])

  const importWorkflows = useCallback((incoming: Workflow[]) => {
    if (incoming.length === 0) return 0
    const remaining = MAX_WORKFLOWS - workflows.length
    const toAdd = incoming.slice(0, remaining)
    saveWorkflows([...toAdd, ...workflows])
    return toAdd.length
  }, [workflows, saveWorkflows])

  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return workflows
    const q = searchQuery.toLowerCase()
    return workflows.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.steps.some(s => s.title.toLowerCase().includes(q))
    )
  }, [workflows, searchQuery])

  return {
    workflows,
    filteredWorkflows,
    searchQuery,
    setSearchQuery,
    expandedId,
    setExpandedId,
    editingId,
    setEditingId,
    showCreateForm,
    setShowCreateForm,
    // Create form
    newName, setNewName,
    newDesc, setNewDesc,
    newIcon, setNewIcon,
    newTeamwork, setNewTeamwork,
    newSteps, setNewSteps,
    // Edit form
    editName, setEditName,
    editDesc, setEditDesc,
    editIcon, setEditIcon,
    editSteps, setEditSteps,
    // Actions
    runWorkflow,
    createWorkflow,
    importWorkflows,
    deleteWorkflow,
    duplicateWorkflow,
    startEdit,
    saveEdit,
    installPreset,
    updateStepPositions,
    PRESET_TEAMWORK_WORKFLOWS,
  }
}
