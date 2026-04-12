import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Workflow as WorkflowIcon, Maximize2, ChevronsUpDown, Download, Minimize2, LayoutGrid } from 'lucide-react'
import { Workflow, WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import { useChatStore } from '../../store'
import CanvasNode, { NODE_WIDTH, NODE_MIN_HEIGHT } from './CanvasNode'
import CanvasEdge, { CanvasEdgeDefs } from './CanvasEdge'
import CanvasProgressBar from './CanvasProgressBar'
import CanvasToolbar from './CanvasToolbar'
import { useWorkflowExecution } from './useWorkflowExecution'
import { useCanvasLayout } from './useCanvasLayout'
import type { NodePosition } from './useCanvasLayout'
import { useWorkflowHistory } from './useWorkflowHistory'
import WorkflowRunHistory from './WorkflowRunHistory'

interface WorkflowCanvasProps {
  workflow: Workflow | null
  highlightStepIds?: Set<string> | null  // null = no filter, Set = show only these
  // Direction A: retry a failed step
  onRetryStep?: (stepId: string) => void
  // Direction A+9: rerun entire workflow
  onRerun?: () => void
  // R key: run workflow for the first time
  onRun?: () => void
  // Direction B: update a step's title or prompt
  onStepUpdate?: (stepId: string, changes: { title?: string; prompt?: string }) => void
  // D6: reorder steps (drag handle)
  onStepReorder?: (stepId: string, newIndex: number) => void
  // Direction 11: import steps from JSON
  onImportSteps?: (steps: Array<{ title: string; prompt: string }>) => void
  // Direction 4: insert step between two existing steps
  onInsertBetween?: (afterStepId: string, beforeStepId: string) => void
  // Direction 5: delete steps by id
  onDeleteSteps?: (stepIds: string[]) => void
  // Inline workflow update (name rename from canvas header)
  onWorkflowUpdate?: (updated: Workflow) => void
}

// --- Viewport culling ---
const CULL_MARGIN = 100

function isInViewport(
  pos: { x: number; y: number; width: number; height: number },
  viewLeft: number, viewTop: number, viewRight: number, viewBottom: number,
  cullMargin = CULL_MARGIN
): boolean {
  return (
    pos.x + pos.width > viewLeft - cullMargin &&
    pos.x < viewRight + cullMargin &&
    pos.y + pos.height > viewTop - cullMargin &&
    pos.y < viewBottom + cullMargin
  )
}

// --- Minimap ---
const MINIMAP_W = 120
const MINIMAP_H = 80

interface MinimapProps {
  nodePositions: Record<string, NodePosition>
  stepIds: string[]
  stepStatuses: Record<string, string>
  panX: number
  panY: number
  zoom: number
  containerW: number
  containerH: number
  // Direction C: click to jump
  onClickNode?: (stepId: string) => void
  onViewportDrag?: (newPanX: number, newPanY: number) => void
}

function Minimap({ nodePositions, stepIds, stepStatuses, panX, panY, zoom, containerW, containerH, onClickNode, onViewportDrag }: MinimapProps) {
  if (stepIds.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of stepIds) {
    const p = nodePositions[id]
    if (!p) continue
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + p.width); maxY = Math.max(maxY, p.y + p.height)
  }
  if (!isFinite(minX)) return null

  const pad = 10
  const contentW = maxX - minX + pad * 2
  const contentH = maxY - minY + pad * 2
  const scaleX = MINIMAP_W / contentW
  const scaleY = MINIMAP_H / contentH
  const scale = Math.min(scaleX, scaleY)

  const vpX = (-panX / zoom - minX + pad) * scale
  const vpY = (-panY / zoom - minY + pad) * scale
  const vpW = (containerW / zoom) * scale
  const vpH = (containerH / zoom) * scale

  const vpDragRef = React.useRef<{ mouseX: number; mouseY: number; startPanX: number; startPanY: number } | null>(null)

  const handleVpMouseDown = onViewportDrag ? (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    vpDragRef.current = { mouseX: e.clientX, mouseY: e.clientY, startPanX: panX, startPanY: panY }
    const handleMove = (me: MouseEvent) => {
      if (!vpDragRef.current) return
      const dx = me.clientX - vpDragRef.current.mouseX
      const dy = me.clientY - vpDragRef.current.mouseY
      // minimap delta → canvas pan delta（反向，除以 scale，乘以 zoom）
      const newPanX = vpDragRef.current.startPanX - (dx / scale) * zoom
      const newPanY = vpDragRef.current.startPanY - (dy / scale) * zoom
      onViewportDrag(newPanX, newPanY)
    }
    const handleUp = () => {
      vpDragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  } : undefined

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 40,
        right: 8,
        zIndex: 10,
        background: 'rgba(12,12,22,0.90)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        overflow: 'hidden',
        width: MINIMAP_W,
        height: MINIMAP_H,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H} style={{ display: 'block' }}>
        {stepIds.map(id => {
          const p = nodePositions[id]
          if (!p) return null
          const st = stepStatuses[id] ?? 'idle'
          const fill = st === 'completed' ? '#22c55e'
            : st === 'running' ? '#6366f1'
            : st === 'pending' ? 'rgba(120,120,120,0.4)'
            : 'rgba(100,100,100,0.3)'
          const nodeIdx = stepIds.indexOf(id)
          const rectW = Math.max(2, p.width * scale)
          const rectH = Math.max(2, p.height * scale)
          const rx = (p.x - minX + pad) * scale
          const ry = (p.y - minY + pad) * scale
          return (
            <g key={id}>
              <rect
                x={rx} y={ry}
                width={rectW} height={rectH}
                rx={2}
                fill={fill}
                fillOpacity={0.9}
                style={{ cursor: onClickNode ? 'pointer' : 'default' }}
                onClick={onClickNode ? (e) => { e.stopPropagation(); onClickNode(id) } : undefined}
              />
              {rectW > 10 && rectH > 6 && (
                <text
                  x={rx + rectW / 2}
                  y={ry + rectH / 2 + 3}
                  textAnchor="middle"
                  fontSize={Math.max(4, Math.min(7, rectW * 0.35))}
                  fill="rgba(255,255,255,0.75)"
                  fontWeight="800"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {nodeIdx + 1}
                </text>
              )}
            </g>
          )
        })}
        <rect
          x={vpX} y={vpY}
          width={Math.max(4, vpW)} height={Math.max(4, vpH)}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={0.8}
          rx={1}
          style={{ pointerEvents: onViewportDrag ? 'all' : 'none', cursor: onViewportDrag ? 'grab' : 'default' }}
          onMouseDown={handleVpMouseDown}
        />
      </svg>
    </div>
  )
}

