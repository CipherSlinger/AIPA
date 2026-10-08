// OrgChart — the company diagram at the top of the 「部门」 view.
//
// The tree has three levels and this file draws two of them:
//
//   company      one section per company record, with its own HQ card
//     department the cards hanging off that HQ
//       team     a small drawn sub-tree under the card (level toggle)
//
// Employees (sessions) are deliberately *not* listed at this level — a team chip
// shows a headcount, and clicking any card or chip drills into that node's
// roster, where the figures live. A node with no company parent still renders,
// under a generic HQ section, which is how every pre-template install looked.
//
// Within a section the tree re-flows as the nodes are added, so it never
// degenerates into a long ribbon of cards. Two shapes, picked from how many
// departments there are and how much room the pane has:
//
//   1 row  — symmetric: HQ centred, a trunk dropping straight into the middle of
//            the row, with a bus spanning the card centres.
//   2+ rows — a rail: the trunk runs down the left edge and every row hangs off
//            it on its own bus. Column count comes from the measured width, and
//            the rows are balanced so the last one never holds a single stray
//            card. Past DENSE_FROM departments the cards themselves compact and
//            more columns fit.
//
// Card and connector coordinates are computed in pixels from the measured
// container width (a percentage bus would drift off the card centres by the gap).
import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Building2, ChevronRight, FolderOpen, LayoutGrid, MessageSquare, Network, Plus, Search, UserPlus, Users, X,
} from 'lucide-react'
import { useChatStore, useDepartmentStore, useSessionStore, type Department } from '../../store'
import { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import { cardStyle, ToolbarButton } from '../workflows/EmployeesShared'
import {
  baseName, childrenOf, deptByNormDir, deptBySlug, deptEmoji, findDeptForSession, kindOf, teamsOf,
} from './deptUtils'
import DeptTemplatePicker from './DeptTemplatePicker'
import { COMPANY_TEMPLATES, hasChosenDeptSetup } from './deptPresets'

const ACCENT = '#6366f1'
/** Horizontal gap between cards in a row. */
const GAP = 16
/** Below this card width a card stops being readable, so a column is dropped. */
const CARD_MIN_FULL = 216
const CARD_MIN_DENSE = 180
/** Cards stop growing past this width — otherwise one department gets a billboard. */
const CARD_MAX_FULL = 400
const CARD_MAX_DENSE = 300
const MAX_COLS_FULL = 4
const MAX_COLS_DENSE = 5
/** Department count at which cards compact to keep the whole tree on screen. */
const DENSE_FROM = 9
/** X of the rail in the multi-row layout, and the gap between rail and cards. */
const RAIL_X = 26
const RAIL_GAP = 26

/** Connector lengths — tightened in dense mode to keep many rows compact. */
interface TreeMetrics { trunk: number; drop: number; rowGap: number }
const METRICS_FULL: TreeMetrics = { trunk: 28, drop: 28, rowGap: 26 }
const METRICS_DENSE: TreeMetrics = { trunk: 20, drop: 20, rowGap: 16 }

// Team strip geometry. Chips are equal width, which is what makes their centres
// computable without measuring the DOM — the price is an ellipsis on long names.
const TEAM_CHIP_GAP = 6
const TEAM_TRUNK = 12
const TEAM_DROP = 10
const MAX_TEAM_CHIPS = 3
const MAX_CHIP_WIDTH = 150

/** Deterministic emoji per department lives in deptUtils so the archive ledger
 * can show the same face without importing this whole chart. */

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function relativeTime(timestamp: number | undefined, t: (key: string) => string): string {
  if (!timestamp) return '—'
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('session.justNow')
  if (minutes < 60) return `${minutes}${t('session.minutesAgo')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}${t('session.hoursAgo')}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}${t('session.daysAgo')}`
  return new Date(timestamp).toLocaleDateString()
}

// ── Layout ──────────────────────────────────────────────────────────────────

interface TreeLayout {
  /** Card count per row — always sums to the number of departments. */
  rows: number[]
  cols: number
  cardWidth: number
  /** Left edge of the card area (top-left of the first card). */
  cardLeft: number
  /** X of the trunk: the pane centre in single-row mode, the rail otherwise. */
  spineX: number
  single: boolean
  metrics: TreeMetrics
}

/**
 * Split `count` cards into rows of at most `cols`, then even out a lone trailing
 * card — `4 + 1` reads as a stray, `3 + 2` reads as deliberate. Only safe with
 * 3+ columns, since borrowing would otherwise leave the row above with one card.
 */
function balanceRows(count: number, cols: number): number[] {
  const rows: number[] = []
  for (let left = count; left > 0;) {
    const take = Math.min(cols, left)
    rows.push(take)
    left -= take
  }
  if (rows.length >= 2 && rows[rows.length - 1] === 1 && cols >= 3) {
    rows[rows.length - 2] -= 1
    rows[rows.length - 1] = 2
  }
  return rows
}

function computeLayout(width: number, count: number, dense: boolean): TreeLayout | null {
  if (width <= 0 || count <= 0) return null
  const cardMin = dense ? CARD_MIN_DENSE : CARD_MIN_FULL
  const cardMax = dense ? CARD_MAX_DENSE : CARD_MAX_FULL
  const maxCols = dense ? MAX_COLS_DENSE : MAX_COLS_FULL
  const railOffset = RAIL_X + RAIL_GAP

  const colsWithin = (avail: number) =>
    Math.max(1, Math.min(maxCols, Math.floor((avail + GAP) / (cardMin + GAP))))

  // The rail costs a lane on the left, so first ask how many columns fit with it
  // taken out. If everything still lands on one row, the rail is unnecessary and
  // the full width is available again.
  const colsWithRail = colsWithin(width - railOffset)
  const single = count <= colsWithRail
  const cols = single ? colsWithin(width) : colsWithRail

  const rows = balanceRows(count, cols)
  const avail = width - (single ? 0 : railOffset)
  const cardWidth = Math.min(cardMax, Math.max(0, (avail - (cols - 1) * GAP) / cols))
  const rowWidth = count * cardWidth + (count - 1) * GAP
  return {
    rows,
    cols,
    cardWidth,
    cardLeft: single ? Math.max(0, (width - rowWidth) / 2) : railOffset,
    spineX: single ? width / 2 : RAIL_X,
    single,
    metrics: dense ? METRICS_DENSE : METRICS_FULL,
  }
}

/** Centre x of each card in a row of `size`, in container coordinates. */
function rowCenters(size: number, cardWidth: number, cardLeft: number): number[] {
  return Array.from({ length: size }, (_, i) => cardLeft + i * (cardWidth + GAP) + cardWidth / 2)
}

// ── Connector lines ─────────────────────────────────────────────────────────

/** Vertical connector at x (px), from `top` downwards. */
function VLine({ x, top, height, stretch }: { x: number; top: number; height?: number; stretch?: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      left: x - 1,
      top,
      ...(stretch ? { bottom: 0 } : { height }),
      width: 2,
      borderRadius: 2,
      background: 'linear-gradient(180deg, rgba(99,102,241,0.55), rgba(99,102,241,0.22))',
      pointerEvents: 'none',
    }} />
  )
}

