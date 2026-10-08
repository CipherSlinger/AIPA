// The little yellow helper itself — the drawing only.
//
// Split out of EmployeeFigure so the artwork can be rendered and reviewed on its
// own (it needs nothing but React), and so the shape lives in one place: the
// roster figure, the recruiting ghost and the loading ghost all draw from here.
//
// Every helper is one stout yellow capsule carrying head AND torso, with an
// oversized goggle lens, denim overalls buttoned below the mouth, black gloves
// and boots. The look is derived from the session id, so the same employee
// always comes back as the same character.

import React from 'react'

// Palette sampled by the id hash — enough variety that a roster reads as a crowd
// of distinct helpers, few enough that everyone still looks on-model.
const BODY = ['#f7d64a', '#f4cf3c', '#f9df66']
const DENIM = ['#4a76c4', '#3d63ad', '#5680cc', '#41659f']
const STRAP = ['#3a4250', '#2b3340', '#4b5563']
const TUFT = ['#2a2118', '#1f1f24', '#3a2a1c']
const HEIGHTS = [1, 0.93, 0.86]
const GLOVE = '#2b303b'
const LENS_RING = '#b4c0cf'
const EYE_WHITE = '#fbfdff'
const IRIS = '#7a4a24'
const PUPIL = '#1a1a20'
const MOUTH = '#4a3226'
const LINE = '#3a2b1e'

// The body is one capsule with a round crown and a flat base; the overalls are
// cut from the same silhouette, so these numbers are the single source of truth
// for the whole figure.
const CX = 36
const TOP = 8
const W = 48
const BOTTOM = 88
const R = W / 2 // 24 — the crown's radius
const HIP = 76 // where the sides stop being vertical and roll into the base
const FLAT = 8 // how far the base's corners are rolled off

// Round crown, straight sides, then a short roll into a flat base wide enough
// that the legs come out of the overalls rather than out of the belly.
const BODY_PATH = `M${CX - R},${TOP + R} A${R},${R} 0 0 1 ${CX + R},${TOP + R} ` +
  `V${HIP} Q${CX + R},${BOTTOM} ${CX + R - FLAT},${BOTTOM} ` +
  `H${CX - R + FLAT} Q${CX - R},${BOTTOM} ${CX - R},${HIP} Z`

/** FNV-1a — same session id always yields the same character. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Mix a #rrggbb toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export interface Look {
  body: string
  denim: string
  strap: string
  tuft: string
  /** Vertical scale — the roster is more fun when they are not all the same height. */
  height: number
  eyes: 1 | 2
  hair: number
  mouth: number
}

export function lookFor(sessionId: string): Look {
  const h = hashId(sessionId)
  const pick = <T,>(arr: readonly T[], shift: number): T => arr[(h >>> shift) % arr.length]
  return {
    body: pick(BODY, 0),
    denim: pick(DENIM, 3),
    strap: pick(STRAP, 6),
    tuft: pick(TUFT, 9),
    height: pick(HEIGHTS, 11),
    eyes: (h >>> 13) % 2 === 0 ? 1 : 2,
    hair: (h >>> 15) % 4,
    mouth: (h >>> 17) % 3,
  }
}

/**
 * The character. The sole sits at y=102 so several tiles line up on one floor;
 * the whole body is scaled about that line so a short helper keeps its feet down.
 *
 * Geometry (viewBox 72x106), top to bottom: hair above y=8, the goggle band at
 * y=20..30 with its lens straddling it, the mouth at y=40..49, the overalls
 * buttoned at y=53 and flaring into the hips at y=64, short legs and big boots.
 */
