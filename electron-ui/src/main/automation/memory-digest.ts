/**
 * The bounded memory descriptor attached to one automation run.
 *
 * Pure and Electron-free (the assembler types are type-only imports), so the
 * derivation and restore rules can be exercised by a Node harness and by
 * `run-history` without loading config or a window.
 *
 * The digest deliberately records shape, never content: tier labels, the
 * block's character count, and whether a budget clipped it. Those are enough
 * to explain a run after the fact ("no memory", "1.2k chars, truncated", or
 * "the read failed") without copying the user's memory into `automations.json`.
 */
import type { AutomationMemoryDigest, AutomationMemoryTier } from './types'
import type { MemoryContextResult, MemoryTierKey } from '../sessions/memory-context'

/** Public tier labels, in the order the assembler emits them. */
export const MEMORY_TIER_LABELS: readonly AutomationMemoryTier[] = [
  'global',
  'project',
  'global-structured',
  'project-structured',
  'personal',
]

/** Internal assembler keys → the persisted labels. */
const TIER_LABEL: Record<MemoryTierKey, AutomationMemoryTier> = {
  globalDoc: 'global',
  projectDoc: 'project',
  globalStructured: 'global-structured',
  projectStructured: 'project-structured',
  personal: 'personal',
}

/**
 * Upper bound for a persisted character count. The production assembler caps
 * the whole block at 12,000 characters, so anything remotely near this is a
 * corrupt value rather than a real run.
 */
const MAX_DIGEST_CHARS = 100_000

/**
 * Describe the snapshot a run saw from the assembler's structured result.
 *
 * Truncation covers both ways a budget can bite: a tier shortened in place
 * (`truncated`) and a tier that existed but was dropped entirely (`omitted`).
 * Deriving it from the structured fields is what makes this immune to user
 * content that happens to contain a `<memory tier=…>` header.
 */
export function buildMemoryDigest(context: MemoryContextResult): AutomationMemoryDigest {
  return {
    state: 'ok',
    tiers: context.applied.map((key) => TIER_LABEL[key]),
    chars: context.text.length,
    truncated: context.truncated.length > 0 || context.omitted.length > 0,
  }
}

/** The descriptor for a read that threw: distinct from an empty snapshot. */
export function failedMemoryDigest(): AutomationMemoryDigest {
  return { state: 'failed', tiers: [], chars: 0, truncated: false }
}

function isKnownTier(value: unknown): value is AutomationMemoryTier {
  return typeof value === 'string' &&
    (MEMORY_TIER_LABELS as readonly string[]).includes(value)
}

/**
 * Restore one persisted descriptor, or drop it.
 *
 * Returns undefined for anything malformed; the run record itself survives
 * without it, exactly like a record written before this field existed. The
 * checks keep a hand-edited file from producing a digest the assembler could
 * never have emitted (for example a failed read that claims tiers, or an empty
 * block that claims truncation).
 */
export function normalizeMemoryDigest(raw: unknown): AutomationMemoryDigest | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const digest = raw as Record<string, unknown>
  if (digest.state !== 'ok' && digest.state !== 'failed') return undefined
  if (typeof digest.truncated !== 'boolean') return undefined

  const chars = digest.chars
  if (typeof chars !== 'number' || !Number.isInteger(chars) ||
    chars < 0 || chars > MAX_DIGEST_CHARS) {
    return undefined
  }

  if (!Array.isArray(digest.tiers)) return undefined
  const tiers: AutomationMemoryTier[] = []
  for (const value of digest.tiers) {
    if (!isKnownTier(value) || tiers.includes(value)) return undefined
    tiers.push(value)
  }
  // Canonical prompt order, so a hand-edited file cannot reorder the row.
  tiers.sort((a, b) => MEMORY_TIER_LABELS.indexOf(a) - MEMORY_TIER_LABELS.indexOf(b))

  if (digest.state === 'failed') {
    if (tiers.length > 0 || chars !== 0 || digest.truncated) return undefined
    return { state: 'failed', tiers, chars: 0, truncated: false }
  }

  // A block with no applied tier is empty by construction, and any applied tier
  // guarantees at least the `<memory>` wrapper in the text.
  if (tiers.length === 0) {
    if (chars !== 0 || digest.truncated) return undefined
  } else if (chars === 0) {
    return undefined
  }
  return { state: 'ok', tiers, chars, truncated: digest.truncated }
}