/** Horizontal bus line between two card centres. */
function HLine({ from, to, top }: { from: number; to: number; top: number }) {
  if (to - from <= 1) return null
  return (
    <div style={{
      position: 'absolute',
      left: from,
      width: to - from,
      top,
      height: 2,
      borderRadius: 2,
      background: 'linear-gradient(90deg, rgba(99,102,241,0.22), rgba(99,102,241,0.55), rgba(99,102,241,0.22))',
      pointerEvents: 'none',
    }} />
  )
}

// ── Team strip ──────────────────────────────────────────────────────────────

interface TeamStripProps {
  teams: Department[]
  /** The department owning these teams — where the `+N` overflow chip leads. */
  deptId: string
  sessionsByDept: Record<string, SessionListItem[]>
  sessionsLoading: boolean
  /** Width of the card above — the strip is exactly this wide, in local coords. */
  cardWidth: number
  onSelectDept: (id: string) => void
}

/**
 * The teams of one department, drawn as a real two-level sub-tree: a short trunk
 * out of the card, a bus, and a drop into each chip. Chips are equal width so
 * their centres are known analytically — that is the whole reason the bus can be
 * drawn at all.
 *
 * The strip is drawn at every density. It used to collapse to a badge past
 * DENSE_FROM departments to keep the cards their old height — but every company
 * template ships 9-10 departments, so that made the hierarchy invisible in
 * exactly the case it was built for.
 */
