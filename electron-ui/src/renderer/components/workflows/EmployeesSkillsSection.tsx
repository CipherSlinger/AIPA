// Skills section of the Employees page — merged in from the old standalone Skills
// panel so experts, workflows and skills all live on one page with one card language.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Puzzle, Search, X, RefreshCw, Store, Plus, Play, Trash2, ArrowRight } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore, useChatStore } from '../../store'
import type { SkillInfo } from '../skills/skillsShared'
import { MARKETPLACE_SKILLS, type MarketplaceSkill } from '../../utils/skillMarketplace'
import { SectionHeader, ToolbarButton, AddCard, PresetCard, SubLabel, cardStyle, EMPLOYEE_GRID } from './EmployeesShared'

const SOURCE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  personal: { color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.30)' },
  project: { color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)' },
  global: { color: 'var(--text-secondary)', bg: 'var(--border)', border: 'var(--border)' },
}

/** Loads installed skills and exposes the actions the section needs. */
export function useEmployeeSkills() {
  const t = useT()
  const workingDir = useChatStore(s => s.workingDir)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set())
  const [installingId, setInstallingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.skillsList(workingDir || undefined)
      const list: SkillInfo[] = result || []
      setSkills(list)
      setInstalledNames(new Set(list.map(s => s.name.toLowerCase())))
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  useEffect(() => { refresh() }, [refresh])

  // Use a skill: drop its slash command into the chat input and jump back to chat
  const useSkill = useCallback((name: string) => {
    useUiStore.getState().setQuotedText(`/${name.replace(/\s+/g, '-').toLowerCase()}`)
    useUiStore.getState().setActiveNavItem('chat')
    useUiStore.getState().addToast('success', t('skills.skillActivated'))
  }, [t])

  const installSkill = useCallback(async (skill: MarketplaceSkill) => {
    setInstallingId(skill.id)
    try {
      const result = await window.electronAPI.skillsInstall({ name: skill.id, content: skill.skillContent })
      if (result?.success) {
        useUiStore.getState().addToast('success', t('skills.installSuccess'))
        await refresh()
      } else {
        useUiStore.getState().addToast('error', result?.error || t('skills.installFailed'))
      }
    } catch (err) {
      useUiStore.getState().addToast('error', String(err))
    } finally {
      setInstallingId(null)
    }
  }, [t, refresh])

  const deleteSkill = useCallback(async (dirPath: string) => {
    try {
      const result = await window.electronAPI.skillsDelete(dirPath)
      if (result?.success) {
        useUiStore.getState().addToast('success', t('skills.skillDeleted'))
        await refresh()
        return true
      }
      useUiStore.getState().addToast('error', result?.error || t('skills.deleteFailed'))
    } catch (err) {
      useUiStore.getState().addToast('error', String(err))
    }
    return false
  }, [t, refresh])

  return { skills, loading, refresh, useSkill, installSkill, deleteSkill, installedNames, installingId }
}

export type EmployeeSkillsState = ReturnType<typeof useEmployeeSkills>

