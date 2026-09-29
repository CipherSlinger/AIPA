import React from 'react'
import type { Persona } from '../../types/app.types'
import { djb2Hash } from '../../utils/hashUtils'

interface PersonCharacterIconProps {
  persona: Persona
  size?: number
  isActive?: boolean
  showBadge?: boolean
  className?: string
}

/**
 * Vivid, illustrated person/character vector icon component.
 * Renders distinct, expressive character features (hair, eyes, face, attire, role accessories)
 * with vibrant gradients and role-defining emblems.
 */
export default function PersonCharacterIcon({
  persona,
  size = 54,
  isActive = false,
  showBadge = true,
  className = '',
}: PersonCharacterIconProps) {
  const p = persona
  const key = p.presetKey || ''
  const baseColor = p.color || '#6366f1'

  // Generate deterministic variations for custom personas based on ID or name
  const hash = Math.abs(djb2Hash(p.id + p.name))

  // Skin tone choices (warm, friendly palette)
  const skinTones = ['#fed7aa', '#fde047', '#fbcfe8', '#fecdd3', '#fef08a']
  const skinColor = skinTones[hash % skinTones.length]

  // Hair color choices
  const hairColors = ['#1e1b4b', '#451a03', '#1c1917', '#7c2d12', '#312e81', '#0f172a']
  const hairColor = key === 'creativePartner'
    ? '#ea580c'
    : key === 'writingCoach'
    ? '#312e81'
    : key === 'researchAnalyst'
    ? '#1c1917'
    : key === 'studyTutor'
    ? '#7c2d12'
    : key === 'productivityCoach'
    ? '#0284c7'
    : hairColors[hash % hairColors.length]

  // Clothing color
  const clothesColor = baseColor

  // Distinct role badge emblems
  const roleEmblem = React.useMemo(() => {
    switch (key) {
      case 'writingCoach':
        return '✍️'
      case 'researchAnalyst':
        return '🔬'
      case 'creativePartner':
        return '🎨'
      case 'studyTutor':
        return '📚'
      case 'productivityCoach':
        return '⚡'
      default:
        return p.emoji || '💼'
    }
  }, [key, p.emoji])

  // Unique ID for SVG gradients to prevent DOM ID collisions
  const gradId = `char-grad-${p.id.replace(/[^a-zA-Z0-9-_]/g, '')}`

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          borderRadius: '50%',
          filter: isActive
            ? `drop-shadow(0 0 8px ${baseColor}80) drop-shadow(0 2px 4px rgba(0,0,0,0.3))`
            : 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))',
          transition: 'all 0.2s ease',
          overflow: 'visible',
        }}
      >
        <defs>
          {/* Radial backdrop gradient */}
          <radialGradient id={gradId} cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor={`${baseColor}44`} />
            <stop offset="70%" stopColor={`${baseColor}22`} />
            <stop offset="100%" stopColor={`${baseColor}11`} />
          </radialGradient>

          {/* Clothes gradient */}
          <linearGradient id={`${gradId}-clothes`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={clothesColor} />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
          </linearGradient>

          {/* Hair gradient */}
          <linearGradient id={`${gradId}-hair`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hairColor} />
            <stop offset="100%" stopColor="#09090b" />
          </linearGradient>

          {/* Clip path for circular character portrait */}
          <clipPath id={`${gradId}-clip`}>
            <circle cx="50" cy="50" r="48" />
          </clipPath>
        </defs>

        {/* Outer ambient circle & background */}
        <circle
          cx="50"
          cy="50"
          r="48"
          fill={`url(#${gradId})`}
          stroke={isActive ? baseColor : `${baseColor}60`}
          strokeWidth={isActive ? '3' : '1.5'}
        />

        {/* Inner character group clipped to circle */}
        <g clipPath={`url(#${gradId}-clip)`}>
          {/* Subtle soft backdrop glow */}
          <circle cx="50" cy="40" r="32" fill={baseColor} fillOpacity="0.15" />

          {/* ── Shoulders & Attire ─────────────────────────────────── */}
          {/* Base upper body */}
          <path
            d="M20 92 C20 74 34 68 50 68 C66 68 80 74 80 92 Z"
            fill={`url(#${gradId}-clothes)`}
          />

          {/* Role-specific attire details */}
          {key === 'writingCoach' ? (
            /* Smart blazer & stylish collar */
            <g>
              <path d="M38 70 L50 82 L62 70" stroke="#f8fafc" strokeWidth="2.5" fill="none" />
              <path d="M50 78 L50 94" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="2 2" />
            </g>
          ) : key === 'researchAnalyst' ? (
            /* Modern turtleneck / pullover with tech crest */
            <g>
              <path d="M42 66 C42 64 58 64 58 66 L57 74 L43 74 Z" fill={clothesColor} />
              <circle cx="50" cy="78" r="2.5" fill="#38bdf8" />
            </g>
          ) : key === 'creativePartner' ? (
            /* Creative hoodie with loose collar */
            <g>
              <path d="M35 72 C42 80 58 80 65 72" stroke="#fbbf24" strokeWidth="2" fill="none" />
              <circle cx="44" cy="80" r="1.5" fill="#fbbf24" />
              <circle cx="56" cy="80" r="1.5" fill="#fbbf24" />
            </g>
          ) : key === 'studyTutor' ? (
            /* Academic collar with necktie / ribbon */
            <g>
              <polygon points="46,68 54,68 52,86 48,86" fill="#c084fc" />
              <polygon points="44,68 50,74 46,74" fill="#ffffff" />
              <polygon points="56,68 50,74 54,74" fill="#ffffff" />
            </g>
          ) : key === 'productivityCoach' ? (
            /* Sporty tech zip collar with neon line */
            <g>
              <path d="M50 68 L50 88" stroke="#38bdf8" strokeWidth="2.5" />
              <circle cx="50" cy="70" r="2" fill="#e0f2fe" />
            </g>
          ) : (
            /* Default professional attire */
            <g>
              <polygon points="47,68 53,68 51,84 49,84" fill={`${baseColor}dd`} />
              <path d="M43 68 L50 75 L57 68" stroke="#ffffff" strokeWidth="1.5" fill="none" />
            </g>
          )}

          {/* ── Neck ─────────────────────────────────────────────── */}
          <rect x="44" y="55" width="12" height="15" rx="3" fill={skinColor} />
          {/* Neck shadow */}
          <ellipse cx="50" cy="62" rx="7" ry="2" fill="#000000" fillOpacity="0.12" />

          {/* ── Head & Face ──────────────────────────────────────── */}
          <ellipse cx="50" cy="45" rx="18" ry="20" fill={skinColor} />

          {/* Cheerful blush */}
          <ellipse cx="38" cy="51" rx="3.5" ry="2" fill="#f43f5e" fillOpacity="0.25" />
          <ellipse cx="62" cy="51" rx="3.5" ry="2" fill="#f43f5e" fillOpacity="0.25" />

          {/* Expressive Eyes */}
          <g>
            {/* Left Eye */}
            <circle cx="42" cy="44" r="3" fill="#18181b" />
            <circle cx="43" cy="43" r="1.1" fill="#ffffff" />
            {/* Right Eye */}
            <circle cx="58" cy="44" r="3" fill="#18181b" />
            <circle cx="59" cy="43" r="1.1" fill="#ffffff" />
            {/* Eyebrows */}
            <path d="M38 39 Q42 37 46 39" stroke={hairColor} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M54 39 Q58 37 62 39" stroke={hairColor} strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </g>

          {/* Friendly Smile */}
          <path d="M45 52 Q50 56 55 52" stroke="#881337" strokeWidth="1.6" strokeLinecap="round" fill="none" />

          {/* ── Hair & Head Accessories ─────────────────────────── */}
          {key === 'creativePartner' ? (
            /* Creative Beret & Curled Hair */
            <g>
              {/* Wavy hair strands */}
              <path d="M32 42 C28 50 32 58 35 60 C32 54 34 46 34 42 Z" fill={`url(#${gradId}-hair)`} />
              <path d="M68 42 C72 50 68 58 65 60 C68 54 66 46 66 42 Z" fill={`url(#${gradId}-hair)`} />
              {/* French Beret Hat */}
              <ellipse cx="50" cy="30" rx="24" ry="11" fill="#ea580c" transform="rotate(-6 50 30)" />
              <circle cx="50" cy="18" r="2" fill="#c2410c" />
              {/* Front bangs */}
              <path d="M36 34 Q44 42 52 35 Q60 40 64 34" fill={`url(#${gradId}-hair)`} />
            </g>
          ) : key === 'researchAnalyst' ? (
            /* Neat Side-crop Hair + Modern Round Glasses */
            <g>
              {/* Hair */}
              <path
                d="M30 40 C30 26 42 22 58 24 C68 25 72 32 70 42 C67 33 60 30 50 30 C38 30 33 34 30 40 Z"
                fill={`url(#${gradId}-hair)`}
              />
              {/* Glasses frame */}
              <circle cx="42" cy="44" r="6.5" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
              <circle cx="58" cy="44" r="6.5" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
              <path d="M48.5 44 L51.5 44" stroke="#38bdf8" strokeWidth="1.5" />
            </g>
          ) : key === 'writingCoach' ? (
            /* Sleek Bob with Glasses */
            <g>
              {/* Hair framing face */}
              <path
                d="M30 42 C28 54 32 60 35 62 C31 52 33 40 36 34 C42 26 58 26 64 34 C67 40 69 52 65 62 C68 60 72 54 70 42 C70 25 60 22 50 22 C40 22 30 25 30 42 Z"
                fill={`url(#${gradId}-hair)`}
              />
              {/* Chic square glasses */}
              <rect x="36" y="39" width="11" height="9" rx="2" stroke="#a78bfa" strokeWidth="1.5" fill="none" />
              <rect x="53" y="39" width="11" height="9" rx="2" stroke="#a78bfa" strokeWidth="1.5" fill="none" />
              <path d="M47 43 L53 43" stroke="#a78bfa" strokeWidth="1.5" />
            </g>
          ) : key === 'studyTutor' ? (
            /* Tutor Scholar Hair & Friendly Glasses */
            <g>
              <path
                d="M32 40 C30 28 40 24 50 24 C60 24 70 28 68 40 C65 33 58 31 50 31 C42 31 35 33 32 40 Z"
                fill={`url(#${gradId}-hair)`}
              />
              {/* Scholar Glasses */}
              <circle cx="42" cy="44" r="6" stroke="#fbbf24" strokeWidth="1.4" fill="none" />
              <circle cx="58" cy="44" r="6" stroke="#fbbf24" strokeWidth="1.4" fill="none" />
              <path d="M48 44 L52 44" stroke="#fbbf24" strokeWidth="1.4" />
            </g>
          ) : key === 'productivityCoach' ? (
            /* Modern Spiky/Textured Hair + Tech Headset */
            <g>
              <path
                d="M32 38 C32 26 42 22 50 20 C54 22 57 19 62 23 C68 27 68 35 68 38 C64 32 58 30 50 30 C40 30 35 33 32 38 Z"
                fill={`url(#${gradId}-hair)`}
              />
              {/* Tech Headset Band */}
              <path d="M30 42 C28 28 72 28 70 42" stroke="#38bdf8" strokeWidth="2.5" fill="none" />
              {/* Earpiece */}
              <circle cx="30" cy="44" r="3.5" fill="#0284c7" stroke="#e0f2fe" strokeWidth="1" />
              {/* Boom Mic */}
              <path d="M31 46 Q34 52 42 52" stroke="#38bdf8" strokeWidth="1.8" fill="none" strokeLinecap="round" />
              <circle cx="42" cy="52" r="1.5" fill="#22c55e" />
            </g>
          ) : (
            /* Default handsome hair */
            <g>
              <path
                d="M31 40 C30 27 40 24 50 23 C60 24 70 27 69 40 C65 32 58 30 50 30 C42 30 35 32 31 40 Z"
                fill={`url(#${gradId}-hair)`}
              />
            </g>
          )}
        </g>

        {/* Active neon highlight ring */}
        {isActive && (
          <circle
            cx="50"
            cy="50"
            r="47"
            stroke={baseColor}
            strokeWidth="2.5"
            fill="none"
            opacity="0.9"
          />
        )}
      </svg>

      {/* Floating Role Emblem Badge at bottom-right */}
      {showBadge && (
        <div
          title={key ? `${key} (${roleEmblem})` : p.name}
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: Math.max(18, Math.round(size * 0.36)),
            height: Math.max(18, Math.round(size * 0.36)),
            borderRadius: '50%',
            background: 'var(--bg-secondary, #1e1e2e)',
            border: `1.5px solid ${baseColor}`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(10, Math.round(size * 0.2)),
            lineHeight: 1,
            zIndex: 3,
            userSelect: 'none',
          }}
        >
          {roleEmblem}
        </div>
      )}

      {/* Online / Active status pulse indicator */}
      {isActive && (
        <div
          title="Active in current session"
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#22c55e',
            border: '2px solid var(--bg-primary, #0f172a)',
            boxShadow: '0 0 8px #22c55e',
            zIndex: 4,
          }}
        />
      )}
    </div>
  )
}
