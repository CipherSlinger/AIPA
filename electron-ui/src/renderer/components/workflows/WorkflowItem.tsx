import React, { useState, useEffect, useRef } from 'react'
import { Trash2, Edit3, Copy, Play } from 'lucide-react'
import { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import { useUiStore, useChatStore } from '../../store'
import { smallBtnStyle, MAX_NAME_LENGTH, MAX_DESC_LENGTH, getPresetStepText } from './workflowConstants'
import WorkflowStepEditor from './WorkflowStepEditor'
import type { useWorkflowCrud } from './useWorkflowCrud'

type CrudReturn = ReturnType<typeof useWorkflowCrud>

const CATEGORY_COLORS: Record<string, string> = {
  singleAgent: '#6366f1',
  teamwork: '#22c55e',
  data: '#fbbf24',
  research: '#6366f1',
  writing: '#ec4899',
  coding: '#67e8f9',
}

const ICON_PALETTE = ['#6366f1', '#a78bfa', '#ec4899', '#fbbf24', '#4ade80', '#67e8f9', '#818cf8', '#f87171']

function iconColor(icon: string): string {
  let hash = 0
  for (let i = 0; i < icon.length; i++) hash = (hash * 31 + icon.charCodeAt(i)) >>> 0
  return ICON_PALETTE[hash % ICON_PALETTE.length]
}

function formatWorkflowAge(ts: number): string {
  const diff = Date.now() - ts
  const d = Math.floor(diff / 86400000)
  const h = Math.floor(diff / 3600000)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

interface WorkflowItemProps {
  wf: Workflow
  isExpanded: boolean
  isEditing: boolean
  crud: CrudReturn
}

export default function WorkflowItem({ wf, isExpanded, isEditing, crud }: WorkflowItemProps) {
  const t = useT()
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [showStepsPreview, setShowStepsPreview] = useState(false)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Workflow status: derive from execution state (running if in queue)
  const isRunning = false // placeholder; actual execution tracked at detail level

  // Reset confirmation state after 2.5s without a second click
  useEffect(() => {
    if (!deleteConfirming) return
    const timer = setTimeout(() => setDeleteConfirming(false), 2500)
    return () => clearTimeout(timer)
  }, [deleteConfirming])

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteConfirming) {
      crud.deleteWorkflow(wf.id)
      setDeleteConfirming(false)
    } else {
      setDeleteConfirming(true)
    }
  }

  const handleRunClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!wf.steps.length) return
    let count = 0
    wf.steps.forEach((step, idx) => {
      const prompt = getPresetStepText(wf.presetKey, idx, 'prompt', t, step.prompt)
      if (prompt.trim()) {
        useChatStore.getState().addToQueue(prompt, { workflowId: wf.id, stepIndex: idx })
        count++
      }
    })
    if (count > 0) {
      useUiStore.getState().addToast('info', t('workflow.running', { name: displayName, count: String(count) }))
    }
  }

  // Use localized name/description for installed presets
  const displayName = wf.presetKey ? t(`workflow.preset.${wf.presetKey}`) : wf.name
  const displayDesc = wf.presetKey ? t(`workflow.preset.${wf.presetKey}Desc`) : wf.description

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        borderLeft: (hovered || isExpanded) ? '3px solid var(--accent, rgba(99,102,241,0.75))' : '3px solid transparent',
        transition: 'all 0.15s ease',
        position: 'relative',
        borderRadius: 8,
        marginBottom: 2,
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
        zIndex: hovered ? 1 : 0,
        background: isExpanded
          ? 'rgba(99,102,241,0.08)'
          : hovered ? 'var(--bg-hover)' : 'transparent',
      }}
    >
      {/* Workflow header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onClick={() => useUiStore.getState().openWorkflowDetail(wf.id)}
        onMouseEnter={_e => { setHovered(true); previewTimer.current = setTimeout(() => setShowStepsPreview(true), 600) }}
        onMouseLeave={_e => { setHovered(false); if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null } setShowStepsPreview(false) }}
      >
        {/* Status dot + icon */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{
            fontSize: 15,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 7,
            overflow: 'hidden',
            background: 'rgba(99,102,241,0.12)',
            border: `1px solid ${iconColor(wf.icon)}33`,
            transition: 'all 0.15s ease',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
          }}>{wf.icon}</span>
          {/* Status dot — bottom-right of icon */}
          <span style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isRunning ? 'var(--color-warning, #fbbf24)' : (wf.runCount > 0 ? 'var(--color-success, #22c55e)' : 'var(--text-faint, rgba(255,255,255,0.2))'),
            border: '2px solid var(--bg-primary, rgba(12,12,20,0.97))',
            transition: 'background 0.3s ease',
          }} title={isRunning ? 'Running' : wf.runCount > 0 ? 'Has runs' : 'Never run'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto', minWidth: 0 }}>{displayName}</span>
            {(wf as any).category && (
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                color: CATEGORY_COLORS[(wf as any).category] ?? 'var(--text-muted)',
                background: `${CATEGORY_COLORS[(wf as any).category] ?? 'var(--border)'}20`,
                borderRadius: 8,
                padding: '1px 5px',
                flexShrink: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {(wf as any).category}
              </span>
            )}
          </div>
          {displayDesc && (
            <div
              title={displayDesc}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 1,
              }}
            >
              {displayDesc}
            </div>
          )}
          <div style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10,
              color: 'var(--accent-muted, #a5b4fc)',
              background: 'var(--accent-bg, rgba(99,102,241,0.15))',
              borderRadius: 10,
              padding: '1px 6px',
              fontWeight: 600,
              flexShrink: 0,
              border: '1px solid var(--accent-border, rgba(99,102,241,0.25))',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}>
              {wf.steps.length} {t('workflow.stepsLabel')}
            </span>
            {wf.runCount > 0 && (
              <span style={{
                fontSize: 10,
                color: 'var(--accent-muted, #a5b4fc)',
                background: 'var(--accent-bg, rgba(99,102,241,0.15))',
                borderRadius: 10,
                padding: '1px 6px',
                fontWeight: 600,
                flexShrink: 0,
                border: '1px solid var(--accent-border, rgba(99,102,241,0.25))',
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}>
                {wf.runCount} {wf.runCount === 1 ? 'run' : 'runs'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            <span style={{ fontSize: 9, opacity: 0.7 }}>&#x1f552;</span>
            {formatWorkflowAge(wf.updatedAt)}
          </div>
        </div>
        {/* Hover action buttons: Run + Edit */}
        {hovered && (
          <>
            <button
              onClick={handleRunClick}
              title={t('workflow.run') || 'Run'}
              style={{
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)',
                cursor: 'pointer',
                color: 'var(--color-success, #22c55e)',
                padding: '4px 6px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 600,
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.22)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.55)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.12)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)'
              }}
            >
              <Play size={10} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); useUiStore.getState().openWorkflowEditor(wf.id) }}
              title={t('workflow.edit')}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--accent-muted, #a5b4fc)'
                e.currentTarget.style.background = 'var(--accent-bg, rgba(99,102,241,0.12))'
                e.currentTarget.style.borderColor = 'var(--accent-border, rgba(99,102,241,0.3))'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); crud.duplicateWorkflow(wf) }}
              title="Clone workflow"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--accent-muted, #a5b4fc)'
                e.currentTarget.style.background = 'var(--accent-bg, rgba(99,102,241,0.12))'
                e.currentTarget.style.borderColor = 'var(--accent-border, rgba(99,102,241,0.3))'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <Copy size={12} />
            </button>
          </>
        )}
        {/* Delete button with two-click confirmation */}
        <button
          onClick={handleDeleteClick}
          title={deleteConfirming ? t('workflow.deleteConfirm') : t('workflow.delete')}
          style={{
            background: deleteConfirming ? 'rgba(239,68,68,0.20)' : (hovered ? 'rgba(239,68,68,0.12)' : 'transparent'),
            border: deleteConfirming ? '1px solid rgba(239,68,68,0.5)' : (hovered ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent'),
            borderRadius: 6,
            padding: '4px',
            cursor: 'pointer',
            color: hovered ? '#fca5a5' : 'var(--text-faint)',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!deleteConfirming) {
              (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.20)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.45)'
              ;(e.currentTarget as HTMLElement).style.color = '#fca5a5'
            }
          }}
          onMouseLeave={e => {
            if (!deleteConfirming) {
              (e.currentTarget as HTMLElement).style.background = hovered ? 'rgba(239,68,68,0.12)' : 'transparent'
              ;(e.currentTarget as HTMLElement).style.borderColor = hovered ? 'rgba(239,68,68,0.25)' : 'transparent'
              ;(e.currentTarget as HTMLElement).style.color = hovered ? '#fca5a5' : 'var(--text-faint)'
            }
          }}
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* Hover preview tooltip */}
      {showStepsPreview && wf.steps.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 4,
            zIndex: 50,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            STEPS
          </div>
          {wf.steps.slice(0, 4).map((step, idx) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: '#818cf8',
                background: 'rgba(99,102,241,0.15)',
                borderRadius: 3, padding: '0 4px',
                minWidth: 16, textAlign: 'center',
                flexShrink: 0,
              }}>
                {idx + 1}
              </span>
              <span style={{
                fontSize: 10, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {step.title}
              </span>
            </div>
          ))}
          {wf.steps.length > 4 && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, opacity: 0.6 }}>
              +{wf.steps.length - 4} more steps
            </div>
          )}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '0 12px 8px', fontSize: 10 }}>
          {displayDesc && (
            <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>
              {displayDesc}
            </div>
          )}

          {isEditing ? (
            /* Edit mode */
            <div>
              <input
                value={crud.editName}
                onChange={e => crud.setEditName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                style={{
                  width: '100%', height: 26, padding: '0 8px',
                  background: 'var(--bg-hover)', border: '1px solid #6366f1',
                  borderRadius: 4, fontSize: 11, color: 'var(--text-primary)',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 4,
                }}
              />
              <input
                value={crud.editDesc}
                onChange={e => crud.setEditDesc(e.target.value)}
                maxLength={MAX_DESC_LENGTH}
                placeholder={t('workflow.descPlaceholder')}
                style={{
                  width: '100%', height: 26, padding: '0 8px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  borderRadius: 4, fontSize: 10, color: 'var(--text-secondary)',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 6,
                }}
              />
              <WorkflowStepEditor steps={crud.editSteps} setSteps={crud.setEditSteps} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
                <button
                  onClick={() => crud.setEditingId(null)}
                  style={{
                    background: 'transparent', border: 'none', borderRadius: 3,
                    padding: '2px 8px', fontSize: 10, cursor: 'pointer', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {t('workflow.cancel')}
                </button>
                <button onClick={crud.saveEdit} style={{
                  background: '#6366f1', border: 'none', borderRadius: 4,
                  padding: '2px 10px', fontSize: 10, color: 'var(--text-primary)', cursor: 'pointer',
                }}>
                  {t('workflow.save')}
                </button>
              </div>
            </div>
          ) : (
            /* View steps */
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {wf.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 6,
                      padding: '4px 6px', background: 'var(--bg-hover)', borderRadius: 4,
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#818cf8',
                      background: 'rgba(99,102,241,0.1)',
                      borderRadius: '50%', width: 16, height: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 1,
                    }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {getPresetStepText(wf.presetKey, idx, 'title', t, step.title)}
                      </div>
                      <div style={{
                        fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden',
                        textOverflow: 'ellipsis', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4,
                      }}>
                        {getPresetStepText(wf.presetKey, idx, 'prompt', t, step.prompt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button onClick={() => useUiStore.getState().openWorkflowEditor(wf.id)} style={{ ...smallBtnStyle }}>
                  <Edit3 size={10} /> {t('workflow.edit')}
                </button>
                <button onClick={() => crud.duplicateWorkflow(wf)} style={{ ...smallBtnStyle }}>
                  <Copy size={10} /> {t('workflow.duplicate')}
                </button>
                <button
                  onClick={() => crud.deleteWorkflow(wf.id)}
                  title={t('workflow.delete')}
                  style={{ ...smallBtnStyle, color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
