import React, { useMemo } from 'react'
import {
  Workflow as WorkflowIcon,
  Plus,
  Search,
} from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import { useWorkflowCrud } from './useWorkflowCrud'
import { WORKFLOW_ICONS, MAX_NAME_LENGTH, MAX_DESC_LENGTH, PRESET_WORKFLOWS } from './workflowConstants'
import WorkflowStepEditor from './WorkflowStepEditor'
import WorkflowItem from './WorkflowItem'
import WorkflowPersonasSection from './WorkflowPersonasSection'

export default function WorkflowPanel() {
  const t = useT()
  const crud = useWorkflowCrud()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-sessionpanel)',
      overflow: 'hidden',
    }}>
      {/* Personas section — collapsible, sits above workflows */}
      <WorkflowPersonasSection />
      <WorkflowTabContent crud={crud} t={t} />
    </div>
  )
}

/* Workflows tab content — extracted to keep the main component clean */
function WorkflowTabContent({ crud, t }: {
  crud: ReturnType<typeof useWorkflowCrud>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      {/* Workflows sub-header with search + create */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('workflow.title')} ({crud.workflows.length})
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => useUiStore.getState().openWorkflowEditor(null)}
              aria-label={t('workflow.create')}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: 4,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={crud.searchQuery}
            onChange={e => crud.setSearchQuery(e.target.value)}
            placeholder={t('workflow.searchPlaceholder')}
            style={{
              width: '100%', height: 28, paddingLeft: 26, paddingRight: 8,
              background: 'var(--input-field-bg)', border: '1px solid var(--input-field-border)',
              borderRadius: 6, fontSize: 11, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-field-border)')}
          />
        </div>
      </div>

      {/* Create form */}
      {crud.showCreateForm && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.03)',
          flexShrink: 0,
          maxHeight: '50%',
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxWidth: '100%' }}>
              {WORKFLOW_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => crud.setNewIcon(icon)}
                  style={{
                    background: crud.newIcon === icon ? 'var(--accent)' : 'transparent',
                    border: crud.newIcon === icon ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 4, padding: '2px 4px', fontSize: 14, cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <input
            value={crud.newName}
            onChange={e => crud.setNewName(e.target.value)}
            placeholder={t('workflow.namePlaceholder')}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            style={{
              width: '100%', height: 28, padding: '0 8px',
              background: 'var(--input-field-bg)', border: '1px solid var(--input-field-border)',
              borderRadius: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-primary)',
              outline: 'none', boxSizing: 'border-box', marginBottom: 4,
            }}
          />
          <input
            value={crud.newDesc}
            onChange={e => crud.setNewDesc(e.target.value)}
            placeholder={t('workflow.descPlaceholder')}
            maxLength={MAX_DESC_LENGTH}
            style={{
              width: '100%', height: 28, padding: '0 8px',
              background: 'var(--input-field-bg)', border: '1px solid var(--input-field-border)',
              borderRadius: 6, fontSize: 10, color: 'var(--text-secondary)',
              outline: 'none', boxSizing: 'border-box', marginBottom: 6,
            }}
          />
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
            {t('workflow.steps')}
          </div>
          <WorkflowStepEditor steps={crud.newSteps} setSteps={crud.setNewSteps} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8 }}>
            <button
              onClick={() => { crud.setShowCreateForm(false); crud.setNewName(''); crud.setNewDesc(''); crud.setNewSteps([{ id: `step-${Date.now()}`, title: t('workflow.stepLabel', { n: 1 }), prompt: '' }]) }}
              style={{
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                padding: '3px 10px', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              {t('workflow.cancel')}
            </button>
            <button
              onClick={crud.createWorkflow}
              disabled={!crud.newName.trim() || crud.newSteps.every(s => !s.prompt.trim())}
              style={{
                background: crud.newName.trim() ? 'var(--accent)' : 'var(--input-field-bg)',
                border: 'none', borderRadius: 4, padding: '3px 12px', fontSize: 10, fontWeight: 600,
                color: crud.newName.trim() ? '#fff' : 'var(--text-muted)',
                cursor: crud.newName.trim() ? 'pointer' : 'default',
              }}
            >
              {t('workflow.save')}
            </button>
          </div>
        </div>
      )}

      {/* Workflow list (Iteration 459: canvas removed, workflows open in main panel) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {crud.filteredWorkflows.length === 0 && !crud.showCreateForm ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '50%', color: 'var(--text-muted)', gap: 8, padding: '0 16px',
          }}>
            <WorkflowIcon size={32} style={{ opacity: 0.3, animation: 'wf-pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12 }}>
              {crud.workflows.length === 0 ? t('workflow.emptyState') : t('workflow.noResults')}
            </span>
            {crud.workflows.length === 0 && (
              <>
                <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center' }}>
                  {t('workflow.emptyHint')}
                </span>
                {/* Preset workflows */}
                <div style={{ width: '100%', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {t('workflow.presets')}
                  </span>
                  {PRESET_WORKFLOWS.map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => crud.installPreset(preset)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '6px 8px', marginTop: 4, background: 'var(--input-field-bg)',
                        border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                        textAlign: 'left', transition: 'border-color 0.15s ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <span style={{ fontSize: 16 }}>{preset.icon}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.presetKey ? t(`workflow.preset.${preset.presetKey}`) : preset.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{preset.steps.length} {t('workflow.stepsLabel')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          crud.filteredWorkflows.map(wf => (
            <WorkflowItem
              key={wf.id}
              wf={wf}
              isExpanded={crud.expandedId === wf.id}
              isEditing={crud.editingId === wf.id}
              crud={crud}
            />
          ))
        )}

        {/* Presets section (when workflows exist but not searching) */}
        {crud.workflows.length > 0 && !crud.searchQuery && (
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              {t('workflow.presets')}
            </div>
            {PRESET_WORKFLOWS.filter(p => !crud.workflows.some(w => w.presetKey === p.presetKey || w.name === p.name)).map((preset, i) => (
              <button
                key={i}
                onClick={() => crud.installPreset(preset)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '5px 8px', marginBottom: 3, background: 'transparent',
                  border: '1px dashed var(--border)', borderRadius: 6, cursor: 'pointer',
                  textAlign: 'left', transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{ fontSize: 14 }}>{preset.icon}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.presetKey ? t(`workflow.preset.${preset.presetKey}`) : preset.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{preset.steps.length} {t('workflow.stepsLabel')}</div>
                </div>
                <Plus size={12} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        )}
        </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {t('workflow.footer')}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
          {t('workflow.inspired')}
        </span>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes wf-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
      `}</style>
    </>
  )
}
