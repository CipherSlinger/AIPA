// Skill detail view — extracted from SkillsPanel.tsx (Iteration 199)
import React from 'react'
import { ArrowLeft, Play, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import type { SkillInfo } from './skillsShared'

interface SkillDetailProps {
  skill: SkillInfo
  skillContent: string
  deletingSkillPath: string | null
  onBack: () => void
  onUseSkill: (name: string) => void
  onDeleteSkill: (dirPath: string) => void
}

export default function SkillDetail({
  skill,
  skillContent,
  deletingSkillPath,
  onBack,
  onUseSkill,
  onDeleteSkill,
}: SkillDetailProps) {
  const t = useT()

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
          onClick={onBack}
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
          {skill.name}
        </span>
        <span style={{
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 10,
          background: skill.source === 'personal'
            ? 'rgba(99, 102, 241, 0.15)'
            : 'rgba(16, 185, 129, 0.15)',
          color: skill.source === 'personal' ? '#6366f1' : '#10b981',
          fontWeight: 500,
        }}>
          {skill.source === 'personal' ? t('skills.personal') : t('skills.project')}
        </span>
      </div>

      {/* Description */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {skill.description}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {skill.dirPath}
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
          onClick={() => onUseSkill(skill.name)}
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

        {skill.source === 'personal' && (
          <button
            onClick={() => onDeleteSkill(skill.dirPath)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: deletingSkillPath === skill.dirPath ? '#ef4444' : 'none',
              color: deletingSkillPath === skill.dirPath ? '#ffffff' : 'var(--text-muted)',
              border: `1px solid ${deletingSkillPath === skill.dirPath ? '#ef4444' : 'var(--card-border)'}`,
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Trash2 size={14} />
            {deletingSkillPath === skill.dirPath ? t('skills.confirmDelete') : t('skills.deleteSkill')}
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
