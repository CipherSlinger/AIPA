import React, { useState, useMemo, useCallback } from 'react'
import {
  Workflow as WorkflowIcon,
  Plus,
  Search,
  Play,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Copy,
  MoreHorizontal,
} from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { Workflow, WorkflowStep } from '../../types/app.types'
import { useT } from '../../i18n'

const MAX_WORKFLOWS = 50
const MAX_STEPS = 20
const MAX_STEP_PROMPT = 2000
const MAX_NAME_LENGTH = 50
const MAX_DESC_LENGTH = 200

const WORKFLOW_ICONS = ['🔄', '📝', '🔍', '📊', '🎯', '🚀', '💡', '📧', '🗂️', '✅', '📋', '🔧']

const PRESET_WORKFLOWS: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>[] = [
  {
    name: 'Weekly Report',
    description: 'Generate a structured weekly status report',
    icon: '📊',
    steps: [
      { id: 'p1', title: 'Gather accomplishments', prompt: 'List my key accomplishments this week based on our conversation history. Focus on concrete outcomes and deliverables.' },
      { id: 'p2', title: 'Identify blockers', prompt: 'Based on what we discussed, what blockers or challenges did I face? How were they resolved or what still needs attention?' },
      { id: 'p3', title: 'Draft the report', prompt: 'Now compile this into a professional weekly status report with sections: Accomplishments, Challenges, Next Week Plans. Keep it concise and actionable.' },
    ],
  },
  {
    name: 'Code Review',
    description: 'Thorough code review pipeline',
    icon: '🔍',
    steps: [
      { id: 'p1', title: 'Overview scan', prompt: 'Give me a high-level overview of this code. What does it do? What patterns does it use?' },
      { id: 'p2', title: 'Bug & security check', prompt: 'Now examine it for potential bugs, edge cases, and security vulnerabilities. Be thorough.' },
      { id: 'p3', title: 'Improvement suggestions', prompt: 'Suggest specific improvements for readability, performance, and maintainability. Prioritize by impact.' },
    ],
  },
  {
    name: 'Research & Summarize',
    description: 'Deep-dive research with structured output',
    icon: '📝',
    steps: [
      { id: 'p1', title: 'Initial research', prompt: 'Research this topic thoroughly. Provide key facts, different perspectives, and recent developments.' },
      { id: 'p2', title: 'Analysis', prompt: 'Analyze the findings. What are the pros and cons? What trade-offs exist? What does the evidence suggest?' },
      { id: 'p3', title: 'Executive summary', prompt: 'Create a concise executive summary with: Key Takeaways (3-5 bullets), Recommendation, and Next Steps.' },
    ],
  },
]

