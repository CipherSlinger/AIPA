// The teams of one department, drawn as a real two-level sub-tree.
//
// A short trunk comes out of the card's bottom centre, a bus runs across, and a
// drop lands on each chip. Chips are **equal width** and placed by arithmetic,
// not by flexbox — that is the whole reason the bus can be drawn: their centres
// are known without measuring the DOM. Anything that lets a chip size itself
// (a long team name, a portrait wider than the slot) breaks the bus, so the chip
// pins its width and clips its content instead.
//
// The strip is drawn at every density. It used to collapse to a badge past
// DENSE_FROM departments to keep the cards their old height — but every company
// template ships 9-10 departments, so that made the hierarchy invisible in
// exactly the case it was built for.

import React from 'react'
import type { Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import DeptPortrait from './DeptPortrait'
import { HLine, VLine } from './orgConnectors'

const ACCENT = '#6366f1'

// Chip geometry. `MAX_CHIP_WIDTH` caps a lone team so it stays a chip rather
// than becoming a second card spanning the whole column.
const TEAM_CHIP_GAP = 6
const TEAM_TRUNK = 12
const TEAM_DROP = 10
const MAX_TEAM_CHIPS = 3
const MAX_CHIP_WIDTH = 150

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export interface TeamStripProps {
  teams: Department[]
  /** The department owning these teams — where the `+N` overflow chip leads. */
  deptId: string
  sessionsByDept: Record<string, SessionListItem[]>
  sessionsLoading: boolean
  /** Width of the card above — the strip is exactly this wide, in local coords. */
  cardWidth: number
  /** Compact chips, to match the denser cards above. */
  dense: boolean
  onSelectDept: (id: string) => void
}

export function TeamStrip({
  teams, deptId, sessionsByDept, sessionsLoading, cardWidth, dense, onSelectDept,
}: TeamStripProps) {
  const t = useT()
  if (teams.length === 0) return null

  const overflow = teams.length - MAX_TEAM_CHIPS
  const chips = overflow > 0 ? teams.slice(0, MAX_TEAM_CHIPS) : teams
  const slotCount = chips.length + (overflow > 0 ? 1 : 0)
  // Slots stay equal width and the group stays centred, so the bus and its drops
  // remain symmetric about the trunk at cardWidth/2.
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
              {/* A team is a desk of people too, so it gets a face rather than a
                  network glyph. 20px is the largest that still fits three chips
                  across the narrowest (180px) card. */}
              <DeptPortrait name={team.name} seed={team.id} color={color} size={dense ? 20 : 26} />
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, maxWidth: '100%' }}>
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

export default React.memo(TeamStrip)