// Skills panel — decomposed orchestrator (Iteration 199)
// Sub-components: SkillDetail, SkillCard, MarketplaceCard, skillsShared
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Puzzle, Search, X, RefreshCw, Store, Plus,
} from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore, useChatStore } from '../../store'
import { MARKETPLACE_SKILLS } from '../../utils/skillMarketplace'
import { type SkillInfo } from './skillsShared'
import SkillDetail from './SkillDetail'
import { SkillSection } from './SkillCard'

export default function SkillsPanel() {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const workingDir = useChatStore(s => s.workingDir)

  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [deletingSkillPath, setDeletingSkillPath] = useState<string | null>(null)

  // Load installed skills
  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.skillsList(workingDir || undefined)
      setSkills(result || [])
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // Load skill detail content
  const handleOpenSkill = useCallback(async (skill: SkillInfo) => {
    setSelectedSkill(skill)
    try {
      const result = await window.electronAPI.skillsRead(skill.dirPath)
      if (result?.content) {
        setSkillContent(result.content)
      } else {
        setSkillContent(result?.error || t('skills.readError'))
      }
    } catch (err) {
      setSkillContent(String(err))
    }
  }, [])

  const handleBack = useCallback(() => {
    setSelectedSkill(null)
    setSkillContent('')
    setDeletingSkillPath(null)
  }, [])

  // Use skill — insert slash command into chat input
  const handleUseSkill = useCallback((skillName: string) => {
    const slashCmd = `/${skillName.replace(/\s+/g, '-').toLowerCase()}`
    setQuotedText(slashCmd)
    addToast('success', t('skills.skillActivated'))
  }, [setQuotedText, addToast, t])

  // Delete skill (personal only)
  const handleDeleteSkill = useCallback(async (dirPath: string) => {
    if (deletingSkillPath === dirPath) {
      try {
        const result = await window.electronAPI.skillsDelete(dirPath)
        if (result?.success) {
          addToast('success', t('skills.skillDeleted'))
          setSelectedSkill(null)
          setDeletingSkillPath(null)
          loadSkills()
        } else {
          addToast('error', result?.error || t('skills.deleteFailed'))
        }
      } catch (err) {
        addToast('error', String(err))
      }
    } else {
      setDeletingSkillPath(dirPath)
      setTimeout(() => setDeletingSkillPath(null), 3000)
    }
  }, [deletingSkillPath, addToast, t, loadSkills])

  // Create skill — open the skill-creator form in the main view (Iteration 535)
  const handleCreateSkill = useCallback(() => {
    useUiStore.getState().setMainView('skill-creator')
  }, [])

  // Filter installed skills by search
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills
    const q = searchQuery.toLowerCase()
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [skills, searchQuery])

  // ── Skill Detail View ──
  if (selectedSkill) {
    return (
      <SkillDetail
        skill={selectedSkill}
        skillContent={skillContent}
        deletingSkillPath={deletingSkillPath}
        onBack={handleBack}
        onUseSkill={handleUseSkill}
        onDeleteSkill={handleDeleteSkill}
      />
    )
  }

  // ── Main List / Marketplace View ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('skills.title')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => useUiStore.getState().setMainView('skill-marketplace')}
            aria-label={t('skills.marketplace')}
            title={t('skills.marketplace')}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 500,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Store size={14} />
            {t('skills.marketplace')}
          </button>
          <button
            onClick={handleCreateSkill}
            aria-label={t('skills.createSkill')}
            title={t('skills.createSkill')}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 500,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Plus size={14} />
            {t('skills.create')}
          </button>
          <button
            onClick={loadSkills}
            aria-label={t('skills.refresh')}
            title={t('skills.refresh')}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              fontSize: 12,
              transition: 'border-color 0.15s, color 0.15s',
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 8px',
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
        }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('skills.searchPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {skills.length === 0 && !loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            <Puzzle size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              {t('skills.noSkills')}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 240 }}>
              {t('skills.noSkillsHint')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => useUiStore.getState().setMainView('skill-marketplace')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <Store size={14} />
                {t('skills.browseMarketplace')}
              </button>
              <button
                onClick={handleCreateSkill}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  background: 'none',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <Plus size={14} />
                {t('skills.createOwn')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {filteredSkills.filter(s => s.source === 'personal').length > 0 && (
              <SkillSection
                label={t('skills.personalSkills')}
                skills={filteredSkills.filter(s => s.source === 'personal')}
                onOpen={handleOpenSkill}
                onUse={handleUseSkill}
              />
            )}
            {filteredSkills.filter(s => s.source === 'project').length > 0 && (
              <SkillSection
                label={t('skills.projectSkills')}
                skills={filteredSkills.filter(s => s.source === 'project')}
                onOpen={handleOpenSkill}
                onUse={handleUseSkill}
              />
            )}
            {filteredSkills.length === 0 && searchQuery.trim() && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}>
                {t('skills.noResults')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
