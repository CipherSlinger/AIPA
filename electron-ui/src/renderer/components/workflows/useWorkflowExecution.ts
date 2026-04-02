import { useMemo } from 'react'
import { useChatStore } from '../../store'
import { Workflow } from '../../types/app.types'

export type StepStatus = 'idle' | 'pending' | 'running' | 'completed'

export interface WorkflowExecutionState {
  isRunning: boolean
  stepStatuses: Record<string, StepStatus>
  activeStepIndex: number // -1 if not running
  completedCount: number
  totalSteps: number
}

/**
 * Observes the task queue to determine the execution state of a given workflow.
 * Works by matching queue item content against workflow step prompts.
 * No store modifications needed -- purely observational.
 */
export function useWorkflowExecution(workflow: Workflow | null): WorkflowExecutionState {
  const taskQueue = useChatStore(s => s.taskQueue)

  return useMemo(() => {
    const defaultState: WorkflowExecutionState = {
      isRunning: false,
      stepStatuses: {},
      activeStepIndex: -1,
      completedCount: 0,
      totalSteps: workflow?.steps.length ?? 0,
    }

    if (!workflow || workflow.steps.length === 0) return defaultState

    // Try to match queue items to workflow steps by content (prompt text)
    // Queue items are added in order, so we match sequentially
    const stepPrompts = workflow.steps.map(s => s.prompt)

    // Find the contiguous subsequence of queue items that match this workflow's steps
    // Look for the first queue item matching step[0]'s prompt
    let queueStartIdx = -1
    for (let qi = 0; qi < taskQueue.length; qi++) {
      if (taskQueue[qi].content === stepPrompts[0]) {
        // Verify the rest match
        let allMatch = true
        for (let si = 1; si < stepPrompts.length; si++) {
          if (qi + si >= taskQueue.length || taskQueue[qi + si].content !== stepPrompts[si]) {
            allMatch = false
            break
          }
        }
        if (allMatch) {
          queueStartIdx = qi
          break
        }
      }
    }

    if (queueStartIdx === -1) return defaultState

    // Map queue item statuses to step statuses
    const stepStatuses: Record<string, StepStatus> = {}
    let activeStepIndex = -1
    let completedCount = 0
    let hasRunningOrPending = false

    workflow.steps.forEach((step, idx) => {
      const queueItem = taskQueue[queueStartIdx + idx]
      if (!queueItem) {
        stepStatuses[step.id] = 'idle'
        return
      }

      switch (queueItem.status) {
        case 'done':
          stepStatuses[step.id] = 'completed'
          completedCount++
          break
        case 'running':
          stepStatuses[step.id] = 'running'
          activeStepIndex = idx
          hasRunningOrPending = true
          break
        case 'pending':
          stepStatuses[step.id] = 'pending'
          hasRunningOrPending = true
          break
        default:
          stepStatuses[step.id] = 'idle'
      }
    })

    return {
      isRunning: hasRunningOrPending,
      stepStatuses,
      activeStepIndex,
      completedCount,
      totalSteps: workflow.steps.length,
    }
  }, [workflow, taskQueue])
}
