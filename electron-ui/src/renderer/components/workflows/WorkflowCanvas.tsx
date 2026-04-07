import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Workflow as WorkflowIcon } from 'lucide-react'
import { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import CanvasNode from './CanvasNode'
import CanvasEdge, { CanvasEdgeDefs } from './CanvasEdge'
import CanvasProgressBar from './CanvasProgressBar'
import CanvasNodeSidebar from './CanvasNodeSidebar'
import CanvasToolbar from './CanvasToolbar'
import { useWorkflowExecution } from './useWorkflowExecution'
import { useCanvasLayout } from './useCanvasLayout'
import type { NodePosition } from './useCanvasLayout'

interface WorkflowCanvasProps {
  workflow: Workflow | null
  highlightStepIds?: Set<string> | null  // null = no filter, Set = show only these
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
}

function Minimap({ nodePositions, stepIds, stepStatuses, panX, panY, zoom, containerW, containerH }: MinimapProps) {
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

  // Layout hook (pan, zoom, node positions, drag, collapse, minimap, Space key)
  const layout = useCanvasLayout(workflow, containerRef)

  // Track when execution started for ETA
  const executionStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (execution.isRunning && executionStartRef.current === null) {
      executionStartRef.current = Date.now()
    } else if (!execution.isRunning) {
      executionStartRef.current = null
    }
  }, [execution.isRunning])

  // Selected node (for sidebar)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Sidebar open state
  const [sidebarStepId, setSidebarStepId] = useState<string | null>(null)

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
    setSidebarStepId(null)
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

  // --- Node selection (opens sidebar) ---
  const handleNodeSelect = useCallback((stepId: string) => {
    setSelectedNode(stepId)
    setSidebarStepId(stepId)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarStepId(null)
  }, [])

  // --- Canvas mouse down: deselect + start pan ---
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelectedNode(null)
    setSidebarStepId(null)
    layout.handleCanvasMouseDown(e)
  }, [layout])

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

  const cursor = layout.spaceDown
    ? (layout.isPanning ? 'grabbing' : 'grab')
    : layout.isPanning ? 'grabbing' : 'default'

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

  const zoomPercent = Math.round(layout.zoom * 100)

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
      onMouseDown={handleCanvasMouseDown}
      onWheel={layout.handleWheel}
      onMouseEnter={() => layout.setIsHovered(true)}
      onMouseLeave={() => layout.setIsHovered(false)}
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
              fill="var(--border)"
              fillOpacity={0.5}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-dot-grid)" />
      </svg>

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
      />

      {/* Space-key hint */}
      {layout.spaceDown && !layout.isPanning && (
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
        <g transform={`translate(${layout.panX}, ${layout.panY}) scale(${layout.zoom})`}>
          <CanvasEdgeDefs />
          {workflow.steps.map((step, idx) => {
            if (idx === 0) return null
            const prevStep = workflow.steps[idx - 1]
            const fromPos = layout.nodePositions[prevStep.id]
            const toPos = layout.nodePositions[step.id]
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
          transform: `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`,
          transformOrigin: '0 0',
          transition: layout.smoothTransition ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {workflow.steps.map((step, idx) => {
          const pos = layout.nodePositions[step.id]
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
              collapsed={layout.collapsedNodes.has(step.id)}
              outputText={execution.stepOutputs[step.id]}
              dimmed={highlightStepIds !== null && highlightStepIds !== undefined && !highlightStepIds.has(step.id)}
              durationMs={execution.stepDurations[step.id]}
              onSelect={handleNodeSelect}
              onDragStart={layout.handleNodeDragStart}
              onToggleCollapse={layout.handleToggleCollapse}
            />
          )
        })}
      </div>

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

      {/* CSS animations for execution states */}
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
