import React, { useMemo, useState } from 'react'
import {
  Workflow as WorkflowIcon,
  Plus,
  Search,
  Users2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import { useWorkflowCrud } from './useWorkflowCrud'
import { WORKFLOW_ICONS, MAX_NAME_LENGTH, MAX_DESC_LENGTH, PRESET_WORKFLOWS } from './workflowConstants'
import WorkflowStepEditor from './WorkflowStepEditor'
import WorkflowItem from './WorkflowItem'
import WorkflowPersonasSection from './WorkflowPersonasSection'

type WorkflowCategory = 'singleAgent' | 'teamwork'

const PRESET_EMOJIS: Record<string, string> = {
  weeklyReport: '📋',
  codeReview: '🔍',
  researchSummarize: '🔬',
  dailySummary: '📅',
  weeklyReview: '📆',
  morningMotivation: '☀️',
  productLaunch: '🚀',
  incidentResponse: '🚨',
  contentPipeline: '✍️',
}

function PresetCard({
  preset,
  onInstall,
  t,
}: {
  preset: { icon: string; name: string; presetKey?: string; steps: unknown[] }
  onInstall: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [hovered, setHovered] = React.useState(false)
  const key = preset.presetKey ?? ''
  const emoji = PRESET_EMOJIS[key] ?? preset.icon
  const name = key ? t(`workflow.preset.${key}`) : preset.name
  const desc = key ? t(`workflow.preset.${key}Desc`) : ''
  return (
    <div
      onClick={onInstall}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hovered ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 8,
        padding: '8px 10px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Emoji circle */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}>
        {emoji}
      </div>
      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.82)',
          marginBottom: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {name}
        </div>
        {desc && (
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.35,
          }}>
            {desc}
          </div>
        )}
        {/* Step count badge */}
        <div style={{
          display: 'inline-block',
          marginTop: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase' as const,
          color: 'rgba(99,102,241,0.9)',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10,
          padding: '1px 6px',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {preset.steps.length} {t('workflow.stepsLabel')}
        </div>
      </div>
    </div>
  )
}

export default function WorkflowPanel() {
  const t = useT()
  const crud = useWorkflowCrud()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'rgba(12,12,20,0.97)',
      borderRight: '1px solid rgba(255,255,255,0.07)',
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
  const [category, setCategory] = useState<WorkflowCategory>('singleAgent')
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'runs'>('recent')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  // Filter workflows by category
  const categoryWorkflows = useMemo(() => {
    return crud.filteredWorkflows.filter(wf =>
      category === 'teamwork' ? wf.teamwork === true : !wf.teamwork
    )
  }, [crud.filteredWorkflows, category])

  const allCategoryWorkflows = useMemo(() => {
    return crud.workflows.filter(wf =>
      category === 'teamwork' ? wf.teamwork === true : !wf.teamwork
    )
  }, [crud.workflows, category])

  const sortedWorkflows = useMemo(() => {
    const wfs = [...categoryWorkflows]
    if (sortBy === 'name') return wfs.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'runs') return wfs.sort((a, b) => b.runCount - a.runCount)
    return wfs.sort((a, b) => b.updatedAt - a.updatedAt) // 'recent'
  }, [categoryWorkflows, sortBy])

  const availableCategories = useMemo(() => {
    const cats = new Set<string>()
    categoryWorkflows.forEach(wf => { if ((wf as any).category) cats.add((wf as any).category) })
    return Array.from(cats)
  }, [categoryWorkflows])

  const filteredWorkflows = categoryFilter
    ? sortedWorkflows.filter(wf => (wf as any).category === categoryFilter)
    : sortedWorkflows

  return (
    <>
      {/* Workflows sub-header with search + create */}
      <div style={{
        padding: '12px 14px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.82)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3 }}>
              {t('workflow.title')}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'rgba(99,102,241,0.85)',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 10,
              padding: '1px 7px',
              letterSpacing: 0.3,
              lineHeight: 1.6,
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}>
              {crud.workflows.length}
            </span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {importStatus && (
              <div style={{
                fontSize: 10,
                color: importStatus.startsWith('✓') ? '#22c55e' : '#f87171',
                padding: '2px 8px',
                background: importStatus.startsWith('✓') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                borderRadius: 4,
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}>
                {importStatus}
              </div>
            )}
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  const data = JSON.parse(text)
                  const workflows = Array.isArray(data) ? data : [data]
                  const valid = workflows.filter((wf: unknown) =>
                    wf && typeof wf === 'object' && (wf as Record<string, unknown>).name && Array.isArray((wf as Record<string, unknown>).steps)
                  ).map((wf: Record<string, unknown>) => ({
                    ...wf,
                    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    runCount: 0,
                  }))
                  const imported = crud.importWorkflows(valid)
                  if (imported > 0) {
                    setImportStatus(`✓ Imported ${imported} workflow${imported > 1 ? 's' : ''}`)
                  } else {
                    setImportStatus('✗ Invalid workflow JSON')
                  }
                  setTimeout(() => setImportStatus(null), 3000)
                } catch {
                  setImportStatus('✗ Could not read clipboard')
                  setTimeout(() => setImportStatus(null), 3000)
                }
              }}
              title="Import workflow from clipboard (paste JSON)"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.45)', fontSize: 11,
                cursor: 'pointer', flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
                e.currentTarget.style.color = '#6366f1'
                e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              ↑ Import
            </button>
            <button
              onClick={() => {
                crud.setNewTeamwork(category === 'teamwork')
                useUiStore.getState().openWorkflowEditor(null)
              }}
              aria-label={t('workflow.create')}
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                borderRadius: 7,
                padding: '5px 10px',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.82)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                boxShadow: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Category tabs: Single-Agent / Teamwork */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
          {(['singleAgent', 'teamwork'] as WorkflowCategory[]).map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                flex: 1,
                padding: '3px 0',
                fontSize: 10,
                fontWeight: category === cat ? 600 : 400,
                background: category === cat ? 'rgba(99,102,241,0.12)' : 'transparent',
                border: `1px solid ${category === cat ? '#6366f1' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 5,
                color: category === cat ? '#6366f1' : 'rgba(255,255,255,0.45)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
              }}
            >
              {cat === 'teamwork' ? <Users2 size={10} /> : <WorkflowIcon size={10} />}
              {t(`workflow.${cat}`)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={crud.searchQuery}
            onChange={e => crud.setSearchQuery(e.target.value)}
            placeholder={t('workflow.searchPlaceholder')}
            style={{
              width: '100%', height: 28, paddingLeft: 26, paddingRight: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.82)', outline: 'none', boxSizing: 'border-box',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              transition: 'all 0.15s ease',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>
      </div>

      {/* Create form */}
      {crud.showCreateForm && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(99,102,241,0.03)',
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
                    background: crud.newIcon === icon ? '#6366f1' : 'transparent',
                    border: crud.newIcon === icon ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.07)',
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
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.82)',
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
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6, fontSize: 10, color: 'rgba(255,255,255,0.60)',
              outline: 'none', boxSizing: 'border-box', marginBottom: 6,
            }}
          />
          {/* Teamwork toggle */}
          <button
            type="button"
            onClick={() => crud.setNewTeamwork(!crud.newTeamwork)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none', padding: '2px 0',
              cursor: 'pointer', marginBottom: 6,
              color: crud.newTeamwork ? '#6366f1' : 'rgba(255,255,255,0.45)',
            }}
          >
            {crud.newTeamwork
              ? <ToggleRight size={16} style={{ color: '#6366f1' }} />
              : <ToggleLeft size={16} />
            }
            <span style={{ fontSize: 10, fontWeight: 600 }}>
              {t('workflow.teamworkToggle')}
            </span>
            <Users2 size={10} style={{ opacity: 0.7 }} />
          </button>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
            {t('workflow.steps')}
          </div>
          <WorkflowStepEditor steps={crud.newSteps} setSteps={crud.setNewSteps} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8 }}>
            <button
              onClick={() => { crud.setShowCreateForm(false); crud.setNewName(''); crud.setNewDesc(''); crud.setNewTeamwork(false); crud.setNewSteps([{ id: `step-${Date.now()}`, title: t('workflow.stepLabel', { n: 1 }), prompt: '' }]) }}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4,
                padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
              }}
            >
              {t('workflow.cancel')}
            </button>
            <button
              onClick={crud.createWorkflow}
              disabled={!crud.newName.trim() || crud.newSteps.every(s => !s.prompt.trim())}
              style={{
                background: crud.newName.trim() ? '#6366f1' : 'rgba(255,255,255,0.08)',
                border: 'none', borderRadius: 4, padding: '3px 12px', fontSize: 10, fontWeight: 600,
                color: crud.newName.trim() ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.45)',
                cursor: crud.newName.trim() ? 'pointer' : 'not-allowed',
                opacity: crud.newName.trim() ? 1 : 0.4,
                transition: 'all 0.15s ease',
              }}
            >
              {t('workflow.save')}
            </button>
          </div>
        </div>
      )}

      {/* Workflow list (Iteration 459: canvas removed, workflows open in main panel) */}
        <div className="wf-panel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', scrollbarWidth: 'thin' }}>
          {/* Category filter tabs */}
          {availableCategories.length > 1 && (
            <div style={{ display: 'flex', gap: 4, padding: '0 0 8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setCategoryFilter(null)}
                style={{
                  fontSize: 10, padding: '2px 9px', borderRadius: 20, cursor: 'pointer',
                  background: !categoryFilter ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                  border: !categoryFilter ? '1px solid rgba(99,102,241,0.30)' : '1px solid rgba(255,255,255,0.07)',
                  color: !categoryFilter ? '#818cf8' : 'rgba(255,255,255,0.45)',
                  fontWeight: !categoryFilter ? 700 : 400,
                  transition: 'all 0.15s ease',
                }}
              >All</button>
              {availableCategories.map(cat => (
                <button key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    fontSize: 10, padding: '2px 9px', borderRadius: 20, cursor: 'pointer',
                    background: categoryFilter === cat ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                    border: categoryFilter === cat ? '1px solid rgba(99,102,241,0.30)' : '1px solid rgba(255,255,255,0.07)',
                    color: categoryFilter === cat ? '#818cf8' : 'rgba(255,255,255,0.45)',
                    fontWeight: categoryFilter === cat ? 700 : 400,
                    transition: 'all 0.15s ease',
                    textTransform: 'capitalize',
                  }}
                >{cat}</button>
              ))}
            </div>
          )}
          {/* Sort controls */}
          {categoryWorkflows.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, padding: '0 4px' }}>
              {(['recent', 'name', 'runs'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: `1px solid ${sortBy === s ? 'rgba(99,102,241,0.50)' : 'rgba(255,255,255,0.07)'}`,
                    background: sortBy === s ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: sortBy === s ? '#818cf8' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    fontWeight: sortBy === s ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s === 'recent' ? t('session.sortNewest') : s === 'name' ? t('session.sortAlpha') : t('session.sortMsgs')}
                </button>
              ))}
            </div>
          )}
          {categoryWorkflows.length === 0 && !crud.showCreateForm ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '50%', color: 'rgba(255,255,255,0.38)', gap: 8, padding: '0 16px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {category === 'teamwork'
              ? <Users2 size={28} style={{ color: 'rgba(255,255,255,0.15)', animation: 'wf-pulse 2s ease-in-out infinite' }} />
              : <WorkflowIcon size={28} style={{ color: 'rgba(255,255,255,0.15)', animation: 'wf-pulse 2s ease-in-out infinite' }} />
            }
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'rgba(255,255,255,0.38)' }}>
              {allCategoryWorkflows.length === 0 ? t('workflow.emptyState') : t('workflow.noResults')}
            </span>
            </div>
            {allCategoryWorkflows.length === 0 && category === 'singleAgent' && (
              <>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', opacity: 0.65, textAlign: 'center' }}>
                  {t('workflow.emptyHint')}
                </span>
                <button
                  onClick={() => {
                    crud.setNewTeamwork(false)
                    useUiStore.getState().openWorkflowEditor(null)
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.82)',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 16px',
                    cursor: 'pointer',
                    marginTop: 4,
                    boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'
                    ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                    ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(99,102,241,0.35)'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                  }}
                >
                  {t('workflow.create')} →
                </button>
                {/* Preset workflows */}
                <div style={{ width: '100%', marginTop: 8 }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.45)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    opacity: 0.7,
                    paddingLeft: 8,
                    borderLeft: '2px solid rgba(99,102,241,0.4)',
                    display: 'block',
                    marginBottom: 6,
                  }}>
                    {t('workflow.presets')}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6 }}>
                    {PRESET_WORKFLOWS.map((preset, i) => (
                      <PresetCard
                        key={i}
                        preset={preset}
                        onInstall={() => crud.installPreset(preset)}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
            {allCategoryWorkflows.length === 0 && category === 'teamwork' && (
              <>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', opacity: 0.7, textAlign: 'center' }}>
                  {t('workflow.teamworkEmptyHint')}
                </span>
                <div style={{ width: '100%', marginTop: 8 }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.45)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    opacity: 0.7,
                    paddingLeft: 8,
                    borderLeft: '2px solid rgba(99,102,241,0.4)',
                    display: 'block',
                    marginBottom: 6,
                  }}>
                    {t('workflow.presets')}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6 }}>
                    {crud.PRESET_TEAMWORK_WORKFLOWS.map((preset, i) => (
                      <PresetCard
                        key={i}
                        preset={preset}
                        onInstall={() => crud.installPreset(preset)}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          filteredWorkflows.map(wf => (
            <WorkflowItem
              key={wf.id}
              wf={wf}
              isExpanded={crud.expandedId === wf.id}
              isEditing={crud.editingId === wf.id}
              crud={crud}
            />
          ))
        )}

        {/* Presets section (when workflows exist but not searching) — only for singleAgent */}
        {allCategoryWorkflows.length > 0 && !crud.searchQuery && category === 'singleAgent' && (
          <div style={{ padding: '8px 12px' }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              opacity: 0.7,
              paddingLeft: 8,
              borderLeft: '2px solid rgba(99,102,241,0.4)',
              marginBottom: 8,
            }}>
              {t('workflow.presets')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {PRESET_WORKFLOWS.filter(p => !crud.workflows.some(w => w.presetKey === p.presetKey || w.name === p.name)).map((preset, i) => (
                <PresetCard
                  key={i}
                  preset={preset}
                  onInstall={() => crud.installPreset(preset)}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}
        {/* Teamwork presets footer */}
        {allCategoryWorkflows.length > 0 && !crud.searchQuery && category === 'teamwork' && (
          <div style={{ padding: '8px 12px' }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              opacity: 0.7,
              paddingLeft: 8,
              borderLeft: '2px solid rgba(99,102,241,0.4)',
              marginBottom: 8,
            }}>
              {t('workflow.presets')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {crud.PRESET_TEAMWORK_WORKFLOWS.filter(p => !crud.workflows.some(w => w.presetKey === p.presetKey || w.name === p.name)).map((preset, i) => (
                <PresetCard
                  key={i}
                  preset={preset}
                  onInstall={() => crud.installPreset(preset)}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}
        </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.38)' }}>
          {t('workflow.footer')}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)' }}>
          {t('workflow.inspired')}
        </span>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes wf-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
        .wf-panel-scroll::-webkit-scrollbar { width: 4px; }
        .wf-panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </>
  )
}
