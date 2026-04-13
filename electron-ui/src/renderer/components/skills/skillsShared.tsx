// Shared types and components for Skills panel — extracted from SkillsPanel.tsx (Iteration 199)
import React, { useState } from 'react'

export interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
  tags?: string[]
}

export function TabButton({ label, icon, isActive, count, onClick }: {
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
        borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
        color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)',
        fontSize: 12,
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {icon}
      {label}
      <span style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 8,
        background: isActive ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.07)',
        color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.38)',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
      }}>
        {count}
      </span>
    </button>
  )
}

export function CategoryPill({ label, isActive, color, count, onClick }: {
  label: string
  isActive: boolean
  color?: string
  count?: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        borderRadius: 20,
        border: isActive
          ? `1px solid ${color ? `${color}4d` : 'rgba(99,102,241,0.30)'}`
          : hovered
            ? '1px solid rgba(255,255,255,0.13)'
            : '1px solid rgba(255,255,255,0.09)',
        background: isActive
          ? color ? `${color}20` : 'rgba(99,102,241,0.15)'
          : hovered
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.06)',
        color: isActive
          ? color ? color : '#a5b4fc'
          : 'rgba(255,255,255,0.55)',
        fontSize: 11,
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
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
      {count != null && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: isActive ? 'inherit' : 'rgba(255,255,255,0.38)',
          minWidth: 14,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}
