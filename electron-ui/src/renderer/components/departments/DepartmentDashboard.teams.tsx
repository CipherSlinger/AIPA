// Child teams as pills on the parent's page. Without them a team could only be
// reached from the org chart, and a department page would look like its teams
// did not exist.

import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { useDepartmentStore, type Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useI18n } from '../../i18n'
import { deptDisplayName } from './deptUtils'
import { groupSessionsByResolvedDept } from './deptBrief.data'

interface DeptTeamStripProps {
  teams: Department[]
  /** The full session list — team counts are not narrowed by the page search. */
  sessions: SessionListItem[]
  homeDir?: string
  deptColor?: string
  onSelectDept: (deptId: string) => void
}

export default function DeptTeamStrip({ teams, sessions, homeDir, deptColor, onSelectDept }: DeptTeamStripProps) {
  const { t, resolvedLocale } = useI18n()
  // A manual filing changes a team's headcount, so this surface re-renders with
  // the map. One lookup and one resolution per session, not one per chip.
  const filings = useDepartmentStore(s => s.filings)
  const teamCounts = useMemo(() => {
    const { byDept } = groupSessionsByResolvedDept(sessions, {
      departments: teams,
      filings,
      homeDir,
    })
    const counts = new Map<string, number>()
    for (const team of teams) counts.set(team.id, byDept[team.id]?.length ?? 0)
    return counts
  }, [sessions, teams, filings, homeDir])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {teams.map(team => {
        const teamCount = teamCounts.get(team.id) ?? 0
        const teamOpen = team.positions?.length ?? 0
        const color = team.color || deptColor || '#6366f1'
        return (
          <button
            key={team.id}
            onClick={() => onSelectDept(team.id)}
            title={team.directory}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              maxWidth: 220, padding: '4px 10px', borderRadius: 999,
              border: `1px solid ${color}44`, background: `${color}12`,
              color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${color}22` }}
            onMouseLeave={e => { e.currentTarget.style.background = `${color}12` }}
          >
            <Users size={11} style={{ flexShrink: 0, color }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deptDisplayName(team, resolvedLocale)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{teamCount}</span>
            {teamOpen > 0 && (
              <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>· {t('dept.positionOpen')} {teamOpen}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
