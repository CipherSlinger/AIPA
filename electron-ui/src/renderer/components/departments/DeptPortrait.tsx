// The figure that stands in for a department in the org chart.
//
// One portrait = one department. The art itself comes from CharacterFace; this
// file adds the chrome that turns a face into a *node*: the halo tinted with the
// department colour, the ring, the optional crown that marks a company, and a
// memo boundary so a chart full of these does not re-draw every SVG when the
// search box above it changes.
//
// Memoising at this level (rather than leaving it to each caller) is deliberate:
// CharacterFace is an inline SVG of roughly forty nodes, and the org chart can
// hold a hundred of them. The chart re-renders on every keystroke in its search
// field, so without this boundary every character typed would rebuild a few
// thousand SVG elements. The props are all primitives, so the default shallow
// comparison is exactly the right test.

import React, { useMemo } from 'react'
import { Crown } from 'lucide-react'
import * as CharacterFaceModule from '../avatars/CharacterFace'
import type { CharacterSpec } from '../avatars/CharacterFace'
import { faceForCompany, resolveFace, type DeptFace } from './deptFaces'

// CharacterFace is owned by another module and is expected to expose a default
// export. Resolving both spellings costs one property read at module load and
// keeps this file compiling whichever way that module exports its component —
// a hard default import turns a cosmetic export difference into a build break.
type FaceComponent = React.ComponentType<CharacterSpec & { className?: string }>
const faceModule = CharacterFaceModule as unknown as {
  CharacterFace?: FaceComponent
  default?: FaceComponent
}
const CharacterFace = (faceModule.default ?? faceModule.CharacterFace) as FaceComponent

export interface DeptPortraitProps {
  /** The department's display name — what decides the look. */
  name: string
  /** Stable id, used for skin/hair variation and as the fallback hash. */
  seed: string
  /** The department accent. Tints the halo, ring and shadow. */
  color: string
  /** Outer diameter in px. Face art fills the circle; no inner padding maths. */
  size: number
  /** Company node: a calmer, more senior face plus a crown badge. */
  crown?: boolean
  className?: string
}

export const DeptPortrait = React.memo(function DeptPortrait({
  name, seed, color, size, crown = false, className,
}: DeptPortraitProps) {
  const face = useMemo<DeptFace>(
    () => (crown ? faceForCompany(seed) : resolveFace(name, seed)),
    [crown, name, seed],
  )

  const badge = Math.max(14, Math.round(size * 0.34))

  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        // A halo rather than a flat fill: the colour is strongest behind the
        // head and falls off before the ring, which is what keeps a row of
        // portraits from reading as a row of coloured discs.
        background: `radial-gradient(circle at 50% 32%, ${color}42 0%, ${color}1c 58%, ${color}08 78%, transparent 100%)`,
        border: `${crown ? 2 : 1.5}px solid ${color}${crown ? 'aa' : '66'}`,
        boxShadow: `0 6px 16px -8px ${color}cc${crown ? `, 0 0 0 3px ${color}1f` : ''}, inset 0 1px 0 rgba(255,255,255,0.10)`,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', overflow: 'hidden' }}>
        <CharacterFace seed={seed} color={color} look={face.look} glasses={face.glasses} />
      </span>

      {crown && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -5, right: -5,
            width: badge, height: badge, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
            boxShadow: '0 2px 6px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
          }}
        >
          <Crown size={Math.round(badge * 0.56)} color="#4a2c05" strokeWidth={2.4} />
        </span>
      )}
    </span>
  )
})

export default DeptPortrait