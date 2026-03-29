// Marketplace skill card — extracted from SkillsPanel.tsx (Iteration 199)
import React, { useState } from 'react'
import { Package, Download, CheckCircle, ExternalLink } from 'lucide-react'
import {
  CATEGORY_COLORS,
  SOURCE_COLORS,
  type MarketplaceSkill,
} from '../../utils/skillMarketplace'

interface MarketplaceCardProps {
  skill: MarketplaceSkill
  isInstalled: boolean
  isInstalling: boolean
  onInstall: () => void
  onUse: () => void
  t: (key: string) => string
  language?: string
}

export default function MarketplaceCard({ skill, isInstalled, isInstalling, onInstall, onUse, t, language }: MarketplaceCardProps) {
  const [hovered, setHovered] = useState(false)
  const catColor = CATEGORY_COLORS[skill.category]
  const srcColor = SOURCE_COLORS[skill.source]
  const description = (language === 'zh-CN' && skill.descriptionZh) ? skill.descriptionZh : skill.description

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
              {t(`skills.category_${skill.category.toLowerCase()}`)}
            </span>
            <span style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 8,
              background: `${srcColor}20`,
              color: srcColor,
              fontWeight: 500,
            }}>
              {t(`skills.source_${skill.source.toLowerCase()}`)}
            </span>
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            marginBottom: 6,
          }}>
            {description}
          </div>
          <div style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            opacity: 0.7,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>{t('skills.by')} {skill.author}</span>
            {skill.sourceUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  window.electronAPI.shellOpenExternal(skill.sourceUrl)
                }}
                title={t('skills.openOnGitHub')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '1px 6px',
                  borderRadius: 8,
                  border: '1px solid var(--card-border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 9,
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--card-border)' }}
              >
                <ExternalLink size={9} />
                {t('skills.source')}
              </button>
            )}
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
