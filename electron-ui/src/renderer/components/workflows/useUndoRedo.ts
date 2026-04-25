import { useState, useCallback, useRef, useEffect } from 'react'
import { Workflow, WorkflowStep } from '../../types/app.types'

const MAX_LEVELS = 50

/**
 * Full undo/redo hook for workflow state changes.
 * Tracks: add/delete/reorder steps, edit title/prompt, node position changes, layout direction.
 */
export function useUndoRedo(workflow: Workflow | null, onWorkflowUpdate: ((updated: Workflow) => void) | undefined) {
  const [undoStack, setUndoStack] = useState<Workflow[]>([])
  const [redoStack, setRedoStack] = useState<Workflow[]>([])
  const undoStackRef = useRef(undoStack)
  const redoStackRef = useRef(redoStack)
  useEffect(() => { undoStackRef.current = undoStack }, [undoStack])
  useEffect(() => { redoStackRef.current = redoStack }, [redoStack])

  // Reset stacks when workflow changes
  useEffect(() => {
    setUndoStack([])
    setRedoStack([])
  }, [workflow?.id])

  /**
   * Push current workflow state to undo stack, then apply new state.
   */
  const apply = useCallback((next: Workflow) => {
    if (!workflow) return
    setUndoStack(prev => {
      const next = [...prev, workflow].slice(-MAX_LEVELS)
      return next
    })
    setRedoStack([])
    onWorkflowUpdate?.(next)
  }, [workflow, onWorkflowUpdate])

  /**
   * Push a snapshot — call BEFORE making any change, or use apply() to do it atomically.
   */
  const snapshot = useCallback(() => {
    if (!workflow) return
    setUndoStack(prev => [...prev, workflow].slice(-MAX_LEVELS))
    setRedoStack([])
  }, [workflow])

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0 || !workflow) return
    const prev = stack[stack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setRedoStack(s => [...s, workflow].slice(-MAX_LEVELS))
    onWorkflowUpdate?.({ ...prev, updatedAt: Date.now() })
  }, [workflow, onWorkflowUpdate])

  const redo = useCallback(() => {
    const stack = redoStackRef.current
    if (stack.length === 0 || !workflow) return
    const next = stack[stack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setUndoStack(s => [...s, workflow].slice(-MAX_LEVELS))
    onWorkflowUpdate?.({ ...next, updatedAt: Date.now() })
  }, [workflow, onWorkflowUpdate])

  /**
   * Insert a new step at the given index.
   */
  const insertStep = useCallback((index: number, step: WorkflowStep) => {
    if (!workflow) return
    snapshot()
    const steps = [...workflow.steps]
    steps.splice(index, 0, step)
    onWorkflowUpdate?.({ ...workflow, steps, updatedAt: Date.now() })
  }, [workflow, snapshot, onWorkflowUpdate])

  /**
   * Delete steps by id.
   */
  const deleteSteps = useCallback((stepIds: string[]) => {
    if (!workflow) return
    snapshot()
    const steps = workflow.steps.filter(s => !stepIds.includes(s.id))
    onWorkflowUpdate?.({ ...workflow, steps, updatedAt: Date.now() })
  }, [workflow, snapshot, onWorkflowUpdate])

  /**
   * Reorder: move step to a new index.
   */
  const reorderStep = useCallback((stepId: string, toIndex: number) => {
    if (!workflow) return
    const fromIndex = workflow.steps.findIndex(s => s.id === stepId)
    if (fromIndex === -1 || fromIndex === toIndex) return
    snapshot()
    const steps = [...workflow.steps]
    const [moved] = steps.splice(fromIndex, 1)
    steps.splice(toIndex, 0, moved)
    onWorkflowUpdate?.({ ...workflow, steps, updatedAt: Date.now() })
  }, [workflow, snapshot, onWorkflowUpdate])

  /**
   * Update a step's title and/or prompt.
   */
  const updateStep = useCallback((stepId: string, changes: { title?: string; prompt?: string }) => {
    if (!workflow) return
    const steps = workflow.steps.map(s =>
      s.id === stepId ? { ...s, ...changes } : s
    )
    // Only snapshot if something actually changed
    const changed = steps.some((s, i) => s !== workflow.steps[i])
    if (!changed) return
    snapshot()
    onWorkflowUpdate?.({ ...workflow, steps, updatedAt: Date.now() })
  }, [workflow, snapshot, onWorkflowUpdate])

  /**
   * Replace the entire steps array (used by import, duplicate, etc.).
   */
  const replaceSteps = useCallback((steps: WorkflowStep[]) => {
    if (!workflow) return
    snapshot()
    onWorkflowUpdate?.({ ...workflow, steps, updatedAt: Date.now() })
  }, [workflow, snapshot, onWorkflowUpdate])

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    apply,
    snapshot,
    insertStep,
    deleteSteps,
    reorderStep,
    updateStep,
    replaceSteps,
  }
}
