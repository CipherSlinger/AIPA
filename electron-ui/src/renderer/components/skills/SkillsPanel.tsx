import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Puzzle, Search, X, RefreshCw, Play, ArrowLeft, Trash2,
  FolderOpen, Download, CheckCircle, Store, Package,
} from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore, useChatStore } from '../../store'
import {
  MARKETPLACE_SKILLS,
  SKILL_CATEGORIES,
  CATEGORY_COLORS,
  type MarketplaceSkill,
  type SkillCategory,
} from '../../utils/skillMarketplace'

interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
}

type TabView = 'installed' | 'marketplace'

export default function SkillsPanel() {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const workingDir = useChatStore(s => s.workingDir)

  const [activeTab, setActiveTab] = useState<TabView>('installed')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [deletingSkillPath, setDeletingSkillPath] = useState<string | null>(null)
  const [marketplaceCategory, setMarketplaceCategory] = useState<SkillCategory | null>(null)
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set())
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null)

  // Load installed skills
  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.skillsList(workingDir || undefined)
      setSkills(result || [])
      setInstalledSkillNames(new Set((result || []).map((s: SkillInfo) => s.name.toLowerCase())))
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
        setSkillContent(result?.error || 'Could not read skill file')
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
      // Second click — confirm delete
      try {
        const result = await window.electronAPI.skillsDelete(dirPath)
        if (result?.success) {
          addToast('success', t('skills.skillDeleted'))
          setSelectedSkill(null)
          setDeletingSkillPath(null)
          loadSkills()
        } else {
          addToast('error', result?.error || 'Delete failed')
        }
      } catch (err) {
        addToast('error', String(err))
      }
    } else {
      setDeletingSkillPath(dirPath)
      // Reset after 3 seconds
      setTimeout(() => setDeletingSkillPath(null), 3000)
    }
  }, [deletingSkillPath, addToast, t, loadSkills])

  // Install marketplace skill
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
        loadSkills()
      } else {
        addToast('error', result?.error || 'Install failed')
      }
    } catch (err) {
      addToast('error', String(err))
    } finally {
      setInstallingSkillId(null)
    }
  }, [addToast, t, loadSkills])

  // Filter installed skills by search
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills
    const q = searchQuery.toLowerCase()
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [skills, searchQuery])

  // Filter marketplace skills
  const filteredMarketplace = useMemo(() => {
    let list = MARKETPLACE_SKILLS
    if (marketplaceCategory) {
      list = list.filter(s => s.category === marketplaceCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [marketplaceCategory, searchQuery])

  // ── Skill Detail View ──
  if (selectedSkill) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            aria-label={t('skills.back')}
          >
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            {selectedSkill.name}
          </span>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 10,
            background: selectedSkill.source === 'personal'
              ? 'rgba(99, 102, 241, 0.15)'
              : 'rgba(16, 185, 129, 0.15)',
            color: selectedSkill.source === 'personal' ? '#6366f1' : '#10b981',
            fontWeight: 500,
          }}>
            {selectedSkill.source === 'personal' ? t('skills.personal') : t('skills.project')}
          </span>
        </div>

        {/* Description */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {selectedSkill.description}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {selectedSkill.dirPath}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => handleUseSkill(selectedSkill.name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
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
            <Play size={14} />
            {t('skills.useSkill')}
          </button>

          {selectedSkill.source === 'personal' && (
            <button
              onClick={() => handleDeleteSkill(selectedSkill.dirPath)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: deletingSkillPath === selectedSkill.dirPath ? '#ef4444' : 'none',
                color: deletingSkillPath === selectedSkill.dirPath ? '#ffffff' : 'var(--text-muted)',
                border: `1px solid ${deletingSkillPath === selectedSkill.dirPath ? '#ef4444' : 'var(--card-border)'}`,
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Trash2 size={14} />
              {deletingSkillPath === selectedSkill.dirPath ? t('skills.confirmDelete') : t('skills.deleteSkill')}
            </button>
          )}
        </div>

        {/* Skill content preview */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            SKILL.md
          </div>
          <pre style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.6,
            margin: 0,
            fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
            background: 'var(--code-bg, rgba(0,0,0,0.1))',
            borderRadius: 8,
            padding: 12,
          }}>
            {skillContent}
          </pre>
        </div>
      </div>
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

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <TabButton
          label={t('skills.installed')}
          icon={<Package size={14} />}
          isActive={activeTab === 'installed'}
          count={skills.length}
          onClick={() => setActiveTab('installed')}
        />
        <TabButton
          label={t('skills.marketplace')}
          icon={<Store size={14} />}
          isActive={activeTab === 'marketplace'}
          count={MARKETPLACE_SKILLS.length}
          onClick={() => setActiveTab('marketplace')}
        />
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

      {/* Marketplace category filter */}
      {activeTab === 'marketplace' && (
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '8px 14px',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <CategoryPill
            label={t('skills.allCategories')}
            isActive={marketplaceCategory === null}
            color={undefined}
            onClick={() => setMarketplaceCategory(null)}
          />
          {SKILL_CATEGORIES.map(cat => (
            <CategoryPill
              key={cat}
              label={cat}
              isActive={marketplaceCategory === cat}
              color={CATEGORY_COLORS[cat]}
              onClick={() => setMarketplaceCategory(cat === marketplaceCategory ? null : cat)}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'installed' ? (
          // ── Installed Skills ──
          <>
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
                <button
                  onClick={() => setActiveTab('marketplace')}
                  style={{
                    marginTop: 16,
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
              </div>
            ) : (
              <>
                {/* Personal skills section */}
                {filteredSkills.filter(s => s.source === 'personal').length > 0 && (
                  <SkillSection
                    label={t('skills.personalSkills')}
                    skills={filteredSkills.filter(s => s.source === 'personal')}
                    onOpen={handleOpenSkill}
                    onUse={handleUseSkill}
                  />
                )}
                {/* Project skills section */}
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
          </>
        ) : (
          // ── Marketplace ──
          <div style={{ padding: '4px 0' }}>
            {filteredMarketplace.map(skill => (
              <MarketplaceCard
                key={skill.id}
                skill={skill}
                isInstalled={installedSkillNames.has(skill.name.toLowerCase())}
                isInstalling={installingSkillId === skill.id}
                onInstall={() => handleInstallSkill(skill)}
                onUse={() => handleUseSkill(skill.name)}
                t={t}
              />
            ))}
            {filteredMarketplace.length === 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}>
                {t('skills.noResults')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function TabButton({ label, icon, isActive, count, onClick }: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 0',
        background: 'none',
        border: 'none',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 12,
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {icon}
      {label}
      <span style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 8,
        background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(128,128,128,0.15)',
        fontWeight: 500,
      }}>
        {count}
      </span>
    </button>
  )
}

function CategoryPill({ label, isActive, color, onClick }: {
  label: string
  isActive: boolean
  color?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 12,
        border: `1px solid ${isActive && color ? color : 'var(--card-border)'}`,
        background: isActive && color ? `${color}20` : isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
        color: isActive && color ? color : isActive ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11,
        fontWeight: isActive ? 500 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {color && (
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
        }} />
      )}
      {label}
    </button>
  )
}

function SkillSection({ label, skills, onOpen, onUse }: {
  label: string
  skills: SkillInfo[]
  onOpen: (skill: SkillInfo) => void
  onUse: (name: string) => void
}) {
  return (
    <div>
      <div style={{
        padding: '10px 14px 6px',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label} ({skills.length})
      </div>
      {skills.map(skill => (
        <SkillCard
          key={skill.dirPath}
          skill={skill}
          onOpen={() => onOpen(skill)}
          onUse={() => onUse(skill.name)}
        />
      ))}
    </div>
  )
}

function SkillCard({ skill, onOpen, onUse }: {
  skill: SkillInfo
  onOpen: () => void
  onUse: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const t = useT()

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        transition: 'background 0.1s',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: skill.source === 'personal'
          ? 'rgba(99, 102, 241, 0.12)'
          : 'rgba(16, 185, 129, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Puzzle size={18} style={{
          color: skill.source === 'personal' ? '#6366f1' : '#10b981',
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skill.name}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginTop: 2,
        }}>
          {skill.description}
        </div>
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onUse() }}
          title={t('skills.useSkill')}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            gap: 4,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          <Play size={12} />
        </button>
      )}
    </div>
  )
}

function MarketplaceCard({ skill, isInstalled, isInstalling, onInstall, onUse, t }: {
  skill: MarketplaceSkill
  isInstalled: boolean
  isInstalling: boolean
  onInstall: () => void
  onUse: () => void
  t: (key: string) => string
}) {
  const [hovered, setHovered] = useState(false)
  const catColor = CATEGORY_COLORS[skill.category]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${catColor}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Package size={18} style={{ color: catColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}>
              {skill.name}
            </span>
            <span style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 8,
              background: `${catColor}20`,
              color: catColor,
              fontWeight: 500,
            }}>
              {skill.category}
            </span>
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            marginBottom: 6,
          }}>
            {skill.description}
          </div>
          <div style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            opacity: 0.7,
          }}>
            {t('skills.by')} {skill.author}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {isInstalled ? (
            <button
              onClick={onUse}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              <CheckCircle size={12} />
              {t('skills.useNow')}
            </button>
          ) : (
            <button
              onClick={onInstall}
              disabled={isInstalling}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                background: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: isInstalling ? 'wait' : 'pointer',
                opacity: isInstalling ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!isInstalling) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!isInstalling) e.currentTarget.style.opacity = '1' }}
            >
              <Download size={12} />
              {isInstalling ? t('skills.installing') : t('skills.install')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
