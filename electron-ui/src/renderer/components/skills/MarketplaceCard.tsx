// Marketplace skill card — extracted from SkillsPanel.tsx (Iteration 200)
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
  const [btnHovered, setBtnHovered] = useState(false)
  const catColor = CATEGORY_COLORS[skill.category]
  const srcColor = SOURCE_COLORS[skill.source]
  const description = (language === 'zh-CN' && skill.descriptionZh) ? skill.descriptionZh : skill.description

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: hovered ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'rgba(99,102,241,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Package size={18} style={{ color: '#818cf8' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.82)',
            }}>
              {skill.name}
            </span>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.45)',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}>
              {t(`skills.category_${skill.category.toLowerCase()}`)}
            </span>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 20,
              background: `${srcColor}20`,
              color: srcColor,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}>
              {t(`skills.source_${skill.source.toLowerCase()}`)}
            </span>
          </div>
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.5,
            marginTop: 3,
            marginBottom: 6,
          }}>
            {description}
          </div>
          <div style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.38)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
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
                  border: '1px solid rgba(255,255,255,0.09)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: 9,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#a5b4fc'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
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
                padding: '4px 10px',
                background: 'rgba(34,197,94,0.12)',
                color: '#4ade80',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.22)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.45)'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(34,197,94,0.25)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(34,197,94,0.12)'
                e.currentTarget.style.borderColor = 'rgba(34,197,94,0.25)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <CheckCircle size={12} />
              {t('skills.useNow')}
            </button>
          ) : (
            <button
              onClick={onInstall}
              disabled={isInstalling}
              onMouseEnter={() => setBtnHovered(true)}
              onMouseLeave={() => setBtnHovered(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                color: 'rgba(255,255,255,0.82)',
                border: 'none',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: isInstalling ? 'not-allowed' : 'pointer',
                opacity: isInstalling ? 0.4 : 1,
                transform: btnHovered && !isInstalling ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: btnHovered && !isInstalling ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
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
