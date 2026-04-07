import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Maximize2, Workflow as WorkflowIcon, ChevronsDownUp, ChevronsUpDown, Map } from 'lucide-react'
import { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import CanvasNode, { NODE_WIDTH, NODE_MIN_HEIGHT, NODE_COLLAPSED_HEIGHT, NODE_GAP_Y } from './CanvasNode'
import CanvasEdge, { CanvasEdgeDefs } from './CanvasEdge'
import CanvasProgressBar from './CanvasProgressBar'
import CanvasNodeSidebar from './CanvasNodeSidebar'
import { useWorkflowExecution } from './useWorkflowExecution'

interface WorkflowCanvasProps {
  workflow: Workflow | null
  highlightStepIds?: Set<string> | null  // null = no filter, Set = show only these
}

interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1

// --- Minimap ---
interface MinimapProps {
  nodePositions: Record<string, NodePosition>
  stepIds: string[]
  stepStatuses: Record<string, string>
  panX: number
  panY: number
  zoom: number
  containerW: number
  containerH: number
}

const MINIMAP_W = 120
const MINIMAP_H = 80

function Minimap({ nodePositions, stepIds, stepStatuses, panX, panY, zoom, containerW, containerH }: MinimapProps) {
  if (stepIds.length === 0) return null

  // Content bounds
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

  // Viewport rect in minimap coords
  const vpX = (-panX / zoom - minX + pad) * scale
  const vpY = (-panY / zoom - minY + pad) * scale
  const vpW = (containerW / zoom) * scale
  const vpH = (containerH / zoom) * scale

  return (
    <div style={{
      position: 'absolute',
      bottom: 36,
      right: 8,
      zIndex: 10,
      background: 'rgba(var(--bg-card-rgb, 30,30,30), 0.85)',
      backdropFilter: 'blur(6px)',
      border: '1px solid var(--border)',
      borderRadius: 5,
      overflow: 'hidden',
      width: MINIMAP_W,
      height: MINIMAP_H,
    }}>
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
            />
          )
        })}
        {/* Viewport indicator */}
        <rect
          x={vpX}
          y={vpY}
          width={Math.max(4, vpW)}
          height={Math.max(4, vpH)}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={0.8}
          rx={1}
        />
      </svg>
    </div>
  )
}