export default function WorkflowPanel() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToQueue = useChatStore(s => s.addToQueue)
  const addToast = useUiStore(s => s.addToast)

  const workflows: Workflow[] = prefs.workflows || []

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('🔄')
  const [newSteps, setNewSteps] = useState<WorkflowStep[]>([
    { id: `step-${Date.now()}`, title: 'Step 1', prompt: '' },
  ])

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('🔄')
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>([])

  const saveWorkflows = useCallback((updated: Workflow[]) => {
    setPrefs({ workflows: updated })
    window.electronAPI.prefsSet('workflows', updated)
  }, [setPrefs])

  const runWorkflow = useCallback((wf: Workflow) => {
    if (wf.steps.length === 0) return
    // Add all steps to the task queue
    for (const step of wf.steps) {
      addToQueue(step.prompt)
    }
    // Update run count
    saveWorkflows(workflows.map(w =>
      w.id === wf.id ? { ...w, runCount: w.runCount + 1, updatedAt: Date.now() } : w
    ))
    addToast('success', t('workflow.running', { name: wf.name, count: String(wf.steps.length) }))
  }, [addToQueue, workflows, saveWorkflows, addToast, t])

  const createWorkflow = useCallback(() => {
    if (!newName.trim() || newSteps.every(s => !s.prompt.trim())) return
    if (workflows.length >= MAX_WORKFLOWS) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const validSteps = newSteps.filter(s => s.prompt.trim())
    const wf: Workflow = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim().slice(0, MAX_NAME_LENGTH),
      description: newDesc.trim().slice(0, MAX_DESC_LENGTH),
      icon: newIcon,
      steps: validSteps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
    }
    saveWorkflows([wf, ...workflows])
    setShowCreateForm(false)
    setNewName('')
    setNewDesc('')
    setNewIcon('🔄')
    setNewSteps([{ id: `step-${Date.now()}`, title: 'Step 1', prompt: '' }])
    addToast('success', t('workflow.created'))
  }, [newName, newDesc, newIcon, newSteps, workflows, saveWorkflows, addToast, t])

  const deleteWorkflow = useCallback((id: string) => {
    saveWorkflows(workflows.filter(w => w.id !== id))
    if (expandedId === id) setExpandedId(null)
    addToast('info', t('workflow.deleted'))
  }, [workflows, saveWorkflows, expandedId, addToast, t])

  const duplicateWorkflow = useCallback((wf: Workflow) => {
    if (workflows.length >= MAX_WORKFLOWS) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const copy: Workflow = {
      ...wf,
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${wf.name} (copy)`.slice(0, MAX_NAME_LENGTH),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      steps: wf.steps.map(s => ({ ...s, id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}` })),
    }
    saveWorkflows([copy, ...workflows])
    addToast('success', t('workflow.duplicated'))
  }, [workflows, saveWorkflows, addToast, t])

  const startEdit = useCallback((wf: Workflow) => {
    setEditingId(wf.id)
    setEditName(wf.name)
    setEditDesc(wf.description)
    setEditIcon(wf.icon)
    setEditSteps([...wf.steps])
    setExpandedId(wf.id)
  }, [])

  const saveEdit = useCallback(() => {
    if (!editingId || !editName.trim()) return
    const validSteps = editSteps.filter(s => s.prompt.trim())
    saveWorkflows(workflows.map(w =>
      w.id === editingId
        ? { ...w, name: editName.trim(), description: editDesc.trim(), icon: editIcon, steps: validSteps, updatedAt: Date.now() }
        : w
    ))
    setEditingId(null)
    addToast('success', t('workflow.updated'))
  }, [editingId, editName, editDesc, editIcon, editSteps, workflows, saveWorkflows, addToast, t])

  const installPreset = useCallback((preset: typeof PRESET_WORKFLOWS[number]) => {
    if (workflows.length >= MAX_WORKFLOWS) {
      addToast('error', t('workflow.limitReached'))
      return
    }
    const wf: Workflow = {
      ...preset,
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      steps: preset.steps.map(s => ({ ...s, id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}` })),
    }
    saveWorkflows([wf, ...workflows])
    addToast('success', t('workflow.installed', { name: preset.name }))
  }, [workflows, saveWorkflows, addToast, t])

  const addStep = (steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>) => {
    if (steps.length >= MAX_STEPS) return
    setter([...steps, {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      title: `Step ${steps.length + 1}`,
      prompt: '',
    }])
  }

  const removeStep = (steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string) => {
    setter(steps.filter(s => s.id !== stepId))
  }

  const updateStep = (steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, stepId: string, field: 'title' | 'prompt', value: string) => {
    setter(steps.map(s => s.id === stepId ? { ...s, [field]: value } : s))
  }

  const moveStep = (steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>, index: number, direction: 'up' | 'down') => {
    const newStepsArr = [...steps]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newStepsArr.length) return
    ;[newStepsArr[index], newStepsArr[newIndex]] = [newStepsArr[newIndex], newStepsArr[index]]
    setter(newStepsArr)
  }

  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return workflows
    const q = searchQuery.toLowerCase()
    return workflows.filter(w =>
      w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
    )
  }, [workflows, searchQuery])

  const renderStepEditor = (steps: WorkflowStep[], setter: React.Dispatch<React.SetStateAction<WorkflowStep[]>>) => (
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
              onChange={e => updateStep(steps, setter, step.id, 'title', e.target.value)}
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
                <button onClick={() => moveStep(steps, setter, idx, 'up')} style={iconBtnStyle}>
                  <ChevronUp size={11} />
                </button>
              )}
              {idx < steps.length - 1 && (
                <button onClick={() => moveStep(steps, setter, idx, 'down')} style={iconBtnStyle}>
                  <ChevronDown size={11} />
                </button>
              )}
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(steps, setter, step.id)}
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
            onChange={e => updateStep(steps, setter, step.id, 'prompt', e.target.value)}
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
          onClick={() => addStep(steps, setter)}
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-sessionpanel)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 12px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.06) 0%, transparent 100%)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <WorkflowIcon size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('workflow.title')}
            </span>
            <span style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              background: 'var(--input-field-bg)',
              borderRadius: 8,
              padding: '1px 6px',
            }}>
              {workflows.length}
            </span>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            aria-label={t('workflow.create')}
            style={{
              background: showCreateForm ? 'var(--accent)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: 4,
              cursor: 'pointer',
              color: showCreateForm ? '#fff' : 'var(--text-muted)',
              display: 'flex',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('workflow.searchPlaceholder')}
            style={{
              width: '100%',
              height: 28,
              paddingLeft: 26,
              paddingRight: 8,
              background: 'var(--input-field-bg)',
              border: '1px solid var(--input-field-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--input-field-border)')}
          />
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
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
                  onClick={() => setNewIcon(icon)}
                  style={{
                    background: newIcon === icon ? 'var(--accent)' : 'transparent',
                    border: newIcon === icon ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 14,
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={t('workflow.namePlaceholder')}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            style={{
              width: '100%',
              height: 28,
              padding: '0 8px',
              background: 'var(--input-field-bg)',
              border: '1px solid var(--input-field-border)',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 4,
            }}
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder={t('workflow.descPlaceholder')}
            maxLength={MAX_DESC_LENGTH}
            style={{
              width: '100%',
              height: 28,
              padding: '0 8px',
              background: 'var(--input-field-bg)',
              border: '1px solid var(--input-field-border)',
              borderRadius: 6,
              fontSize: 10,
              color: 'var(--text-secondary)',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 6,
            }}
          />
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
            {t('workflow.steps')}
          </div>
          {renderStepEditor(newSteps, setNewSteps)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8 }}>
            <button
              onClick={() => { setShowCreateForm(false); setNewName(''); setNewDesc(''); setNewSteps([{ id: `step-${Date.now()}`, title: 'Step 1', prompt: '' }]) }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: 10,
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {t('workflow.cancel')}
            </button>
            <button
              onClick={createWorkflow}
              disabled={!newName.trim() || newSteps.every(s => !s.prompt.trim())}
              style={{
                background: newName.trim() ? 'var(--accent)' : 'var(--input-field-bg)',
                border: 'none',
                borderRadius: 4,
                padding: '3px 12px',
                fontSize: 10,
                fontWeight: 600,
                color: newName.trim() ? '#fff' : 'var(--text-muted)',
                cursor: newName.trim() ? 'pointer' : 'default',
              }}
            >
              {t('workflow.save')}
            </button>
          </div>
        </div>
      )}

      {/* Workflow list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filteredWorkflows.length === 0 && !showCreateForm ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '50%',
            color: 'var(--text-muted)',
            gap: 8,
            padding: '0 16px',
          }}>
            <WorkflowIcon size={32} style={{ opacity: 0.3, animation: 'wf-pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12 }}>
              {workflows.length === 0 ? t('workflow.emptyState') : t('workflow.noResults')}
            </span>
            {workflows.length === 0 && (
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
                      onClick={() => installPreset(preset)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 8px',
                        marginTop: 4,
                        background: 'var(--input-field-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'border-color 0.15s ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <span style={{ fontSize: 16 }}>{preset.icon}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{preset.steps.length} steps</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          filteredWorkflows.map(wf => {
            const isExpanded = expandedId === wf.id
            const isEditing = editingId === wf.id

            return (
              <div
                key={wf.id}
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
                  onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{wf.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{wf.steps.length} {t('workflow.stepsLabel')}</span>
                      {wf.runCount > 0 && <span>{t('workflow.runCount', { count: String(wf.runCount) })}</span>}
                    </div>
                  </div>
                  {/* Run button */}
                  <button
                    onClick={e => { e.stopPropagation(); runWorkflow(wf) }}
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
                    {wf.description && (
                      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>
                        {wf.description}
                      </div>
                    )}

                    {isEditing ? (
                      /* Edit mode */
                      <div>
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          maxLength={MAX_NAME_LENGTH}
                          style={{
                            width: '100%',
                            height: 26,
                            padding: '0 8px',
                            background: 'var(--input-field-bg)',
                            border: '1px solid var(--accent)',
                            borderRadius: 4,
                            fontSize: 11,
                            color: 'var(--text-primary)',
                            outline: 'none',
                            boxSizing: 'border-box',
                            marginBottom: 4,
                          }}
                        />
                        <input
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          maxLength={MAX_DESC_LENGTH}
                          placeholder={t('workflow.descPlaceholder')}
                          style={{
                            width: '100%',
                            height: 26,
                            padding: '0 8px',
                            background: 'var(--input-field-bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            fontSize: 10,
                            color: 'var(--text-secondary)',
                            outline: 'none',
                            boxSizing: 'border-box',
                            marginBottom: 6,
                          }}
                        />
                        {renderStepEditor(editSteps, setEditSteps)}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
                          <button onClick={() => setEditingId(null)} style={{ ...iconBtnStyle, padding: '2px 8px', fontSize: 10 }}>
                            {t('workflow.cancel')}
                          </button>
                          <button onClick={saveEdit} style={{
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: 4,
                            padding: '2px 10px',
                            fontSize: 10,
                            color: '#fff',
                            cursor: 'pointer',
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
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 6,
                                padding: '4px 6px',
                                background: 'var(--input-field-bg)',
                                borderRadius: 4,
                              }}
                            >
                              <span style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: 'var(--accent)',
                                background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.1)',
                                borderRadius: '50%',
                                width: 16,
                                height: 16,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: 1,
                              }}>
                                {idx + 1}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)' }}>
                                  {step.title}
                                </div>
                                <div style={{
                                  fontSize: 9,
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  lineHeight: 1.4,
                                }}>
                                  {step.prompt}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          <button onClick={() => startEdit(wf)} style={{ ...smallBtnStyle }}>
                            <Edit3 size={10} /> {t('workflow.edit')}
                          </button>
                          <button onClick={() => duplicateWorkflow(wf)} style={{ ...smallBtnStyle }}>
                            <Copy size={10} /> {t('workflow.duplicate')}
                          </button>
                          <button
                            onClick={() => deleteWorkflow(wf.id)}
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
          })
        )}

        {/* Presets section (when workflows exist but searching) */}
        {workflows.length > 0 && !searchQuery && (
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              {t('workflow.presets')}
            </div>
            {PRESET_WORKFLOWS.filter(p => !workflows.some(w => w.name === p.name)).map((preset, i) => (
              <button
                key={i}
                onClick={() => installPreset(preset)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '5px 8px',
                  marginBottom: 3,
                  background: 'transparent',
                  border: '1px dashed var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{ fontSize: 14 }}>{preset.icon}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{preset.steps.length} steps</div>
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
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  padding: 2,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
}

const smallBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 10,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  transition: 'border-color 0.15s ease',
}
