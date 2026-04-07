// WorkflowDetailHeader -- header bar for WorkflowDetailPage (extracted Iteration 511, updated 513)
// Contains: back button, icon picker, execution badge, edit/run/save buttons.
// Iteration 513: Added isEditMode prop to toggle between view/edit header states,
// saveFlash for green flash on Ctrl+S, enterEditMode/exitEditMode callbacks.

import React, { useState } from 'react'
import { ArrowLeft, Play, Edit3, Check, Save, X as XIcon, Eye } from 'lucide-react'
import type { WorkflowExecutionState } from './useWorkflowExecution'

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
  onGoBack: () => void
  onOpenEditor: () => void
  onEnterEditMode: () => void
  onExitEditMode: () => void
  onRunWorkflow: () => void
  onSave: () => void
  onUpdateIcon: (emoji: string) => void
  onUpdateDesc: (v: string) => void
  t: (key: string, params?: Record<string, string>) => string
}

export default function WorkflowDetailHeader({
  editIcon, editDesc, hasUnsavedChanges, justSaved, canSave,
  execution, isEditMode, saveFlash, onGoBack, onOpenEditor,
  onEnterEditMode, onExitEditMode, onRunWorkflow, onSave,
  onUpdateIcon, onUpdateDesc, t,
}: Props) {
  const [showIconPicker, setShowIconPicker] = useState(false)

  return (
    <>
      {/* Header */}
      <div style={{
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        background: saveFlash ? 'rgba(34,197,94, 0.08)' : 'var(--chat-header-bg)',
        flexShrink: 0,
        transition: 'background 0.3s ease',
      }}>
        <button
          onClick={onGoBack}
          aria-label={t('workflow.back')}
          style={iconBtnStyle}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
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
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
              title={t('workflow.changeIcon')}
            >
              {editIcon}
            </button>
          ) : (
            <span style={{ fontSize: 22, padding: '2px 4px' }}>{editIcon}</span>
          )}
          {showIconPicker && isEditMode && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
              borderRadius: 8, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4,
              boxShadow: 'var(--popup-shadow)', zIndex: 20, width: 200,
              animation: 'popup-in 0.12s ease',
            }}>
              {WORKFLOW_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onUpdateIcon(emoji); setShowIconPicker(false) }}
                  style={{
                    width: 32, height: 32, border: editIcon === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 6, background: editIcon === emoji ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'transparent',
                    cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {/* Execution summary badge */}
          {execution.isRunning && (
            <span style={{
              fontSize: 10, color: 'var(--accent)', fontWeight: 500,
              padding: '2px 8px', borderRadius: 10,
              background: 'rgba(var(--accent-rgb,59,130,246),0.1)',
              border: '1px solid rgba(var(--accent-rgb,59,130,246),0.2)',
            }}>
              {execution.completedCount}/{execution.totalSteps}
            </span>
          )}
          {!execution.isRunning && execution.completedCount === execution.totalSteps && execution.totalSteps > 0 && (
            <span style={{
              fontSize: 10, color: '#22c55e', fontWeight: 500,
              padding: '2px 8px', borderRadius: 10,
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
                  background: hasUnsavedChanges && canSave ? 'var(--accent)' : justSaved ? '#22c55e' : 'var(--card-bg)',
                  color: hasUnsavedChanges && canSave ? '#fff' : justSaved ? '#fff' : 'var(--text-muted)',
                  opacity: hasUnsavedChanges && canSave ? 1 : justSaved ? 1 : 0.6,
                  cursor: hasUnsavedChanges && canSave ? 'pointer' : 'default',
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
              <button onClick={onEnterEditMode} title={t('workflow.edit')} style={actionBtnStyle}>
                <Edit3 size={14} />
                <span style={{ fontSize: 12 }}>{t('workflow.edit')}</span>
              </button>
              {/* Run workflow */}
              <button onClick={onRunWorkflow} disabled={execution.isRunning} style={{
                ...actionBtnStyle,
                background: execution.isRunning ? 'var(--border)' : 'var(--accent)',
                color: '#fff',
                opacity: execution.isRunning ? 0.6 : 1,
                cursor: execution.isRunning ? 'not-allowed' : 'pointer',
              }}>
                <Play size={14} fill="#fff" />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{t('workflow.run')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description bar (editable only in edit mode) */}
      <div style={{
        padding: '6px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--chat-header-bg)',
        flexShrink: 0,
      }}>
        {isEditMode ? (
          <input
            value={editDesc}
            onChange={e => onUpdateDesc(e.target.value)}
            placeholder={t('workflow.descPlaceholder')}
            maxLength={200}
            style={{
              width: '100%', fontSize: 11, color: 'var(--text-muted)',
              background: 'transparent', border: 'none', outline: 'none',
              padding: '2px 0',
            }}
          />
        ) : (
          <div style={{
            fontSize: 11, color: 'var(--text-muted)',
            padding: '2px 0', minHeight: 16,
          }}>
            {editDesc || t('workflow.descPlaceholder')}
          </div>
        )}
      </div>
    </>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
  padding: 4, borderRadius: 4,
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontSize: 12,
  transition: 'all 0.15s',
}
