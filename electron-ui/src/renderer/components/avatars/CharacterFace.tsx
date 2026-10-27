// CharacterFace — the pure portrait for a persona / department member.
// Deliberately excludes rings, role badges and presence dots: those are chrome
// only some surfaces want, and baking them in made the drawing impossible to
// reuse for the org-chart cards.

import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { hashIndex } from '../../utils/hashUtils'

export type FaceLook = 'bob' | 'crop' | 'curly' | 'ponytail' | 'spiky' | 'medium'
export type FaceGlasses = 'round' | 'square' | 'none'

/**
 * Six skin tones spanning a believable range. The previous palette was five
 * pastels, which all collapsed to the same value at 30px and read as cartoon.
 */
export const SKIN_TONES = ['#f6d5b8', '#eec39a', '#d99c6a', '#b87a4b', '#8d5524', '#f3c9a5'] as const
export type SkinTone = (typeof SKIN_TONES)[number]

/** Look order doubles as the deterministic fallback pick for seed-only callers. */
export const FACE_LOOKS: readonly FaceLook[] = ['bob', 'crop', 'curly', 'ponytail', 'spiky', 'medium']

export interface CharacterSpec {
  /** Deterministic seed for skin tone, look and glasses when not given explicitly. */
  seed: string
  /** Accent colour; the backdrop wash, hair tint and clothing are derived from it. */
  color: string
  look?: FaceLook
  skin?: SkinTone
  glasses?: FaceGlasses
}

export interface CharacterFaceProps extends CharacterSpec {
  size?: number | string
  className?: string
  style?: CSSProperties
  /** Accessible name. When omitted the SVG is marked decorative. */
  title?: string
}

// The head sits at y≈44 with a 17.5×19.5 ellipse, so the shoulders have to
// start below the jaw and curve instead of being a square post.
const SHOULDERS = 'M27 100 C27 83 37 72 50 72 C63 72 73 83 73 100 Z'

// Hair must stay close to black; only a hint of the persona hue survives,
// otherwise the character reads as dyed rather than lit.
const HAIR_MIX: Record<FaceLook, number> = {
  bob: 0.86,
  crop: 0.92,
  curly: 0.78,
  ponytail: 0.88,
  spiky: 0.87,
  medium: 0.89,
}

function normalizeHex(input: string): string {
  const value = (input || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map(c => c + c)
      .join('')}`
  }
  return '#6366f1'
}

function mix(from: string, to: string, t: number): string {
  const a = normalizeHex(from)
  const b = normalizeHex(to)
  const pick = (offset: number) => {
    const ca = parseInt(a.slice(offset, offset + 2), 16)
    const cb = parseInt(b.slice(offset, offset + 2), 16)
    return Math.round(ca * (1 - t) + cb * t)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${pick(1)}${pick(3)}${pick(5)}`
}

function Attire({ look, coat }: { look: FaceLook; coat: string }) {
  // Accents are role-flavoured details, not persona colours — they need to stay
  // bright against the darkened coat to survive at 30px.
  const accent: ReactNode = {
    bob: <path d="M43 72 L50 86 L57 72" stroke="#c4b5fd" strokeWidth={2} fill="none" strokeLinejoin="round" />,
    crop: <path d="M41 72 C41 79 59 79 59 72" stroke="#7dd3fc" strokeWidth={1.6} fill="none" />,
    curly: (
      <path d="M34 78 C43 87 57 87 66 78" stroke="#fbbf24" strokeWidth={2} fill="none" strokeLinecap="round" />
    ),
    ponytail: <path d="M50 74 L46 90 L50 95 L54 90 Z" fill="#86efac" />,
    spiky: <path d="M50 73 L50 100" stroke="#67e8f9" strokeWidth={2} />,
    medium: <path d="M44 72 L50 83 L56 72" stroke="#a5b4fc" strokeWidth={1.8} fill="none" strokeLinejoin="round" />,
  }[look]

  return (
    <>
      <path d={SHOULDERS} fill={coat} />
      {accent}
    </>
  )
}

