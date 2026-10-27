// PersonCharacterIcon — persona avatar chrome around CharacterFace.
// The drawing itself lives in avatars/CharacterFace so the org-chart cards can
// reuse it without inheriting the ring, badge or presence dot.

import React from 'react'
import type { Persona } from '../../types/app.types'
import { CharacterFace } from '../avatars/CharacterFace'
import type { FaceGlasses, FaceLook, SkinTone } from '../avatars/CharacterFace'

interface PersonCharacterIconProps {
  persona: Persona
  size?: number
  isActive?: boolean
  showBadge?: boolean
  className?: string
}

interface PresetFace {
  look: FaceLook
  skin: SkinTone
  glasses: FaceGlasses
}

/**
 * Preset faces are pinned rather than hashed: two installed presets must never
 * land on the same look/skin pair, which a hash cannot guarantee.
 */
const PRESET_FACES: Record<string, PresetFace> = {
  writingCoach: { look: 'bob', skin: '#eec39a', glasses: 'square' },
  researchAnalyst: { look: 'crop', skin: '#b87a4b', glasses: 'round' },
  creativePartner: { look: 'curly', skin: '#f6d5b8', glasses: 'none' },
  studyTutor: { look: 'ponytail', skin: '#d99c6a', glasses: 'round' },
  productivityCoach: { look: 'spiky', skin: '#8d5524', glasses: 'none' },
}

const ROLE_EMBLEMS: Record<string, string> = {
  writingCoach: '✍️',
  researchAnalyst: '🔬',
  creativePartner: '🎨',
  studyTutor: '📚',
  productivityCoach: '⚡',
}

/**
 * Illustrated persona avatar: circular portrait plus the role emblem badge and
 * the active-session glow / presence dot.
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
  const preset = PRESET_FACES[key]

  const roleEmblem = React.useMemo(() => ROLE_EMBLEMS[key] || p.emoji || '💼', [key, p.emoji])

  // Badge geometry: 0.36 ate the chin at 30px. 0.30 with a 16px floor keeps the
  // emblem legible without covering the jaw, and the font tracks the badge.
  const badgeSize = Math.max(16, Math.round(size * 0.3))
  const badgeFont = Math.max(9, Math.round(size * 0.17))

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
      <CharacterFace
        seed={`${p.id}|${p.name}`}
        color={baseColor}
        look={preset?.look}
        skin={preset?.skin}
        glasses={preset?.glasses}
        size={size}
        // Every call site already prints the persona name next to the avatar;
        // leaving the portrait decorative avoids double-announcing it.
        style={{
          filter: isActive
            ? `drop-shadow(0 0 8px ${baseColor}80) drop-shadow(0 2px 4px rgba(0,0,0,0.3))`
            : 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))',
          transition: 'filter 0.2s ease',
        }}
      />

      {/* Floating role emblem badge at bottom-right */}
      {showBadge && (
        <div
          title={key ? `${key} (${roleEmblem})` : p.name}
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            // Translucent so the portrait reads through instead of being cut off
            // by an opaque disc; the hairline border is what defines the edge.
            background: 'rgba(15,23,42,0.92)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: badgeFont,
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