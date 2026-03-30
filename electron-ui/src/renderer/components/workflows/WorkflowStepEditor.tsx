import React from 'react'
import { Plus, ChevronUp, ChevronDown, X, GripVertical } from 'lucide-react'
import { WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'
import { MAX_STEPS, MAX_STEP_PROMPT, iconBtnStyle } from './workflowConstants'

interface WorkflowStepEditorProps {
  steps: WorkflowStep[]
  setSteps: React.Dispatch<React.SetStateAction<WorkflowStep[]>>
}

function addStep(steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>) {
  if (steps.length >= MAX_STEPS) return
  setter([...steps, {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
    title: `Step ${steps.length + 1}`,
    prompt: '',
  }])
}

function removeStep(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string) {
  setter(prev => prev.filter(s => s.id !== stepId))
}

function updateStep(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, field: 'title' | 'prompt', value: string) {
  setter(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s))
}

function moveStep(steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, index: number, direction: 'up' | 'down') {
  const newStepsArr = [...steps]
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= newStepsArr.length) return
  ;[newStepsArr[index], newStepsArr[newIndex]] = [newStepsArr[newIndex], newStepsArr[index]]
  setter(newStepsArr)
}

export default function WorkflowStepEditor({ steps, setSteps }: WorkflowStepEditorProps) {
  const t = useT()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((step, idx) => (
        <div
          key={step.id}
          style={{
            background: 'var(--input-field-bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <GripVertical size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
              {idx + 1}
            </span>
            <input
              value={step.title}
              onChange={e => updateStep(setSteps, step.id, 'title', e.target.value)}
              placeholder={`Step ${idx + 1}`}
              maxLength={50}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-primary)',
                outline: 'none',
                padding: '1px 4px',
              }}
            />
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {idx > 0 && (
                <button onClick={() => moveStep(steps, setSteps, idx, 'up')} style={iconBtnStyle}>
                  <ChevronUp size={11} />
                </button>
              )}
              {idx < steps.length - 1 && (
                <button onClick={() => moveStep(steps, setSteps, idx, 'down')} style={iconBtnStyle}>
                  <ChevronDown size={11} />
                </button>
              )}
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(setSteps, step.id)}
                  style={{ ...iconBtnStyle, color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
          <textarea
            value={step.prompt}
            onChange={e => updateStep(setSteps, step.id, 'prompt', e.target.value)}
            placeholder={t('workflow.stepPromptPlaceholder')}
            maxLength={MAX_STEP_PROMPT}
            style={{
              width: '100%',
              height: 40,
              padding: '4px 6px',
              background: 'var(--bg-chat)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontSize: 10,
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>
      ))}
      {steps.length < MAX_STEPS && (
        <button
          onClick={() => addStep(steps, setSteps)}
          style={{
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: 6,
            padding: '6px 0',
            fontSize: 10,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <Plus size={12} />
          {t('workflow.addStep')}
        </button>
      )}
    </div>
  )
}
