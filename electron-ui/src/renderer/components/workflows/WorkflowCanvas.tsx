import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Maximize2, Workflow as WorkflowIcon, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import CanvasNode, { NODE_WIDTH, NODE_MIN_HEIGHT, NODE_COLLAPSED_HEIGHT, NODE_GAP_Y } from './CanvasNode'
import CanvasEdge, { CanvasEdgeDefs } from './CanvasEdge'
import CanvasProgressBar from './CanvasProgressBar'
import CanvasNodeSidebar from './CanvasNodeSidebar'
import { useWorkflowExecution } from './useWorkflowExecution'

interface WorkflowCanvasProps {
  workflow: Workflow | null
}

interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1

export default function WorkflowCanvas({ workflow }: WorkflowCanvasProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const execution = useWorkflowExecution(workflow)

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

  // Dragging node state
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 })

  // Smooth transition flag for programmatic moves (fit-to-view, auto-pan)
  const [smoothTransition, setSmoothTransition] = useState(false)

  // Hover state for keyboard shortcut scope
  const [isHovered, setIsHovered] = useState(false)

  // Collapsed nodes (compact mode)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())

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

    // Check if node is visible in current viewport
    const nodeScreenX = pos.x * zoom + panX
    const nodeScreenY = pos.y * zoom + panY
    const margin = 50
    const isVisible =
      nodeScreenX > margin &&
      nodeScreenX + pos.width * zoom < cw - margin &&
      nodeScreenY > margin &&
      nodeScreenY + pos.height * zoom < ch - margin

    if (!isVisible) {
      // Pan to center the active node
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

  // --- Wheel zoom (toward cursor position) ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    setZoom(prev => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta))
      // Zoom toward mouse position: adjust pan so the point under cursor stays fixed
      setPanX(px => mouseX - (mouseX - px) * (newZoom / prev))
      setPanY(py => mouseY - (mouseY - py) * (newZoom / prev))
      return newZoom
    })
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

  // --- Keyboard shortcuts (when canvas is hovered) ---
  useEffect(() => {
    if (!isHovered) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn() }
      else if (e.key === '-') { e.preventDefault(); zoomOut() }
      else if (e.key === '0') { e.preventDefault(); fitToView() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
        cursor: isPanning ? 'grabbing' : 'grab',
        background: 'var(--bg-main)',
      }}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Execution progress bar */}
      <CanvasProgressBar
        completedCount={execution.completedCount}
        totalSteps={execution.totalSteps}
        isRunning={execution.isRunning}
      />

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
              r={Math.max(0.5, zoom * 0.8)}
              fill="var(--border)"
              fillOpacity={0.6}
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
        gap: 4,
        alignItems: 'center',
        background: 'rgba(var(--bg-card-rgb, 30, 30, 30), 0.8)',
        backdropFilter: 'blur(8px)',
        borderRadius: 6,
        padding: '3px 6px',
        border: '1px solid var(--border)',
        transition: 'top 0.2s ease',
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); fitToView() }}
          aria-label={t('workflow.fitToView')}
          title={t('workflow.fitToView') + ' (0)'}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: 3,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); zoomOut() }}
          aria-label="Zoom out"
          title="Zoom out (−)"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: '1px 5px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 14,
            lineHeight: 1,
            fontWeight: 600,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          −
        </button>
        <span style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          minWidth: 36,
          textAlign: 'center',
          userSelect: 'none',
        }}>
          {zoomPercent}%
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); zoomIn() }}
          aria-label="Zoom in"
          title="Zoom in (+)"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: '1px 5px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 14,
            lineHeight: 1,
            fontWeight: 600,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          +
        </button>
        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
        {/* Collapse all */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCollapseAll() }}
          aria-label="Collapse all nodes"
          title="Collapse all"
          style={{
            background: 'transparent', border: 'none', borderRadius: 4,
            padding: 3, cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ChevronsDownUp size={13} />
        </button>
        {/* Expand all */}
        <button
          onClick={(e) => { e.stopPropagation(); handleExpandAll() }}
          aria-label="Expand all nodes"
          title="Expand all"
          style={{
            background: 'transparent', border: 'none', borderRadius: 4,
            padding: 3, cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ChevronsUpDown size={13} />
        </button>
      </div>

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
              onSelect={handleNodeSelect}
              onDragStart={handleNodeDragStart}
              onToggleCollapse={handleToggleCollapse}
            />
          )
        })}
      </div>

      {/* Node detail sidebar */}
      {sidebarStep && (
        <CanvasNodeSidebar
          step={sidebarStep}
          stepIndex={sidebarStepIndex}
          presetKey={workflow?.presetKey}
          status={sidebarStatus}
          outputText={sidebarStepId ? execution.stepOutputs[sidebarStepId] : undefined}
          onClose={closeSidebar}
        />
      )}

      {/* CSS animations for execution states */}
      <style>{`
        @keyframes canvas-node-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb, 59, 130, 246), 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(var(--accent-rgb, 59, 130, 246), 0); }
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
      `}</style>
    </div>
  )
}
