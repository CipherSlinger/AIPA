// Employees page: Experts (personas), Skills and Workflows as matching card grids.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Workflow as WorkflowIcon, Search, Users2, ClipboardPaste, Plus } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import type { Workflow } from '../../types/app.types'
import type { SkillInfo } from '../skills/skillsShared'
import { useWorkflowCrud } from './useWorkflowCrud'
import { PRESET_WORKFLOWS } from './workflowConstants'
import WorkflowCard from './WorkflowCard'
import WorkflowPersonasSection from './WorkflowPersonasSection'
import { EmployeesSkillsSection, useEmployeeSkills } from './EmployeesSkillsSection'
import SkillDetail from '../skills/SkillDetail'
import { SectionHeader, ToolbarButton, AddCard, PresetCard, SubLabel, EMPLOYEE_GRID } from './EmployeesShared'

type WorkflowCategory = 'singleAgent' | 'teamwork'
type SortKey = 'recent' | 'name' | 'runs'

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

export default function WorkflowPanel() {
  const t = useT()
  const crud = useWorkflowCrud()
  const skillState = useEmployeeSkills()

  // Opening a skill takes over the page, mirroring the old standalone Skills panel
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [deletingSkillPath, setDeletingSkillPath] = useState<string | null>(null)

  const openSkill = async (skill: SkillInfo) => {
    setSelectedSkill(skill)
    try {
      const result = await window.electronAPI.skillsRead(skill.dirPath)
      setSkillContent(result?.content || result?.error || t('skills.readError'))
    } catch (err) {
      setSkillContent(String(err))
    }
  }

  const backFromSkill = () => {
    setSelectedSkill(null)
    setSkillContent('')
    setDeletingSkillPath(null)
  }

  const handleDeleteSkill = async (dirPath: string) => {
    if (deletingSkillPath !== dirPath) {
      setDeletingSkillPath(dirPath)
      setTimeout(() => setDeletingSkillPath(null), 3000)
      return
    }
    if (await skillState.deleteSkill(dirPath)) backFromSkill()
  }

  // Jump to a section when another entry point (Ctrl+4, /skills, palette) landed here
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingSection = useUiStore(s => s.pendingEmployeesSection)
  useEffect(() => {
    if (!pendingSection || selectedSkill) return
    const el = scrollRef.current?.querySelector(`[data-employees-section="${pendingSection}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    useUiStore.getState().clearPendingEmployeesSection()
  }, [pendingSection, selectedSkill])

  if (selectedSkill) {
    return (
      <div style={{ height: '100%' }}>
        <SkillDetail
          skill={selectedSkill}
          skillContent={skillContent}
          deletingSkillPath={deletingSkillPath}
          onBack={backFromSkill}
          onUseSkill={skillState.useSkill}
          onDeleteSkill={handleDeleteSkill}
        />
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="wf-panel-scroll" style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-primary)', scrollbarWidth: 'thin' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 40px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            {t('employees.pageTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {t('employees.pageSub')}
          </div>
        </div>

        <div data-employees-section="agents">
          <WorkflowPersonasSection />
        </div>

        <div style={{ height: 1, background: 'var(--glass-border)', margin: '28px 0 24px' }} />

        <div data-employees-section="skills">
          <EmployeesSkillsSection state={skillState} onOpenSkill={openSkill} />
        </div>

        <div style={{ height: 1, background: 'var(--glass-border)', margin: '28px 0 24px' }} />

        <div data-employees-section="workflows">
          <WorkflowsSection crud={crud} />
        </div>
      </div>
      <style>{`
        .wf-panel-scroll::-webkit-scrollbar { width: 6px; }
        .wf-panel-scroll::-webkit-scrollbar-thumb { background: var(--bg-active); border-radius: 3px; }
      `}</style>
    </div>
  )
}

function WorkflowsSection({ crud }: { crud: ReturnType<typeof useWorkflowCrud> }) {
  const t = useT()
  const [category, setCategory] = useState<WorkflowCategory>('singleAgent')
  const [sortBy, setSortBy] = useState<SortKey>('recent')

  const inCategory = (wf: Workflow) => (category === 'teamwork' ? wf.teamwork === true : !wf.teamwork)
  const allInCategory = useMemo(() => crud.workflows.filter(inCategory), [crud.workflows, category]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const list = crud.filteredWorkflows.filter(inCategory)
    if (sortBy === 'name') return list.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'runs') return list.sort((a, b) => b.runCount - a.runCount)
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [crud.filteredWorkflows, category, sortBy]) // eslint-disable-line react-hooks/exhaustive-deps

  const presets = (category === 'teamwork' ? crud.PRESET_TEAMWORK_WORKFLOWS : PRESET_WORKFLOWS)
    .filter(p => !crud.workflows.some(w => w.presetKey === p.presetKey || w.name === p.name))

  const createNew = () => {
    crud.setNewTeamwork(category === 'teamwork')
    useUiStore.getState().openWorkflowEditor(null)
  }

  const importFromClipboard = async () => {
    const toast = useUiStore.getState().addToast
    try {
      const data = JSON.parse(await navigator.clipboard.readText())
      const valid = (Array.isArray(data) ? data : [data])
        .filter((wf: unknown) => wf && typeof wf === 'object' && (wf as Record<string, unknown>).name && Array.isArray((wf as Record<string, unknown>).steps))
        .map((wf: Record<string, unknown>) => ({
          ...wf,
          id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          runCount: 0,
        }))
      const imported = crud.importWorkflows(valid as Workflow[])
      if (imported > 0) toast('success', t('employees.imported', { count: imported }))
      else toast('error', t('employees.importInvalid'))
    } catch {
      useUiStore.getState().addToast('error', t('employees.clipboardFailed'))
    }
  }

  return (
    <section>
      <SectionHeader
        icon={<WorkflowIcon size={14} />}
        title={t('employees.workflows')}
        subtitle={t('employees.workflowsSub')}
        count={crud.workflows.length}
        actions={
          <>
            <ToolbarButton onClick={importFromClipboard} title={t('employees.importFromClipboard')}>
              <ClipboardPaste size={13} />
              {t('employees.import')}
            </ToolbarButton>
            <ToolbarButton onClick={createNew} primary>
              <Plus size={13} />
              {t('employees.addWorkflow')}
            </ToolbarButton>
          </>
        }
      />

      {/* Filter bar: category segmented control, search, sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', padding: 2, borderRadius: 9, background: 'var(--bg-hover)', border: '1px solid var(--glass-border)' }}>
          {(['singleAgent', 'teamwork'] as WorkflowCategory[]).map(cat => {
            const on = category === cat
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, height: 24, padding: '0 12px', borderRadius: 7, border: 'none',
                  fontSize: 12, fontWeight: on ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s ease',
                  background: on ? 'var(--bg-primary)' : 'transparent',
                  color: on ? '#818cf8' : 'var(--text-muted)',
                  boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                {cat === 'teamwork' ? <Users2 size={12} /> : <WorkflowIcon size={12} />}
                {t(`workflow.${cat}`)}
              </button>
            )
          })}
        </div>

        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={crud.searchQuery}
            onChange={e => crud.setSearchQuery(e.target.value)}
            placeholder={t('workflow.searchPlaceholder')}
            style={{
              width: '100%', height: 28, paddingLeft: 28, paddingRight: 10, boxSizing: 'border-box',
              background: 'var(--bg-hover)', border: '1px solid var(--glass-border)', borderRadius: 8,
              fontSize: 12, color: 'var(--text-primary)', outline: 'none', transition: 'all 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {allInCategory.length > 1 && (
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            aria-label={t('employees.sortLabel')}
            style={{
              height: 28, padding: '0 8px', borderRadius: 8, fontSize: 12, cursor: 'pointer', marginLeft: 'auto',
              background: 'var(--bg-hover)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', outline: 'none',
            }}
          >
            <option value="recent">{t('employees.sortRecent')}</option>
            <option value="name">{t('employees.sortName')}</option>
            <option value="runs">{t('employees.sortRuns')}</option>
          </select>
        )}
      </div>

      {/* Grid */}
      {visible.length === 0 && crud.searchQuery ? (
        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{t('workflow.noResults')}</div>
      ) : (
        <>
          {allInCategory.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              {category === 'teamwork' ? t('workflow.teamworkEmptyHint') : t('workflow.emptyHint')}
            </div>
          )}
          <div style={EMPLOYEE_GRID}>
            {visible.map(wf => (
              <WorkflowCard key={wf.id} wf={wf} onDuplicate={crud.duplicateWorkflow} onDelete={crud.deleteWorkflow} />
            ))}
            {!crud.searchQuery && <AddCard label={t('employees.addWorkflow')} onClick={createNew} minHeight={148} />}
          </div>
        </>
      )}

      {/* Presets not yet installed */}
      {presets.length > 0 && !crud.searchQuery && (
        <>
          <SubLabel>{t('employees.presetsWorkflows')}</SubLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {presets.map(preset => {
              const key = preset.presetKey ?? ''
              return (
                <PresetCard
                  key={key || preset.name}
                  icon={<span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{PRESET_EMOJIS[key] ?? preset.icon}</span>}
                  title={key ? t(`workflow.preset.${key}`) : preset.name}
                  subtitle={key ? t(`workflow.preset.${key}Desc`) : t('employees.steps', { count: preset.steps.length })}
                  onClick={() => crud.installPreset(preset)}
                />
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
