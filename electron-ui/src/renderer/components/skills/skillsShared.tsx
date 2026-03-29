// Shared types and components for Skills panel — extracted from SkillsPanel.tsx (Iteration 199)
import React from 'react'

export interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
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

export function CategoryPill({ label, isActive, color, count, onClick }: {
  label: string
  isActive: boolean
  color?: string
  count?: number
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
      {count != null && (
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          opacity: 0.7,
          minWidth: 14,
          textAlign: 'center',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}