export function Figure({ look, glow }: { look: Look; glow: string }) {
  // Gradients are keyed by colour so two helpers sharing a palette (or two
  // renders of the same one) reference an identical definition.
  const bodyId = `emp-body-${look.body.slice(1)}`
  const denimId = `emp-denim-${look.denim.slice(1)}`

  // Overalls: a bib buttoned over the chest that flares out at the hips, then
  // runs down the body's own outline to the flat base — so no denim spills past
  // the silhouette and no yellow leaks out underneath.
  const bibL = CX - 15
  const bibR = CX + 15
  const overalls =
    `M${bibL},53 H${bibR} V58 ` +
    `Q${CX + R},60 ${CX + R},66 ` +
    `V${HIP} Q${CX + R},${BOTTOM} ${CX + R - FLAT},${BOTTOM} ` +
    `H${CX - R + FLAT} Q${CX - R},${BOTTOM} ${CX - R},${HIP} ` +
    `V66 Q${CX - R},60 ${bibL},58 Z`

  return (
    <svg width={76} height={104} viewBox="0 0 72 106" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        {/* Volume on the yellow capsule: lit from the upper left, shaded at the rim. */}
        <radialGradient id={bodyId} cx="0.32" cy="0.2" r="0.95">
          <stop offset="0%" stopColor={shade(look.body, 0.2)} />
          <stop offset="55%" stopColor={look.body} />
          <stop offset="100%" stopColor={shade(look.body, -0.13)} />
        </radialGradient>
        {/* One gradient down the whole garment, so bib, straps and legs shade as
            parts of the same denim rather than each on its own. */}
        <linearGradient id={denimId} gradientUnits="userSpaceOnUse" x1={CX} y1="50" x2={CX} y2="102">
          <stop offset="0%" stopColor={shade(look.denim, 0.16)} />
          <stop offset="100%" stopColor={shade(look.denim, -0.2)} />
        </linearGradient>
      </defs>

      <g className="emp-figure">
        {/* Rotating halo — faint on hover, always spinning while working. */}
        <circle
          className="emp-halo"
          cx={CX} cy="48" r="36"
          fill="none" stroke="#818cf8" strokeWidth="1.3" strokeDasharray="7 9"
        />
        {/* Floor glow: the session's color label, when it has one. */}
        <ellipse cx={CX} cy="102" rx="18" ry="3.2" fill={glow} opacity="0.55" />

        {/* Legs, hidden behind the overalls except for the short stretch of
            denim above each boot. */}
        <rect x="22" y="74" width="13" height="26" rx="6.5" fill={`url(#${denimId})`} />
        <rect x="37" y="74" width="13" height="26" rx="6.5" fill={`url(#${denimId})`} />

        {/* Boots */}
        <rect x="20" y="94" width="15" height="9" rx="4" fill={GLOVE} />
        <rect x="37" y="94" width="15" height="9" rx="4" fill={GLOVE} />
        <rect x="21" y="99.4" width="13" height="2" rx="1" fill="#ffffff" opacity="0.08" />

        {/* Head and torso in one capsule */}
        <path d={BODY_PATH} fill={`url(#${bodyId})`} />

        {/* Overalls: bib, shoulder straps, and a pocket on the bib */}
        <path d={overalls} fill={`url(#${denimId})`} />
        <path d={`M${bibL + 2},53 L${bibL},26`} stroke={`url(#${denimId})`} strokeWidth="4" strokeLinecap="round" />
        <path d={`M${bibR - 2},53 L${bibR},26`} stroke={`url(#${denimId})`} strokeWidth="4" strokeLinecap="round" />
        <rect x="27" y="54.4" width="18" height="6" rx="1.6" fill="#ffffff" opacity="0.14" />
        <circle cx={bibL + 2} cy="54.2" r="1.3" fill="#eef2fa" />
        <circle cx={bibR - 2} cy="54.2" r="1.3" fill="#eef2fa" />

        {/* Arms — hanging at the sides, ending in black gloves. The right one
            types while working (see .emp-working .emp-arm-r). */}
        <rect x="7" y="44" width="8" height="24" rx="4" fill={`url(#${bodyId})`} />
        <rect className="emp-arm-r" x="57" y="44" width="8" height="24" rx="4" fill={`url(#${bodyId})`} />
        <circle cx="11" cy="71" r="5" fill={GLOVE} />
        <circle cx="61" cy="71" r="5" fill={GLOVE} />
        <circle cx="9.6" cy="69.4" r="1.4" fill="#ffffff" opacity="0.12" />
        <circle cx="59.6" cy="69.4" r="1.4" fill="#ffffff" opacity="0.12" />

        {/* Mouth — right under the goggle: an open grin with a row of teeth, a
            plain smile, or a surprised "oh" */}
        {look.mouth === 0 && (
          <>
            <path d="M27.5,41 H44.5 A8.5,6.5 0 0 1 27.5,41 Z" fill={MOUTH} />
            <path d="M28.4,41 H43.6 V43.4 H28.4 Z" fill="#fdfdfd" />
            <g stroke={MOUTH} strokeWidth="0.6">
              <path d="M32.2,41 V43.4" />
              <path d="M36,41 V43.4" />
              <path d="M39.8,41 V43.4" />
            </g>
          </>
        )}
        {look.mouth === 1 && (
          <path d="M28,40.4 Q36,49 44,40.4" fill="none" stroke={LINE} strokeWidth="2.4" strokeLinecap="round" />
        )}
        {look.mouth === 2 && (
          <>
            <ellipse cx="36" cy="44.4" rx="3.9" ry="3.5" fill={MOUTH} />
            <path d="M33.1,41.6 H38.9 V43.2 H33.1 Z" fill="#fdfdfd" opacity="0.92" />
          </>
        )}

        {/* Goggles — the strap is a band across the head, cut to the head's own
            width so its ends tuck into the silhouette, with the lens on top */}
        <rect x="14" y="20" width="44" height="10" rx="5" fill={look.strap} />
        <rect x="16" y="21.4" width="40" height="1.6" rx="0.8" fill="#ffffff" opacity="0.12" />
        {look.eyes === 1 ? (
          <>
            <circle cx={CX} cy="25" r="14.5" fill={LENS_RING} />
            <g className="emp-eye">
              <circle cx={CX} cy="25" r="12.3" fill={EYE_WHITE} />
              <circle cx={CX} cy="24.4" r="6.6" fill={IRIS} />
              <circle cx={CX} cy="24.4" r="3" fill={PUPIL} />
              <circle cx={CX - 4.4} cy="22.4" r="1.8" fill="#ffffff" />
            </g>
          </>
        ) : (
          [CX - 9.5, CX + 9.5].map(cx => (
            <g key={cx}>
              <circle cx={cx} cy="25" r="10" fill={LENS_RING} />
              <g className="emp-eye">
                <circle cx={cx} cy="25" r="8.4" fill={EYE_WHITE} />
                <circle cx={cx} cy="24.6" r="4.6" fill={IRIS} />
                <circle cx={cx} cy="24.6" r="2.1" fill={PUPIL} />
                <circle cx={cx - 3} cy="23" r="1.3" fill="#ffffff" />
              </g>
            </g>
          ))
        )}

        {/* Hair — a few strands from the crown, or none at all */}
        {look.hair === 1 && (
          <g stroke={look.tuft} strokeWidth="1.8" strokeLinecap="round" fill="none">
            <path d="M33,9.6 L32.4,3.4" />
            <path d="M36,8.6 L36,2.2" />
            <path d="M39,9.6 L39.6,3.4" />
          </g>
        )}
        {look.hair === 2 && (
          <path d="M35.4,8.6 C34.6,4.4 36.4,1.8 39.2,1.6" fill="none" stroke={look.tuft} strokeWidth="2" strokeLinecap="round" />
        )}
        {look.hair === 3 && (
          <path d="M32.4,9.6 C30,5.6 32,2.6 35.8,2" fill="none" stroke={look.tuft} strokeWidth="2" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}

/** The outline shared by the recruiting slot and the loading ghosts. */
export function GhostSilhouette() {
  return (
    <svg width={76} height={104} viewBox="0 0 72 106" style={{ display: 'block' }}>
      <g className="emp-figure">
        <ellipse className="emp-ghost-body" cx={CX} cy="102" rx="13" ry="3.2" />
        <rect className="emp-ghost-body" x="22" y="74" width="13" height="27" rx="6.5" />
        <rect className="emp-ghost-body" x="37" y="74" width="13" height="27" rx="6.5" />
        <rect className="emp-ghost-body" x="7" y="44" width="8" height="24" rx="4" />
        <rect className="emp-ghost-body" x="57" y="44" width="8" height="24" rx="4" />
        <path className="emp-ghost-body" d={BODY_PATH} />
      </g>
    </svg>
  )
}