function HairShape({ look, fill }: { look: FaceLook; fill: string }) {
  // Each silhouette has to stay legible as a distinct shape at 30px, which is
  // why a ponytail tail or spiky crown extends past the head outline.
  switch (look) {
    case 'bob':
      return (
        <>
          <path
            d="M29 52 C27 32 36 20 50 20 C64 20 73 32 71 52 C70 58 68 62 66 64 C67 52 66 40 62 34 C56 30 44 30 38 34 C34 40 33 52 34 64 C32 62 30 58 29 52 Z"
            fill={fill}
          />
          <path d="M38 30 C46 26 58 27 63 32 C56 30 44 30 38 34 Z" fill="#fff" fillOpacity={0.1} />
        </>
      )
    case 'crop':
      return (
        <path
          d="M31 44 C31 27 40 21 50 21 C62 21 70 28 69 44 C67 36 62 31 50 31 C38 31 33 36 31 44 Z"
          fill={fill}
        />
      )
    case 'curly':
      return (
        <g fill={fill}>
          <circle cx="50" cy="24" r="13" />
          <circle cx="34" cy="33" r="10" />
          <circle cx="66" cy="33" r="10" />
          <circle cx="28" cy="46" r="7" />
          <circle cx="72" cy="46" r="7" />
        </g>
      )
    case 'ponytail':
      return (
        <>
          <path
            d="M31 44 C31 27 40 21 50 21 C62 21 70 28 69 44 C67 35 61 30 50 30 C39 30 33 35 31 44 Z"
            fill={fill}
          />
          <path d="M68 40 C76 44 78 56 74 66 C72 58 70 50 66 46 Z" fill={fill} />
        </>
      )
    case 'spiky':
      return (
        <>
          <path
            d="M31 44 C30 30 38 22 50 22 C62 22 70 30 69 44 C66 36 60 32 50 32 C40 32 34 36 31 44 Z"
            fill={fill}
          />
          <path d="M35 27 L40 20 L45 27 L50 18 L55 27 L60 20 L65 27 Z" fill={fill} />
        </>
      )
    case 'medium':
      return (
        <path
          d="M32 46 C31 29 40 22 50 22 C61 22 69 29 68 46 C66 37 60 32 50 32 C40 32 34 37 32 46 Z"
          fill={fill}
        />
      )
  }
}

function Glasses({ style, stroke }: { style: FaceGlasses; stroke: string }) {
  if (style === 'none') return null

  if (style === 'square') {
    return (
      <g stroke={stroke} strokeWidth={1.3} fill="none" opacity={0.9}>
        <rect x="37.5" y="40" width="10" height="8" rx="2" />
        <rect x="52.5" y="40" width="10" height="8" rx="2" />
        <path d="M47.5 44 L52.5 44" />
      </g>
    )
  }

  return (
    <g stroke={stroke} strokeWidth={1.3} fill="none" opacity={0.92}>
      <circle cx="43" cy="45" r="5.6" />
      <circle cx="57" cy="45" r="5.6" />
      <path d="M48.6 45 L51.4 45" />
    </g>
  )
}