export default function WorkflowCanvas({ workflow, highlightStepIds }: WorkflowCanvasProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const execution = useWorkflowExecution(workflow)

  // Track when execution started for ETA
  const executionStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (execution.isRunning && executionStartRef.current === null) {
      executionStartRef.current = Date.now()
    } else if (!execution.isRunning) {
      executionStartRef.current = null
    }
  }, [execution.isRunning])

  // Pan & zoom state
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)

  // Node positions (custom overrides from dragging)
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({})

  // Selected node (for sidebar)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Sidebar open state
  const [sidebarStepId, setSidebarStepId] = useState<string | null>(null)

  // Panning state
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Space-key temporary pan mode
  const [spaceDown, setSpaceDown] = useState(false)
  const spaceRef = useRef(false)

  // Dragging node state
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 })

  // Smooth transition flag for programmatic moves (fit-to-view, auto-pan)
  const [smoothTransition, setSmoothTransition] = useState(false)

  // Hover state for keyboard shortcut scope
  const [isHovered, setIsHovered] = useState(false)

  // Collapsed nodes (compact mode)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())

  // Minimap visibility
  const [showMinimap, setShowMinimap] = useState(true)

  // Container size for minimap viewport
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({ w: e.contentRect.width, h: e.contentRect.height })
      }
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

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

      const doneCount = workflow.steps.filter((_, i) => i < activeIdx).length
      const summaryText = `Running "${activeStep.name}"${doneCount > 0 ? ` — ${doneCount} step${doneCount > 1 ? 's' : ''} done` : ''}`
      setAgentSummary(summaryText)
    }

    generateSummary()
    summaryIntervalRef.current = setInterval(generateSummary, 30_000)

    return () => {
      if (summaryIntervalRef.current) clearInterval(summaryIntervalRef.current)
    }
  }, [execution.isRunning, execution.activeStepIndex, workflow, execution.stepOutputs])

  const handleToggleCollapse = useCallback((stepId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }, [])

  const handleCollapseAll = useCallback(() => {
    if (!workflow) return
    setCollapsedNodes(new Set(workflow.steps.map(s => s.id)))
  }, [workflow])

  const handleExpandAll = useCallback(() => {
    setCollapsedNodes(new Set())
  }, [])

  // Compute default positions for all nodes (top-to-bottom layout, respects collapsed height)
  const defaultPositions = useMemo(() => {
    if (!workflow) return {}
    const positions: Record<string, NodePosition> = {}
    const startX = 0
    let yOffset = 0
    workflow.steps.forEach((step) => {
      const isCollapsed = collapsedNodes.has(step.id)
      const h = isCollapsed ? NODE_COLLAPSED_HEIGHT : NODE_MIN_HEIGHT
      positions[step.id] = {
        x: startX,
        y: yOffset,
        width: NODE_WIDTH,
        height: h,
      }
      yOffset += h + (NODE_GAP_Y - NODE_MIN_HEIGHT)
    })
    return positions
  }, [workflow, collapsedNodes])

  // Merged positions: default + custom overrides
  const nodePositions = useMemo(() => {
    const merged: Record<string, NodePosition> = {}
    for (const [id, pos] of Object.entries(defaultPositions)) {
      if (customPositions[id]) {
        merged[id] = { ...pos, x: customPositions[id].x, y: customPositions[id].y }
      } else {
        merged[id] = pos
      }
    }
    return merged
  }, [defaultPositions, customPositions])

  // Reset custom positions when workflow changes
  useEffect(() => {
    setCustomPositions({})
    setSelectedNode(null)
    setSidebarStepId(null)
    setZoom(1)
    setPanX(0)
    setPanY(0)
    setCollapsedNodes(new Set())
  }, [workflow?.id])

  // Fit to view
  const fitToView = useCallback(() => {
    if (!workflow || workflow.steps.length === 0 || !containerRef.current) return
    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight

    // Find bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const pos of Object.values(nodePositions)) {
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + pos.width)
      maxY = Math.max(maxY, pos.y + pos.height)
    }

    const contentW = maxX - minX + 60 // padding
    const contentH = maxY - minY + 60
    const scaleX = cw / contentW
    const scaleY = ch / contentH
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY)))

    const newPanX = (cw - contentW * newZoom) / 2 - minX * newZoom + 30 * newZoom
    const newPanY = (ch - contentH * newZoom) / 2 - minY * newZoom + 30 * newZoom

    setSmoothTransition(true)
    setZoom(newZoom)
    setPanX(newPanX)
    setPanY(newPanY)
    setTimeout(() => setSmoothTransition(false), 350)
  }, [workflow, nodePositions])

  // Auto-fit on first render or workflow change
  useEffect(() => {
    if (workflow && workflow.steps.length > 0) {
      const timer = setTimeout(fitToView, 50)
      return () => clearTimeout(timer)
    }
  }, [workflow?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Auto-pan to active node during execution ---
  const prevActiveRef = useRef(-1)
  useEffect(() => {
    if (
      execution.activeStepIndex < 0 ||
      execution.activeStepIndex === prevActiveRef.current ||
      !workflow ||
      !containerRef.current
    ) return

    prevActiveRef.current = execution.activeStepIndex
    const activeStep = workflow.steps[execution.activeStepIndex]
    if (!activeStep) return
    const pos = nodePositions[activeStep.id]
    if (!pos) return

    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight

    const nodeScreenX = pos.x * zoom + panX
    const nodeScreenY = pos.y * zoom + panY
    const margin = 50
    const isVisible =
      nodeScreenX > margin &&
      nodeScreenX + pos.width * zoom < cw - margin &&
      nodeScreenY > margin &&
      nodeScreenY + pos.height * zoom < ch - margin

    if (!isVisible) {
      const newPanX = cw / 2 - (pos.x + pos.width / 2) * zoom
      const newPanY = ch / 2 - (pos.y + pos.height / 2) * zoom
      setSmoothTransition(true)
      setPanX(newPanX)
      setPanY(newPanY)
      setTimeout(() => setSmoothTransition(false), 350)
    }
  }, [execution.activeStepIndex, workflow, nodePositions, zoom, panX, panY])

  // --- Node selection (opens sidebar) ---
  const handleNodeSelect = useCallback((stepId: string) => {
    setSelectedNode(stepId)
    setSidebarStepId(stepId)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarStepId(null)
  }, [])

  // --- Mouse handlers for pan ---
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelectedNode(null)
    setSidebarStepId(null)
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY }
  }, [panX, panY])

  useEffect(() => {
    if (!isPanning) return
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPanX(panStartRef.current.panX + dx)
      setPanY(panStartRef.current.panY + dy)
    }
    const handleUp = () => setIsPanning(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isPanning])

  // --- Mouse handlers for node drag ---
  const handleNodeDragStart = useCallback((stepId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const pos = nodePositions[stepId]
    if (!pos) return
    setDraggingNode(stepId)
    dragStartRef.current = { x: e.clientX, y: e.clientY, nodeX: pos.x, nodeY: pos.y }
  }, [nodePositions])

  useEffect(() => {
    if (!draggingNode) return
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStartRef.current.x) / zoom
      const dy = (e.clientY - dragStartRef.current.y) / zoom
      setCustomPositions(prev => ({
        ...prev,
        [draggingNode]: {
          x: dragStartRef.current.nodeX + dx,
          y: dragStartRef.current.nodeY + dy,
        },
      }))
    }
    const handleUp = () => setDraggingNode(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [draggingNode, zoom])

  // --- Wheel zoom (toward cursor position) — supports trackpad pinch via ctrlKey ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (e.ctrlKey) {
      // Trackpad pinch-to-zoom: deltaY is in pixels, use finer sensitivity
      const sensitivity = 0.005
      const delta = -e.deltaY * sensitivity
      setZoom(prev => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * (1 + delta)))
        setPanX(px => mouseX - (mouseX - px) * (newZoom / prev))
        setPanY(py => mouseY - (mouseY - py) * (newZoom / prev))
        return newZoom
      })
    } else {
      // Mouse wheel or trackpad scroll (pan)
      const scrollSensitivity = e.deltaMode === 0 ? 1 : 20 // pixel vs line mode
      setPanX(px => px - e.deltaX * scrollSensitivity)
      setPanY(py => py - e.deltaY * scrollSensitivity)
    }
  }, [])

  // --- Zoom in/out helpers (zoom toward canvas center) ---
  const zoomIn = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    setZoom(prev => {
      const newZoom = Math.min(MAX_ZOOM, prev + ZOOM_STEP)
      setPanX(px => cx - (cx - px) * (newZoom / prev))
      setPanY(py => cy - (cy - py) * (newZoom / prev))
      return newZoom
    })
  }, [])

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    setZoom(prev => {
      const newZoom = Math.max(MIN_ZOOM, prev - ZOOM_STEP)
      setPanX(px => cx - (cx - px) * (newZoom / prev))
      setPanY(py => cy - (cy - py) * (newZoom / prev))
      return newZoom
    })
  }, [])

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !spaceRef.current) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        spaceRef.current = true
        setSpaceDown(true)
      }
      if (!isHovered) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn() }
      else if (e.key === '-') { e.preventDefault(); zoomOut() }
      else if (e.key === '0') { e.preventDefault(); fitToView() }
      else if (e.key === 'm' || e.key === 'M') { setShowMinimap(v => !v) }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceRef.current = false
        setSpaceDown(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isHovered, zoomIn, zoomOut, fitToView])

  // --- Sidebar step data ---
  const sidebarStep = sidebarStepId && workflow
    ? workflow.steps.find(s => s.id === sidebarStepId) ?? null
    : null
  const sidebarStepIndex = sidebarStepId && workflow
    ? workflow.steps.findIndex(s => s.id === sidebarStepId)
    : -1
  const sidebarStatus = sidebarStepId
    ? execution.stepStatuses[sidebarStepId] ?? 'idle'
    : 'idle'

  // Cursor
  const cursor = spaceDown
    ? (isPanning ? 'grabbing' : 'grab')
    : draggingNode
      ? 'grabbing'
      : 'default'

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
        gap: 8,
      }}>
        <WorkflowIcon size={32} style={{ opacity: 0.4 }} />
        <span style={{ fontSize: 12 }}>{t('workflow.canvasEmpty')}</span>
      </div>
    )
  }

  if (workflow.steps.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        gap: 8,
      }}>
        <WorkflowIcon size={32} style={{ opacity: 0.4 }} />
        <span style={{ fontSize: 12 }}>{t('workflow.emptyState')}</span>
      </div>
    )
  }

  const zoomPercent = Math.round(zoom * 100)

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        cursor,
        background: 'var(--bg-main)',
      }}
      onMouseDown={spaceDown ? handleCanvasMouseDown : undefined}
      onClick={spaceDown ? undefined : (e => {
        // Only deselect if clicking canvas background (not a node)
        if (e.target === containerRef.current) {
          setSelectedNode(null)
          setSidebarStepId(null)
        }
      })}
      onWheel={handleWheel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Execution progress bar */}
      <CanvasProgressBar
        completedCount={execution.completedCount}
        totalSteps={execution.totalSteps}
        isRunning={execution.isRunning}
        startedAt={executionStartRef.current}
      />

      {/* 30s agent summary banner during execution */}
      {agentSummary && execution.isRunning && (
        <div style={{
          position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, pointerEvents: 'none',
          background: 'rgba(var(--accent-rgb,59,130,246),0.1)',
          border: '1px solid rgba(var(--accent-rgb,59,130,246),0.22)',
          borderRadius: 8, padding: '4px 12px',
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
            x={panX % (20 * zoom)}
            y={panY % (20 * zoom)}
            width={20 * zoom}
            height={20 * zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={20 * zoom / 2}
              cy={20 * zoom / 2}
              r={Math.max(0.5, zoom * 0.7)}
              fill="var(--border)"
              fillOpacity={0.5}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-dot-grid)" />
      </svg>

      {/* Canvas toolbar */}
      <div style={{
        position: 'absolute',
        top: execution.isRunning || execution.completedCount > 0 ? 28 : 8,
        right: 8,
        zIndex: 10,
        display: 'flex',
        gap: 3,
        alignItems: 'center',
        background: 'rgba(var(--bg-card-rgb, 30, 30, 30), 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: 6,
        padding: '3px 5px',
        border: '1px solid var(--border)',
        transition: 'top 0.2s ease',
      }}>
        {/* Fit to view */}
        <ToolbarButton onClick={fitToView} title={t('workflow.fitToView') + ' (0)'} aria={t('workflow.fitToView')}>
          <Maximize2 size={13} />
        </ToolbarButton>
        {/* Zoom out */}
        <ToolbarButton onClick={zoomOut} title="Zoom out (−)" aria="Zoom out">
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1 }}>−</span>
        </ToolbarButton>
        {/* Zoom % */}
        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          minWidth: 34, textAlign: 'center', userSelect: 'none',
        }}>
          {zoomPercent}%
        </span>
        {/* Zoom in */}
        <ToolbarButton onClick={zoomIn} title="Zoom in (+)" aria="Zoom in">
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1 }}>+</span>
        </ToolbarButton>

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 1px' }} />

        {/* Collapse all */}
        <ToolbarButton onClick={handleCollapseAll} title="Collapse all" aria="Collapse all nodes">
          <ChevronsDownUp size={13} />
        </ToolbarButton>
        {/* Expand all */}
        <ToolbarButton onClick={handleExpandAll} title="Expand all" aria="Expand all nodes">
          <ChevronsUpDown size={13} />
        </ToolbarButton>

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 1px' }} />

        {/* Minimap toggle */}
        <ToolbarButton
          onClick={() => setShowMinimap(v => !v)}
          title="Toggle minimap (M)"
          aria="Toggle minimap"
          active={showMinimap}
        >
          <Map size={13} />
        </ToolbarButton>
      </div>

      {/* Space-key hint */}
      {spaceDown && !isPanning && (
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(0,0,0,0.5)', borderRadius: 4,
          padding: '2px 8px', fontSize: 9, color: 'rgba(255,255,255,0.6)',
        }}>
          Hold & drag to pan
        </div>
      )}

      {/* SVG edge layer */}
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
        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          <CanvasEdgeDefs />
          {workflow.steps.map((step, idx) => {
            if (idx === 0) return null
            const prevStep = workflow.steps[idx - 1]
            const fromPos = nodePositions[prevStep.id]
            const toPos = nodePositions[step.id]
            if (!fromPos || !toPos) return null
            const srcStatus = execution.stepStatuses[prevStep.id] ?? 'idle'
            const edgeStatus = srcStatus === 'completed' ? 'done' : srcStatus === 'running' ? 'active' : 'idle'
            return (
              <CanvasEdge
                key={`edge-${prevStep.id}-${step.id}`}
                from={fromPos}
                to={toPos}
                status={edgeStatus}
              />
            )
          })}
        </g>
      </svg>

      {/* Node layer */}
      <div
        onMouseDown={!spaceDown ? (e => {
          // Canvas background drag — only fire if no node was clicked
          if (e.target === e.currentTarget) {
            setSelectedNode(null)
            setSidebarStepId(null)
            setIsPanning(true)
            panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY }
          }
        }) : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0',
          transition: smoothTransition ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {workflow.steps.map((step, idx) => {
          const pos = nodePositions[step.id]
          if (!pos) return null
          return (
            <CanvasNode
              key={step.id}
              step={step}
              index={idx}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              selected={selectedNode === step.id}
              status={execution.stepStatuses[step.id] ?? 'idle'}
              presetKey={workflow.presetKey}
              collapsed={collapsedNodes.has(step.id)}
              outputText={execution.stepOutputs[step.id]}
              dimmed={highlightStepIds !== null && highlightStepIds !== undefined && !highlightStepIds.has(step.id)}
              durationMs={execution.stepDurations[step.id]}
              onSelect={handleNodeSelect}
              onDragStart={handleNodeDragStart}
              onToggleCollapse={handleToggleCollapse}
            />
          )
        })}
      </div>

      {/* Minimap */}
      {showMinimap && (
        <Minimap
          nodePositions={nodePositions}
          stepIds={workflow.steps.map(s => s.id)}
          stepStatuses={execution.stepStatuses}
          panX={panX}
          panY={panY}
          zoom={zoom}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}

      {/* Node detail sidebar */}
      {sidebarStep && (
        <CanvasNodeSidebar
          step={sidebarStep}
          stepIndex={sidebarStepIndex}
          presetKey={workflow?.presetKey}
          status={sidebarStatus}
          outputText={sidebarStepId ? execution.stepOutputs[sidebarStepId] : undefined}
          durationMs={sidebarStepId ? execution.stepDurations[sidebarStepId] : undefined}
          onClose={closeSidebar}
        />
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes canvas-node-pulse {
          0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.2), 0 0 0 0 rgba(var(--accent-rgb, 59, 130, 246), 0.4); }
          50% { box-shadow: 0 4px 16px rgba(0,0,0,0.2), 0 0 0 6px rgba(var(--accent-rgb, 59, 130, 246), 0); }
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
      `}</style>
    </div>
  )
}

// Shared toolbar button component
function ToolbarButton({
  onClick, title, aria, children, active,
}: {
  onClick: () => void
  title: string
  aria: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label={aria}
      title={title}
      style={{
        background: active ? 'var(--bg-hover)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        padding: '3px 4px',
        cursor: 'pointer',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--bg-hover)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--text)' : 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}
