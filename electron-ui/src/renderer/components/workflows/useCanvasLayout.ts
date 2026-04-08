// useCanvasLayout — pan/zoom/layout logic extracted from WorkflowCanvas (Iteration 510)
// Manages: node positions, pan, zoom, fit-to-view, node drag, collapse state, keyboard shortcuts
// Iteration 490: added trackpad pinch-to-zoom, Space-key pan, minimap toggle
// Direction E: horizontal/vertical layout toggle (L key)
// Direction F: multi-select nodes (Shift+click, clearSelection)

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { NODE_WIDTH, NODE_MIN_HEIGHT, NODE_COLLAPSED_HEIGHT, NODE_GAP_Y } from './CanvasNode'
import type { Workflow } from '../../types/app.types'

export interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

export const MIN_ZOOM = 0.3
export const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1

export function useCanvasLayout(
  workflow: Workflow | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void,
) {
  // Pan & zoom state
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)

  // Direction E: layout direction
  const [layoutDirection, setLayoutDirection] = useState<'vertical' | 'horizontal'>('vertical')

  // Node positions (custom overrides from dragging) — seeded from step.canvasPos on mount
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    if (!workflow) return {}
    const initial: Record<string, { x: number; y: number }> = {}
    for (const step of workflow.steps) {
      if (step.canvasPos) initial[step.id] = step.canvasPos
    }
    return initial
  })

  // Focused node for keyboard navigation (Direction 3)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  // Direction F: multi-selected nodes
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())

  // Panning state
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Space-key temporary pan mode
  const [spaceDown, setSpaceDown] = useState(false)
  const spaceRef = useRef(false)

  // Dragging node state
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 })

  // Direction F: multi-node drag — records per-node start positions
  const [draggingMulti, setDraggingMulti] = useState(false)
  const multiDragStartRef = useRef<{ mouseX: number; mouseY: number; nodeStarts: Record<string, { x: number; y: number }> }>({
    mouseX: 0, mouseY: 0, nodeStarts: {},
  })

  // Smooth transition flag for programmatic moves (fit-to-view, auto-pan)
  const [smoothTransition, setSmoothTransition] = useState(false)

  // Hover state for keyboard shortcut scope
  const [isHovered, setIsHovered] = useState(false)

  // Collapsed nodes (compact mode)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())

  // Minimap visibility
  const [showMinimap, setShowMinimap] = useState(true)

  // Container size for minimap viewport rect
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
  }, [containerRef])

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

  // Compute default positions for all nodes — supports vertical and horizontal layouts
  const defaultPositions = useMemo(() => {
    if (!workflow) return {}
    const positions: Record<string, NodePosition> = {}
    let offset = 0
    workflow.steps.forEach((step) => {
      const isCollapsed = collapsedNodes.has(step.id)
      const h = isCollapsed ? NODE_COLLAPSED_HEIGHT : NODE_MIN_HEIGHT
      if (layoutDirection === 'horizontal') {
        positions[step.id] = {
          x: offset,
          y: 0,
          width: NODE_WIDTH,
          height: h,
        }
        offset += NODE_WIDTH + (NODE_GAP_Y - NODE_MIN_HEIGHT)
      } else {
        positions[step.id] = {
          x: 0,
          y: offset,
          width: NODE_WIDTH,
          height: h,
        }
        offset += h + (NODE_GAP_Y - NODE_MIN_HEIGHT)
      }
    })
    return positions
  }, [workflow, collapsedNodes, layoutDirection])

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

  // Reset custom positions when workflow changes — seed from step.canvasPos
  useEffect(() => {
    const initial: Record<string, { x: number; y: number }> = {}
    if (workflow) {
      for (const step of workflow.steps) {
        if (step.canvasPos) initial[step.id] = step.canvasPos
      }
    }
    setCustomPositions(initial)
    setZoom(1)
    setPanX(0)
    setPanY(0)
    setCollapsedNodes(new Set())
    setFocusedNodeId(null)
    setSelectedNodes(new Set())
  }, [workflow?.id])

  // Fit to view
  const fitToView = useCallback(() => {
    if (!workflow || workflow.steps.length === 0 || !containerRef.current) return
    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const pos of Object.values(nodePositions)) {
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + pos.width)
      maxY = Math.max(maxY, pos.y + pos.height)
    }

    const contentW = maxX - minX + 60
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
  }, [workflow, nodePositions, containerRef])

  // Auto-fit on first render or workflow change
  useEffect(() => {
    if (workflow && workflow.steps.length > 0) {
      const timer = setTimeout(fitToView, 50)
      return () => clearTimeout(timer)
    }
  }, [workflow?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Direction E: toggle layout direction, clear custom positions, re-fit
  const toggleLayoutDirection = useCallback(() => {
    setCustomPositions({})
    onPositionsChange?.({})
    setLayoutDirection(prev => prev === 'vertical' ? 'horizontal' : 'vertical')
    setTimeout(fitToView, 80)
  }, [fitToView, onPositionsChange])

  // --- Auto-pan to active node during execution ---
  const autoPanToNode = useCallback((stepId: string) => {
    if (!workflow || !containerRef.current) return
    const pos = nodePositions[stepId]
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
  }, [workflow, containerRef, nodePositions, zoom, panX, panY])

  // --- Mouse handlers for pan ---
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
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
      setCustomPositions(prev => {
        const next = {
          ...prev,
          [draggingNode]: {
            x: dragStartRef.current.nodeX + dx,
            y: dragStartRef.current.nodeY + dy,
          },
        }
        onPositionsChange?.(next)
        return next
      })
    }
    const handleUp = () => setDraggingNode(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [draggingNode, zoom, onPositionsChange])

  // Direction F: multi-node drag
  const handleMultiNodeDragStart = useCallback((ids: Set<string>, e: React.MouseEvent) => {
    e.stopPropagation()
    const nodeStarts: Record<string, { x: number; y: number }> = {}
    ids.forEach(id => {
      const pos = nodePositions[id]
      if (pos) nodeStarts[id] = { x: pos.x, y: pos.y }
    })
    multiDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, nodeStarts }
    setDraggingMulti(true)
  }, [nodePositions])

  useEffect(() => {
    if (!draggingMulti) return
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - multiDragStartRef.current.mouseX) / zoom
      const dy = (e.clientY - multiDragStartRef.current.mouseY) / zoom
      setCustomPositions(prev => {
        const next = { ...prev }
        Object.entries(multiDragStartRef.current.nodeStarts).forEach(([id, start]) => {
          next[id] = { x: start.x + dx, y: start.y + dy }
        })
        onPositionsChange?.(next)
        return next
      })
    }
    const handleUp = () => setDraggingMulti(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [draggingMulti, zoom, onPositionsChange])

  // Direction F: select node (single or add to selection with shift)
  const selectNode = useCallback((id: string, addToSelection: boolean) => {
    setSelectedNodes(prev => {
      if (addToSelection) {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      return new Set([id])
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedNodes(new Set())
  }, [])

  // --- Wheel zoom (toward cursor) — ctrlKey = trackpad pinch, else zoom ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (e.ctrlKey) {
      // Trackpad pinch-to-zoom
      const sensitivity = 0.005
      const delta = -e.deltaY * sensitivity
      setZoom(prev => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * (1 + delta)))
        setPanX(px => mouseX - (mouseX - px) * (newZoom / prev))
        setPanY(py => mouseY - (mouseY - py) * (newZoom / prev))
        return newZoom
      })
    } else {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom(prev => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta))
        setPanX(px => mouseX - (mouseX - px) * (newZoom / prev))
        setPanY(py => mouseY - (mouseY - py) * (newZoom / prev))
        return newZoom
      })
    }
  }, [containerRef])

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
  }, [containerRef])

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
  }, [containerRef])

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
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleLayoutDirection() }
      else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        if (!workflow || workflow.steps.length === 0) return
        e.preventDefault()
        setFocusedNodeId(prev => {
          const steps = workflow.steps
          const idx = steps.findIndex(s => s.id === prev)
          const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, steps.length - 1)
          const nextId = steps[nextIdx].id
          autoPanToNode(nextId)
          return nextId
        })
      }
      else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        if (!workflow || workflow.steps.length === 0) return
        e.preventDefault()
        setFocusedNodeId(prev => {
          const steps = workflow.steps
          const idx = steps.findIndex(s => s.id === prev)
          const prevIdx = idx < 0 ? steps.length - 1 : Math.max(idx - 1, 0)
          const prevId = steps[prevIdx].id
          autoPanToNode(prevId)
          return prevId
        })
      }
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
  }, [isHovered, zoomIn, zoomOut, fitToView, workflow, autoPanToNode, toggleLayoutDirection])

  // --- Reset layout: clear all custom positions and notify store ---
  const resetLayout = useCallback(() => {
    setCustomPositions({})
    onPositionsChange?.({})
    setFocusedNodeId(null)
  }, [onPositionsChange])

  return {
    // State
    panX,
    panY,
    zoom,
    isPanning,
    spaceDown,
    smoothTransition,
    collapsedNodes,
    nodePositions,
    showMinimap,
    containerSize,
    focusedNodeId,
    layoutDirection,
    selectedNodes,

    // Actions
    fitToView,
    zoomIn,
    zoomOut,
    handleCollapseAll,
    handleExpandAll,
    handleToggleCollapse,
    handleCanvasMouseDown,
    handleNodeDragStart,
    handleMultiNodeDragStart,
    handleWheel,
    autoPanToNode,
    setIsHovered,
    setShowMinimap,
    setFocusedNodeId,
    resetLayout,
    toggleLayoutDirection,
    selectNode,
    clearSelection,
  }
}