export function CharacterFace({
  seed,
  color,
  look,
  skin,
  glasses,
  size = '100%',
  className,
  style,
  title,
}: CharacterFaceProps) {
  // Gradient ids must be unique per instance: the same persona can appear in the
  // sidebar and the editor at once, and duplicate ids silently steal fills.
  // useId() emits colons, which are legal in HTML but fragile inside url(#…) refs.
  const uid = `cf${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const resolvedLook = look ?? FACE_LOOKS[hashIndex(seed, FACE_LOOKS.length)]
  const resolvedSkin = skin ?? SKIN_TONES[hashIndex(`${seed}:skin`, SKIN_TONES.length)]

  const glassesRoll = hashIndex(`${seed}:glasses`, 4)
  const resolvedGlasses: FaceGlasses =
    glasses ?? (glassesRoll === 0 ? 'round' : glassesRoll === 1 ? 'square' : 'none')

  const base = normalizeHex(color)
  const hair = mix(base, '#0c0b10', HAIR_MIX[resolvedLook])
  const coat = mix(base, '#0b1020', 0.58)
  // Lenses pick up the persona hue but stay light enough to read as glass.
  const lensStroke = mix(base, '#f8fafc', 0.62)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', borderRadius: '50%', ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}

      <defs>
        {/* Top-lit vignette instead of a flat colour wash — flat fills were what
            made the old avatars look like stickers. */}
        <radialGradient id={`${uid}-bg`} cx="50%" cy="30%" r="72%">
          <stop offset="0%" stopColor={base} stopOpacity={0.3} />
          <stop offset="55%" stopColor={base} stopOpacity={0.13} />
          <stop offset="100%" stopColor="#0b1020" stopOpacity={0.55} />
        </radialGradient>
        <linearGradient id={`${uid}-hair`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor={hair} stopOpacity={1} />
          <stop offset="100%" stopColor={hair} stopOpacity={0.72} />
        </linearGradient>
        <linearGradient id={`${uid}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={resolvedSkin} />
          <stop offset="100%" stopColor={resolvedSkin} stopOpacity={0.88} />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-clip)`}>
        <rect width="100" height="100" fill={`url(#${uid}-bg)`} />

        <Attire look={resolvedLook} coat={coat} />

        {/* Neck is a rounded column that tucks under the jaw; the old square post
            left a visible seam against the collar. */}
        <rect x="45.6" y="56" width="8.8" height="20" rx="4.4" fill={resolvedSkin} fillOpacity={0.95} />
        <ellipse cx="50" cy="60" rx="7.5" ry="2.6" fill="#5a3a26" fillOpacity={0.16} />

        <ellipse cx="50" cy="44" rx="17.5" ry="19.5" fill={`url(#${uid}-skin)`} />

        <ellipse cx="32.6" cy="45" rx="2.6" ry="3.6" fill={resolvedSkin} />
        <ellipse cx="67.4" cy="45" rx="2.6" ry="3.6" fill={resolvedSkin} />

        <ellipse cx="40" cy="51" rx="4.2" ry="2.6" fill="#f43f5e" fillOpacity={0.13} />
        <ellipse cx="60" cy="51" rx="4.2" ry="2.6" fill="#f43f5e" fillOpacity={0.13} />

        {/* Eyes need sclera + iris + pupil + a separate lid arc. A single arc
            reads as a closed eye at every size. */}
        <g>
          <ellipse cx="42.6" cy="44.2" rx="3.3" ry="3.5" fill="#fffdf8" />
          <ellipse cx="57.4" cy="44.2" rx="3.3" ry="3.5" fill="#fffdf8" />
          <circle cx="42.9" cy="44.4" r="2.15" fill="#2a1a12" />
          <circle cx="57.1" cy="44.4" r="2.15" fill="#2a1a12" />
          <circle cx="42.9" cy="44.4" r="1" fill="#120c08" />
          <circle cx="57.1" cy="44.4" r="1" fill="#120c08" />
          <circle cx="43.6" cy="43.5" r="0.75" fill="#fff" fillOpacity={0.95} />
          <circle cx="57.8" cy="43.5" r="0.75" fill="#fff" fillOpacity={0.95} />
          <path
            d="M39.1 44 Q42.6 40.4 46.1 44"
            stroke="#2b1d16"
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            opacity={0.75}
          />
          <path
            d="M53.9 44 Q57.4 40.4 60.9 44"
            stroke="#2b1d16"
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            opacity={0.75}
          />
        </g>

        <path
          d="M38.6 38.2 Q42.6 36.4 46.6 38.2"
          stroke={hair}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />
        <path
          d="M53.4 38.2 Q57.4 36.4 61.4 38.2"
          stroke={hair}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />

        <path
          d="M45.6 53.4 Q50 56.6 54.4 53.4"
          stroke="#8a3a2e"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />

        <Glasses style={resolvedGlasses} stroke={lensStroke} />

        {/* Hair is painted last so it can sit over the brow line and glasses. */}
        <HairShape look={resolvedLook} fill={`url(#${uid}-hair)`} />
      </g>

      <circle cx="50" cy="50" r="48.6" stroke="#fff" strokeOpacity={0.1} strokeWidth={1.2} fill="none" />
    </svg>
  )
}