// One company's section: its HQ node, and the department cards hanging off it.
//
// Split out of OrgChart.tsx because the section owns all the connector geometry
// for its own subtree — the trunk, the bus and the rail a multi-row section
// hangs its rows from — and that arithmetic has nothing to do with the toolbar,
// the template picker or the popovers the chart itself owns.
//
// The section makes no decisions about *what* to draw: the chart hands it the
// departments it filtered and the teams it indexed, and it lays them out.

import React, { useMemo, useState } from 'react'
import { MessageSquare, Trash2, Users } from 'lucide-react'
import type { Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import DeptCard from './DeptCard'
import DeptPortrait from './DeptPortrait'
import TeamStrip from './TeamStrip'
import { HLine, VLine } from './orgConnectors'
import { GAP, MAX_COLS_FULL, METRICS_FULL, computeLayout, rowCenters } from './orgLayout'

const HQ_ACCENT = '#818cf8'

// A single shared empty array. Writing `?? []` inline would hand every card and
// every strip a fresh array on each render, which is enough to break their memo
// boundaries — and the chart re-renders on every search keystroke.
const NO_SESSIONS: SessionListItem[] = []
const NO_TEAMS: Department[] = []

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** One HQ card and the departments hanging off it. */
export interface OrgSectionProps {
  /** The HQ card's title — a real company name, or the generic one. */
  title: string
  /**
   * The company record this section belongs to. Absent for the legacy section,
   * which is a synthetic grouping of unparented departments rather than a node —
   * there is nothing there to delete, so it gets no HQ action.
   */
  node?: Department
  departments: Department[]
  teamsByDept: Record<string, Department[]>
  sessionsByDept: Record<string, SessionListItem[]>
  sessionsLoading: boolean
  currentSessionId: string | null
  width: number
  dense: boolean
  onSelectDept: (id: string) => void
  onRecruit: (id: string) => void
  onStats: (deptId: string, e: React.MouseEvent) => void
  onDelete: (deptId: string, e: React.MouseEvent) => void
}

export function OrgSection({
  title, node, departments, teamsByDept, sessionsByDept, sessionsLoading, currentSessionId,
  width, dense, onSelectDept, onRecruit, onStats, onDelete,
}: OrgSectionProps) {
  const t = useT()
  const [hqHovered, setHqHovered] = useState(false)
  const layout = useMemo(() => computeLayout(width, departments.length, dense), [width, departments.length, dense])

  // The section's own totals, teams included — a team is a real desk with real
  // employees, it just does not get its own card at this level.
  const allNodes = useMemo(
    () => departments.flatMap(d => [d, ...(teamsByDept[d.id] ?? NO_TEAMS)]),
    [departments, teamsByDept],
  )
  const totalStaff = allNodes.reduce((sum, d) => sum + (sessionsByDept[d.id]?.length ?? 0), 0)
  const totalMessages = allNodes.reduce(
    (sum, d) => sum + (sessionsByDept[d.id] ?? NO_SESSIONS).reduce((n, s) => n + (s.messageCount ?? 0), 0),
    0,
  )

  return (
    <div style={{ marginBottom: 34 }}>
      {/* Company node — centred above a single row, pushed left over the rail otherwise */}
      <div style={{
        display: 'flex',
        justifyContent: layout && !layout.single ? 'flex-start' : 'center',
        paddingLeft: layout && !layout.single ? Math.max(0, layout.spineX - 24) : 0,
      }}>
        <div
          onMouseEnter={() => setHqHovered(true)}
          onMouseLeave={() => setHqHovered(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 18px', borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.10))',
            border: '1px solid rgba(99,102,241,0.34)',
            boxShadow: '0 6px 22px rgba(99,102,241,0.16)',
          }}
        >
          {/* The company is a person at the head of the chart, not a building
              glyph — the same visual grammar as the department cards below it,
              one rank up. The crown marks the rank; the heavier panel is what
              separates this node from a department at a glance. */}
          <DeptPortrait
            name={title}
            // Seeded from the company record, not the heading: the legacy
            // section's title is translated, so seeding from it would give the
            // same company a different face in the other language.
            seed={node?.id ?? 'company:legacy'}
            color={HQ_ACCENT}
            size={46}
            crown
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', ...ELLIPSIS }}>
              {title}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              {t('dept.companyStaff', { depts: String(departments.length), staff: String(totalStaff) })}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8, paddingLeft: 14, borderLeft: '1px solid rgba(99,102,241,0.28)' }}>
            {[
              { icon: <Users size={12} />, value: totalStaff, title: t('dept.staff') },
              { icon: <MessageSquare size={12} />, value: totalMessages, title: t('dept.msgCount') },
            ].map(stat => (
              <span key={stat.title} title={stat.title} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ display: 'flex', color: HQ_ACCENT }}>{stat.icon}</span>
                {sessionsLoading ? '·' : stat.value}
              </span>
            ))}
          </span>

          {/* Deleting a company takes the whole section with it — every
              department below, and every team below those. It is the widest
              action in the chart, so it is the most thoroughly hidden. */}
          {node && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(node.id, e) }}
              title={t('dept.delete')}
              style={{
                flexShrink: 0, padding: 5, borderRadius: 7, border: 'none',
                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer', display: 'flex', transition: 'all 0.15s ease',
                opacity: hqHovered ? 1 : 0, pointerEvents: hqHovered ? 'auto' : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.16)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent' }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Department rows hanging off the trunk */}
      {layout ? (() => {
        const { cardWidth, cardLeft, spineX, single, metrics } = layout
        let cardIndex = 0
        return layout.rows.map((size, rowIndex) => {
          const isLastRow = rowIndex === layout.rows.length - 1
          const centers = rowCenters(size, cardWidth, cardLeft)
          const cards = departments.slice(cardIndex, cardIndex + size)
          cardIndex += size
          return (
            <div
              key={rowIndex}
              style={{ position: 'relative', paddingBottom: isLastRow ? 0 : metrics.rowGap }}
            >
              {single ? (
                <>
                  <VLine x={spineX} top={0} height={metrics.trunk} />
                  <HLine
                    from={Math.min(spineX, centers[0])}
                    to={Math.max(spineX, centers[centers.length - 1])}
                    top={metrics.trunk}
                  />
                </>
              ) : (
                <>
                  {/* Rail: runs the height of every row but the last (which stops at its bus) */}
                  <VLine x={spineX} top={0} height={isLastRow ? metrics.trunk : undefined} stretch={!isLastRow} />
                  <HLine from={spineX} to={centers[centers.length - 1]} top={metrics.trunk} />
                </>
              )}
              {centers.map((x, i) => <VLine key={i} x={x} top={metrics.trunk} height={metrics.drop} />)}

              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${size}, ${cardWidth}px)`,
                // No row gap: the strip's own padding is the trunk-and-drop run,
                // so a gap here would leave the trunk starting in mid-air instead
                // of at the card's bottom edge.
                columnGap: GAP,
                rowGap: 0,
                marginLeft: cardLeft,
                paddingTop: metrics.trunk + metrics.drop,
              }}>
                {cards.map(dept => (
                  <DeptCard
                    key={dept.id}
                    dept={dept}
                    sessions={sessionsByDept[dept.id] ?? NO_SESSIONS}
                    sessionsLoading={sessionsLoading}
                    hasActiveSession={(sessionsByDept[dept.id] ?? NO_SESSIONS).some(s => s.sessionId === currentSessionId)}
                    dense={dense}
                    // The handlers themselves, not a closure per card: see the
                    // note on DeptCardProps.
                    onEnter={onSelectDept}
                    onRecruit={onRecruit}
                    onStats={onStats}
                    onDelete={onDelete}
                  />
                ))}
                {/* Second grid row: the team strips. They live in a row of their
                    own rather than inside the card's column so that every card
                    above keeps the same height — a strip hangs off one card, but
                    the space it needs is shared by the whole row. Columns without
                    teams get an empty cell, which costs nothing. */}
                {cards.map(dept => {
                  const teams = teamsByDept[dept.id] ?? NO_TEAMS
                  return teams.length > 0 ? (
                    <TeamStrip
                      key={dept.id}
                      teams={teams}
                      deptId={dept.id}
                      sessionsByDept={sessionsByDept}
                      sessionsLoading={sessionsLoading}
                      cardWidth={cardWidth}
                      dense={dense}
                      onSelectDept={onSelectDept}
                    />
                  ) : <div key={dept.id} />
                })}
              </div>
            </div>
          )
        })
      })() : (
        // Width not measured yet — lay the cards out without connectors. The
        // team strips are held back too: their bus and drops are placed against a
        // card width that is not known yet, and a bus drawn 100px off would read
        // as a bug rather than as a frame of settling.
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(Math.max(departments.length, 1), MAX_COLS_FULL)}, minmax(0, 1fr))`,
          gap: GAP,
          marginTop: METRICS_FULL.trunk + METRICS_FULL.drop,
        }}>
          {departments.map(dept => (
            <DeptCard
              key={dept.id}
              dept={dept}
              sessions={sessionsByDept[dept.id] ?? NO_SESSIONS}
              sessionsLoading={sessionsLoading}
              hasActiveSession={(sessionsByDept[dept.id] ?? NO_SESSIONS).some(s => s.sessionId === currentSessionId)}
              dense={dense}
              onEnter={onSelectDept}
              onRecruit={onRecruit}
              onStats={onStats}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {departments.length === 0 && (
        <div style={{ padding: '18px 10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, opacity: 0.7 }}>
          {t('dept.noSelectionHint')}
        </div>
      )}
    </div>
  )
}

export default OrgSection