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
  const [searchFocused, setSearchFocused] = useState(false)

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

  const isFiltered = !!(marketplaceCategory || marketplaceSource || searchQuery.trim())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setMainView('chat')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            padding: '5px',
            borderRadius: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <Store size={16} style={{ color: '#818cf8' }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {t('skills.marketplace')}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 20,
          background: 'var(--border)',
          color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {filteredMarketplace.length} {t('skills.skills') || 'skills'}
        </span>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 20px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          borderRadius: 8,
          border: searchFocused
            ? '1px solid rgba(99,102,241,0.40)'
            : '1px solid var(--border)',
          background: 'var(--bg-hover)',
          boxShadow: searchFocused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box' as const,
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t('skills.searchPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Source filter pills */}
          <button
            onClick={() => setMarketplaceSource(null)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: marketplaceSource === null ? '1px solid rgba(99,102,241,0.30)' : '1px solid var(--border)',
              background: marketplaceSource === null ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
              color: marketplaceSource === null ? '#818cf8' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: marketplaceSource === null ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {t('skills.allSources')}
          </button>
          {SKILL_SOURCES.map(src => (
            <button
              key={src}
              onClick={() => setMarketplaceSource(src as SkillSource)}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                border: marketplaceSource === src ? '1px solid rgba(99,102,241,0.30)' : '1px solid var(--border)',
                background: marketplaceSource === src ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                color: marketplaceSource === src ? '#818cf8' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: marketplaceSource === src ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t(`skills.source_${src.toLowerCase()}`)}
            </button>
          ))}
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
          {/* Category filter pills */}
          <button
            onClick={() => setMarketplaceCategory(null)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: marketplaceCategory === null ? '1px solid rgba(99,102,241,0.30)' : '1px solid var(--border)',
              background: marketplaceCategory === null ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
              color: marketplaceCategory === null ? '#818cf8' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: marketplaceCategory === null ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {t('skills.allCategories')}
          </button>
          {SKILL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setMarketplaceCategory(cat as SkillCategory)}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                border: marketplaceCategory === cat ? '1px solid rgba(99,102,241,0.30)' : '1px solid var(--border)',
                background: marketplaceCategory === cat ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                color: marketplaceCategory === cat ? '#818cf8' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: marketplaceCategory === cat ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t(`skills.category_${cat.toLowerCase()}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {filteredMarketplace.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                {isFiltered
                  ? t('skills.results') || 'Results'
                  : t('skills.featured') || 'Featured'}
              </span>
              {!isFiltered && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: 20,
                  background: 'rgba(99,102,241,0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.25)',
                }}>
                  Featured
                </span>
              )}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
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
            </div>
          </>
        )}
        {filteredMarketplace.length === 0 && (
          <div style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: 32,
          }}>
            {t('skills.noResults')}
          </div>
        )}
      </div>
    </div>
  )
}
