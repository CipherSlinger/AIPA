// WorkflowDetailHeader -- header bar for WorkflowDetailPage (extracted Iteration 511, updated 513, 539)
// Contains: breadcrumb nav, icon picker, inline title edit, execution badge, run/stop/delete + edit/save buttons.
// Iteration 539: Added breadcrumb navigation, inline title editing, Run/Stop/Delete semantic buttons, CSS variables.

import React, { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Edit3, Check, Save, Eye, Play, Square, Trash2 } from 'lucide-react'
import type { WorkflowExecutionState } from './useWorkflowExecution'
import type { WorkflowStep } from '../../types/app.types'

// Derive a deterministic accent color from the workflow icon emoji.
// Used for the top category accent bar.
function iconToAccent(icon: string): string {
  const ACCENTS = [
    '#6366f1', // blue
    '#a78bfa', // violet
    '#ec4899', // pink
    '#fbbf24', // amber
    '#4ade80', // emerald
    '#f87171', // red
    '#67e8f9', // cyan
    '#f97316', // orange
  ]
  let code = 0
  for (let i = 0; i < icon.length; i++) code += icon.codePointAt(i) ?? 0
  return ACCENTS[code % ACCENTS.length]
}

// Format epoch ms timestamp as a short relative time string ("2h ago", "3d ago").
function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const s = Math.floor(diffMs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  const mo = Math.floor(d / 30)
  return `${mo}mo`
}

// Step node type colors for the dots preview
const STEP_DOT_COLORS: Record<string, string> = {
  prompt:    '#6366f1',
  condition: '#fbbf24',
  parallel:  '#4ade80',
}
const STEP_DOT_DEFAULT = 'var(--text-muted)'

const WORKFLOW_EMOJIS = [
  '\u{1F4CB}', '\u{1F4CA}', '\u{1F4DD}', '\u2728', '\u{1F680}',
  '\u{1F9E0}', '\u{1F3AF}', '\u{1F50D}', '\u{1F4A1}', '\u{1F4E7}',
  '\u{1F30D}', '\u2699\uFE0F',
]

interface Props {
  editIcon: string
  editName: string
  editDesc: string
  hasUnsavedChanges: boolean
  justSaved: boolean
  canSave: boolean
  execution: WorkflowExecutionState
  isEditMode: boolean
  saveFlash: boolean
  /** Steps array for dots preview */
  steps: WorkflowStep[]
  /** Total run count for the badge */
  runCount: number
  /** Epoch ms of last run (updatedAt proxy); undefined = never run */
  lastRunAt?: number
  onGoBack: () => void
  onOpenEditor: () => void
  onEnterEditMode: () => void
  onExitEditMode: () => void
  onSave: () => void
  onRun: () => void
  onStop: () => void
  onDelete: () => void
  onUpdateIcon: (emoji: string) => void
  onUpdateName: (v: string) => void
  onUpdateDesc: (v: string) => void
  t: (key: string, params?: Record<string, string>) => string
}

