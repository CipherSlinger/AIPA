// One reading of `skills:install` for every surface that can publish a skill.
//
// `installSkill` refuses to overwrite a folder it did not write unless the
// caller passes `replace: true`, and reports that refusal with a stable
// `skill_exists` code plus the folder (and, when readable, the name) already
// there. Before this module each caller treated any non-success as one generic
// error, so the marketplace, the conversation dialog and the employee presets
// either showed main's raw sentence or looked broken. They now share this
// mapping: the same refusal is an `exists` outcome that names the skill and
// offers Open / Replace, and nothing here ever decides to replace on its own —
// `replaceRequested` is whatever the caller's explicit press sent.
//
// Deliberately React-free: the harness executes it in plain Node, and a copy
// that only exists inside a component could drift from the other two.
import type { SkillInfo } from './skillsShared'

/** The four codes `installSkill` can return, plus the success case. */
export type SkillInstallOutcomeKind = 'installed' | 'exists' | 'invalid_name' | 'outside_skills' | 'failed'

export type SkillInstallOutcomeCode =
  | 'success'
  | 'skill_exists'
  | 'invalid_name'
  | 'outside_skills'
  | 'write_failed'
  | 'unknown'

export type SkillInstallAffordance = 'open' | 'replace'

/** The subset of the preload result the mapper needs; extra fields are ignored. */
export interface SkillInstallResultLike {
  success?: boolean
  code?: string
  error?: string
  dirPath?: string
  name?: string
}

export interface SkillInstallOutcome {
  kind: SkillInstallOutcomeKind
  /** Which main-side code produced this, or `unknown` for a malformed reply. */
  code: SkillInstallOutcomeCode
  /** Folder the install wrote, or the folder already holding the skill. */
  dirPath?: string
  /** `name:` of the existing SKILL.md; absent when it could not be read. */
  name?: string
  /** Main's raw sentence. Secondary detail only — never the primary line. */
  error?: string
  /** True only when the request that succeeded had `replace: true`. */
  replaced: boolean
  tone: 'success' | 'warning' | 'error'
  /** Primary localized line for this outcome. */
  messageKey: string
  /** Optional second line: the existing skill's name, or its folder. */
  detailKey?: string
  /** Buttons the surface may offer; `Replace` is never implicit. */
  affordances: SkillInstallAffordance[]
  /** Warning that must accompany a Replace button. */
  replaceWarningKey?: string
}

/** Labels for the affordances, shared so the three surfaces say the same thing. */
export const INSTALL_AFFORDANCE_LABEL_KEYS: Record<SkillInstallAffordance, string> = {
  open: 'skill.existsOpen',
  replace: 'skill.existsReplace',
}

/** The overwrite warning the skill creator already uses. */
export const INSTALL_REPLACE_WARNING_KEY = 'skill.existsReplaceWarning'

function failed(error: string | undefined, replaced: boolean): SkillInstallOutcome {
  return {
    kind: 'failed',
    code: 'unknown',
    ...(error ? { error } : {}),
    replaced,
    tone: 'error',
    messageKey: 'skills.installFailed',
    affordances: [],
  }
}

/**
 * Turn a `skills:install` reply into the one outcome every surface renders.
 *
 * `replaceRequested` must be the flag the caller actually sent, not an
 * inference from the reply: only a press that said `replace: true` may be
 * described as a replacement.
 */
export function resolveInstallOutcome(
  result: SkillInstallResultLike | null | undefined,
  options: { replaceRequested?: boolean } = {},
): SkillInstallOutcome {
  const replaceRequested = options.replaceRequested === true
  if (!result || typeof result !== 'object') return failed(undefined, false)

  if (result.success === true) {
    return {
      kind: 'installed',
      code: 'success',
      ...(result.dirPath ? { dirPath: result.dirPath } : {}),
      replaced: replaceRequested,
      tone: 'success',
      // A replacement is not an install: the marketplace card and the
      // conversation dialog both have to say which one happened.
      messageKey: replaceRequested ? 'skills.installOutcome.replaced' : 'skills.installSuccess',
      affordances: [],
    }
  }

  switch (result.code) {
    case 'skill_exists':
      return {
        kind: 'exists',
        code: 'skill_exists',
        ...(result.dirPath ? { dirPath: result.dirPath } : {}),
        ...(result.name ? { name: result.name } : {}),
        ...(result.error ? { error: result.error } : {}),
        replaced: false,
        tone: 'warning',
        messageKey: 'skill.existsTitle',
        // Name it when main could read the old frontmatter; otherwise point at
        // the folder that is in the way.
        ...(result.name
          ? { detailKey: 'skill.existsName' }
          : result.dirPath
            ? { detailKey: 'skill.existsBody' }
            : {}),
        // Open needs a folder. Replace does not, but it still needs a press.
        affordances: result.dirPath ? ['open', 'replace'] : ['replace'],
        replaceWarningKey: INSTALL_REPLACE_WARNING_KEY,
      }
    case 'invalid_name':
      return {
        kind: 'invalid_name',
        code: 'invalid_name',
        ...(result.error ? { error: result.error } : {}),
        replaced: false,
        tone: 'error',
        messageKey: 'skills.installOutcome.invalidName',
        affordances: [],
      }
    case 'outside_skills':
      return {
        kind: 'outside_skills',
        code: 'outside_skills',
        ...(result.error ? { error: result.error } : {}),
        replaced: false,
        tone: 'error',
        messageKey: 'skills.installOutcome.outsideSkills',
        affordances: [],
      }
    case 'write_failed':
      return {
        kind: 'failed',
        code: 'write_failed',
        ...(result.error ? { error: result.error } : {}),
        replaced: false,
        tone: 'error',
        messageKey: 'skills.installFailed',
        affordances: [],
      }
    default:
      return failed(result.error, false)
  }
}

function folderName(dirPath: string): string {
  // The renderer has no `path` module; both separators occur on Windows.
  const trimmed = dirPath.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

/**
 * Find the installed skill a marketplace/source entry points at.
 *
 * `skills:list` names a skill by its frontmatter `name:` (falling back to the
 * folder), while the marketplace identifies an entry by its `id` and shows a
 * display name. Matching name, folder basename and any extra candidate keeps a
 * card from offering Install for a folder that is already on disk.
 */
export function findInstalledSkill<T extends Pick<SkillInfo, 'name' | 'dirPath'>>(
  installed: readonly T[],
  candidates: readonly (string | undefined | null)[],
): T | undefined {
  const keys = new Set(
    candidates
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim().toLowerCase()),
  )
  if (keys.size === 0) return undefined
  return installed.find(skill =>
    keys.has(skill.name.toLowerCase()) || keys.has(folderName(skill.dirPath).toLowerCase()),
  )
}
