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
            background: 'rgba(15,15,25,0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.30)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            {/* Drag grip hint */}
            <GripVertical
              size={13}
              style={{
                color: 'rgba(255,255,255,0.45)',
                flexShrink: 0,
                opacity: 0.5,
                cursor: 'grab',
              }}
              title="Drag to reorder"
            />
            {/* Step number badge */}
            <span
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.95)',
                fontWeight: 700,
                flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                borderRadius: '50%',
                width: 16,
                height: 16,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            >
              {idx + 1}
            </span>
            {/* Step type icon badge */}
            {(step.nodeType === 'condition') && (
              <span
                title="Condition step"
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#fbbf24',
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  borderRadius: 6,
                  padding: '1px 4px',
                  flexShrink: 0,
                  lineHeight: 1.4,
                  letterSpacing: 0.3,
                }}
              >
                IF
              </span>
            )}
            {(step.nodeType === 'parallel') && (
              <span
                title="Parallel step"
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#818cf8',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  borderRadius: 6,
                  padding: '1px 4px',
                  flexShrink: 0,
                  lineHeight: 1.4,
                  letterSpacing: 0.3,
                }}
              >
                ∥
              </span>
            )}
            {(!step.nodeType || step.nodeType === 'prompt') && (
              <span
                title="Prompt step"
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.45)',
                  flexShrink: 0,
                  lineHeight: 1,
                  opacity: 0.6,
                }}
              >
                →
              </span>
            )}
            <input
              value={step.title}
              onChange={e => updateStep(setSteps, step.id, 'title', e.target.value)}
              placeholder={t('workflow.stepLabel', { n: idx + 1 })}
              maxLength={50}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.82)',
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
                  style={{ ...iconBtnStyle, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.55)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
          {/* Node type selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>{t('workflow.nodeType')}:</span>
            <select
              value={step.nodeType ?? 'prompt'}
              onChange={e => updateStepNodeType(setSteps, step.id, e.target.value as WorkflowNodeType)}
              onMouseDown={e => e.stopPropagation()}
              style={{
                fontSize: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.82)',
                padding: '2px 6px',
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <option value="prompt">{t('workflow.nodeTypePrompt')}</option>
              <option value="condition">{t('workflow.nodeTypeCondition')}</option>
              <option value="parallel">{t('workflow.nodeTypeParallel')}</option>
            </select>
          </div>

          {/* Prompt / Condition Question */}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.38)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4, marginBottom: 8 }}>
            {(step.nodeType ?? 'prompt') === 'condition' ? t('workflow.conditionQuestion') : 'Prompt'}
          </div>
          <textarea
            value={step.prompt}
            onChange={e => updateStep(setSteps, step.id, 'prompt', e.target.value)}
            placeholder={(step.nodeType ?? 'prompt') === 'condition' ? t('workflow.conditionQuestion') : t('workflow.stepPromptPlaceholder')}
            maxLength={MAX_STEP_PROMPT}
            style={{
              width: '100%',
              height: 40,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgba(255,255,255,0.82)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}
            onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.50)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)' }}
            onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)'; e.currentTarget.style.boxShadow = 'none' }}
          />

          {/* Template variable hints for steps with prior steps */}
          {idx > 0 && (
            <div style={{ marginTop: 4, padding: '6px 8px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
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
                      color: isUsed ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <code style={{
                      fontFamily: 'monospace',
                      background: isUsed ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.06)',
                      border: isUsed ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.08)',
                      padding: '2px 7px',
                      borderRadius: 5,
                      fontSize: 9,
                      color: isUsed ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
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
                    <div style={{ fontSize: 9, color: bi === 0 ? '#22c55e' : '#f87171', fontWeight: 600, marginBottom: 2 }}>
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
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.06)',
                        border: `1px solid ${bi === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.82)',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace',
                        lineHeight: 1.6,
                      }}
                      onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.5)' }}
                      onBlur={e => { e.currentTarget.style.border = `1px solid ${bi === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* Parallel node: list of sub-prompts */}
          {(step.nodeType ?? 'prompt') === 'parallel' && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 9, color: '#a78bfa', fontWeight: 600, marginBottom: 2 }}>{t('workflow.parallelPrompts')}</div>
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
                      padding: '6px 10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.82)',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'monospace',
                      lineHeight: 1.6,
                    }}
                    onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.5)' }}
                    onBlur={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.3)' }}
                  />
                  {(step.parallelPrompts ?? []).length > 1 && (
                    <button
                      onClick={() => removeParallelPrompt(setSteps, step.id, pi)}
                      style={{ ...iconBtnStyle, color: 'rgba(255,255,255,0.45)', flexShrink: 0, marginTop: 4 }}
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
                  color: '#a78bfa',
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
            background: 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))',
            border: 'none',
            borderRadius: 8,
            padding: '6px 0',
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.95)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <Plus size={12} />
          {t('workflow.addStep')}
        </button>
      )}
    </div>
  )
}
