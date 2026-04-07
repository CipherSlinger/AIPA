import { useState, useEffect, useCallback } from 'react'

export interface WorkflowRun {
  runId: string
  workflowId: string
  startedAt: number
  finishedAt: number
  stepOutputs: Record<string, string>
  stepDurations: Record<string, number>
  success: boolean
}

const STORAGE_KEY = 'aipa_workflow_runs'
const MAX_RUNS_PER_WORKFLOW = 10

export function useWorkflowHistory(workflowId: string | null) {
  const [runs, setRuns] = useState<WorkflowRun[]>([])

  useEffect(() => {
    if (!workflowId) { setRuns([]); return }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const all: WorkflowRun[] = raw ? JSON.parse(raw) : []
      setRuns(all.filter(r => r.workflowId === workflowId).slice(0, MAX_RUNS_PER_WORKFLOW))
    } catch { setRuns([]) }
  }, [workflowId])

  const saveRun = useCallback((run: Omit<WorkflowRun, 'runId'>) => {
    const newRun: WorkflowRun = { ...run, runId: 'run-' + Date.now() }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const all: WorkflowRun[] = raw ? JSON.parse(raw) : []
      const others = all.filter(r => r.workflowId !== workflowId)
      const thisWf = all.filter(r => r.workflowId === workflowId)
      const updated = [newRun, ...thisWf].slice(0, MAX_RUNS_PER_WORKFLOW)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...others, ...updated]))
      setRuns(updated)
    } catch {}
  }, [workflowId])

  const clearHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const all: WorkflowRun[] = raw ? JSON.parse(raw) : []
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all.filter(r => r.workflowId !== workflowId)))
      setRuns([])
    } catch {}
  }, [workflowId])

  return { runs, saveRun, clearHistory }
}
