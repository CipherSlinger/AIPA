// Installed skill card + section — extracted from SkillsPanel.tsx (Iteration 199)
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

export function SkillCard({ skill, onOpen, onUse }: {
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
