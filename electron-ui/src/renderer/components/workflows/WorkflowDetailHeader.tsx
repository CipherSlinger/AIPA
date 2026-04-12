// WorkflowDetailHeader -- header bar for WorkflowDetailPage (extracted Iteration 511, updated 513)
// Contains: back button, icon picker, execution badge, edit/run/save buttons.
// Iteration 513: Added isEditMode prop to toggle between view/edit header states,
// saveFlash for green flash on Ctrl+S, enterEditMode/exitEditMode callbacks.
// Enhanced: category accent bar, run count badge with pulse, relative last-run time, step dots preview.

import React, { useState } from 'react'
import { ArrowLeft, Edit3, Check, Save, Eye } from 'lucide-react'
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
const STEP_DOT_DEFAULT = 'rgba(255,255,255,0.38)'

const WORKFLOW_EMOJIS = [
  '\u{1F4CB}', '\u{1F4CA}', '\u{1F4DD}', '\u2728', '\u{1F680}',
  '\u{1F9E0}', '\u{1F3AF}', '\u{1F50D}', '\u{1F4A1}', '\u{1F4E7}',
  '\u{1F30D}', '\u2699\uFE0F',
]

interface Props {
  editIcon: string
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
  onUpdateIcon: (emoji: string) => void
  onUpdateDesc: (v: string) => void
  t: (key: string, params?: Record<string, string>) => string
}

export default function WorkflowDetailHeader({
  editIcon, editDesc, hasUnsavedChanges, justSaved, canSave,
  execution, isEditMode, saveFlash, steps, runCount, lastRunAt,
  onGoBack, onOpenEditor,
  onEnterEditMode, onExitEditMode, onSave,
  onUpdateIcon, onUpdateDesc, t,
}: Props) {
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [backHover, setBackHover] = useState(false)

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

      {/* Header */}
      <div style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${accentColor}`,
        background: saveFlash ? 'rgba(34,197,94, 0.08)' : 'rgba(15,15,25,0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
        transition: 'background 0.15s ease',
      }}>
        <button
          onClick={onGoBack}
          aria-label={t('workflow.back')}
          style={{
            ...iconBtnStyle,
            background: backHover ? 'rgba(255,255,255,0.07)' : 'transparent',
            color: backHover ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
        >
          <ArrowLeft size={18} />
        </button>

        {/* Icon (clickable to pick in edit mode, static in view mode) */}
        <div style={{ position: 'relative' }}>
          {isEditMode ? (
            <button
              onClick={() => setShowIconPicker(!showIconPicker)}
              style={{
                fontSize: 22, background: 'none', border: '1px solid transparent',
                borderRadius: 6, cursor: 'pointer', padding: '2px 4px',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
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
              background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 8, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)', zIndex: 20, width: 200,
              animation: 'slideUp 0.15s ease',
            }}>
              {WORKFLOW_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onUpdateIcon(emoji); setShowIconPicker(false) }}
                  style={{
                    width: 32, height: 32, border: editIcon === emoji ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.07)',
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
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)',
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
                <span style={{ fontSize: 9, color: '#818cf8', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>+{extraSteps}</span>
              )}
            </div>
          )}

          {/* Run count pill — pulses subtly when > 0 */}
          {runCount > 0 && (
            <span style={{
              fontSize: 11,
              color: '#a78bfa',
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
            color: 'rgba(255,255,255,0.45)',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
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
              fontSize: 10, color: '#818cf8', fontWeight: 500,
              padding: '2px 8px', borderRadius: 20,
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}>
              {execution.completedCount}/{execution.totalSteps}
            </span>
          )}
          {!execution.isRunning && execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && (
            <span style={{
              fontSize: 10, color: '#22c55e', fontWeight: 500,
              padding: '2px 8px', borderRadius: 20,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              {t('workflow.canvasComplete')}
            </span>
          )}

          {/* Mode-specific buttons */}
          {isEditMode ? (
            <>
              {/* Exit edit mode */}
              <button
                onClick={onExitEditMode}
                title={t('workflow.exitEditMode')}
                style={{ ...actionBtnStyle, gap: 4 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
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
                    : justSaved ? '#22c55e' : 'rgba(255,255,255,0.04)',
                  color: hasUnsavedChanges && canSave ? 'rgba(255,255,255,0.95)' : justSaved ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                  opacity: hasUnsavedChanges && canSave ? 1 : justSaved ? 1 : 0.4,
                  cursor: hasUnsavedChanges && canSave ? 'pointer' : justSaved ? 'pointer' : 'not-allowed',
                  boxShadow: hasUnsavedChanges && canSave ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                  border: hasUnsavedChanges && canSave ? 'none' : '1px solid rgba(255,255,255,0.1)',
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
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
              >
                <Edit3 size={14} />
                <span style={{ fontSize: 12 }}>{t('workflow.edit')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description bar (editable only in edit mode) */}
      <div style={{
        padding: '6px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(15,15,25,0.85)',
        flexShrink: 0,
      }}>
        {isEditMode ? (
          <input
            value={editDesc}
            onChange={e => onUpdateDesc(e.target.value)}
            placeholder={t('workflow.descPlaceholder')}
            maxLength={200}
            style={{
              width: '100%', fontSize: 12, color: 'rgba(255,255,255,0.45)',
              background: 'transparent', border: 'none', outline: 'none',
              padding: '2px 0', marginTop: 2, opacity: 0.8,
            }}
          />
        ) : (
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.45)',
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

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center',
  padding: 6, borderRadius: 6,
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 7,
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.82)',
  fontSize: 12,
  transition: 'all 0.15s ease',
}
