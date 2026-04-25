// useCanvasLayout — pan/zoom/layout logic extracted from WorkflowCanvas (Iteration 510)
// Manages: node positions, pan, zoom, fit-to-view, node drag, collapse state, keyboard shortcuts
// Iteration 490: added trackpad pinch-to-zoom, Space-key pan, minimap toggle
// Direction E: horizontal/vertical layout toggle (L key)
// Direction F: multi-select nodes (Shift+click, clearSelection)
// D1: marquee/box selection on canvas drag
// D3: viewport state persistence (pan/zoom saved per workflow in localStorage)
// D7: collapsed node state persistence per workflow in localStorage
// Direction 9: dynamic node heights
// Direction 5: expanded keyboard shortcuts (Escape clears selection, Delete/Backspace triggers onDeleteNodes)

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
  onDeleteNodes?: (ids: string[]) => void,
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

  // Minimap visibility — persisted in localStorage
  const [showMinimap, setShowMinimap] = useState<boolean>(() => {
    try { return localStorage.getItem('aipa:canvas-minimap') !== 'false' } catch { return true }
  })

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

  // D3: viewport persistence refs
  const viewportRestoredRef = useRef(false)
  const vpSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // F1: custom positions save timer ref
  const posSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // D1: Marquee selection state
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [isMarqueeing, setIsMarqueeing] = useState(false)
  const marqueeStartRef = useRef<{ x1: number; y1: number; panX: number; panY: number; zoom: number; shiftKey: boolean } | null>(null)

  // D1: keep nodePositions accessible inside marquee effect without causing re-registrations
  const nodePositionsRef = useRef<Record<string, NodePosition>>({})

  // Direction 9: dynamic node heights reported by CanvasNode via ResizeObserver
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({})

  const updateNodeHeight = useCallback((nodeId: string, height: number) => {
    setNodeHeights(prev => {
      if (prev[nodeId] === height) return prev
      return { ...prev, [nodeId]: height }
    })
  }, [])

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
  // Direction 9: use dynamic nodeHeights for expanded nodes instead of fixed NODE_MIN_HEIGHT
  const defaultPositions = useMemo(() => {
    if (!workflow) return {}
    const positions: Record<string, NodePosition> = {}
    let offset = 0
    workflow.steps.forEach((step) => {
      const isCollapsed = collapsedNodes.has(step.id)
      const h = isCollapsed ? NODE_COLLAPSED_HEIGHT : (nodeHeights[step.id] ?? NODE_MIN_HEIGHT)
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
  }, [workflow, collapsedNodes, layoutDirection, nodeHeights])

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

  // Keep nodePositionsRef in sync for marquee hit-testing
  useEffect(() => {
    nodePositionsRef.current = nodePositions
  }, [nodePositions])

  // Reset custom positions when workflow changes — seed from step.canvasPos
  // D3: restore viewport from localStorage; D7: restore collapsed state
  useEffect(() => {
    const initial: Record<string, { x: number; y: number }> = {}
    if (workflow) {
      for (const step of workflow.steps) {
        if (step.canvasPos) initial[step.id] = step.canvasPos
      }
    }
    setCustomPositions(initial)
    setFocusedNodeId(null)
    setSelectedNodes(new Set())
    setMarqueeRect(null)
    setIsMarqueeing(false)
    // Direction 9: reset dynamic heights on workflow switch
    setNodeHeights({})

    viewportRestoredRef.current = false

    if (workflow?.id) {
      // D3: restore viewport
      try {
        const vpSaved = localStorage.getItem(`aipa:canvas-vp:${workflow.id}`)
        if (vpSaved) {
          const { px, py, z } = JSON.parse(vpSaved)
          if (typeof px === 'number' && typeof py === 'number' && typeof z === 'number') {
            setPanX(px)
            setPanY(py)
            setZoom(z)
            viewportRestoredRef.current = true
          }
        }
      } catch { }

      // D7: restore collapsed nodes
      try {
        const colSaved = localStorage.getItem(`aipa:canvas-collapsed:${workflow.id}`)
        if (colSaved) {
          const ids: string[] = JSON.parse(colSaved)
          setCollapsedNodes(new Set(ids))
        } else {
          setCollapsedNodes(new Set())
        }
      } catch {
        setCollapsedNodes(new Set())
      }

      // F1: restore custom positions (override seed from step.canvasPos)
      try {
        const posSaved = localStorage.getItem(`aipa:canvas-pos:${workflow.id}`)
        if (posSaved) {
          const parsed: Record<string, { x: number; y: number }> = JSON.parse(posSaved)
          setCustomPositions(prev => ({ ...prev, ...parsed }))
        }
      } catch { }

      // F2: restore layout direction
      try {
        const dirSaved = localStorage.getItem(`aipa:canvas-dir:${workflow.id}`)
        if (dirSaved === 'horizontal' || dirSaved === 'vertical') {
          setLayoutDirection(dirSaved)
        } else {
          setLayoutDirection('vertical')
        }
      } catch {
        setLayoutDirection('vertical')
      }
    } else {
      setCollapsedNodes(new Set())
    }

    if (!viewportRestoredRef.current) {
      setZoom(1)
      setPanX(0)
      setPanY(0)
    }
  }, [workflow?.id])

  // D3: save viewport to localStorage (debounced 500ms)
  useEffect(() => {
    if (!workflow?.id) return
    if (vpSaveTimerRef.current) clearTimeout(vpSaveTimerRef.current)
    vpSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`aipa:canvas-vp:${workflow.id}`, JSON.stringify({ px: panX, py: panY, z: zoom }))
      } catch { }
    }, 500)
  }, [panX, panY, zoom, workflow?.id])

  // D7: save collapsed state to localStorage whenever it changes
  useEffect(() => {
    if (!workflow?.id) return
    try {
      localStorage.setItem(`aipa:canvas-collapsed:${workflow.id}`, JSON.stringify([...collapsedNodes]))
    } catch { }
  }, [collapsedNodes, workflow?.id])

  // Persist minimap visibility preference to localStorage
  useEffect(() => {
    try { localStorage.setItem('aipa:canvas-minimap', String(showMinimap)) } catch { }
  }, [showMinimap])

  // F1: save custom positions to localStorage (debounced 800ms)
  useEffect(() => {
    if (!workflow?.id) return
    if (posSaveTimerRef.current) clearTimeout(posSaveTimerRef.current)
    posSaveTimerRef.current = setTimeout(() => {
      try {
        if (Object.keys(customPositions).length > 0) {
          localStorage.setItem(`aipa:canvas-pos:${workflow.id}`, JSON.stringify(customPositions))
        } else {
          localStorage.removeItem(`aipa:canvas-pos:${workflow.id}`)
        }
      } catch { }
    }, 800)
  }, [customPositions, workflow?.id])

  // F2: save layout direction to localStorage whenever it changes
  useEffect(() => {
    if (!workflow?.id) return
    try {
      localStorage.setItem(`aipa:canvas-dir:${workflow.id}`, layoutDirection)
    } catch { }
  }, [layoutDirection, workflow?.id])

  // Center viewport at 100% zoom — used on first render so nodes are visible
  const centerViewAt100 = useCallback(() => {
    if (!workflow || workflow.steps.length === 0 || !containerRef.current) return
    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight
    const zoom = 1 // always 100%

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const pos of Object.values(nodePositionsRef.current)) {
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + pos.width)
      maxY = Math.max(maxY, pos.y + pos.height)
    }

    const contentW = maxX - minX
    const contentH = maxY - minY
    const padX = 40
    const padY = 40

    // Pan so the content block is centered in the viewport
    const panX = (cw - contentW * zoom) / 2 - minX * zoom + padX
    const panY = (ch - contentH * zoom) / 2 - minY * zoom + padY

    setZoom(zoom)
    setPanX(panX)
    setPanY(panY)
  }, [workflow, containerRef])

  // Fit to view (manual trigger via keyboard shortcut)
  const fitToView = useCallback(() => {
    if (!workflow || workflow.steps.length === 0 || !containerRef.current) return
    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const pos of Object.values(nodePositionsRef.current)) {
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
  }, [workflow, containerRef])

  // Center at 100% zoom on first render (only if viewport was NOT restored)
  useEffect(() => {
    if (workflow && workflow.steps.length > 0 && !viewportRestoredRef.current) {
      const timer = setTimeout(centerViewAt100, 50)
      return () => clearTimeout(timer)
    }
  }, [workflow?.id, centerViewAt100]) // eslint-disable-line react-hooks/exhaustive-deps

  // Direction E: toggle layout direction, clear custom positions, re-fit
  const toggleLayoutDirection = useCallback(() => {
    setCustomPositions({})
    onPositionsChange?.({})
    setLayoutDirection(prev => prev === 'vertical' ? 'horizontal' : 'vertical')
    setTimeout(centerViewAt100, 80)
  }, [centerViewAt100, onPositionsChange])

  // --- Auto-pan to active node during execution ---
  const autoPanToNode = useCallback((stepId: string) => {
    if (!workflow || !containerRef.current) return
    const pos = nodePositionsRef.current[stepId]
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
  }, [workflow, containerRef, zoom, panX, panY])

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
    const pos = nodePositionsRef.current[stepId]
    if (!pos) return
    setDraggingNode(stepId)
    dragStartRef.current = { x: e.clientX, y: e.clientY, nodeX: pos.x, nodeY: pos.y }
  }, [])

  useEffect(() => {
    if (!draggingNode) return
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStartRef.current.x) / zoom
      const dy = (e.clientY - dragStartRef.current.y) / zoom
      const rawX = dragStartRef.current.nodeX + dx
      const rawY = dragStartRef.current.nodeY + dy
      // Shift 键临时禁用吸附
      const snap = !e.shiftKey
      setCustomPositions(prev => {
        const next = {
          ...prev,
          [draggingNode]: {
            x: snap ? Math.round(rawX / 20) * 20 : rawX,
            y: snap ? Math.round(rawY / 20) * 20 : rawY,
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
      const pos = nodePositionsRef.current[id]
      if (pos) nodeStarts[id] = { x: pos.x, y: pos.y }
    })
    multiDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, nodeStarts }
    setDraggingMulti(true)
  }, [])

  useEffect(() => {
    if (!draggingMulti) return
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - multiDragStartRef.current.mouseX) / zoom
      const dy = (e.clientY - multiDragStartRef.current.mouseY) / zoom
      setCustomPositions(prev => {
        const next = { ...prev }
        Object.entries(multiDragStartRef.current.nodeStarts).forEach(([id, start]) => {
          const snap = !e.shiftKey
          next[id] = {
            x: snap ? Math.round((start.x + dx) / 20) * 20 : start.x + dx,
            y: snap ? Math.round((start.y + dy) / 20) * 20 : start.y + dy,
          }
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

  // D1: Marquee selection — start drag on empty canvas
  const startMarquee = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = (e.clientX - rect.left - panX) / zoom
    const cy = (e.clientY - rect.top - panY) / zoom
    marqueeStartRef.current = { x1: cx, y1: cy, panX, panY, zoom, shiftKey: e.shiftKey }
    setMarqueeRect({ x1: cx, y1: cy, x2: cx, y2: cy })
    setIsMarqueeing(true)
  }, [containerRef, panX, panY, zoom])

  // D1: Handle marquee drag and selection on mouseup
  useEffect(() => {
    if (!isMarqueeing) return
    const startData = marqueeStartRef.current
    if (!startData) return
    const el = containerRef.current

    const handleMove = (e: MouseEvent) => {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = (e.clientX - rect.left - startData.panX) / startData.zoom
      const cy = (e.clientY - rect.top - startData.panY) / startData.zoom
      setMarqueeRect({ x1: startData.x1, y1: startData.y1, x2: cx, y2: cy })
    }

    const handleUp = () => {
      setMarqueeRect(prev => {
        if (prev) {
          const minX = Math.min(prev.x1, prev.x2)
          const maxX = Math.max(prev.x1, prev.x2)
          const minY = Math.min(prev.y1, prev.y2)
          const maxY = Math.max(prev.y1, prev.y2)
          // Only select if drag has meaningful size (> 5px in canvas coords)
          if (maxX - minX > 5 || maxY - minY > 5) {
            const selected = new Set<string>()
            Object.entries(nodePositionsRef.current).forEach(([id, pos]) => {
              if (pos.x < maxX && pos.x + pos.width > minX && pos.y < maxY && pos.y + pos.height > minY) {
                selected.add(id)
              }
            })
            if (selected.size > 0) {
              if (startData.shiftKey) {
                setSelectedNodes(prev => {
                  const next = new Set(prev)
                  selected.forEach(id => next.add(id))
                  return next
                })
              } else {
                setSelectedNodes(selected)
              }
            }
          }
        }
        return null
      })
      setIsMarqueeing(false)
      marqueeStartRef.current = null
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isMarqueeing, containerRef])

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
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); handleCollapseAll() }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleExpandAll() }
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
      // Direction 5: Escape — clear selection and focused node
      else if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        setFocusedNodeId(null)
      }
      // Direction 5: Delete/Backspace — invoke onDeleteNodes for focused or selected nodes
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!onDeleteNodes) return
        // Collect ids to delete: selectedNodes union focusedNodeId
        const ids: string[] = []
        selectedNodes.forEach(id => ids.push(id))
        if (focusedNodeId && !selectedNodes.has(focusedNodeId)) {
          ids.push(focusedNodeId)
        }
        if (ids.length > 0) {
          e.preventDefault()
          onDeleteNodes(ids)
        }
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
  }, [isHovered, zoomIn, zoomOut, fitToView, workflow, autoPanToNode, toggleLayoutDirection, handleCollapseAll, handleExpandAll, focusedNodeId, clearSelection, selectedNodes, onDeleteNodes])

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
    marqueeRect,
    nodeHeights,
    draggingNode,

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
    startMarquee,
    setPanX,
    setPanY,
    updateNodeHeight,
  }
}