export default function WorkflowDetailHeader({
  editIcon, editName, editDesc, hasUnsavedChanges, justSaved, canSave,
  execution, isEditMode, saveFlash, steps, runCount, lastRunAt,
  onGoBack, onOpenEditor,
  onEnterEditMode, onExitEditMode, onSave,
  onRun, onStop, onDelete,
  onUpdateIcon, onUpdateName, onUpdateDesc, t,
}: Props) {
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus title input when entering inline edit
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  // Reset delete confirm after 2.5s
  useEffect(() => {
    if (!deleteConfirm) return
    const t2 = setTimeout(() => setDeleteConfirm(false), 2500)
    return () => clearTimeout(t2)
  }, [deleteConfirm])

  const accentColor = iconToAccent(editIcon)
  const dotSteps = steps.slice(0, 8)
  const extraSteps = steps.length > 8 ? steps.length - 8 : 0
  const lastRunLabel = lastRunAt && runCount > 0
    ? t('workflow.lastRun', { time: relativeTime(lastRunAt) })
    : t('workflow.neverRun')

  return (
    <>
      {/* Pulse animation for run count badge */}
      <style>{`
        @keyframes wdh-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Category color accent bar — 3px, full width, derived from icon */}
      <div style={{
        height: 3,
        background: accentColor,
        flexShrink: 0,
        opacity: 0.85,
      }} />

      {/* Breadcrumb navigation bar */}
      <div style={{
        padding: '5px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary, rgba(12,12,20,0.97))',
        flexShrink: 0,
      }}>
        <button
          onClick={onGoBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 11, padding: '1px 4px',
            borderRadius: 4, transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft size={11} />
          {t('workflow.breadcrumbList') || 'Workflows'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>›</span>
        {/* Inline editable title */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={editName}
            onChange={e => onUpdateName(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false) }}
            style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
              background: 'var(--bg-hover)', border: '1px solid var(--accent, rgba(99,102,241,0.5))',
              borderRadius: 4, padding: '1px 6px', outline: 'none',
              minWidth: 80, maxWidth: 200,
            }}
          />
        ) : (
          <span
            onClick={() => setEditingTitle(true)}
            title={t('workflow.clickToEditTitle') || 'Click to edit title'}
            style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
              cursor: 'text', padding: '1px 4px', borderRadius: 4,
              border: '1px solid transparent',
              transition: 'border-color 0.15s ease',
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
          >
            {editName}
          </span>
        )}
      </div>

      {/* Header */}
      <div style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${accentColor}`,
        background: saveFlash ? 'rgba(34,197,94, 0.08)' : 'var(--popup-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}>
        {/* Icon (clickable to pick in edit mode, static in view mode) */}
        <div style={{ position: 'relative' }}>
          {isEditMode ? (
            <button
              onClick={() => setShowIconPicker(!showIconPicker)}
              style={{
                fontSize: 22, background: 'none', border: '1px solid transparent',
                borderRadius: 6, cursor: 'pointer', padding: '2px 4px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
              title={t('workflow.changeIcon')}
            >
              {editIcon}
            </button>
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${accentColor}22`,
              border: `1px solid ${accentColor}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              {editIcon}
            </div>
          )}
          {showIconPicker && isEditMode && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--popup-bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)', zIndex: 20, width: 200,
              animation: 'slideUp 0.15s ease',
            }}>
              {WORKFLOW_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onUpdateIcon(emoji); setShowIconPicker(false) }}
                  style={{
                    width: 32, height: 32, border: editIcon === emoji ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border)',
                    borderRadius: 6, background: editIcon === emoji ? 'rgba(99,102,241,0.12)' : 'transparent',
                    cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step dots preview + run metadata — between icon and spacer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Step dots: up to 8 colored dots representing each step's node type */}
          {dotSteps.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                background: 'var(--accent-bg, rgba(99,102,241,0.12))',
                border: '1px solid var(--accent-border, rgba(99,102,241,0.25))',
                borderRadius: 8, padding: '4px 10px',
              }}
              title={`${steps.length} ${t('workflow.stepsLabel')}`}
            >
              {dotSteps.map((step, i) => (
                <div
                  key={step.id ?? i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: STEP_DOT_COLORS[step.nodeType ?? 'prompt'] ?? STEP_DOT_DEFAULT,
                    opacity: 0.85,
                    flexShrink: 0,
                  }}
                />
              ))}
              {extraSteps > 0 && (
                <span style={{ fontSize: 9, color: 'var(--accent-muted, #818cf8)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>+{extraSteps}</span>
              )}
            </div>
          )}

          {/* Run count pill — pulses subtly when > 0 */}
          {runCount > 0 && (
            <span style={{
              fontSize: 11,
              color: 'var(--color-violet, #a78bfa)',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.2)',
              animation: 'wdh-pulse 2.5s ease-in-out infinite',
              flexShrink: 0,
            }}>
              {t('workflow.runCount', { count: String(runCount) })}
            </span>
          )}

          {/* Last run relative timestamp pill */}
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}>
            {lastRunLabel}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {/* Execution summary badge */}
          {execution.isRunning && (
            <span style={{
              fontSize: 10, color: 'var(--accent-muted, #818cf8)', fontWeight: 500,
              padding: '2px 8px', borderRadius: 20,
              background: 'var(--accent-bg, rgba(99,102,241,0.1))',
              border: '1px solid var(--accent-border, rgba(99,102,241,0.2))',
            }}>
              {execution.completedCount}/{execution.totalSteps}
            </span>
          )}
          {!execution.isRunning && execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && (
            <span style={{
              fontSize: 10, color: 'var(--color-success, #22c55e)', fontWeight: 500,
              padding: '2px 8px', borderRadius: 20,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              {t('workflow.canvasComplete')}
            </span>
          )}

          {/* Run / Stop button — semantic color */}
          {execution.isRunning ? (
            <button
              onClick={onStop}
              title={t('workflow.stop') || 'Stop'}
              style={{
                ...actionBtnStyle,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: 'var(--color-error, #f87171)',
                gap: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.55)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
            >
              <Square size={13} />
              <span style={{ fontSize: 12 }}>{t('workflow.stop') || 'Stop'}</span>
            </button>
          ) : (
            <button
              onClick={onRun}
              title={t('workflow.run') || 'Run'}
              style={{
                ...actionBtnStyle,
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)',
                color: 'var(--color-success, #22c55e)',
                gap: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.55)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)' }}
            >
              <Play size={13} />
              <span style={{ fontSize: 12 }}>{t('workflow.run') || 'Run'}</span>
            </button>
          )}

          {/* Mode-specific buttons */}
          {isEditMode ? (
            <>
              {/* Exit edit mode */}
              <button
                onClick={onExitEditMode}
                title={t('workflow.exitEditMode')}
                style={{ ...actionBtnStyle, gap: 4 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <Eye size={14} />
                <span style={{ fontSize: 12 }}>{t('workflow.viewMode')}</span>
              </button>
              {/* Save button */}
              <button
                onClick={onSave}
                disabled={!canSave || !hasUnsavedChanges}
                style={{
                  ...actionBtnStyle,
                  background: hasUnsavedChanges && canSave
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                    : justSaved ? 'var(--color-success, #22c55e)' : 'var(--bg-hover)',
                  color: hasUnsavedChanges && canSave ? 'var(--text-primary)' : justSaved ? 'var(--text-primary)' : 'var(--text-muted)',
                  opacity: hasUnsavedChanges && canSave ? 1 : justSaved ? 1 : 0.4,
                  cursor: hasUnsavedChanges && canSave ? 'pointer' : justSaved ? 'pointer' : 'not-allowed',
                  boxShadow: hasUnsavedChanges && canSave ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                  border: hasUnsavedChanges && canSave ? 'none' : '1px solid var(--border)',
                  borderRadius: 7,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title={hasUnsavedChanges ? `${t('workflow.save')} (Ctrl+S)` : t('workflow.saved')}
              >
                {justSaved ? <Check size={14} /> : <Save size={14} />}
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  {justSaved ? t('workflow.saved') : t('workflow.save')}
                </span>
              </button>
            </>
          ) : (
            <>
              {/* Enter edit mode */}
              <button onClick={onEnterEditMode} title={t('workflow.edit')} style={actionBtnStyle}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <Edit3 size={14} />
                <span style={{ fontSize: 12 }}>{t('workflow.edit')}</span>
              </button>
            </>
          )}

          {/* Delete button — destructive, semantic red */}
          <button
            onClick={() => {
              if (deleteConfirm) { onDelete(); setDeleteConfirm(false) }
              else setDeleteConfirm(true)
            }}
            title={deleteConfirm ? (t('workflow.deleteConfirm') || 'Click again to confirm') : (t('workflow.delete') || 'Delete')}
            style={{
              ...actionBtnStyle,
              background: deleteConfirm ? 'rgba(239,68,68,0.20)' : 'transparent',
              border: `1px solid ${deleteConfirm ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
              color: deleteConfirm ? 'var(--color-error, #f87171)' : 'var(--text-muted)',
              padding: '5px 8px',
            }}
            onMouseEnter={e => {
              if (!deleteConfirm) {
                e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
                e.currentTarget.style.color = 'var(--color-error, #f87171)'
              }
            }}
            onMouseLeave={e => {
              if (!deleteConfirm) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-muted)'
              }
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Description bar (editable only in edit mode) */}
      <div style={{
        padding: '6px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
      }}>
        {isEditMode ? (
          <input
            value={editDesc}
            onChange={e => onUpdateDesc(e.target.value)}
            placeholder={t('workflow.descPlaceholder')}
            maxLength={200}
            style={{
              width: '100%', fontSize: 12, color: 'var(--text-muted)',
              background: 'transparent', border: 'none', outline: 'none',
              padding: '2px 0', marginTop: 2, opacity: 0.8,
            }}
          />
        ) : (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)',
            padding: '2px 0', minHeight: 16, marginTop: 2, opacity: 0.8,
            lineHeight: 1.5,
          }}>
            {editDesc || t('workflow.descPlaceholder')}
          </div>
        )}
      </div>
    </>
  )
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  background: 'var(--border)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontSize: 12,
  transition: 'all 0.15s ease',
}
