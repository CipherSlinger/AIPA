// SkillMarketplacePage — full-page marketplace view opened from Skills panel
import React, { useState, useCallback, useMemo } from 'react'
import { ArrowLeft, Store } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore, useChatStore, usePrefsStore } from '../../store'
import {
  MARKETPLACE_SKILLS,
  SKILL_CATEGORIES,
  SKILL_SOURCES,
  type MarketplaceSkill,
  type SkillCategory,
  type SkillSource,
} from '../../utils/skillMarketplace'
import MarketplaceCard from './MarketplaceCard'

export default function SkillMarketplacePage() {
  const t = useT()
  const setMainView = useUiStore(s => s.setMainView)
  const addToast = useUiStore(s => s.addToast)
  const language = usePrefsStore(s => s.prefs.language)

  const [marketplaceCategory, setMarketplaceCategory] = useState<SkillCategory | null>(null)
  const [marketplaceSource, setMarketplaceSource] = useState<SkillSource | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set())
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null)

  const handleInstallSkill = useCallback(async (skill: MarketplaceSkill) => {
    setInstallingSkillId(skill.id)
    try {
      const result = await window.electronAPI.skillsInstall({
        name: skill.id,
        content: skill.skillContent,
      })
      if (result?.success) {
        addToast('success', t('skills.installSuccess'))
        setInstalledSkillNames(prev => new Set([...prev, skill.name.toLowerCase()]))
      } else {
        addToast('error', result?.error || t('skills.installFailed'))
      }
    } catch (err) {
      addToast('error', String(err))
    } finally {
      setInstallingSkillId(null)
    }
  }, [addToast, t])

  const handleUseSkill = useCallback((skillName: string) => {
    const setQuotedText = useUiStore.getState().setQuotedText
    const slashCmd = `/${skillName.replace(/\s+/g, '-').toLowerCase()}`
    setQuotedText(slashCmd)
    setMainView('chat')
    addToast('success', t('skills.skillActivated'))
  }, [addToast, t, setMainView])

  const filteredMarketplace = useMemo(() => {
    let list: MarketplaceSkill[] = MARKETPLACE_SKILLS
    if (marketplaceCategory) list = list.filter(s => s.category === marketplaceCategory)
    if (marketplaceSource) list = list.filter(s => s.source === marketplaceSource)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [marketplaceCategory, marketplaceSource, searchQuery])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
        borderBottom: '1px solid var(--border)', background: 'var(--chat-header-bg)', flexShrink: 0,
      }}>
        <button
          onClick={() => setMainView('chat')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <ArrowLeft size={16} />
        </button>
        <Store size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {t('skills.marketplace')}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filteredMarketplace.length} {t('skills.skills') || 'skills'}
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('skills.searchPlaceholder')}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
          }}
        />
        <select
          value={marketplaceSource || ''}
          onChange={e => setMarketplaceSource((e.target.value || null) as SkillSource | null)}
          style={{
            padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--input-field-bg)', color: 'var(--text-primary)', fontSize: 11, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">{t('skills.allSources')}</option>
          {SKILL_SOURCES.map(src => (
            <option key={src} value={src}>{t(`skills.source_${src.toLowerCase()}`)}</option>
          ))}
        </select>
        <select
          value={marketplaceCategory || ''}
          onChange={e => setMarketplaceCategory((e.target.value || null) as SkillCategory | null)}
          style={{
            padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--input-field-bg)', color: 'var(--text-primary)', fontSize: 11, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">{t('skills.allCategories')}</option>
          {SKILL_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{t(`skills.category_${cat.toLowerCase()}`)}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {filteredMarketplace.map(skill => (
          <MarketplaceCard
            key={skill.id}
            skill={skill}
            isInstalled={installedSkillNames.has(skill.name.toLowerCase())}
            isInstalling={installingSkillId === skill.id}
            onInstall={() => handleInstallSkill(skill)}
            onUse={() => handleUseSkill(skill.name)}
            t={t}
            language={language}
          />
        ))}
        {filteredMarketplace.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {t('skills.noResults')}
          </div>
        )}
      </div>
    </div>
  )
}
