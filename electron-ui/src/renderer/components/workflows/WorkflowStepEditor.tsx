import React from 'react'
import { Plus, ChevronUp, ChevronDown, X, GripVertical } from 'lucide-react'
import { WorkflowStep, WorkflowNodeType } from '../../types/app.types'
import { useT } from '../../i18n'
import { MAX_STEPS, MAX_STEP_PROMPT, iconBtnStyle } from './workflowConstants'

interface WorkflowStepEditorProps {
  steps: WorkflowStep[]
  setSteps: React.Dispatch<React.SetStateAction<WorkflowStep[]>>
}

function addStep(steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, t: (key: string, params?: Record<string, string | number>) => string) {
  if (steps.length >= MAX_STEPS) return
  setter([...steps, {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
    title: t('workflow.stepLabel', { n: steps.length + 1 }),
    prompt: '',
  }])
}

function removeStep(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string) {
  setter(prev => prev.filter(s => s.id !== stepId))
}

function updateStep(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, field: 'title' | 'prompt', value: string) {
  setter(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s))
}

function updateStepNodeType(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, nodeType: WorkflowNodeType) {
  setter(prev => prev.map(s => {
    if (s.id !== stepId) return s
    const updated: WorkflowStep = { ...s, nodeType }
    // Initialize defaults for new node types
    if (nodeType === 'condition' && !updated.branches) {
      updated.branches = [{ label: 'Yes', prompt: '' }, { label: 'No', prompt: '' }]
    }
    if (nodeType === 'parallel' && !updated.parallelPrompts) {
      updated.parallelPrompts = ['', '']
    }
    return updated
  }))
}

function updateStepBranch(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, branchIdx: number, prompt: string) {
  setter(prev => prev.map(s => {
    if (s.id !== stepId) return s
    const branches = [...(s.branches ?? [{ label: 'Yes', prompt: '' }, { label: 'No', prompt: '' }])]
    branches[branchIdx] = { ...branches[branchIdx], prompt }
    return { ...s, branches }
  }))
}

function updateParallelPrompt(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, idx: number, value: string) {
  setter(prev => prev.map(s => {
    if (s.id !== stepId) return s
    const parallelPrompts = [...(s.parallelPrompts ?? [])]
    parallelPrompts[idx] = value
    return { ...s, parallelPrompts }
  }))
}

function addParallelPrompt(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string) {
  setter(prev => prev.map(s => {
    if (s.id !== stepId) return s
    return { ...s, parallelPrompts: [...(s.parallelPrompts ?? []), ''] }
  }))
}

