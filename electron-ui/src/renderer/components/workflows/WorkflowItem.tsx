import React from 'react'
import { Play, Trash2, Edit3, Copy, ChevronDown } from 'lucide-react'
import { Workflow } from '../../types/app.types'
import { useT } from '../../i18n'
import { smallBtnStyle, MAX_NAME_LENGTH, MAX_DESC_LENGTH, getPresetStepText } from './workflowConstants'
import WorkflowStepEditor from './WorkflowStepEditor'
import type { useWorkflowCrud } from './useWorkflowCrud'

type CrudReturn = ReturnType<typeof useWorkflowCrud>

interface WorkflowItemProps {
  wf: Workflow
  isExpanded: boolean
  isEditing: boolean
  crud: CrudReturn
}

export default function WorkflowItem({ wf, isExpanded, isEditing, crud }: WorkflowItemProps) {
  const t = useT()

  // Use localized name/description for installed presets
  const displayName = wf.presetKey ? t(`workflow.preset.${wf.presetKey}`) : wf.name
  const displayDesc = wf.presetKey ? t(`workflow.preset.${wf.presetKey}Desc`) : wf.description

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Workflow header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
        }}
        onClick={() => crud.setExpandedId(isExpanded ? null : wf.id)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>{wf.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>{wf.steps.length} {t('workflow.stepsLabel')}</span>
            {wf.runCount > 0 && <span>{t('workflow.runCount', { count: String(wf.runCount) })}</span>}
          </div>
        </div>
        {/* Run button */}
        <button
          onClick={e => { e.stopPropagation(); crud.runWorkflow(wf) }}
          title={t('workflow.run')}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <Play size={10} fill="#fff" />
          {t('workflow.run')}
        </button>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--text-muted)',
            flexShrink: 0,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>

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
                  background: 'var(--input-field-bg)', border: '1px solid var(--accent)',
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
                  background: 'var(--input-field-bg)', border: '1px solid var(--border)',
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
                  background: 'var(--accent)', border: 'none', borderRadius: 4,
                  padding: '2px 10px', fontSize: 10, color: '#fff', cursor: 'pointer',
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
                      padding: '4px 6px', background: 'var(--input-field-bg)', borderRadius: 4,
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: 'var(--accent)',
                      background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.1)',
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
                <button onClick={() => crud.startEdit(wf)} style={{ ...smallBtnStyle }}>
                  <Edit3 size={10} /> {t('workflow.edit')}
                </button>
                <button onClick={() => crud.duplicateWorkflow(wf)} style={{ ...smallBtnStyle }}>
                  <Copy size={10} /> {t('workflow.duplicate')}
                </button>
                <button
                  onClick={() => crud.deleteWorkflow(wf.id)}
                  style={{ ...smallBtnStyle, color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <Trash2 size={10} /> {t('workflow.delete')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