export default function WorkflowCanvas({ workflow, highlightStepIds, onRetryStep, onRerun, onRun, onStepUpdate, onStepReorder, onImportSteps, onInsertBetween, onDeleteSteps, onWorkflowUpdate }: WorkflowCanvasProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedNodesRef = useRef<Set<string>>(new Set())
  const selectedNodeRef = useRef<string | null>(null)

  // Inline name editing state
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(workflow?.name ?? '')

  // Sync nameValue when workflow changes
  useEffect(() => {
    setNameValue(workflow?.name ?? '')
    setEditingName(false)
  }, [workflow?.id])
  const execution = useWorkflowExecution(workflow)
  // Direction 9: get abort from chat store
  const abort = useChatStore(s => s.abort)
  const clearQueue = useChatStore(s => s.clearQueue)

  // D2: subscribe to live streaming text from the current assistant message
  const streamingContent = useChatStore(s => {
    if (!s.isStreaming) return ''
    const msgs = s.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i] as any
      if (m.role === 'assistant' && m.isStreaming && typeof m.content === 'string' && m.content) {
        // Show last 100 chars of the streaming output
        return m.content.slice(-100)
      }
    }
    return ''
  })

  // Direction 13: search query state
  const [searchQuery, setSearchQuery] = useState('')

  // Enhancement 3: undo history for step deletions (Ctrl+Z)
  const [deletedStepHistory, setDeletedStepHistory] = useState<{ step: WorkflowStep; idx: number }[]>([])

  // Direction 5: delete nodes callback (passed to useCanvasLayout as 4th param)
  const handleDeleteNodes = useCallback((ids: string[]) => {
    if (workflow) {
      const deletedEntries = ids
        .map(id => {
          const idx = workflow.steps.findIndex(s => s.id === id)
          const step = workflow.steps[idx]
          return idx >= 0 && step ? { step, idx } : null
        })
        .filter((e): e is { step: WorkflowStep; idx: number } => e !== null)
      if (deletedEntries.length > 0) {
        setDeletedStepHistory(prev => [...prev.slice(-5), ...deletedEntries])
      }
    }
    onDeleteSteps?.(ids)
  }, [onDeleteSteps, workflow])

  // Layout hook (pan, zoom, node positions, drag, collapse, minimap, Space key)
  const layout = useCanvasLayout(workflow, containerRef, undefined, handleDeleteNodes)

  // Direction 6: execution history
  const { runs, saveRun, clearHistory } = useWorkflowHistory(workflow?.id ?? null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  // Enhancement 2: workflow completion summary toast
  const [completionSummary, setCompletionSummary] = useState<{ stepCount: number; visible: boolean } | null>(null)
  const prevRunningRef = useRef(false)

  // Track when execution started for ETA
  const executionStartRef = useRef<number | null>(null)
  const executionStartedAtRef = useRef<number | null>(null)
  useEffect(() => {
    if (execution.isRunning && executionStartRef.current === null) {
      executionStartRef.current = Date.now()
      executionStartedAtRef.current = Date.now()
    } else if (!execution.isRunning) {
      executionStartRef.current = null
    }
  }, [execution.isRunning])

  // Direction 6: save run when execution finishes
  const prevIsRunningRef = useRef(false)
  useEffect(() => {
    const justFinished = prevIsRunningRef.current && !execution.isRunning
    prevIsRunningRef.current = execution.isRunning
    if (
      justFinished &&
      workflow &&
      execution.completedCount > 0 &&
      executionStartedAtRef.current !== null
    ) {
      const success = execution.completedCount === execution.totalSteps
      saveRun({
        workflowId: workflow.id,
        startedAt: executionStartedAtRef.current,
        finishedAt: Date.now(),
        stepOutputs: { ...execution.stepOutputs },
        stepDurations: { ...execution.stepDurations },
        stepTitles: Object.fromEntries(workflow.steps.map(s => [s.id, s.title])),
        success,
      })
      executionStartedAtRef.current = null
    }
  }, [execution.isRunning, execution.completedCount, execution.totalSteps,
      execution.stepOutputs, execution.stepDurations, workflow, saveRun])

  // Enhancement 2: show completion toast when workflow transitions from running to done
  useEffect(() => {
    const wasRunning = prevRunningRef.current
    const allDone = !execution.isRunning && execution.completedCount === execution.totalSteps && execution.totalSteps > 0
    if (wasRunning && allDone && workflow) {
      setCompletionSummary({ stepCount: workflow.steps.length, visible: true })
      setTimeout(() => setCompletionSummary(null), 4000)
    }
    prevRunningRef.current = execution.isRunning
  }, [execution.isRunning, execution.completedCount, execution.totalSteps, workflow])

  // Direction 6: resolve historical data for display
  const selectedRun = selectedRunId ? runs.find(r => r.runId === selectedRunId) : null
  const historyStepOutputs = selectedRun ? selectedRun.stepOutputs : null
  const historyStepDurations = selectedRun ? selectedRun.stepDurations : null

  // Selected node
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  // Copy-to-clipboard toast
  const [copyToast, setCopyToast] = useState(false)
  // Execution summary card collapse state
  const [summaryCollapsed, setSummaryCollapsed] = useState(false)

  // D5: canvas right-click context menu
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number } | null>(null)

  // Find overlay
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const findInputRef = React.useRef<HTMLInputElement>(null)

  // D5: live step timer — track start times per step
  const [liveElapsedMs, setLiveElapsedMs] = useState<Record<string, number>>({})
  const stepStartTimesRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!workflow) return
    const statuses = execution.stepStatuses
    workflow.steps.forEach(step => {
      if (statuses[step.id] === 'running') {
        if (!stepStartTimesRef.current[step.id]) {
          stepStartTimesRef.current[step.id] = Date.now()
        }
      } else {
        delete stepStartTimesRef.current[step.id]
      }
    })
  }, [execution.stepStatuses, workflow])

  useEffect(() => {
    if (!execution.isRunning) {
      setLiveElapsedMs({})
      stepStartTimesRef.current = {}
      return
    }
    const id = setInterval(() => {
      const now = Date.now()
      const updated: Record<string, number> = {}
      Object.entries(stepStartTimesRef.current).forEach(([sid, start]) => {
        updated[sid] = now - start
      })
      setLiveElapsedMs(updated)
    }, 1000)
    return () => clearInterval(id)
  }, [execution.isRunning])

  // D8: edge hover state — key is "fromId:toId"
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null)

  // Insert-between gap hover state — index of the step AFTER which to insert
  const [hoveredGap, setHoveredGap] = useState<number | null>(null)

  // D6: reorder drag state
  const [reorderDrag, setReorderDrag] = useState<{ stepId: string; insertAfterIndex: number } | null>(null)
  const reorderDragRef = useRef(reorderDrag)
  useEffect(() => { reorderDragRef.current = reorderDrag }, [reorderDrag])

  // Refs for stale-closure-safe access inside reorder effect
  const workflowRef = useRef(workflow)
  useEffect(() => { workflowRef.current = workflow }, [workflow])
  const onStepReorderRef = useRef(onStepReorder)
  useEffect(() => { onStepReorderRef.current = onStepReorder }, [onStepReorder])
  const layoutPanYRef = useRef(layout.panY)
  const layoutPanXRef = useRef(layout.panX)
  const layoutDirectionRef = useRef(layout.layoutDirection)
  const layoutZoomRef = useRef(layout.zoom)
  const layoutNodePositionsRef = useRef(layout.nodePositions)
  useEffect(() => {
    layoutPanYRef.current = layout.panY
    layoutPanXRef.current = layout.panX
    layoutDirectionRef.current = layout.layoutDirection
    layoutZoomRef.current = layout.zoom
    layoutNodePositionsRef.current = layout.nodePositions
  }, [layout.panY, layout.panX, layout.layoutDirection, layout.zoom, layout.nodePositions])

  // D6: reorder drag window listeners
  useEffect(() => {
    if (!reorderDrag) return
    const handleMove = (e: MouseEvent) => {
      const wf = workflowRef.current
      if (!containerRef.current || !wf) return
      const rect = containerRef.current.getBoundingClientRect()
      const isHoriz = layoutDirectionRef.current === 'horizontal'
      const canvasCoord = isHoriz
        ? (e.clientX - rect.left - layoutPanXRef.current) / layoutZoomRef.current
        : (e.clientY - rect.top - layoutPanYRef.current) / layoutZoomRef.current
      let insertAfter = -1
      wf.steps.forEach((step, idx) => {
        const pos = layoutNodePositionsRef.current[step.id]
        if (!pos) return
        const mid = isHoriz ? pos.x + pos.width / 2 : pos.y + pos.height / 2
        if (canvasCoord > mid) insertAfter = idx
      })
      setReorderDrag(prev => prev ? { ...prev, insertAfterIndex: insertAfter } : null)
    }
    const handleUp = () => {
      const current = reorderDragRef.current
      const wf = workflowRef.current
      const cb = onStepReorderRef.current
      if (current && wf && cb) {
        const { stepId, insertAfterIndex } = current
        const fromIdx = wf.steps.findIndex(s => s.id === stepId)
        const targetInsertIndex = insertAfterIndex + 1
        let toIdx: number
        if (targetInsertIndex < fromIdx) {
          toIdx = targetInsertIndex
        } else if (targetInsertIndex > fromIdx + 1) {
          toIdx = targetInsertIndex - 1
        } else {
          setReorderDrag(null)
          return
        }
        if (toIdx >= 0 && toIdx < wf.steps.length) {
          cb(stepId, toIdx)
        }
      }
      setReorderDrag(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [reorderDrag?.stepId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Streaming words-per-second indicator
  const [streamingWps, setStreamingWps] = useState<number | null>(null)
  const lastWordCountRef = useRef(0)
  const lastWpsCheckRef = useRef(Date.now())

  useEffect(() => {
    if (!execution.isRunning) {
      setStreamingWps(null)
      lastWordCountRef.current = 0
      return
    }

    const interval = setInterval(() => {
      const activeIdx = execution.activeStepIndex
      if (activeIdx < 0) return
      const activeStep = workflow?.steps[activeIdx]
      if (!activeStep) return

      const streamText = execution.stepOutputs?.[activeStep.id] ?? ''
      const wordCount = streamText.trim().split(/\s+/).filter(Boolean).length

      const now = Date.now()
      const elapsed = (now - lastWpsCheckRef.current) / 1000
      if (elapsed > 0 && wordCount > lastWordCountRef.current) {
        const wps = Math.round((wordCount - lastWordCountRef.current) / elapsed)
        setStreamingWps(wps)
      }
      lastWordCountRef.current = wordCount
      lastWpsCheckRef.current = now
    }, 1500)

    return () => clearInterval(interval)
  }, [execution.isRunning, execution.activeStepIndex, execution.stepOutputs, workflow])

  // 30s periodic active step banner during execution
  const [activeStepBanner, setActiveStepBanner] = useState<string | null>(null)
  const bannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastBannerStepRef = useRef<string | null>(null)

  useEffect(() => {
    const isRunning = execution.isRunning
    if (!isRunning || !workflow) {
      if (bannerIntervalRef.current) {
        clearInterval(bannerIntervalRef.current)
        bannerIntervalRef.current = null
      }
      if (!isRunning) setActiveStepBanner(null)
      return
    }

    const updateBanner = () => {
      const activeIdx = execution.activeStepIndex
      const activeStep = activeIdx >= 0 ? workflow.steps[activeIdx] : null
      if (!activeStep) return
      if (activeStep.id === lastBannerStepRef.current) return
      lastBannerStepRef.current = activeStep.id

      const completedOutputs = workflow.steps
        .filter((_, i) => i < activeIdx)
        .map(s => `Step "${s.title}": ${(execution.stepOutputs[s.id] || '').slice(0, 200)}`)
        .join('\n')

      const bannerText = `Running "${activeStep.title}"${completedOutputs ? ` — ${workflow.steps.filter((_, i) => i < activeIdx).length} steps done` : ''}`
      setActiveStepBanner(bannerText)
    }

    updateBanner()
    bannerIntervalRef.current = setInterval(updateBanner, 30_000)

    return () => {
      if (bannerIntervalRef.current) clearInterval(bannerIntervalRef.current)
    }
  }, [execution.isRunning, execution.activeStepIndex, workflow, execution.stepOutputs])

  // Reset selection when workflow changes
  useEffect(() => {
    setSelectedNode(null)
    setSelectedRunId(null)
    setReorderDrag(null)
    setHoveredEdgeKey(null)
    setSearchQuery('')
    setDeletedStepHistory([])
  }, [workflow?.id])

  // --- Auto-pan to active node during execution ---
  const prevActiveRef = useRef(-1)
  useEffect(() => {
    if (
      execution.activeStepIndex < 0 ||
      execution.activeStepIndex === prevActiveRef.current ||
      !workflow
    ) return

    prevActiveRef.current = execution.activeStepIndex
    const activeStep = workflow.steps[execution.activeStepIndex]
    if (!activeStep) return
    layout.autoPanToNode(activeStep.id)
  }, [execution.activeStepIndex, workflow, layout])

  // --- Node selection ---
  const handleNodeSelect = useCallback((stepId: string) => {
    setSelectedNode(stepId)
  }, [])

  // Direction C: minimap click handler
  const handleMinimapClickNode = useCallback((stepId: string) => {
    layout.autoPanToNode(stepId)
    handleNodeSelect(stepId)
  }, [layout, handleNodeSelect])

  // D5: close context menu on outside click
  useEffect(() => {
    if (!canvasCtxMenu) return
    const close = () => setCanvasCtxMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [canvasCtxMenu])

  // Keep selectedNodesRef in sync to avoid re-registering the keydown listener on every render
  useEffect(() => { selectedNodesRef.current = layout.selectedNodes }, [layout.selectedNodes])
  // Keep selectedNodeRef in sync for stale-closure-safe access in the Delete handler
  useEffect(() => { selectedNodeRef.current = selectedNode }, [selectedNode])

  // Delete/Backspace: delete selected nodes (multi-select or single-select)
  useEffect(() => {
    if (!onDeleteSteps) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // Don't fire when user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const selected = selectedNodesRef.current
      if (selected.size > 0) {
        e.preventDefault()
        onDeleteSteps([...selected])
        layout.clearSelection()
      } else if (selectedNodeRef.current && !execution.isRunning) {
        e.preventDefault()
        onDeleteSteps([selectedNodeRef.current])
        setSelectedNode(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDeleteSteps, layout.clearSelection, execution.isRunning])

  // R key: run workflow (when canvas is focused/hovered and no input is active)
  useEffect(() => {
    if (!onRun) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return
      if (e.ctrlKey || e.metaKey) return
      // Don't fire when user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (execution.isRunning) return
      e.preventDefault()
      onRun()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onRun, execution.isRunning])

  // Ctrl+Z: undo last step deletion
  useEffect(() => {
    if (!onWorkflowUpdate) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== 'z' && e.key !== 'Z') || (!e.ctrlKey && !e.metaKey) || e.shiftKey) return
      // Don't fire when user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (!workflow) return
      setDeletedStepHistory(prev => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        const newSteps = [...workflow.steps]
        newSteps.splice(last.idx, 0, last.step)
        onWorkflowUpdate({ ...workflow, steps: newSteps, updatedAt: Date.now() })
        e.preventDefault()
        return prev.slice(0, -1)
      })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onWorkflowUpdate, workflow, deletedStepHistory])

  // Ctrl+C: copy workflow as JSON when no node is selected
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey) && !selectedNode && workflow) {
        e.preventDefault()
        const json = JSON.stringify(workflow, null, 2)
        navigator.clipboard.writeText(json).then(() => {
          setCopyToast(true)
          setTimeout(() => setCopyToast(false), 2000)
        }).catch(() => {})
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedNode, workflow])

  // Ctrl+F: find node overlay
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setFindOpen(prev => {
          if (!prev) setTimeout(() => findInputRef.current?.focus(), 50)
          return !prev
        })
      }
      if (e.key === 'Escape' && findOpen) {
        setFindOpen(false)
        setFindQuery('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [findOpen])

  // D6: keyboard focus → node selection sync
  useEffect(() => {
    if (layout.focusedNodeId && workflow) {
      handleNodeSelect(layout.focusedNodeId)
    }
  }, [layout.focusedNodeId])

  // --- Canvas mouse down: D1 marquee vs pan depending on spaceDown ---
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelectedNode(null)
    layout.clearSelection()
    if (layout.spaceDown) {
      // Space held: pan mode
      layout.handleCanvasMouseDown(e)
    } else {
      // D1: marquee selection mode
      layout.startMarquee(e)
    }
  }, [layout])

  const cursor = layout.spaceDown
    ? (layout.isPanning ? 'grabbing' : 'grab')
    : reorderDrag ? 'ns-resize'
    : layout.isPanning ? 'grabbing' : 'default'

  // Enhancement 1: isDragging — true when user is reorder-dragging a node
  // (layout.draggingNode is not exported from useCanvasLayout, so we use reorderDrag as the signal)
  const isDragging = reorderDrag !== null

  // Direction B: node title change (from CanvasNode inline edit)
  const handleTitleChange = useCallback((stepId: string, newTitle: string) => {
    onStepUpdate?.(stepId, { title: newTitle })
  }, [onStepUpdate])

  // Direction B: node prompt change (from CanvasNode inline edit)
  const handlePromptChange = useCallback((stepId: string, newPrompt: string) => {
    onStepUpdate?.(stepId, { prompt: newPrompt })
  }, [onStepUpdate])

  // Direction G: JSON export
  const handleExport = useCallback(() => {
    if (!workflow) return
    const data = {
      name: workflow.name,
      steps: workflow.steps,
      nodePositions: layout.nodePositions,
      exportedAt: Date.now(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}-export.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [workflow, layout.nodePositions])

  // Direction 11: JSON import handler
  const handleImport = useCallback((jsonStr: string) => {
    try {
      const d = JSON.parse(jsonStr)
      if (d.steps) onImportSteps?.(d.steps)
    } catch {
      // ignore parse errors
    }
  }, [onImportSteps])

  // Direction 12: Shell script export handler
  const handleExportScript = useCallback(() => {
    if (!workflow) return
    const lines = ['#!/bin/bash', `# Workflow: ${workflow.name}`, '']
    workflow.steps.forEach((step, i) => {
      lines.push(`# Step ${i + 1}: ${step.title}`)
      lines.push(`echo "Running: ${step.title}"`)
      lines.push(`# Prompt: ${step.prompt.slice(0, 100).replace(/"/g, '\\"')}`)
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}.sh`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [workflow])

  // TODO: wire up actual partial execution when useWorkflowExecution supports startFromStep
  const handleRunFromStep = useCallback((_stepIdx: number) => {
    // no-op for now — UI affordance only
  }, [])

  // Insert a new empty step after the given index by delegating to onInsertBetween
  const handleInsertStep = useCallback((insertAtIndex: number) => {
    if (!workflow || !onInsertBetween) return
    const afterStep = workflow.steps[insertAtIndex - 1]
    const beforeStep = workflow.steps[insertAtIndex]
    if (!afterStep || !beforeStep) return
    onInsertBetween(afterStep.id, beforeStep.id)
  }, [workflow, onInsertBetween])

  // Direction 13: compute effective highlight IDs (search takes priority over external prop)
  const effectiveHighlightStepIds: Set<string> | null | undefined = (() => {
    if (searchQuery && workflow) {
      const q = searchQuery.toLowerCase()
      const matched = workflow.steps
        .filter(s => s.title.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q))
        .map(s => s.id)
      return new Set(matched)
    }
    return highlightStepIds
  })()

  const searchMatchCount = searchQuery && effectiveHighlightStepIds
    ? effectiveHighlightStepIds.size
    : null

  // D8: auto-pan to first search match
  useEffect(() => {
    if (!effectiveHighlightStepIds || effectiveHighlightStepIds.size === 0 || !workflow) return
    const firstMatchId = workflow.steps.find(s => effectiveHighlightStepIds!.has(s.id))?.id
    if (firstMatchId) layout.autoPanToNode(firstMatchId)
  }, [effectiveHighlightStepIds])

  // --- Empty state ---
  if (!workflow) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8,8,16,1)',
        color: 'rgba(255,255,255,0.45)',
        gap: 10,
      }}>
        <div style={{
          background: 'rgba(99,102,241,0.08)',
          borderRadius: 20,
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <WorkflowIcon size={24} style={{ opacity: 0.45, color: 'rgba(99,102,241,0.8)' }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.82)' }}>{t('workflow.canvasEmpty')}</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{t('workflow.selectOrCreate')}</span>
      </div>
    )
  }

  const selectedStep = selectedNode ? workflow?.steps.find(s => s.id === selectedNode) : null
  const selectedStepIndex = selectedNode ? workflow?.steps.findIndex(s => s.id === selectedNode) : -1
  const selectedStepStatus = selectedNode ? (execution.stepStatuses[selectedNode] ?? 'idle') : null

  const findMatches = findQuery.trim() && workflow
    ? workflow.steps
        .map((step, idx) => ({ step, idx }))
        .filter(({ step }) =>
          step.title.toLowerCase().includes(findQuery.toLowerCase()) ||
          (step.prompt || '').toLowerCase().includes(findQuery.toLowerCase())
        )
    : []

  const zoomPercent = Math.round(layout.zoom * 100)

  // Direction 8: viewport culling helpers
  const viewLeft = -layout.panX / layout.zoom
  const viewTop = -layout.panY / layout.zoom
  const viewRight = viewLeft + layout.containerSize.w / layout.zoom
  const viewBottom = viewTop + layout.containerSize.h / layout.zoom

  const showRerunOrError = (execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && !execution.isRunning) || (execution.hasError && !execution.isRunning)
  const totalSteps = workflow?.steps.length ?? 0

  const totalDurationMs = workflow
    ? workflow.steps.reduce((sum, step) => sum + (execution.stepDurations[step.id] ?? 0), 0)
    : 0
  const totalOutputWords = workflow
    ? workflow.steps.reduce((sum, step) => {
        const out = execution.stepOutputs[step.id] ?? ''
        return sum + (out ? out.trim().split(/\s+/).filter(Boolean).length : 0)
      }, 0)
    : 0

  // D8: determine which nodes are highlighted by edge hover
  const hoveredFromId = hoveredEdgeKey ? hoveredEdgeKey.split(':')[0] : null
  const hoveredToId = hoveredEdgeKey ? hoveredEdgeKey.split(':')[1] : null

  // D6: compute reorder insertion line position
  const reorderInsertLine = reorderDrag && (() => {
    const { insertAfterIndex } = reorderDrag
    const isHoriz = layout.layoutDirection === 'horizontal'
    if (isHoriz) {
      if (insertAfterIndex < 0) {
        const pos = workflow.steps[0] ? layout.nodePositions[workflow.steps[0].id] : null
        return pos ? { x: pos.x - 8, isVertical: true } : null
      }
      const pos = workflow.steps[insertAfterIndex] ? layout.nodePositions[workflow.steps[insertAfterIndex].id] : null
      return pos ? { x: pos.x + pos.width + 4, isVertical: true } : null
    } else {
      if (insertAfterIndex < 0) {
        const pos = workflow.steps[0] ? layout.nodePositions[workflow.steps[0].id] : null
        return pos ? { y: pos.y - 8, isVertical: false } : null
      }
      const pos = workflow.steps[insertAfterIndex] ? layout.nodePositions[workflow.steps[insertAfterIndex].id] : null
      return pos ? { y: pos.y + pos.height + 4, isVertical: false } : null
    }
  })()

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor,
        background: 'rgba(8,8,16,1)',
      }}
      onMouseDown={handleCanvasMouseDown}
      onWheel={layout.handleWheel}
      onMouseEnter={() => layout.setIsHovered(true)}
      onMouseLeave={() => layout.setIsHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const menuW = 180
        const menuH = 200
        const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX
        const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY
        setCanvasCtxMenu({ x, y })
      }}
    >
      {/* Canvas header strip — workflow name (inline-editable) + description */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 12,
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          pointerEvents: 'none',
        }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, pointerEvents: 'all' }}>
          {/* Workflow name — inline-editable on double-click */}
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.82)', lineHeight: 1.2 }}>
            {editingName ? (
              <input
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={() => {
                  if (nameValue.trim() && workflow && nameValue !== workflow.name) {
                    onWorkflowUpdate?.({ ...workflow, name: nameValue.trim(), updatedAt: Date.now() })
                  }
                  setEditingName(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') { setNameValue(workflow?.name ?? ''); setEditingName(false) }
                }}
                autoFocus
                style={{
                  fontSize: 14, fontWeight: 700,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid #6366f1',
                  borderRadius: 4,
                  color: 'rgba(255,255,255,0.82)',
                  padding: '2px 6px',
                  outline: 'none',
                  width: 200,
                }}
              />
            ) : (
              <span
                onDoubleClick={() => { setEditingName(true); setNameValue(workflow?.name ?? '') }}
                title={t('workflow.doubleClickToEdit')}
                style={{ cursor: 'text', userSelect: 'none' }}
              >
                {workflow?.name}
              </span>
            )}
          </div>
          {/* Workflow description */}
          {workflow?.description && (
            <div style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 300,
              opacity: 0.75,
              marginTop: 1,
            }}>
              {workflow.description}
            </div>
          )}
        </div>
      </div>

      {/* Selected node info strip */}
      {selectedStep && selectedStepIndex >= 0 && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px 3px 8px',
            background: 'rgba(15,15,25,0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            pointerEvents: 'none',
            animation: 'workflow-done-in 0.15s ease-out',
          }}
        >
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.45)',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '1px 5px',
          }}>
            {String(selectedStepIndex + 1).padStart(2, '0')}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.82)',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {selectedStep.title}
          </span>
          {selectedStepStatus && selectedStepStatus !== 'idle' && (
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              color: selectedStepStatus === 'completed' ? '#22c55e'
                : selectedStepStatus === 'running' ? '#6366f1'
                : selectedStepStatus === 'error' ? '#f87171'
                : 'rgba(255,255,255,0.45)',
              background: selectedStepStatus === 'completed' ? 'rgba(34,197,94,0.1)'
                : selectedStepStatus === 'running' ? 'rgba(99,102,241,0.12)'
                : selectedStepStatus === 'error' ? 'rgba(239,68,68,0.1)'
                : 'rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '1px 6px',
              textTransform: 'capitalize',
            }}>
              {selectedStepStatus}
            </span>
          )}
        </div>
      )}

      {/* Find node overlay — triggered by Ctrl+F */}
      {findOpen && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 12,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(10,10,20,0.9)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            padding: '5px 8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            minWidth: 220,
            animation: 'slideUp 0.15s ease',
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>🔍</span>
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={e => setFindQuery(e.target.value)}
            placeholder="Find step..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.82)',
              fontSize: 12,
              flex: 1,
              minWidth: 0,
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') { setFindOpen(false); setFindQuery('') }
              if (e.key === 'Enter' && findMatches.length > 0) {
                layout.autoPanToNode(findMatches[0].step.id)
              }
            }}
          />
          {findQuery && (
            <span style={{ fontSize: 10, color: findMatches.length > 0 ? '#22c55e' : '#f87171', flexShrink: 0, fontWeight: 600 }}>
              {findMatches.length}
            </span>
          )}
          <button
            onClick={() => { setFindOpen(false); setFindQuery('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 2, fontSize: 14, lineHeight: 1, borderRadius: 4, transition: 'all 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.82)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'none' }}
          >×</button>
        </div>
      )}

      {/* Execution shimmer progress bar */}
      {execution.isRunning && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          zIndex: 20,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)',
            backgroundSize: '200% 100%',
            animation: 'canvas-progress-shimmer 1.8s ease-in-out infinite',
            width: execution.activeStepIndex >= 0 && totalSteps > 0
              ? `${Math.round(((execution.activeStepIndex) / totalSteps) * 100)}%`
              : '30%',
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}

      {/* Execution progress bar */}
      <CanvasProgressBar
        completedCount={execution.completedCount}
        totalSteps={execution.totalSteps}
        isRunning={execution.isRunning}
        startedAt={executionStartRef.current}
        hasError={execution.hasError && !execution.isRunning}
      />

      {/* 30s active step banner during execution */}
      {activeStepBanner && execution.isRunning && (
        <div style={{
          position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, pointerEvents: 'none',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 10, padding: '5px 16px',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          fontSize: 11, color: 'rgba(255,255,255,0.82)',
          whiteSpace: 'nowrap', maxWidth: '60%',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {activeStepBanner}
          {streamingContent && (
            <span style={{ opacity: 0.65, marginLeft: 8, fontSize: 10 }}>
              — {streamingContent}
            </span>
          )}
          {execution.activeStepIndex >= 0 && (
            <span style={{
              marginLeft: 10,
              fontSize: 10,
              fontWeight: 700,
              color: '#6366f1',
              background: 'rgba(99,102,241,0.12)',
              borderRadius: 20,
              padding: '1px 8px',
              flexShrink: 0,
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}>
              {execution.activeStepIndex + 1} / {execution.totalSteps}
            </span>
          )}
          {execution.isRunning && streamingWps !== null && streamingWps > 0 && (
            <span style={{
              fontSize: 10,
              color: 'rgba(99,102,241,0.8)',
              background: 'rgba(99,102,241,0.08)',
              borderRadius: 8,
              padding: '1px 7px',
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {streamingWps} w/s
            </span>
          )}
        </div>
      )}

      {/* Enhancement 2: Workflow completion summary toast */}
      {completionSummary?.visible && (
        <div style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          background: 'rgba(34,197,94,0.15)',
          border: '1px solid rgba(34,197,94,0.4)',
          borderRadius: 10,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(34,197,94,0.2)',
          animation: 'workflow-done-in 0.15s ease-out',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 18 }}>✓</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
              {t('workflow.canvasComplete')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
              {completionSummary.stepCount} {t('workflow.stepsLabel')} completed
            </div>
          </div>
        </div>
      )}

      {/* Dot grid background — moves with pan/zoom */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <defs>
          <pattern
            id="canvas-dot-grid"
            x={layout.panX % (20 * layout.zoom)}
            y={layout.panY % (20 * layout.zoom)}
            width={20 * layout.zoom}
            height={20 * layout.zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={20 * layout.zoom / 2}
              cy={20 * layout.zoom / 2}
              r={Math.max(0.5, layout.zoom * 0.7)}
              fill="rgba(255,255,255,0.06)"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-dot-grid)" />
      </svg>
      {/* Radial gradient overlay — subtle purple glow at canvas center */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(99,102,241,0.04) 0%, transparent 65%)',
      }} />

      {/* B8: Empty canvas guide — shown when workflow has no steps */}
      {workflow.steps.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'none',
            userSelect: 'none',
            animation: 'canvas-empty-pulse 3s ease-in-out infinite',
          }}
        >
          {/* Dashed circle with + */}
          <div style={{
            background: 'rgba(99,102,241,0.08)',
            borderRadius: 20,
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width={60} height={60}>
              <circle
                cx={30}
                cy={30}
                r={26}
                fill="none"
                stroke="rgba(99,102,241,0.4)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <text
                x={30}
                y={39}
                textAnchor="middle"
                fontSize={22}
                fill="rgba(99,102,241,0.6)"
                fontWeight={300}
              >+</text>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.82)', textAlign: 'center' }}>
            {t('workflow.emptyState')}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', letterSpacing: '0.01em' }}>
            {t('workflow.canvasAddStepHint')}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', opacity: 0.5, letterSpacing: '0.01em', textAlign: 'center' }}>
            {t('workflow.canvasRightClickHint')}
          </div>
        </div>
      )}

      {/* Canvas toolbar */}
      <CanvasToolbar
        zoomPercent={zoomPercent}
        offsetTop={execution.isRunning || execution.completedCount > 0}
        fitToViewLabel={t('workflow.fitToView')}
        showMinimap={layout.showMinimap}
        onFitToView={layout.fitToView}
        onZoomIn={layout.zoomIn}
        onZoomOut={layout.zoomOut}
        onCollapseAll={layout.handleCollapseAll}
        onExpandAll={layout.handleExpandAll}
        onToggleMinimap={() => layout.setShowMinimap(v => !v)}
        isRunning={execution.isRunning}
        allDone={execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && !execution.isRunning}
        hasError={execution.hasError && !execution.isRunning}
        onAbort={abort ? () => abort() : undefined}
        onRerun={onRerun}
        onRun={onRun}
        layoutDirection={layout.layoutDirection}
        onToggleLayout={layout.toggleLayoutDirection}
        onExport={handleExport}
        onImport={handleImport}
        onExportScript={handleExportScript}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearOutputs={clearQueue}
        completedCount={execution.completedCount}
        stepCount={workflow?.steps.length ?? 0}
      />

      {searchMatchCount !== null && (
        <div style={{
          position: 'absolute',
          top: (execution.isRunning || execution.completedCount > 0) ? 28 : 8,
          left: 158,  // 搜索框宽度约 150px + 8px offset
          zIndex: 11,
          fontSize: 10,
          color: searchMatchCount > 0 ? '#6366f1' : 'rgba(255,255,255,0.45)',
          background: searchMatchCount > 0
            ? 'rgba(99,102,241,0.12)'
            : 'rgba(255,255,255,0.07)',
          borderRadius: 20,
          padding: '2px 8px',
          pointerEvents: 'none',
          transition: 'top 0.15s ease',
          fontWeight: 600,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {searchMatchCount}
        </div>
      )}

      {/* Space-key hint */}
      {layout.spaceDown && !layout.isPanning && (
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(0,0,0,0.6)', borderRadius: 6,
          padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.65)',
          letterSpacing: '0.01em',
        }}>
          {t('workflow.holdDragToPan')}
        </div>
      )}

      {/* Enhancement 1: Snap hint — shown during reorder drag */}
      {isDragging && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
          background: 'rgba(20,20,20,0.8)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          borderRadius: 6,
          padding: '3px 10px',
          border: '1px solid rgba(255,255,255,0.08)',
          pointerEvents: 'none',
          zIndex: 15,
        }}>
          Shift to disable snap · {t('canvas.dragToReorder')}
        </div>
      )}

      {/* Multi-select hint */}
      {layout.selectedNodes.size > 1 && (
        <div style={{
          position: 'absolute', top: execution.isRunning || execution.completedCount > 0 ? 60 : 40,
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 4,
          padding: '2px 10px', fontSize: 9, color: '#6366f1',
        }}>
          {layout.selectedNodes.size} {t('workflow.nodesSelected')}
        </div>
      )}

      {/* SVG edge layer — pointerEvents: none on SVG allows children to override */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <g style={{ transform: `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`, transformOrigin: '0 0', transition: layout.smoothTransition ? 'transform 0.15s ease-out' : 'none' }}>
          <CanvasEdgeDefs />
          {workflow.steps.map((step, idx) => {
            if (idx === 0) return null
            const prevStep = workflow.steps[idx - 1]
            const fromPos = layout.nodePositions[prevStep.id]
            const toPos = layout.nodePositions[step.id]
            if (!fromPos || !toPos) return null
            // Direction 8: skip edge if both endpoints are outside viewport
            if (!isInViewport(fromPos, viewLeft, viewTop, viewRight, viewBottom) && !isInViewport(toPos, viewLeft, viewTop, viewRight, viewBottom)) return null
            const srcStatus = execution.stepStatuses[prevStep.id] ?? 'idle'
            const edgeStatus = srcStatus === 'completed' ? 'done' : srcStatus === 'running' ? 'active' : 'idle'
            const edgeKey = `${prevStep.id}:${step.id}`
            // D8: highlight edge if hovered, and nodes connected to hovered edge
            const isHighlighted = hoveredEdgeKey === edgeKey
            return (
              <CanvasEdge
                key={`edge-${prevStep.id}-${step.id}`}
                from={fromPos}
                to={toPos}
                status={edgeStatus}
                layoutDirection={layout.layoutDirection}
                onHoverChange={(hovered) => setHoveredEdgeKey(hovered ? edgeKey : null)}
                highlighted={isHighlighted}
                // Direction 4: insert step between two existing steps
                onAddBetween={onInsertBetween ? () => {
                  onInsertBetween(prevStep.id, step.id)
                } : undefined}
                // Direction 4: pass output length and duration from previous step
                outputLength={execution.stepOutputs[prevStep.id]?.length}
                durationMs={execution.stepDurations[prevStep.id]}
                sourceStepIndex={idx - 1}
                targetStepIndex={idx}
                label={prevStep.condition ? `if: ${prevStep.condition.slice(0, 20)}` : undefined}
              />
            )
          })}
        </g>
      </svg>

      {/* Node layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          transform: `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`,
          transformOrigin: '0 0',
          transition: layout.smoothTransition ? 'transform 0.15s ease-out' : 'none',
        }}
      >
        {workflow.steps.map((step, idx) => {
          const pos = layout.nodePositions[step.id]
          if (!pos) return null
          // Direction 8: render lightweight placeholder for off-screen nodes
          if (!isInViewport(pos, viewLeft, viewTop, viewRight, viewBottom)) {
            return (
              <div
                key={step.id}
                style={{ position: 'absolute', left: pos.x, top: pos.y, width: pos.width, height: pos.height }}
              />
            )
          }
          const stepStatus = execution.stepStatuses[step.id] ?? 'idle'
          return (
            <div
              key={step.id}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: pos.width,
                animation: 'canvas-node-fadein 0.15s ease',
                animationFillMode: 'both',
              }}
            >
            <CanvasNode
              step={step}
              index={idx}
              x={0}
              y={0}
              width={pos.width}
              selected={selectedNode === step.id}
              multiSelected={layout.selectedNodes.has(step.id)}
              status={stepStatus}
              presetKey={workflow.presetKey}
              collapsed={layout.collapsedNodes.has(step.id)}
              outputText={historyStepOutputs ? (historyStepOutputs[step.id] ?? execution.stepOutputs[step.id]) : execution.stepOutputs[step.id]}
              dimmed={
                (effectiveHighlightStepIds !== null && effectiveHighlightStepIds !== undefined && !effectiveHighlightStepIds.has(step.id)) ||
                (reorderDrag !== null && reorderDrag.stepId === step.id)
              }
              highlighted={
                searchQuery.trim().length > 0 &&
                effectiveHighlightStepIds !== null &&
                effectiveHighlightStepIds !== undefined &&
                effectiveHighlightStepIds.has(step.id)
              }
              durationMs={historyStepDurations ? (historyStepDurations[step.id] ?? execution.stepDurations[step.id]) : execution.stepDurations[step.id]}
              isFirst={idx === 0}
              isLast={idx === workflow.steps.length - 1}
              // D4: keyboard focus visual ring
              focused={layout.focusedNodeId === step.id}
              // D2: streaming text on running node
              streamingText={execution.isRunning && stepStatus === 'running' ? streamingContent : undefined}
              // D5: live elapsed timer
              liveElapsedMs={liveElapsedMs[step.id]}
              stepIndex={idx}
              onSelect={handleNodeSelect}
              onDragStart={(stepId, e) => {
                // Direction F: if this node is part of multi-selection, drag all
                if (layout.selectedNodes.size > 1 && layout.selectedNodes.has(stepId)) {
                  layout.handleMultiNodeDragStart(layout.selectedNodes, e)
                } else {
                  layout.handleNodeDragStart(stepId, e)
                }
              }}
              onToggleCollapse={layout.handleToggleCollapse}
              onTitleChange={handleTitleChange}
              onPromptChange={onStepUpdate ? handlePromptChange : undefined}
              onMultiSelect={(id, shiftKey) => layout.selectNode(id, shiftKey)}
              // D6: drag to reorder
              onReorderDragStart={onStepReorder ? (stepId, e) => {
                e.stopPropagation()
                setReorderDrag({ stepId, insertAfterIndex: -1 })
              } : undefined}
              onDeleteNode={onDeleteSteps ? (stepId) => onDeleteSteps([stepId]) : undefined}
              onInsertBefore={onInsertBetween && idx > 0 ? (stepId) => {
                const prevStep = workflow.steps[idx - 1]
                onInsertBetween(prevStep.id, stepId)
              } : undefined}
              onInsertAfter={onInsertBetween && idx < workflow.steps.length - 1 ? (stepId) => {
                const nextStep = workflow.steps[idx + 1]
                onInsertBetween(stepId, nextStep.id)
              } : undefined}
              onRetry={onRetryStep ? (stepId) => onRetryStep(stepId) : undefined}
              onRetryStep={onRetryStep && execution.stepStatuses[step.id] === 'error' && !execution.isRunning ? () => onRetryStep(step.id) : undefined}
              onRunFromStep={!execution.isRunning ? () => handleRunFromStep(idx) : undefined}
              onHeightChange={layout.updateNodeHeight}
              onDuplicate={onWorkflowUpdate ? (stepId) => {
                const srcIdx = workflow.steps.findIndex(s => s.id === stepId)
                if (srcIdx === -1) return
                const src = workflow.steps[srcIdx]
                const dup = {
                  ...src,
                  id: Date.now().toString(),
                  title: src.title + ' (copy)',
                  canvasPos: src.canvasPos
                    ? { x: src.canvasPos.x + 40, y: src.canvasPos.y + 40 }
                    : undefined,
                }
                const newSteps = [
                  ...workflow.steps.slice(0, srcIdx + 1),
                  dup,
                  ...workflow.steps.slice(srcIdx + 1),
                ]
                onWorkflowUpdate({ ...workflow, steps: newSteps, updatedAt: Date.now() })
              } : undefined}
              onMoveUp={idx > 0 && onWorkflowUpdate ? () => {
                const steps = [...workflow.steps]
                ;[steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]]
                onWorkflowUpdate({ ...workflow, steps })
              } : undefined}
              onMoveDown={idx < workflow.steps.length - 1 && onWorkflowUpdate ? () => {
                const steps = [...workflow.steps]
                ;[steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]]
                onWorkflowUpdate({ ...workflow, steps })
              } : undefined}
            />
            </div>
          )
        })}

        {/* D6: Reorder insertion indicator line */}
        {reorderDrag && reorderInsertLine && (
          <div
            style={{
              position: 'absolute',
              ...(reorderInsertLine.isVertical
                ? { top: -6, height: NODE_MIN_HEIGHT + 12, left: (reorderInsertLine as any).x, width: 2 }
                : { left: -6, width: NODE_WIDTH + 12, top: (reorderInsertLine as any).y, height: 2 }),
              background: '#6366f1',
              borderRadius: 1,
              pointerEvents: 'none',
              boxShadow: '0 0 6px rgba(99,102,241,0.6)',
              zIndex: 10,
            }}
          />
        )}

        {/* Insert-between zones — "+" button that appears between consecutive steps */}
        {!execution.isRunning && onInsertBetween && workflow.steps.map((step, idx) => {
          if (idx >= workflow.steps.length - 1) return null
          const thisPos = layout.nodePositions[step.id]
          const nextPos = layout.nodePositions[workflow.steps[idx + 1].id]
          if (!thisPos || !nextPos) return null

          const isHoriz = layout.layoutDirection === 'horizontal'
          const midX = isHoriz
            ? thisPos.x + thisPos.width + (nextPos.x - thisPos.x - thisPos.width) / 2
            : thisPos.x + thisPos.width / 2
          const midY = isHoriz
            ? thisPos.y + thisPos.height / 2
            : thisPos.y + thisPos.height + (nextPos.y - thisPos.y - thisPos.height) / 2

          const isHovered = hoveredGap === idx
          return (
            <div
              key={`gap-${idx}`}
              onMouseEnter={() => setHoveredGap(idx)}
              onMouseLeave={() => setHoveredGap(null)}
              onClick={e => {
                e.stopPropagation()
                handleInsertStep(idx + 1)
                setHoveredGap(null)
              }}
              style={{
                position: 'absolute',
                left: midX - 14,
                top: midY - 14,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isHovered ? '#6366f1' : 'rgba(99,102,241,0.12)',
                border: `2px solid ${isHovered ? '#6366f1' : 'rgba(99,102,241,0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 5,
                transition: 'all 0.15s ease',
                opacity: isHovered ? 1 : 0.4,
                color: isHovered ? 'rgba(255,255,255,0.95)' : '#6366f1',
                fontSize: 18,
                fontWeight: 300,
                lineHeight: 1,
                boxShadow: isHovered ? '0 2px 12px rgba(99,102,241,0.4)' : 'none',
                userSelect: 'none',
              }}
              title={t('workflow.addStep')}
            >
              +
            </div>
          )
        })}
      </div>

      {/* D1: Marquee selection rectangle overlay */}
      {layout.marqueeRect && (() => {
        const { x1, y1, x2, y2 } = layout.marqueeRect
        const screenX = Math.min(x1, x2) * layout.zoom + layout.panX
        const screenY = Math.min(y1, y2) * layout.zoom + layout.panY
        const screenW = Math.abs(x2 - x1) * layout.zoom
        const screenH = Math.abs(y2 - y1) * layout.zoom
        return (
          <div
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              width: screenW,
              height: screenH,
              border: '1px solid rgba(99,102,241,0.6)',
              background: 'rgba(99,102,241,0.08)',
              pointerEvents: 'none',
              zIndex: 15,
              borderRadius: 2,
            }}
          />
        )
      })()}

      {/* Minimap */}
      {layout.showMinimap && (
        <Minimap
          nodePositions={layout.nodePositions}
          stepIds={workflow.steps.map(s => s.id)}
          stepStatuses={execution.stepStatuses}
          panX={layout.panX}
          panY={layout.panY}
          zoom={layout.zoom}
          containerW={layout.containerSize.w}
          containerH={layout.containerSize.h}
          onClickNode={handleMinimapClickNode}
          onViewportDrag={(newPanX, newPanY) => {
            layout.setPanX(newPanX)
            layout.setPanY(newPanY)
          }}
        />
      )}


      {/* Direction 6: History replay panel — bottom left */}
      <div
        style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 15 }}
        onClick={e => e.stopPropagation()}
      >
        <WorkflowRunHistory
          runs={runs}
          selectedRunId={selectedRunId}
          onSelect={setSelectedRunId}
          onClear={clearHistory}
        />
      </div>

      {/* Bottom-left info chip — node count */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
          background: 'rgba(20,20,20,0.7)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          borderRadius: 5,
          padding: '2px 8px',
          border: '1px solid rgba(255,255,255,0.08)',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {workflow?.steps.length ?? 0} {t('workflow.stepsLabel')}
        </span>
      </div>

      {/* Canvas context menu */}
      {canvasCtxMenu && (
        <div
          style={{
            position: 'fixed',
            left: canvasCtxMenu.x,
            top: canvasCtxMenu.y,
            zIndex: 1000,
            background: 'rgba(15,15,25,0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            minWidth: 168,
            padding: '4px 0',
            userSelect: 'none',
            animation: 'slideUp 0.15s ease',
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: t('workflow.fitToView'), icon: <Maximize2 size={11} />, action: layout.fitToView },
            { label: t('workflow.collapseAll'), icon: <Minimize2 size={11} />, action: layout.handleCollapseAll },
            { label: t('workflow.expandAll'), icon: <ChevronsUpDown size={11} />, action: layout.handleExpandAll },
            { label: layout.layoutDirection === 'vertical' ? t('workflow.horizontalLayout') : t('workflow.verticalLayout'), icon: <LayoutGrid size={11} />, action: layout.toggleLayoutDirection },
            { label: t('workflow.exportJSON'), icon: <Download size={11} />, action: handleExport },
            { label: t('workflow.exportScript'), icon: <Download size={11} />, action: handleExportScript },
          ].map(({ label, icon, action }) => (
            <div
              key={label}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                fontSize: 12,
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.82)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onMouseDown={() => {
                action()
                setCanvasCtxMenu(null)
              }}
            >
              <span style={{ opacity: 0.6, display: 'flex' }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Execution timeline strip — shown when execution has results */}
      {copyToast && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          background: 'rgba(34,197,94,0.9)',
          color: 'rgba(255,255,255,0.95)',
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 6,
          padding: '5px 14px',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
          animation: 'canvas-toast-in 0.15s ease-out',
        }}>
          Workflow copied to clipboard ✓
        </div>
      )}

      {/* Execution summary card */}
      {(execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && !execution.isRunning || execution.hasError && !execution.isRunning) && execution.completedCount > 0 && workflow && (
        <div
          style={{
            position: 'absolute',
            bottom: summaryCollapsed ? 32 : 32,
            left: 12,
            zIndex: 11,
            background: 'rgba(15,15,25,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${execution.hasError && !execution.isRunning ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 12,
            minWidth: 180,
            maxWidth: 240,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            animation: 'canvas-toast-in 0.15s ease-out',
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 10px',
              cursor: 'pointer',
              borderBottom: summaryCollapsed ? 'none' : '1px solid rgba(255,255,255,0.07)',
            }}
            onClick={() => setSummaryCollapsed(p => !p)}
          >
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: execution.hasError && !execution.isRunning ? '#f87171' : '#22c55e',
              flexShrink: 0,
              boxShadow: `0 0 6px ${execution.hasError && !execution.isRunning ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'}`,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.82)', flex: 1 }}>
              {execution.hasError && !execution.isRunning ? 'Finished with errors' : 'Completed'}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', opacity: 0.6 }}>
              {summaryCollapsed ? '▲' : '▼'}
            </span>
          </div>
          {/* Stats */}
          {!summaryCollapsed && (
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { label: 'Steps', value: `${execution.completedCount} / ${execution.totalSteps}` },
                { label: 'Time', value: totalDurationMs < 1000 ? `${totalDurationMs}ms` : `${(totalDurationMs / 1000).toFixed(1)}s` },
                { label: 'Output', value: `~${totalOutputWords}w` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.82)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(execution.isRunning || execution.completedCount > 0) && workflow && workflow.steps.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 24,
            zIndex: 12,
            display: 'flex',
            alignItems: 'stretch',
            gap: 2,
            padding: '3px 8px',
            background: 'rgba(10,10,15,0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            boxSizing: 'border-box',
          }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          {workflow.steps.map((step, idx) => {
            const st = execution.stepStatuses[step.id] ?? 'idle'
            const dur = execution.stepDurations[step.id]
            const bg = st === 'completed' ? '#22c55e'
              : st === 'running' ? '#6366f1'
              : st === 'error' ? '#f87171'
              : st === 'pending' ? 'rgba(255,255,255,0.12)'
              : 'rgba(255,255,255,0.06)'
            const title = `Step ${idx + 1}: ${step.title}${dur ? ` (${dur < 1000 ? dur + 'ms' : (dur/1000).toFixed(1) + 's'})` : ''}`
            return (
              <div
                key={step.id}
                title={title}
                onClick={() => layout.autoPanToNode(step.id)}
                style={{
                  flex: 1,
                  borderRadius: 3,
                  background: bg,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, transform 0.15s',
                  position: 'relative',
                  overflow: 'hidden',
                  minWidth: 4,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scaleY(1.3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scaleY(1)' }}
              >
                {st === 'running' && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    backgroundSize: '200% 100%',
                    animation: 'canvas-bar-shimmer 1.2s ease-in-out infinite',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Zoom level badge — bottom-center, above timeline strip */}
      <div
        onDoubleClick={(e) => { e.stopPropagation(); layout.fitToView() }}
        title="Double-click to fit to view"
        style={{
          position: 'absolute',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: '2px 8px',
          fontSize: 9,
          color: 'rgba(255,255,255,0.45)',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          pointerEvents: 'auto',
          userSelect: 'none',
          letterSpacing: '0.05em',
          zIndex: 11,
          cursor: 'default',
        }}
      >
        {zoomPercent}%
      </div>

      {/* CSS animations for execution states */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes canvas-node-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.5), 0 4px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(99,102,241,0), 0 4px 20px rgba(0,0,0,0.3); }
        }
        @keyframes canvas-spinner {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes canvas-sidebar-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes canvas-edge-flow {
          from { stroke-dashoffset: 18; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes canvas-shimmer {
          0%, 100% { left: -60%; width: 40%; }
          50% { left: 120%; width: 40%; }
        }
        @keyframes canvas-bar-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @keyframes canvas-progress-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
        @keyframes canvas-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes canvas-node-fadein {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes canvas-empty-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.5; }
        }
        @keyframes sc-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes canvas-node-complete {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.7), 0 4px 16px rgba(0,0,0,0.25); }
          60%  { box-shadow: 0 0 0 10px rgba(34,197,94,0), 0 4px 16px rgba(0,0,0,0.25); }
          100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.15), 0 4px 16px rgba(0,0,0,0.25); }
        }
        @keyframes canvas-progress-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes workflow-done-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes canvas-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