function removeParallelPrompt(setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, idx: number) {
  setter(prev => prev.map(s => {
    if (s.id !== stepId) return s
    const parallelPrompts = (s.parallelPrompts ?? []).filter((_, i) => i !== idx)
    return { ...s, parallelPrompts }
  }))
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
              placeholder={t('workflow.stepLabel', { n: idx + 1 })}
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
          {/* Node type selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{t('workflow.nodeType')}:</span>
            <select
              value={step.nodeType ?? 'prompt'}
              onChange={e => updateStepNodeType(setSteps, step.id, e.target.value as WorkflowNodeType)}
              onMouseDown={e => e.stopPropagation()}
              style={{
                fontSize: 10,
                background: 'var(--bg-chat)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                padding: '2px 4px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="prompt">{t('workflow.nodeTypePrompt')}</option>
              <option value="condition">{t('workflow.nodeTypeCondition')}</option>
              <option value="parallel">{t('workflow.nodeTypeParallel')}</option>
            </select>
          </div>

          {/* Prompt / Condition Question */}
          <textarea
            value={step.prompt}
            onChange={e => updateStep(setSteps, step.id, 'prompt', e.target.value)}
            placeholder={(step.nodeType ?? 'prompt') === 'condition' ? t('workflow.conditionQuestion') : t('workflow.stepPromptPlaceholder')}
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

          {/* Template variable hints for steps with prior steps */}
          {idx > 0 && (
            <div style={{ marginTop: 4, padding: '4px 6px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('workflow.availableVariables')}
              </div>
              {steps.slice(0, idx).map((priorStep, priorIdx) => {
                const varName = `{{step_${priorIdx + 1}_output}}`
                const isUsed = step.prompt.includes(varName)
                return (
                  <div
                    key={priorStep.id}
                    title={`Click to insert ${varName}`}
                    onClick={() => updateStep(setSteps, step.id, 'prompt', step.prompt + varName)}
                    style={{
                      fontSize: 9,
                      lineHeight: 1.6,
                      cursor: 'pointer',
                      color: isUsed ? 'var(--accent)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <code style={{
                      fontFamily: 'monospace',
                      background: isUsed ? 'rgba(var(--accent-rgb,59,130,246),0.12)' : 'var(--input-field-bg)',
                      padding: '0 3px',
                      borderRadius: 3,
                      fontSize: 9,
                      color: isUsed ? 'var(--accent)' : 'var(--text-muted)',
                    }}>{varName}</code>
                    <span style={{ opacity: 0.7 }}>
                      {t('workflow.stepLabel', { n: priorIdx + 1 })}{priorStep.title ? `: "${priorStep.title}"` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Condition node: Yes/No branch prompts */}
          {(step.nodeType ?? 'prompt') === 'condition' && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[0, 1].map(bi => {
                const branch = step.branches?.[bi] ?? { label: bi === 0 ? 'Yes' : 'No', prompt: '' }
                return (
                  <div key={bi}>
                    <div style={{ fontSize: 9, color: bi === 0 ? '#22c55e' : '#ef4444', fontWeight: 600, marginBottom: 2 }}>
                      {bi === 0 ? t('workflow.yesBranch') : t('workflow.noBranch')}
                    </div>
                    <textarea
                      value={branch.prompt}
                      onChange={e => updateStepBranch(setSteps, step.id, bi, e.target.value)}
                      placeholder={`${branch.label} branch prompt...`}
                      maxLength={MAX_STEP_PROMPT}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '4px 6px',
                        background: 'var(--bg-chat)',
                        border: `1px solid ${bi === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
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
                )
              })}
            </div>
          )}

          {/* Parallel node: list of sub-prompts */}
          {(step.nodeType ?? 'prompt') === 'parallel' && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 600, marginBottom: 2 }}>{t('workflow.parallelPrompts')}</div>
              {(step.parallelPrompts ?? ['', '']).map((pp, pi) => (
                <div key={pi} style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                  <textarea
                    value={pp}
                    onChange={e => updateParallelPrompt(setSteps, step.id, pi, e.target.value)}
                    placeholder={`Prompt ${pi + 1}...`}
                    maxLength={MAX_STEP_PROMPT}
                    style={{
                      flex: 1,
                      height: 36,
                      padding: '4px 6px',
                      background: 'var(--bg-chat)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      borderRadius: 4,
                      fontSize: 10,
                      color: 'var(--text-primary)',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                  {(step.parallelPrompts ?? []).length > 1 && (
                    <button
                      onClick={() => removeParallelPrompt(setSteps, step.id, pi)}
                      style={{ ...iconBtnStyle, color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }}
                      title={t('workflow.removeParallelPrompt')}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => addParallelPrompt(setSteps, step.id)}
                style={{
                  background: 'transparent',
                  border: '1px dashed rgba(139,92,246,0.4)',
                  borderRadius: 4,
                  padding: '3px 0',
                  fontSize: 10,
                  color: '#8b5cf6',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Plus size={10} />
                {t('workflow.addParallelPrompt')}
              </button>
            </div>
          )}
        </div>
      ))}
      {steps.length < MAX_STEPS && (
        <button
          onClick={() => addStep(steps, setSteps, t)}
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
