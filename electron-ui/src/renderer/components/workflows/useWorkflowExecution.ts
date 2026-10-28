import { useMemo, useRef, useState, useEffect } from 'react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'
import { Workflow } from '../../types/app.types'
import { StandardChatMessage } from '../../types/app.types'
import { getStepQueueEntries } from './workflowConstants'

export type StepStatus = 'idle' | 'pending' | 'running' | 'completed' | 'error'

export interface WorkflowExecutionState {
  isRunning: boolean
  hasError: boolean
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
  const t = useT()
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
      hasError: false,
      stepStatuses: {},
      stepOutputs: {},
      activeStepIndex: -1,
      completedCount: 0,
      totalSteps: workflow?.steps.length ?? 0,
    }

    if (!workflow || workflow.steps.length === 0) return defaultState

    // Must be the same derivation the run entry points queue, or a parallel
    // workflow is observed against prompts that were never enqueued.
    const entriesByStep = workflow.steps.map((step, idx) =>
      getStepQueueEntries(step, idx, workflow.presetKey, t)
    )
    const entries = entriesByStep.flat()
    if (entries.length === 0) return defaultState

    let queueStartIdx = -1
    for (let qi = 0; qi + entries.length <= taskQueue.length; qi++) {
      let allMatch = true
      for (let ei = 0; ei < entries.length; ei++) {
        if (taskQueue[qi + ei].content !== entries[ei].prompt) {
          allMatch = false
          break
        }
      }
      if (allMatch) {
        queueStartIdx = qi
        break
      }
    }

    if (queueStartIdx === -1) return defaultState

    const stepStatuses: Record<string, StepStatus> = {}
    const stepOutputs: Record<string, string> = {}
    let activeStepIndex = -1
    let completedCount = 0
    let hasRunningOrPending = false
    let hasError = false

    const stdMessages = messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    ) as StandardChatMessage[]

    let cursor = 0
    workflow.steps.forEach((step, idx) => {
      const stepEntries = entriesByStep[idx] ?? []
      const queueItems = taskQueue.slice(queueStartIdx + cursor, queueStartIdx + cursor + stepEntries.length)
      cursor += stepEntries.length
      if (stepEntries.length === 0 || queueItems.length < stepEntries.length) {
        stepStatuses[step.id] = 'idle'
        return
      }

      // A parallel step owns several queue items; the step is only complete
      // once all of them are, and a failure only counts once none is active.
      const statuses = queueItems.map(item => item.status)
      if (statuses.includes('running')) {
        stepStatuses[step.id] = 'running'
        activeStepIndex = idx
        hasRunningOrPending = true
      } else if (statuses.includes('pending')) {
        stepStatuses[step.id] = 'pending'
        hasRunningOrPending = true
      } else if (statuses.includes('failed')) {
        stepStatuses[step.id] = 'error'
        hasError = true
      } else if (statuses.every(status => status === 'done')) {
        stepStatuses[step.id] = 'completed'
        completedCount++
      } else {
        stepStatuses[step.id] = 'idle'
      }

      const outputs: string[] = []
      for (const entry of stepEntries) {
        let matchCount = 0
        for (let mi = 0; mi < stdMessages.length; mi++) {
          const msg = stdMessages[mi]
          if (msg.role === 'user' && msg.content === entry.prompt) {
            if (matchCount === idx) {
              for (let ai = mi + 1; ai < stdMessages.length; ai++) {
                if (stdMessages[ai].role === 'assistant') {
                  outputs.push(stdMessages[ai].content)
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
      }
      if (outputs.length > 0) stepOutputs[step.id] = outputs.join('\n\n')
    })

    return {
      isRunning: hasRunningOrPending,
      hasError,
      stepStatuses,
      stepOutputs,
      activeStepIndex,
      completedCount,
      totalSteps: workflow.steps.length,
    }
  }, [workflow, taskQueue, messages, t])

  // Track start/end times for step duration measurement
  useEffect(() => {
    if (!workflow) return
    const now = Date.now()
    workflow.steps.forEach(step => {
      const status = base.stepStatuses[step.id]
      if (status === 'running' && !stepStartTimes.current[step.id]) {
        stepStartTimes.current[step.id] = now
      }
      if ((status === 'completed' || status === 'error') && stepStartTimes.current[step.id]) {
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
