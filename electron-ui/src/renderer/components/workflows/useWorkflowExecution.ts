import { useMemo, useRef, useState, useEffect } from 'react'
import { useChatStore } from '../../store'
import { Workflow } from '../../types/app.types'
import { StandardChatMessage } from '../../types/app.types'

export type StepStatus = 'idle' | 'pending' | 'running' | 'completed'

export interface WorkflowExecutionState {
  isRunning: boolean
  stepStatuses: Record<string, StepStatus>
  stepOutputs: Record<string, string>  // step id → AI response text
  stepDurations: Record<string, number> // step id → ms elapsed (for completed steps)
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

  // Track step start times by step id (reset on workflow change)
  const stepStartTimes = useRef<Record<string, number>>({})
  const [stepDurations, setStepDurations] = useState<Record<string, number>>({})
  const prevWorkflowId = useRef<string | null>(null)

  // Reset timers when workflow changes
  useEffect(() => {
    if (workflow?.id !== prevWorkflowId.current) {
      stepStartTimes.current = {}
      setStepDurations({})
      prevWorkflowId.current = workflow?.id ?? null
    }
  }, [workflow?.id])

  const base = useMemo(() => {
    const defaultState: Omit<WorkflowExecutionState, 'stepDurations'> = {
      isRunning: false,
      stepStatuses: {},
      stepOutputs: {},
      activeStepIndex: -1,
      completedCount: 0,
      totalSteps: workflow?.steps.length ?? 0,
    }

    if (!workflow || workflow.steps.length === 0) return defaultState

    const stepPrompts = workflow.steps.map(s => s.prompt)

    let queueStartIdx = -1
    for (let qi = 0; qi < taskQueue.length; qi++) {
      if (taskQueue[qi].content === stepPrompts[0]) {
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

    const stepStatuses: Record<string, StepStatus> = {}
    const stepOutputs: Record<string, string> = {}
    let activeStepIndex = -1
    let completedCount = 0
    let hasRunningOrPending = false

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

      let matchCount = 0
      for (let mi = 0; mi < stdMessages.length; mi++) {
        const msg = stdMessages[mi]
        if (msg.role === 'user' && msg.content === step.prompt) {
          if (matchCount === idx) {
            for (let ai = mi + 1; ai < stdMessages.length; ai++) {
              if (stdMessages[ai].role === 'assistant') {
                stepOutputs[step.id] = stdMessages[ai].content
                break
              } else if (stdMessages[ai].role === 'user') {
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

  // Track start/end times for step duration measurement
  useEffect(() => {
    if (!workflow) return
    const now = Date.now()
    workflow.steps.forEach(step => {
      const status = base.stepStatuses[step.id]
      if (status === 'running' && !stepStartTimes.current[step.id]) {
        stepStartTimes.current[step.id] = now
      }
      if (status === 'completed' && stepStartTimes.current[step.id]) {
        const duration = now - stepStartTimes.current[step.id]
        setStepDurations(prev => {
          if (prev[step.id]) return prev // already recorded
          return { ...prev, [step.id]: duration }
        })
        delete stepStartTimes.current[step.id]
      }
    })
  }, [base.stepStatuses, workflow])

  return { ...base, stepDurations }
}
