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
import { UserPlus } from 'lucide-react'
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
// With three or fewer slots the chips have the row to themselves, so the cap can
// rise a little and buy a two-word name room to breathe. Four slots already
// shrink a chip to <=95px on the widest (400px) card, where the cap never binds,
// so in practice this only widens one- and two-team strips. It stays a cap:
// slotWidth is still shared by every chip and startX still centres the group, so
// the trunk, bus and drops keep landing on the chip centres.
const MAX_CHIP_WIDTH_SPARSE = 168
// Narrowest chip whose name is still readable: below this a word like
// "Personnel" is shorter than the hyphen-less break opportunity, so `break-word`
// cuts it down the middle ("Personn / el"). When a strip cannot give every chip
// this much, it shows one team fewer and lets the `+N` chip carry the rest —
// three chips nobody can read are worth less than two that can be.
const CHIP_MIN_READABLE = 66
const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// A team name may need two lines ("State Ceremonial" inside a 90px chip), but it
// may never need three: a third line would push the count out of the chip and
// grow the strip into the row below. The two lines are not *reserved* — a strip
// whose names all fit on one line keeps the old chip height. When one name does
// wrap, the flex row stretches every chip to match, and the count row is
// bottom-pinned (see marginTop: auto), so the numbers still line up.
const NAME_CLAMP: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  width: '100%',
  lineHeight: 1.2,
  textAlign: 'center',
  wordBreak: 'break-word',
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

  // How wide one chip would be if `n` teams were shown. The overflow chip takes a
  // slot of its own, so hiding a team only pays off when the strip is overflowing.
  const slotWidthFor = (n: number) => {
    const slots = n + (teams.length > n ? 1 : 0)
    const cap = slots <= 3 ? MAX_CHIP_WIDTH_SPARSE : MAX_CHIP_WIDTH
    return Math.min((cardWidth - (slots - 1) * TEAM_CHIP_GAP) / slots, cap)
  }
  let shown = Math.min(MAX_TEAM_CHIPS, teams.length)
  while (shown > 1 && slotWidthFor(shown) < CHIP_MIN_READABLE) shown -= 1

  const overflow = teams.length - shown
  const chips = overflow > 0 ? teams.slice(0, shown) : teams
  const slotCount = chips.length + (overflow > 0 ? 1 : 0)
  // Slots stay equal width and the group stays centred, so the bus and its drops
  // remain symmetric about the trunk at cardWidth/2.
  const maxChipWidth = slotCount <= 3 ? MAX_CHIP_WIDTH_SPARSE : MAX_CHIP_WIDTH
  const slotWidth = Math.min((cardWidth - (slotCount - 1) * TEAM_CHIP_GAP) / slotCount, maxChipWidth)
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
              // The name rides in the tooltip too: it is the one thing the chip
              // can still clip, and the directory alone does not say who the
              // team is.
              title={team.directory ? `${team.name} — ${team.directory}` : team.name}
              style={{
                // flexShrink 0 is load-bearing: the connector drops are placed at
                // slotWidth/2, so a chip that shrank to fit long content would
                // slide out from under its own drop line. Overflow is clipped
                // instead, which is why the labels clamp.
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
              <span style={NAME_CLAMP}>{team.name}</span>
              {/* Count, then the open positions as their own accent mark — never
                  summed into it (a ghost post is not an employee; the card footer
                  makes the same split). The words were the problem: "· Open 3"
                  needs ~50px, so in a 90px slot it clipped to "0 · Ope…" and the
                  number of open posts was lost. The icon is the footer's own
                  UserPlus, which also keeps this mark from reading as the dashed
                  "+N more teams" chip. It does not shrink; the count may ellipsis
                  if it ever gets long. */}
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                // Pinned to the chip's bottom edge: if a neighbouring name wraps
                // to two lines the whole strip stretches, and this keeps every
                // count on one baseline instead of letting the stacks drift.
                marginTop: 'auto',
                maxWidth: '100%', fontSize: 9, color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}>
                <span style={ELLIPSIS}>{sessionsLoading ? '·' : count}</span>
                {open > 0 && (
                  <span
                    title={`${t('dept.positionOpen')}: ${open}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 2, color, flexShrink: 0 }}
                  >
                    <UserPlus size={10} strokeWidth={2.4} />
                    <span>{open}</span>
                  </span>
                )}
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