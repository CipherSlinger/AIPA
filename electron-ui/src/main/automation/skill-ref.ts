/**
 * The identity, the ceiling and the receipt of a skill-backed job.
 *
 * Kept free of `electron`, the preference store and the filesystem so that every
 * path which has to agree on "is this a skill job?" shares one definition: the
 * scheduler's action validator, the job store's `normalizeJob` (which the live
 * store, the trash and the backup importer all call), the run-history
 * normalizer, and the disk side in `skill-action.ts`. A second copy of these
 * rules is how a field gets silently dropped by one whitelist and kept by the
 * next.
 */
import { DEPT_HANDBOOK_MAX_CHARS } from './dept-handbook'
import type {
  AutomationSkillDigest,
  AutomationSkillRef,
  AutomationSkillSource,
} from './types'

/**
 * How much of a skill's body one run may inject.
 *
 * Deliberately the department handbook's number: both are "context a job adds
 * on its own", and two different ceilings would make the same SKILL.md arrive
 * whole in a chat turn and half-read at 03:00.
 */
export const SKILL_PROMPT_MAX_CHARS = DEPT_HANDBOOK_MAX_CHARS

/** Long enough for a real skill name, short enough that a record stays readable. */
export const SKILL_NAME_MAX_CHARS = 120

/**
 * The longest directory segment we will accept as a skill identity.
 *
 * Windows refuses segments over 255 characters anyway; this bound only keeps a
 * hand-edited store from carrying a megabyte "name" into every run record.
 */
const SKILL_DIR_MAX_CHARS = 200

/**
 * Validate a stored identity down to the one shape the resolver understands.
 *
 * `source` is a closed set. `dir` must be a single path segment: no separator,
 * no `.`/`..`, no drive colon and no NUL, which is exactly what makes the
 * `path.join(root, dir)` on the other side unable to leave the root. `''` is
 * allowed and means the root's own `SKILL.md`.
 */
export function normalizeSkillRef(source: unknown, dir: unknown): AutomationSkillRef | null {
  if (source !== 'personal' && source !== 'project') return null
  if (typeof dir !== 'string') return null
  if (dir.length > SKILL_DIR_MAX_CHARS) return null
  if (dir === '.') return null
  if (dir === '..') return null
  if (/[\\/\u0000:]/.test(dir)) return null
  return { source: source as AutomationSkillSource, dir }
}

/**
 * Whether a persisted action is a skill action this build can still resolve.
 *
 * Used by `normalizeJob`, so it must answer without touching the disk: whether
 * the skill exists today is a run-time fact, and a job whose skill is gone has
 * to survive a reload so its history and the row that explains it survive too.
 */
export function isSkillActionShape(action: Record<string, unknown>): boolean {
  if (action.kind !== 'skill') return false
  return normalizeSkillRef(action.skillSource, action.skillDir) !== null
}

export interface SkillPromptBlock {
  /** The block handed to the runner; `''` when the skill body is empty. */
  text: string
  /** Body characters kept, after the ceiling. */
  chars: number
  /** Body characters before the ceiling. */
  sourceChars: number
  truncated: boolean
}

/**
 * Turn a SKILL.md body into the one prompt a run sends.
 *
 * Same trim, same ceiling and the same in-band marker as
 * `buildDeptHandbookBlock`, because the reader of a record has to be able to
 * tell a cut from a short file in both cases. An empty body returns `''`: the
 * scheduler's existing "nothing to run" branch records that honestly instead
 * of sending an empty wrapper and calling it a run.
 */
export function buildSkillPromptBlock(rawBody: string): SkillPromptBlock {
  const content = rawBody.trim()
  const sourceChars = content.length
  const truncated = sourceChars > SKILL_PROMPT_MAX_CHARS
  const body = truncated ? content.slice(0, SKILL_PROMPT_MAX_CHARS) : content
  if (!body) return { text: '', chars: 0, sourceChars, truncated }
  const marker = truncated
    ? `\n\n[skill instructions cut here: showing the first ${body.length} of ${sourceChars} characters]`
    : ''
  return {
    text: `<skill_instructions>\n${body}${marker}\n</skill_instructions>`,
    chars: body.length,
    sourceChars,
    truncated,
  }
}

/**
 * Restore a persisted digest, or reject it.
 *
 * The counts are not free-form: `chars` is what `buildSkillPromptBlock` could
 * have produced for `sourceChars`, and `truncated` is that same relationship.
 * A record that disagrees with itself is dropped rather than shown, for the
 * same reason `normalizeAutomationHandbookDigest` exists — a receipt that
 * cannot be arithmetically true is worse than no receipt.
 */
export function normalizeSkillDigest(raw: unknown): AutomationSkillDigest | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  const ref = normalizeSkillRef(value.source, value.dir)
  if (!ref) return undefined
  const chars = value.chars
  const sourceChars = value.sourceChars
  if (typeof chars !== 'number' || !Number.isInteger(chars)) return undefined
  if (typeof sourceChars !== 'number' || !Number.isInteger(sourceChars)) return undefined
  if (chars < 1 || chars > SKILL_PROMPT_MAX_CHARS) return undefined
  if (sourceChars < chars) return undefined
  if (chars !== Math.min(sourceChars, SKILL_PROMPT_MAX_CHARS)) return undefined
  const truncated = sourceChars > SKILL_PROMPT_MAX_CHARS
  if (value.truncated !== truncated) return undefined
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, SKILL_NAME_MAX_CHARS) : ''
  return {
    source: ref.source,
    dir: ref.dir,
    ...(name ? { name } : {}),
    chars,
    sourceChars,
    truncated,
  }
}
