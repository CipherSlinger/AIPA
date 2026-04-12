// Installed skill card + section — extracted from SkillsPanel.tsx (Iteration 200)
import React, { useState } from 'react'
import { Puzzle, Play } from 'lucide-react'
import { useT } from '../../i18n'
import type { SkillInfo } from './skillsShared'

export function SkillSection({ label, skills, onOpen, onUse }: {
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
        fontWeight: 700,
        color: 'rgba(255,255,255,0.38)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {label}
        <span style={{
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.45)',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {skills.length}
        </span>
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

function getSourceBadgeStyle(source: string): React.CSSProperties {
  if (source === 'personal') {
    return {
      background: 'rgba(99,102,241,0.15)',
      color: '#a5b4fc',
      border: '1px solid rgba(99,102,241,0.30)',
    }
  }
  if (source === 'project') {
    return {
      background: 'rgba(34,197,94,0.12)',
      color: '#4ade80',
      border: '1px solid rgba(34,197,94,0.28)',
    }
  }
  // global
  return {
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.12)',
  }
}

function getIconStyle(source: string): { color: string; bg: string } {
  if (source === 'personal') return { color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)' }
  if (source === 'project') return { color: '#4ade80', bg: 'rgba(34,197,94,0.12)' }
  return { color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.08)' }
}

export function SkillCard({ skill, onOpen, onUse }: {
  skill: SkillInfo
  onOpen: () => void
  onUse: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [btnHovered, setBtnHovered] = useState(false)
  const t = useT()

  const icon = getIconStyle(skill.source)
  const sourceBadge = getSourceBadgeStyle(skill.source)

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        margin: '4px 8px',
        background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: hovered
          ? '1px solid rgba(255,255,255,0.09)'
          : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: icon.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Puzzle size={18} style={{ color: icon.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {skill.name}
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase' as const,
            borderRadius: 20,
            padding: '1px 7px',
            flexShrink: 0,
            ...sourceBadge,
          }}>
            {skill.source}
          </span>
        </div>
        <div style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.5,
        }}>
          {skill.description}
        </div>
        {skill.tags && skill.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            {skill.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                fontSize: 10,
                borderRadius: 20,
                padding: '1px 7px',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.50)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onUse() }}
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        title={t('skills.useSkill')}
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))',
          border: 'none',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.95)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '5px 10px',
          gap: 4,
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transform: btnHovered ? 'translateY(-1px)' : 'translateY(0)',
          boxShadow: btnHovered ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <Play size={12} />
      </button>
    </div>
  )
}
