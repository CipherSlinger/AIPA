// generateWordSlug — friendly random identifier generator (Iteration 492)
// Ported from Claude Code sourcemap: src/utils/words.ts
// Used for export filenames and session display names.

const ADJECTIVES = [
  'abundant', 'ancient', 'bright', 'calm', 'cheerful', 'clever', 'cozy',
  'curious', 'dapper', 'dazzling', 'deep', 'delightful', 'eager', 'elegant',
  'enchanted', 'fancy', 'fluffy', 'gentle', 'gleaming', 'golden', 'graceful',
  'happy', 'hidden', 'humble', 'jolly', 'joyful', 'keen', 'kind', 'lively',
  'lovely', 'lucky', 'luminous', 'magical', 'majestic', 'mellow', 'merry',
  'mighty', 'misty', 'noble', 'peaceful', 'playful', 'polished', 'precious',
  'proud', 'quiet', 'quirky', 'radiant', 'rosy', 'serene', 'shiny', 'silly',
  'sleepy', 'smooth', 'snazzy', 'snug', 'soft', 'sparkling', 'splendid',
  'starry', 'steady', 'sunny', 'swift', 'tender', 'tidy', 'toasty', 'tranquil',
] as const

const NOUNS = [
  'aurora', 'beacon', 'brook', 'candle', 'castle', 'cloud', 'comet', 'cosmos',
  'crystal', 'dawn', 'dream', 'dune', 'ember', 'feather', 'field', 'flame',
  'forest', 'fox', 'galaxy', 'garden', 'gem', 'glacier', 'harbor', 'haven',
  'horizon', 'island', 'journey', 'lagoon', 'lantern', 'lighthouse', 'lotus',
  'meadow', 'moon', 'mountain', 'nebula', 'ocean', 'opal', 'orchard', 'owl',
  'peak', 'petal', 'phoenix', 'pine', 'planet', 'pond', 'prism', 'quartz',
  'rainbow', 'raven', 'reef', 'river', 'sage', 'sea', 'shadow', 'shore',
  'sky', 'snowflake', 'star', 'storm', 'stream', 'sun', 'tide', 'tower',
  'trail', 'tree', 'unicorn', 'valley', 'wave', 'wind', 'wing', 'world',
] as const

function pickRandom<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)]!
}

/**
 * Generate a short friendly slug: "adjective-noun"
 * Example: "gleaming-lighthouse", "serene-phoenix"
 */
export function generateShortWordSlug(): string {
  return `${pickRandom(ADJECTIVES)}-${pickRandom(NOUNS)}`
}

/**
 * Generate a longer slug: "adjective-noun-noun"
 * Example: "gleaming-aurora-phoenix"
 */
export function generateWordSlug(): string {
  return `${pickRandom(ADJECTIVES)}-${pickRandom(NOUNS)}-${pickRandom(NOUNS)}`
}
