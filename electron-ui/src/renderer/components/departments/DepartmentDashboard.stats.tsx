// The stat line above the roster. Open positions and child teams keep their own
// tiles when they exist, so seats and structure are never folded into the
// employee totals.

import { useMemo } from 'react'
import type { Department, Position } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import { buildDeptStats, countToday } from './DepartmentDashboard.data'

interface DeptStatsProps {
  sessions: SessionListItem[]
  positions: Position[]
  teams: Department[]
}

export default function DeptStats({ sessions, positions, teams }: DeptStatsProps) {
  const t = useT()

  const stats = useMemo(
    () => buildDeptStats({
      sessions: sessions.length,
      today: countToday(sessions),
      messages: sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0),
      positions: positions.length,
      teams: teams.length,
    }, t),
    [sessions, positions, teams, t],
  )

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 14,
        padding: '10px 14px',
        background: 'var(--glass-bg-low)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'
        el.style.borderColor = 'var(--border)'
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
        el.style.borderColor = 'var(--border)'
        el.style.transform = 'translateY(0)'
      }}
    >
      {stats.map(stat => (
        <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {stat.value}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.4 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}