function TeamStrip({ teams, deptId, sessionsByDept, sessionsLoading, cardWidth, onSelectDept }: TeamStripProps) {
  const t = useT()
  if (teams.length === 0) return null

  const overflow = teams.length - MAX_TEAM_CHIPS
  const chips = overflow > 0 ? teams.slice(0, MAX_TEAM_CHIPS) : teams
  const slotCount = chips.length + (overflow > 0 ? 1 : 0)
  // Capped so a lone team is a chip rather than a second card spanning the whole
  // column. Slots stay equal width and the group stays centred, so the bus and
  // its drops remain symmetric about the trunk at cardWidth/2.
  const slotWidth = Math.min((cardWidth - (slotCount - 1) * TEAM_CHIP_GAP) / slotCount, MAX_CHIP_WIDTH)
  const startX = (cardWidth - (slotCount * slotWidth + (slotCount - 1) * TEAM_CHIP_GAP)) / 2
  const centerOf = (i: number) => startX + i * (slotWidth + TEAM_CHIP_GAP) + slotWidth / 2
  const first = centerOf(0)
  const last = centerOf(slotCount - 1)

  return (
    <div style={{ position: 'relative', width: cardWidth, paddingTop: TEAM_TRUNK + TEAM_DROP }}>
      {/* Trunk out of the card's bottom-centre, then the bus across the chips */}
      <VLine x={cardWidth / 2} top={0} height={TEAM_TRUNK} />
      <HLine from={first} to={last} top={TEAM_TRUNK} />
      {Array.from({ length: slotCount }, (_, i) => (
        <VLine key={i} x={centerOf(i)} top={TEAM_TRUNK} height={TEAM_DROP} />
      ))}

      <div style={{ display: 'flex', gap: TEAM_CHIP_GAP, justifyContent: 'center' }}>
        {chips.map(team => {
          const count = sessionsByDept[team.id]?.length ?? 0
          const open = team.positions?.length ?? 0
          const color = team.color || ACCENT
          return (
            <button
              key={team.id}
              onClick={() => onSelectDept(team.id)}
              title={team.directory}
              style={{
                // flexShrink 0 is load-bearing: the connector drops are placed at
                // slotWidth/2, so a chip that shrank to fit long content would
                // slide out from under its own drop line. Overflow is clipped
                // instead, which is why the labels ellipsis.
                width: slotWidth, flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '5px 4px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${color}44`, background: `${color}12`,
                color: 'var(--text-secondary)', fontSize: 10,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, maxWidth: '100%' }}>
                <Network size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                <span style={ELLIPSIS}>{team.name}</span>
              </span>
              <span style={{
                maxWidth: '100%', fontSize: 9, color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums', ...ELLIPSIS,
              }}>
                {sessionsLoading ? '·' : count}
                {open > 0 && <span style={{ color }}> · {t('dept.positionOpen')} {open}</span>}
              </span>
            </button>
          )
        })}
        {overflow > 0 && (
          <button
            onClick={() => onSelectDept(deptId)}
            title={teams.map(team => team.name).join('、')}
            style={{
              width: slotWidth, flexShrink: 0, boxSizing: 'border-box', padding: '5px 4px', borderRadius: 8,
              cursor: 'pointer', border: '1px dashed var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            +{overflow}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Department card ─────────────────────────────────────────────────────────

interface DeptCardProps {
  dept: Department
  sessions: SessionListItem[]
  sessionsLoading: boolean
  hasActiveSession: boolean
  /** Compact card for the many-department layout. */
  dense: boolean
  /** Team count, shown only when the chart is expanded to the second level. */
  teamCount: number
  showTeams: boolean
  onEnter: () => void
  onRecruit: () => void
  onStats: (e: React.MouseEvent) => void
}

function DeptCard({
  dept, sessions, sessionsLoading, hasActiveSession, dense, teamCount, showTeams,
  onEnter, onRecruit, onStats,
}: DeptCardProps) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const color = dept.color || ACCENT
  const messageCount = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  const openPositions = dept.positions?.length ?? 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardStyle(hovered),
        display: 'flex',
        flexDirection: 'column',
        minHeight: dense ? 108 : 132,
        overflow: 'hidden',
        borderColor: hovered ? `${color}88` : undefined,
      }}
    >
      {/* Department colour accent */}
      <div style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${color}, ${color}33)` }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: dense ? 8 : 10, padding: dense ? '10px 11px 8px' : '12px 13px 10px', flex: 1 }}>
        <span style={{
          width: dense ? 30 : 36, height: dense ? 30 : 36, borderRadius: dense ? 8 : 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: dense ? 15 : 18, lineHeight: 1,
          background: `${color}1f`, border: `1px solid ${color}33`,
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {deptEmoji(dept.id)}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: dense ? 12 : 13, fontWeight: 700, color: 'var(--text-primary)', ...ELLIPSIS }}>
              {dept.name}
            </span>
            {hasActiveSession && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
                animation: 'dept-active-pulse 2s ease-in-out infinite',
              }} />
            )}
          </span>
          <span
            title={dept.directory}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginTop: 3, minWidth: 0 }}
          >
            <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={ELLIPSIS}>{baseName(dept.directory)}</span>
          </span>
        </span>

        <button
          onClick={e => { e.stopPropagation(); onStats(e) }}
          onMouseDown={e => e.stopPropagation()}
          title={t('dept.stats')}
          style={{
            flexShrink: 0, padding: 4, borderRadius: 6, border: 'none',
            background: hovered ? 'rgba(99,102,241,0.12)' : 'transparent',
            color: hovered ? '#818cf8' : 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', transition: 'all 0.15s ease',
          }}
        >
          <BarChart3 size={13} />
        </button>
      </div>

      {/* Footer: headcount, messages, and on hover the drill-in / recruit actions.
          Open positions are counted separately and never folded into the staff
          number — a ghost position is not an employee yet. */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: dense ? 9 : 12,
        padding: dense ? '6px 11px' : '8px 13px',
        borderTop: '1px solid var(--glass-border)',
        fontSize: 11, color: 'var(--text-muted)',
        minHeight: 33,
      }}>
        <span title={t('dept.staff')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <Users size={11} />{sessionsLoading ? '·' : sessions.length}
        </span>
        <span title={t('dept.msgCount')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <MessageSquare size={11} />{sessionsLoading ? '·' : messageCount}
        </span>
        {openPositions > 0 && (
          <span title={t('dept.positions')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums', color }}>
            <UserPlus size={11} />{openPositions}
          </span>
        )}
        {showTeams && teamCount > 0 && (
          <span title={t('dept.teams')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
            <Network size={11} />{teamCount}
          </span>
        )}

        {hovered ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onRecruit() }}
              title={t('dept.newSession')}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 20, cursor: 'pointer',
                fontSize: 10, fontWeight: 700, lineHeight: 1.5,
                border: `1px solid ${color}55`, background: `${color}18`, color,
              }}
            >
              <Plus size={9} />{t('dept.recruit')}
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 1, color, fontSize: 10, fontWeight: 700 }}>
              {t('dept.enter')}<ChevronRight size={10} />
            </span>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', ...ELLIPSIS }}>{relativeTime(sessions[0]?.timestamp, t)}</span>
        )}
      </div>
    </div>
  )
}

// ── One company's section ───────────────────────────────────────────────────

interface OrgSectionProps {
  /** The HQ card's title — a real company name, or the generic one. */
  title: string
  departments: Department[]
  teamsByDept: Record<string, Department[]>
  sessionsByDept: Record<string, SessionListItem[]>
  sessionsLoading: boolean
  currentSessionId: string | null
  width: number
  dense: boolean
  showTeams: boolean
  onSelectDept: (id: string) => void
  onRecruit: (id: string) => void
  onStats: (deptId: string, e: React.MouseEvent) => void
}

function OrgSection({
  title, departments, teamsByDept, sessionsByDept, sessionsLoading, currentSessionId,
  width, dense, showTeams, onSelectDept, onRecruit, onStats,
}: OrgSectionProps) {
  const t = useT()
  const layout = useMemo(() => computeLayout(width, departments.length, dense), [width, departments.length, dense])

  // The section's own totals, teams included — a team is a real desk with real
  // employees, it just does not get its own card at this level.
  const allNodes = useMemo(
    () => departments.flatMap(d => [d, ...(teamsByDept[d.id] ?? [])]),
    [departments, teamsByDept],
  )
  const totalStaff = allNodes.reduce((sum, d) => sum + (sessionsByDept[d.id]?.length ?? 0), 0)
  const totalMessages = allNodes.reduce(
    (sum, d) => sum + (sessionsByDept[d.id] ?? []).reduce((n, s) => n + (s.messageCount ?? 0), 0),
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.10))',
          border: '1px solid rgba(99,102,241,0.34)',
          boxShadow: '0 6px 22px rgba(99,102,241,0.16)',
        }}>
          <span style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.9))',
            boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
          }}>
            <Building2 size={20} />
          </span>
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
                <span style={{ display: 'flex', color: '#818cf8' }}>{stat.icon}</span>
                {sessionsLoading ? '·' : stat.value}
              </span>
            ))}
          </span>
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
                {cards.map(dept => {
                  const sessions = sessionsByDept[dept.id] ?? []
                  const teams = teamsByDept[dept.id] ?? []
                  return (
                    <DeptCard
                      key={dept.id}
                      dept={dept}
                      sessions={sessions}
                      sessionsLoading={sessionsLoading}
                      hasActiveSession={sessions.some(s => s.sessionId === currentSessionId)}
                      dense={dense}
                      teamCount={teams.length}
                      showTeams={showTeams}
                      onEnter={() => onSelectDept(dept.id)}
                      onRecruit={() => onRecruit(dept.id)}
                      onStats={e => onStats(dept.id, e)}
                    />
                  )
                })}
                {/* Second grid row: the team strips. They live in a row of their
                    own rather than inside the card's column so that every card
                    above keeps the same height — a strip hangs off one card, but
                    the space it needs is shared by the whole row. Columns without
                    teams get an empty cell, which costs nothing. */}
                {showTeams && cards.map(dept => {
                  const teams = teamsByDept[dept.id] ?? []
                  return teams.length > 0 ? (
                    <TeamStrip
                      key={dept.id}
                      teams={teams}
                      deptId={dept.id}
                      sessionsByDept={sessionsByDept}
                      sessionsLoading={sessionsLoading}
                      cardWidth={cardWidth}
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
          {departments.map(dept => {
            const sessions = sessionsByDept[dept.id] ?? []
            const teams = teamsByDept[dept.id] ?? []
            return (
              <DeptCard
                key={dept.id}
                dept={dept}
                sessions={sessions}
                sessionsLoading={sessionsLoading}
                hasActiveSession={sessions.some(s => s.sessionId === currentSessionId)}
                dense={dense}
                teamCount={teams.length}
                showTeams={showTeams}
                onEnter={() => onSelectDept(dept.id)}
                onRecruit={() => onRecruit(dept.id)}
                onStats={e => onStats(dept.id, e)}
              />
            )
          })}
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

// ── Org chart ───────────────────────────────────────────────────────────────

export interface OrgChartProps {
  onSelectDept: (deptId: string) => void
  /** Drill into the department with a fresh employee card waiting there. */
  onNewSessionInDept: (deptId: string) => void
}

const LEVEL_KEY = 'aipa:org-level'

export default function OrgChart({ onSelectDept, onNewSessionInDept }: OrgChartProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const homeDir = useSessionStore(s => s.homeDir)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const addNewDept = useDepartmentStore(s => s.addDepartment)

  const [deptSearch, setDeptSearch] = useState('')
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptDir, setNewDeptDir] = useState('')
  // Template picker. `presetSeed` is the company type the picker opens on — the
  // empty state's cards each seed their own, the toolbar entry seeds none.
  const [showPresets, setShowPresets] = useState(false)
  const [presetSeed, setPresetSeed] = useState<string | undefined>(undefined)
  const [statsDeptId, setStatsDeptId] = useState<string | null>(null)
  const [statsPos, setStatsPos] = useState({ x: 0, y: 0 })
  const [width, setWidth] = useState(0)
  // Second level: draw each department's teams under its card. Off by default,
  // which is exactly how the chart looked before teams existed.
  const [showTeams, setShowTeams] = useState(() => {
    try { return localStorage.getItem(LEVEL_KEY) === 'teams' } catch { return false }
  })

  const toggleLevel = () => {
    setShowTeams(prev => {
      const next = !prev
      try { localStorage.setItem(LEVEL_KEY, next ? 'teams' : 'dept') } catch {}
      return next
    })
  }

  // Callback ref (not useRef) because the tree only mounts once there is at
  // least one department — a mount-time effect would observe nothing forever.
  const [treeEl, setTreeEl] = useState<HTMLDivElement | null>(null)

  // Track the tree width so the connector coordinates can be computed exactly:
  // a CSS-percentage bus would drift away from the card centres by the gap.
  useEffect(() => {
    if (!treeEl) return
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0
      if (next > 0) setWidth(next)
    })
    observer.observe(treeEl)
    setWidth(treeEl.clientWidth)
    return () => observer.disconnect()
  }, [treeEl])

  const sessionsByDept = useMemo(() => {
    // One pass over the session list instead of one pass per department: the
    // owning department is resolved once, through the shared join.
    const bySlug = deptBySlug(departments)
    const byNormDir = deptByNormDir(departments, homeDir)
    const map: Record<string, SessionListItem[]> = {}
    for (const dept of departments) map[dept.id] = []
    for (const s of allSessions) {
      const dept = findDeptForSession(s, bySlug, byNormDir, homeDir)
      if (dept) map[dept.id].push(s)
    }
    for (const id of Object.keys(map)) map[id].sort((a, b) => b.timestamp - a.timestamp)
    return map
  }, [departments, allSessions, homeDir])

  const teamsByDept = useMemo(() => {
    const map: Record<string, Department[]> = {}
    for (const dept of departments) map[dept.id] = teamsOf(departments, dept.id)
    return map
  }, [departments])

  /** The sections to draw: one per company, plus the legacy top-level one. */
  const groups = useMemo(() => {
    const companies = departments.filter(d => kindOf(d) === 'company')
    const out = companies.map(company => ({
      key: company.id,
      title: company.name,
      departments: childrenOf(departments, company.id).filter(d => kindOf(d) !== 'team'),
    }))
    // Departments with no company above them — every install that predates
    // templates. They keep the generic HQ they have always had.
    const orphans = departments.filter(d => !d.parentId && kindOf(d) === 'department')
    if (orphans.length > 0) out.push({ key: '__top', title: t('dept.company'), departments: orphans })
    return out
  }, [departments, t])

  const q = deptSearch.trim().toLowerCase()
  /** A department matches on its own name, or on any team's name or position. */
  const sectionDepts = useMemo(() => {
    const out: Record<string, Department[]> = {}
    for (const group of groups) {
      if (!q) { out[group.key] = group.departments; continue }
      out[group.key] = group.departments.filter(d => {
        if (d.name.toLowerCase().includes(q) || d.directory.toLowerCase().includes(q)) return true
        if ((teamsByDept[d.id] ?? []).some(team => team.name.toLowerCase().includes(q))) return true
        return (d.positions ?? []).some(p => p.title.toLowerCase().includes(q))
      })
    }
    return out
  }, [groups, q, teamsByDept])

  // Past DENSE_FROM cards in a row the whole tree compacts so it still fits.
  // Taken across sections so two companies do not render at two densities.
  const dense = useMemo(
    () => Object.values(sectionDepts).some(list => list.length >= DENSE_FROM),
    [sectionDepts],
  )
  const visibleCount = useMemo(
    () => Object.values(sectionDepts).reduce((n, list) => n + list.length, 0),
    [sectionDepts],
  )

  // First run: a brand-new install lands on an empty chart with nothing to click
  // that explains itself, so open the picker once. Waiting for sessions to finish
  // loading matters — that is what tells us whether to offer "reuse my existing
  // folders". After any choice (`blank` included) the flag silences this for good.
  useEffect(() => {
    if (departments.length > 0 || sessionsLoading || hasChosenDeptSetup()) return
    setPresetSeed(undefined)
    setShowPresets(true)
  }, [departments.length, sessionsLoading])

  const closeAdd = () => { setShowAddDept(false); setNewDeptName(''); setNewDeptDir('') }

  const handleAdd = () => {
    if (!newDeptName.trim() || !newDeptDir.trim()) return
    // A hand-made department joins whichever company already exists, so it lands
    // among the cards rather than in a second, orphaned section.
    const loneCompany = departments.filter(d => kindOf(d) === 'company').length === 1
      ? departments.find(d => kindOf(d) === 'company')
      : undefined
    const dept = addNewDept({
      name: newDeptName.trim(),
      directory: newDeptDir.trim(),
      color: ACCENT,
      kind: 'department',
      parentId: loneCompany?.id,
    })
    closeAdd()
    // Land straight in the new department so the first employee can be recruited.
    onSelectDept(dept.id)
  }

  const handleBrowseDir = async () => {
    const p = await window.electronAPI.fsShowOpenDialog()
    if (!p) return
    setNewDeptDir(p)
    if (!newDeptName.trim()) setNewDeptName(baseName(p))
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !showAddDept) {
        e.preventDefault()
        setShowAddDept(true)
      }
      if (e.key === 'Escape' && showAddDept) closeAdd()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showAddDept])

  useEffect(() => {
    if (!statsDeptId) return
    const close = () => setStatsDeptId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [statsDeptId])

  const openStats = React.useCallback((deptId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStatsPos({ x: rect.right + 8, y: rect.top })
    setStatsDeptId(prev => (prev === deptId ? null : deptId))
  }, [])

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-chat)' }}>
      <div style={{
        // Wider pane once the tree needs several columns; a narrow pane falls back
        // to a single column rather than forcing a horizontal scrollbar.
        maxWidth: dense ? 1360 : 1180,
        minWidth: CARD_MIN_FULL + 48,
        margin: '0 auto',
        padding: '18px 24px 40px',
      }}>
        {/* Toolbar — department search, level toggle, create */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={12} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', opacity: 0.6, pointerEvents: 'none',
            }} />
            <input
              value={deptSearch}
              onChange={e => setDeptSearch(e.target.value)}
              placeholder={t('dept.searchDepts')}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 30px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-hover)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            />
            {deptSearch && (
              <button
                onClick={() => setDeptSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 3,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Level toggle — the second level is opt-in so the default chart stays
              exactly as compact as it was before teams existed. */}
          <div style={{
            display: 'flex', flexShrink: 0, padding: 2, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-hover)',
          }}>
            {[
              { on: false, label: t('dept.level.dept') },
              { on: true, label: t('dept.level.withTeams') },
            ].map(opt => (
              <button
                key={String(opt.on)}
                onClick={() => { if (showTeams !== opt.on) toggleLevel() }}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600,
                  background: showTeams === opt.on ? 'rgba(99,102,241,0.18)' : 'transparent',
                  color: showTeams === opt.on ? '#818cf8' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <ToolbarButton onClick={() => (showAddDept ? closeAdd() : setShowAddDept(true))} primary title={t('dept.addTitle')}>
            <Plus size={13} />{t('dept.add')}
          </ToolbarButton>
        </div>

        {/* Create-department panel */}
        {showAddDept && (
          <div style={{
            marginBottom: 22, padding: '14px 16px', borderRadius: 12,
            border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)',
            display: 'flex', flexDirection: 'column', gap: 9,
            animation: 'slideUp 0.15s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('dept.addTitle')}</div>
              <button
                onClick={() => { closeAdd(); setPresetSeed(undefined); setShowPresets(true) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#818cf8', fontSize: 11,
                }}
              >
                <LayoutGrid size={11} />{t('dept.presets.fromTemplate')}
              </button>
            </div>
            <input
              autoFocus
              placeholder={t('dept.namePlaceholder')}
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') closeAdd(); if (e.key === 'Enter') handleAdd() }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                placeholder={t('dept.dirPlaceholder')}
                value={newDeptDir}
                onChange={e => setNewDeptDir(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') closeAdd(); if (e.key === 'Enter') handleAdd() }}
                style={{
                  flex: 1, minWidth: 0,
                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                }}
              />
              <button
                onClick={handleBrowseDir}
                title={t('dept.selectWorkingDir')}
                style={{
                  padding: '6px 9px', borderRadius: 7, border: '1px dashed var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', flexShrink: 0,
                }}
              >
                <FolderOpen size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleAdd}
                disabled={!newDeptName.trim() || !newDeptDir.trim()}
                style={{
                  flex: 1, padding: '7px 12px', borderRadius: 7, border: 'none',
                  background: (!newDeptName.trim() || !newDeptDir.trim())
                    ? 'rgba(99,102,241,0.25)'
                    : 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: (!newDeptName.trim() || !newDeptDir.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {t('dept.create')}
              </button>
              <button
                onClick={closeAdd}
                style={{
                  padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                }}
              >
                {t('dept.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Empty state — no node at all. The fastest way out is a ready-made
            company, so the company types are offered right here instead of buried
            behind the "new department" form. */}
        {departments.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 20px', textAlign: 'center' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)',
            }}>
              <Building2 size={32} style={{ color: ACCENT, opacity: 0.45 }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('dept.presets.emptyTitle')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.8, lineHeight: 1.65, maxWidth: 380 }}>
                {t('dept.presets.emptyHint')}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 620 }}>
              {COMPANY_TEMPLATES.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPresetSeed(p.id); setShowPresets(true) }}
                  style={{
                    padding: '7px 14px', borderRadius: 9, cursor: 'pointer',
                    border: '1px solid rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.07)',
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.16)'; e.currentTarget.style.color = '#818cf8' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setPresetSeed(undefined); setShowPresets(true) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              {t('dept.presets.browseAll')}
            </button>
          </div>
        ) : (
          <div ref={setTreeEl}>
            {groups.map(group => (
              <OrgSection
                key={group.key}
                title={group.title}
                departments={sectionDepts[group.key] ?? []}
                teamsByDept={teamsByDept}
                sessionsByDept={sessionsByDept}
                sessionsLoading={sessionsLoading}
                currentSessionId={currentSessionId}
                width={width}
                dense={dense}
                showTeams={showTeams}
                onSelectDept={onSelectDept}
                onRecruit={onNewSessionInDept}
                onStats={openStats}
              />
            ))}

            {visibleCount === 0 && (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, opacity: 0.65 }}>
                {t('dept.noSearchResults')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Department stats popover */}
      {statsDeptId && (() => {
        const dept = departments.find(d => d.id === statsDeptId)
        if (!dept) return null
        const sessions = sessionsByDept[dept.id] ?? []
        const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
        const todayStart = new Date().setHours(0, 0, 0, 0)
        const todayCount = sessions.filter(s => s.timestamp >= todayStart).length
        const openPositions = dept.positions?.length ?? 0
        return (
          <div
            style={{
              position: 'fixed',
              left: Math.min(statsPos.x, window.innerWidth - 240),
              top: Math.min(statsPos.y, window.innerHeight - 220),
              zIndex: 200,
              background: 'var(--glass-bg-deep)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${dept.color || 'var(--bg-active)'}`,
              borderRadius: 10,
              padding: '12px 16px',
              minWidth: 200,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.15s ease',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color || ACCENT, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dept.name}</span>
              <button
                onClick={() => setStatsDeptId(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            {[
              { label: t('dept.staff'), value: sessions.length },
              { label: t('dept.statsToday'), value: todayCount },
              { label: t('dept.msgCount'), value: totalMessages },
              ...(openPositions > 0 ? [{ label: t('dept.positions'), value: openPositions }] : []),
              { label: t('dept.statsLastActive'), value: relativeTime(sessions[0]?.timestamp, t) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--bg-hover)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, opacity: 0.6, ...ELLIPSIS }}>
              {dept.directory}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => { onSelectDept(dept.id); setStatsDeptId(null) }}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 5,
                  border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.10)',
                  color: '#818cf8', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('dept.enter')}
              </button>
              <button
                onClick={() => {
                  const data = sessions.map(s => ({
                    id: s.sessionId,
                    title: s.title || s.lastPrompt?.slice(0, 60) || 'Untitled',
                    lastPrompt: s.lastPrompt,
                    messageCount: s.messageCount,
                    timestamp: new Date(s.timestamp).toISOString(),
                  }))
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${dept.name.replace(/[^a-z0-9]/gi, '_')}_employees.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  setStatsDeptId(null)
                }}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 5,
                  border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                  color: '#22c55e', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('dept.exportSessions')}
              </button>
            </div>
          </div>
        )
      })()}

      {showPresets && (
        <DeptTemplatePicker
          initialPresetId={presetSeed}
          onClose={() => setShowPresets(false)}
          onApplied={() => setShowPresets(false)}
        />
      )}
    </div>
  )
}
