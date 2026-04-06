import { useMemo } from 'react'
import { useChatStore } from '../../store'
import { Workflow } from '../../types/app.types'
import { StandardChatMessage } from '../../types/app.types'

export type StepStatus = 'idle' | 'pending' | 'running' | 'completed'

export interface WorkflowExecutionState {
  isRunning: boolean
  stepStatuses: Record<string, StepStatus>
  stepOutputs: Record<string, string>  // step id → AI response text
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
  const messages = useChatStore(s => s.messages)

  return useMemo(() => {
    const defaultState: WorkflowExecutionState = {
      isRunning: false,
      stepStatuses: {},
      stepOutputs: {},
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
    const stepOutputs: Record<string, string> = {}
    let activeStepIndex = -1
    let completedCount = 0
    let hasRunningOrPending = false

    // Build a simple list of (role, content) from messages for output correlation
    // We look for user messages matching step prompts, then grab the next assistant message
    const stdMessages = messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    ) as StandardChatMessage[]

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

      // Try to find the AI output for this step from the messages array
      // Strategy: find the idx-th user message matching this step's prompt,
      // then take the next assistant message after it.
      let matchCount = 0
      for (let mi = 0; mi < stdMessages.length; mi++) {
        const msg = stdMessages[mi]
        if (msg.role === 'user' && msg.content === step.prompt) {
          if (matchCount === idx) {
            // Look for the assistant message immediately following
            for (let ai = mi + 1; ai < stdMessages.length; ai++) {
              if (stdMessages[ai].role === 'assistant') {
                stepOutputs[step.id] = stdMessages[ai].content
                break
              } else if (stdMessages[ai].role === 'user') {
                // Another user message before an assistant — no output yet
                break
              }
            }
            break
          }
          matchCount++
        }
      }
    })

    return {
      isRunning: hasRunningOrPending,
      stepStatuses,
      stepOutputs,
      activeStepIndex,
      completedCount,
      totalSteps: workflow.steps.length,
    }
  }, [workflow, taskQueue, messages])
}
