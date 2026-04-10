import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Workflow as WorkflowIcon } from 'lucide-react'
import { Workflow } from '../../types/app.types'
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
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        overflow: 'hidden',
        width: MINIMAP_W,
        height: MINIMAP_H,
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
            : st === 'running' ? 'var(--accent)'
            : st === 'pending' ? 'rgba(120,120,120,0.4)'
            : 'rgba(100,100,100,0.3)'
          return (
            <rect
              key={id}
              x={(p.x - minX + pad) * scale}
              y={(p.y - minY + pad) * scale}
              width={Math.max(2, p.width * scale)}
              height={Math.max(2, p.height * scale)}
              rx={2}
              fill={fill}
              fillOpacity={0.9}
              style={{ cursor: onClickNode ? 'pointer' : 'default' }}
              onClick={onClickNode ? (e) => { e.stopPropagation(); onClickNode(id) } : undefined}
            />
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

export default function WorkflowCanvas({ workflow, highlightStepIds, onRetryStep, onRerun, onStepUpdate, onStepReorder, onImportSteps, onInsertBetween, onDeleteSteps }: WorkflowCanvasProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const execution = useWorkflowExecution(workflow)
  // Direction 9: get abort from chat store
  const abort = useChatStore(s => s.abort)

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

  // Direction 5: delete nodes callback (passed to useCanvasLayout as 4th param)
  const handleDeleteNodes = useCallback((ids: string[]) => {
    onDeleteSteps?.(ids)
  }, [onDeleteSteps])

  // Layout hook (pan, zoom, node positions, drag, collapse, minimap, Space key)
  const layout = useCanvasLayout(workflow, containerRef, undefined, handleDeleteNodes)

  // Direction 6: execution history
  const { runs, saveRun, clearHistory } = useWorkflowHistory(workflow?.id ?? null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

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

  // Direction 6: resolve historical data for display
  const selectedRun = selectedRunId ? runs.find(r => r.runId === selectedRunId) : null
  const historyStepOutputs = selectedRun ? selectedRun.stepOutputs : null
  const historyStepDurations = selectedRun ? selectedRun.stepDurations : null

  // Selected node
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // D5: canvas right-click context menu
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number } | null>(null)

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

  // 30s periodic agent summary during execution
  const [agentSummary, setAgentSummary] = useState<string | null>(null)
  const summaryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSummaryStepRef = useRef<string | null>(null)

  useEffect(() => {
    const isRunning = execution.isRunning
    if (!isRunning || !workflow) {
      if (summaryIntervalRef.current) {
        clearInterval(summaryIntervalRef.current)
        summaryIntervalRef.current = null
      }
      if (!isRunning) setAgentSummary(null)
      return
    }

    const generateSummary = () => {
      const activeIdx = execution.activeStepIndex
      const activeStep = activeIdx >= 0 ? workflow.steps[activeIdx] : null
      if (!activeStep) return
      if (activeStep.id === lastSummaryStepRef.current) return
      lastSummaryStepRef.current = activeStep.id

      const completedOutputs = workflow.steps
        .filter((_, i) => i < activeIdx)
        .map(s => `Step "${s.title}": ${(execution.stepOutputs[s.id] || '').slice(0, 200)}`)
        .join('\n')

      const summaryText = `Running "${activeStep.title}"${completedOutputs ? ` — ${workflow.steps.filter((_, i) => i < activeIdx).length} steps done` : ''}`
      setAgentSummary(summaryText)
    }

    generateSummary()
    summaryIntervalRef.current = setInterval(generateSummary, 30_000)

    return () => {
      if (summaryIntervalRef.current) clearInterval(summaryIntervalRef.current)
    }
  }, [execution.isRunning, execution.activeStepIndex, workflow, execution.stepOutputs])

  // Reset selection when workflow changes
  useEffect(() => {
    setSelectedNode(null)
    setSelectedRunId(null)
    setReorderDrag(null)
    setHoveredEdgeKey(null)
    setSearchQuery('')
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

  // Direction 13: compute effective highlight IDs (search takes priority over external prop)
  const effectiveHighlightStepIds: Set<string> | null | undefined = (() => {
    if (searchQuery && workflow) {
      const matched = workflow.steps
        .filter(s => s.title.includes(searchQuery) || s.prompt.includes(searchQuery))
        .map(s => s.id)
      return new Set(matched)
    }
    return highlightStepIds
  })()

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
        color: 'var(--text-muted)',
        gap: 6,
      }}>
        <WorkflowIcon size={20} style={{ opacity: 0.25 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.55, letterSpacing: '0.01em' }}>{t('workflow.canvasEmpty')}</span>
      </div>
    )
  }

  const zoomPercent = Math.round(layout.zoom * 100)

  // Direction 8: viewport culling helpers
  const viewLeft = -layout.panX / layout.zoom
  const viewTop = -layout.panY / layout.zoom
  const viewRight = viewLeft + layout.containerSize.w / layout.zoom
  const viewBottom = viewTop + layout.containerSize.h / layout.zoom
  const CULL_MARGIN = 100

  function isInViewport(pos: { x: number; y: number; width: number; height: number }) {
    return (
      pos.x + pos.width > viewLeft - CULL_MARGIN &&
      pos.x < viewRight + CULL_MARGIN &&
      pos.y + pos.height > viewTop - CULL_MARGIN &&
      pos.y < viewBottom + CULL_MARGIN
    )
  }

  const showRerunOrError = (execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && !execution.isRunning) || (execution.hasError && !execution.isRunning)

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
        background: 'var(--bg-main)',
      }}
      onMouseDown={handleCanvasMouseDown}
      onWheel={layout.handleWheel}
      onMouseEnter={() => layout.setIsHovered(true)}
      onMouseLeave={() => layout.setIsHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setCanvasCtxMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* Execution progress bar */}
      <CanvasProgressBar
        completedCount={execution.completedCount}
        totalSteps={execution.totalSteps}
        isRunning={execution.isRunning}
        startedAt={executionStartRef.current}
        hasError={execution.hasError && !execution.isRunning}
      />

      {/* 30s agent summary banner during execution */}
      {agentSummary && execution.isRunning && (
        <div style={{
          position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, pointerEvents: 'none',
          background: 'rgba(var(--accent-rgb,59,130,246),0.1)',
          border: '1px solid rgba(var(--accent-rgb,59,130,246),0.3)',
          borderRadius: 10, padding: '5px 16px',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          fontSize: 11, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', maxWidth: '60%',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {agentSummary}
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
            x={layout.panX % (24 * layout.zoom)}
            y={layout.panY % (24 * layout.zoom)}
            width={24 * layout.zoom}
            height={24 * layout.zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={24 * layout.zoom / 2}
              cy={24 * layout.zoom / 2}
              r={Math.max(0.8, layout.zoom)}
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
          <svg width={90} height={90}>
            <circle
              cx={45}
              cy={45}
              r={40}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text
              x={45}
              y={54}
              textAnchor="middle"
              fontSize={28}
              fill="var(--text-muted)"
              fontWeight={300}
            >+</text>
          </svg>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', opacity: 0.6, letterSpacing: '0.01em' }}>
            {t('workflow.emptyState')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.4, letterSpacing: '0.01em' }}>
            {t('workflow.canvasAddStepHint')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.3, letterSpacing: '0.01em' }}>
            or right-click the canvas
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
        layoutDirection={layout.layoutDirection}
        onToggleLayout={layout.toggleLayoutDirection}
        onExport={handleExport}
        onImport={handleImport}
        onExportScript={handleExportScript}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Space-key hint */}
      {layout.spaceDown && !layout.isPanning && (
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(0,0,0,0.6)', borderRadius: 6,
          padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.65)',
          letterSpacing: '0.01em',
        }}>
          Hold & drag to pan
        </div>
      )}

      {/* Multi-select hint */}
      {layout.selectedNodes.size > 1 && (
        <div style={{
          position: 'absolute', top: execution.isRunning || execution.completedCount > 0 ? 60 : 40,
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(var(--accent-rgb,59,130,246),0.12)',
          border: '1px solid rgba(var(--accent-rgb,59,130,246),0.3)',
          borderRadius: 4,
          padding: '2px 10px', fontSize: 9, color: 'var(--accent)',
        }}>
          {layout.selectedNodes.size} nodes selected · drag to move
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
        <g style={{ transform: `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`, transformOrigin: '0 0', transition: layout.smoothTransition ? 'transform 0.3s ease-out' : 'none' }}>
          <CanvasEdgeDefs />
          {workflow.steps.map((step, idx) => {
            if (idx === 0) return null
            const prevStep = workflow.steps[idx - 1]
            const fromPos = layout.nodePositions[prevStep.id]
            const toPos = layout.nodePositions[step.id]
            if (!fromPos || !toPos) return null
            // Direction 8: skip edge if both endpoints are outside viewport
            if (!isInViewport(fromPos) && !isInViewport(toPos)) return null
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
          transition: layout.smoothTransition ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {workflow.steps.map((step, idx) => {
          const pos = layout.nodePositions[step.id]
          if (!pos) return null
          // Direction 8: render lightweight placeholder for off-screen nodes
          if (!isInViewport(pos)) {
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
                animation: 'canvas-node-fadein 0.2s ease',
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
              durationMs={historyStepDurations ? (historyStepDurations[step.id] ?? execution.stepDurations[step.id]) : execution.stepDurations[step.id]}
              isFirst={idx === 0}
              isLast={idx === workflow.steps.length - 1}
              // D4: keyboard focus visual ring
              focused={layout.focusedNodeId === step.id}
              // D2: streaming text on running node
              streamingText={execution.isRunning && stepStatus === 'running' ? streamingContent : undefined}
              // D5: live elapsed timer
              liveElapsedMs={liveElapsedMs[step.id]}
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
              // TODO: wire up updateNodeHeight via CanvasNode onHeightChange
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
              background: 'var(--accent)',
              borderRadius: 1,
              pointerEvents: 'none',
              boxShadow: '0 0 6px rgba(var(--accent-rgb,59,130,246),0.6)',
              zIndex: 10,
            }}
          />
        )}
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
              border: '1.5px dashed rgba(var(--accent-rgb,59,130,246),0.8)',
              background: 'rgba(var(--accent-rgb,59,130,246),0.06)',
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

      {/* Canvas context menu */}
      {canvasCtxMenu && (
        <div
          style={{
            position: 'fixed',
            left: canvasCtxMenu.x,
            top: canvasCtxMenu.y,
            zIndex: 1000,
            background: 'var(--popup-bg, #1e1e2e)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
            minWidth: 168,
            padding: '4px 0',
            userSelect: 'none',
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: 'Fit to view', action: layout.fitToView },
            { label: 'Collapse all', action: layout.handleCollapseAll },
            { label: 'Expand all', action: layout.handleExpandAll },
            { label: layout.layoutDirection === 'vertical' ? 'Horizontal layout' : 'Vertical layout', action: layout.toggleLayoutDirection },
            { label: 'Export JSON', action: handleExport },
            { label: 'Export Script', action: handleExportScript },
          ].map(({ label, action }) => (
            <div
              key={label}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '7px 12px',
                fontSize: 12,
                cursor: 'pointer',
                color: 'var(--text)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onMouseDown={() => {
                action()
                setCanvasCtxMenu(null)
              }}
            >
              {label}
            </div>
          ))}
        </div>
      )}

      {/* CSS animations for execution states */}
      <style>{`
        @keyframes canvas-node-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb, 59,130,246), 0.5), 0 4px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(var(--accent-rgb, 59,130,246), 0), 0 4px 20px rgba(0,0,0,0.3); }
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
      `}</style>
    </div>
  )
}
