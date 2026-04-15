// Skill detail view — extracted from SkillsPanel.tsx (Iteration 199)
import React, { useState } from 'react'
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

function getSourceBadgeStyle(source: string): React.CSSProperties {
  if (source === 'personal') {
    return {
      background: 'rgba(99,102,241,0.15)',
      border: '1px solid rgba(99,102,241,0.25)',
      color: '#a5b4fc',
    }
  }
  if (source === 'project') {
    return {
      background: 'rgba(34,197,94,0.12)',
      border: '1px solid rgba(34,197,94,0.25)',
      color: '#4ade80',
    }
  }
  return {
    background: 'var(--border)',
    border: '1px solid var(--bg-active)',
    color: 'var(--text-secondary)',
  }
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
  const [backHovered, setBackHovered] = useState(false)
  const [useHovered, setUseHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)

  const sourceBadge = getSourceBadgeStyle(skill.source)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <button
          onClick={onBack}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
          style={{
            background: backHovered ? 'var(--border)' : 'none',
            border: 'none',
            color: backHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 12,
            gap: 4,
            transition: 'all 0.15s ease',
          }}
          aria-label={t('skills.back')}
        >
          <ArrowLeft size={14} />
        </button>
        <span style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skill.name}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: 20,
          flexShrink: 0,
          ...sourceBadge,
        }}>
          {skill.source === 'personal'
            ? t('skills.personal')
            : skill.source === 'project'
              ? t('skills.project')
              : 'global'}
        </span>
      </div>

      {/* Hero / description section */}
      <div style={{
        margin: '16px 20px 0',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            overflow: 'hidden',
            flexShrink: 0,
            background: 'rgba(99,102,241,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Play size={22} style={{ color: '#818cf8' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 10,
              lineHeight: 1.5,
            }}>
              {skill.description}
            </div>
            {/* Metadata */}
            <div>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 2,
              }}>
                Path
              </span>
              <span style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
                wordBreak: 'break-all' as const,
              }}>
                {skill.dirPath}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => onUseSkill(skill.name)}
          onMouseEnter={() => setUseHovered(true)}
          onMouseLeave={() => setUseHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 20px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: 'rgba(255,255,255,0.95)',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transform: useHovered ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: useHovered ? '0 4px 16px rgba(99,102,241,0.40)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Play size={14} />
          {t('skills.useSkill')}
        </button>

        {skill.source === 'personal' && (
          <button
            onClick={() => onDeleteSkill(skill.dirPath)}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 20px',
              background: deletingSkillPath === skill.dirPath
                ? 'rgba(239,68,68,0.25)'
                : deleteHovered
                  ? 'rgba(239,68,68,0.12)'
                  : 'var(--bg-hover)',
              color: '#fca5a5',
              border: deletingSkillPath === skill.dirPath
                ? '1px solid rgba(239,68,68,0.45)'
                : '1px solid rgba(239,68,68,0.20)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Trash2 size={14} />
            {deletingSkillPath === skill.dirPath ? t('skills.confirmDelete') : t('skills.deleteSkill')}
          </button>
        )}
      </div>

      {/* Skill content preview */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        <div style={{
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}>
            SKILL.md
          </div>
          <pre style={{
            fontSize: 12,
            color: '#a5b4fc',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            margin: 0,
            fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 8,
            padding: '12px 14px',
            border: '1px solid var(--bg-hover)',
          }}>
            {skillContent}
          </pre>
        </div>
      </div>
    </div>
  )
}