/** Card mirroring WorkflowCard so the two grids read as one system. */
function SkillCard({ skill, hovered, onOpen, onUse, onDelete }: {
  skill: SkillInfo
  hovered: boolean
  onOpen: () => void
  onUse: () => void
  onDelete: () => void
}) {
  const t = useT()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const src = SOURCE_STYLE[skill.source] ?? SOURCE_STYLE.global

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(false), 2500)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  return (
    <div
      onClick={onOpen}
      style={{ ...cardStyle(hovered, false, '#a78bfa'), padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 148 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: src.bg, border: `1px solid ${src.border}`, color: src.color, flexShrink: 0,
          transform: hovered ? 'scale(1.05)' : 'none', transition: 'transform 0.18s ease',
        }}>
          <Puzzle size={20} />
        </span>
        {skill.source === 'personal' && (
          <button
            title={confirmDelete ? t('skills.confirmDelete') : t('skills.deleteSkill')}
            aria-label={confirmDelete ? t('skills.confirmDelete') : t('skills.deleteSkill')}
            onClick={e => {
              e.stopPropagation()
              if (confirmDelete) { onDelete(); setConfirmDelete(false) } else setConfirmDelete(true)
            }}
            style={{
              width: 22, height: 22, borderRadius: 7, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: hovered || confirmDelete ? 1 : 0, transition: 'all 0.15s ease',
              border: `1px solid ${confirmDelete ? '#f87171' : 'var(--glass-border)'}`,
              background: confirmDelete ? '#f87171' : 'var(--bg-primary)',
              color: confirmDelete ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {skill.name}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
            borderRadius: 20, padding: '1px 6px', color: src.color, background: src.bg, border: `1px solid ${src.border}`,
          }}>
            {t(`skills.${skill.source}`)}
          </span>
        </div>
        {skill.description && (
          <div
            title={skill.description}
            style={{
              fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 3,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {skill.description}
          </div>
        )}
        {skill.tags && skill.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {skill.tags.slice(0, 3).map(tag => (
              <span key={tag} style={{ fontSize: 10, borderRadius: 20, padding: '1px 7px', background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={e => { e.stopPropagation(); onUse() }}
          title={t('skills.useSkill')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: '0 10px', borderRadius: 8,
            border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: hovered ? 'linear-gradient(135deg, rgba(99,102,241,0.92), rgba(139,92,246,0.92))' : 'rgba(99,102,241,0.12)',
            color: hovered ? '#fff' : '#818cf8', transition: 'all 0.15s ease',
          }}
        >
          <Play size={10} fill="currentColor" />
          {t('skills.useSkill')}
        </button>
      </div>
    </div>
  )
}

export function EmployeesSkillsSection({ state, onOpenSkill }: {
  state: EmployeeSkillsState
  onOpenSkill: (skill: SkillInfo) => void
}) {
  const t = useT()
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (!searchQuery.trim()) return state.skills
    const q = searchQuery.toLowerCase()
    return state.skills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
  }, [state.skills, searchQuery])

  const available = useMemo(
    () => MARKETPLACE_SKILLS.filter(s => !state.installedNames.has(s.name.toLowerCase())).slice(0, 8),
    [state.installedNames]
  )

  const openCreator = () => useUiStore.getState().setMainView('skill-creator')
  const openMarketplace = () => useUiStore.getState().setMainView('skill-marketplace')

  return (
    <section>
      <SectionHeader
        icon={<Puzzle size={14} />}
        title={t('employees.skills')}
        subtitle={t('employees.skillsSub')}
        count={state.skills.length}
        actions={
          <>
            <ToolbarButton onClick={state.refresh} title={t('skills.refresh')} disabled={state.loading}>
              <RefreshCw size={13} style={{ animation: state.loading ? 'spin 1s linear infinite' : undefined }} />
              {t('skills.refresh')}
            </ToolbarButton>
            <ToolbarButton onClick={openMarketplace} title={t('skills.marketplace')}>
              <Store size={13} />
              {t('skills.marketplace')}
            </ToolbarButton>
            <ToolbarButton onClick={openCreator} primary>
              <Plus size={13} />
              {t('employees.addSkill')}
            </ToolbarButton>
          </>
        }
      />

      {state.skills.length > 0 && (
        <div style={{ position: 'relative', maxWidth: 320, marginBottom: 14 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('skills.searchPlaceholder')}
            style={{
              width: '100%', height: 28, paddingLeft: 28, paddingRight: searchQuery ? 26 : 10, boxSizing: 'border-box',
              background: 'var(--bg-hover)', border: '1px solid var(--glass-border)', borderRadius: 8,
              fontSize: 12, color: 'var(--text-primary)', outline: 'none', transition: 'all 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label={t('canvas.clearSearchLabel')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {visible.length === 0 && searchQuery ? (
        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{t('skills.noResults')}</div>
      ) : (
        <>
          {state.skills.length === 0 && !state.loading && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              {t('skills.noSkillsHint')}
            </div>
          )}
          <div style={EMPLOYEE_GRID}>
            {visible.map(skill => (
              <div
                key={skill.dirPath}
                onMouseEnter={() => setHoveredPath(skill.dirPath)}
                onMouseLeave={() => setHoveredPath(null)}
              >
                <SkillCard
                  skill={skill}
                  hovered={hoveredPath === skill.dirPath}
                  onOpen={() => onOpenSkill(skill)}
                  onUse={() => state.useSkill(skill.name)}
                  onDelete={() => state.deleteSkill(skill.dirPath)}
                />
              </div>
            ))}
            {!searchQuery && <AddCard label={t('employees.addSkill')} onClick={openCreator} minHeight={148} />}
          </div>
        </>
      )}

      {available.length > 0 && !searchQuery && (
        <>
          <SubLabel>{t('employees.presetsSkills')}</SubLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {available.map(skill => (
              <PresetCard
                key={skill.id}
                icon={<span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Puzzle size={15} style={{ color: '#a78bfa' }} /></span>}
                title={state.installingId === skill.id ? t('skills.installing') : skill.name}
                subtitle={skill.description}
                onClick={() => state.installSkill(skill)}
              />
            ))}
          </div>
          <button
            onClick={openMarketplace}
            style={{
              marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
              color: '#818cf8', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
            }}
          >
            {t('skills.browseMarketplace')}
            <ArrowRight size={13} />
          </button>
        </>
      )}
    </section>
  )
}
