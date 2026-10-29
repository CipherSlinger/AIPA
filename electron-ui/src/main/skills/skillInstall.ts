/**
 * Install one SKILL.md without silently destroying the one already there.
 *
 * `skills:install` used to `mkdir -p` the target folder and write over whatever
 * `SKILL.md` was in it. Creating a skill whose sanitized folder was already in
 * use therefore replaced a hand-written file with no warning, and the trash
 * only covers deletes, so there was no way back. Replacement is now opt-in via
 * `replace: true`, and even then the file goes to a temp name in the same
 * folder and is renamed into place, so a crash cannot leave half a SKILL.md.
 *
 * `skillsRoot` is a seam for the harness only, exactly like `moveSkillToTrash`'s
 * root: it keeps a test inside a scratch directory instead of the user's real
 * `~/.claude/skills`. The IPC handler never passes it.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { isPathInside } from '../utils/validate'
import { parseSkillMd, sanitizeSkillDirName } from './skillMd'

export type SkillInstallErrorCode =
  | 'skill_exists'
  | 'invalid_name'
  | 'outside_skills'
  | 'write_failed'

export type SkillInstallResult =
  | { success: true; dirPath: string }
  | {
      success: false
      code: SkillInstallErrorCode
      error: string
      /** Set for `skill_exists` so the caller can offer to open the existing skill. */
      dirPath?: string
      /** Best-effort `name:` from the existing SKILL.md; absent if unreadable. */
      name?: string
    }

export interface InstallSkillInput {
  name: string
  content: string
  replace?: boolean
  /** Harness-only override; the app always installs under the personal root. */
  skillsRoot?: string
}

export function personalSkillsRoot(): string {
  return path.join(os.homedir(), '.claude', 'skills')
}

/**
 * Publish a fully written temp file at `target` only if nothing is there.
 *
 * `rename` is not usable here: it replaces an existing file. A hard link is an
 * atomic "create if absent" on the same volume, and the exclusive copy is the
 * fallback for volumes without hard links (FAT, some network shares). Both
 * publish a complete file, never a partial one.
 */
function publishWithoutOverwrite(tmp: string, target: string): boolean {
  try {
    fs.linkSync(tmp, target)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    try {
      fs.copyFileSync(tmp, target, fs.constants.COPYFILE_EXCL)
      return true
    } catch (copyErr) {
      if ((copyErr as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw copyErr
    }
  }
}

function existingSkill(target: string): { dirPath: string; name?: string } {
  const dirPath = path.dirname(target)
  try {
    const parsed = parseSkillMd(fs.readFileSync(target, 'utf-8'))
    const name = parsed.name?.trim()
    return name ? { dirPath, name } : { dirPath }
  } catch {
    // An unreadable or malformed existing file is still an existing file. The
    // refusal must not turn into an exception that would let a caller retry.
    return { dirPath }
  }
}

export function installSkill(input: InstallSkillInput): SkillInstallResult {
  const { name, content, replace } = input
  if (typeof name !== 'string' || typeof content !== 'string') {
    return { success: false, code: 'invalid_name', error: 'A skill needs a name and content' }
  }

  const root = path.resolve(input.skillsRoot ?? personalSkillsRoot())
  const safeName = sanitizeSkillDirName(name)
  // Empty, and the `.`/`..` shapes a future sanitizer might let through, would
  // otherwise write into the skills root itself instead of a skill folder.
  if (!safeName || safeName === '.' || safeName === '..') {
    return {
      success: false,
      code: 'invalid_name',
      error: 'That name cannot become a skill folder. Use at least one letter or digit.',
    }
  }

  const skillDir = path.resolve(root, safeName)
  // Direct child of the root, and never the root itself. The sanitizer strips
  // separators today; this guard is what keeps a `../evil`-shaped name out if
  // that ever changes, and rejects a sibling with a shared prefix.
  if (path.dirname(skillDir) !== root || !isPathInside(root, skillDir)) {
    return {
      success: false,
      code: 'outside_skills',
      error: 'A skill folder must sit directly inside the skills directory',
    }
  }

  const target = path.join(skillDir, 'SKILL.md')
  if (replace !== true && fs.existsSync(target)) {
    return {
      success: false,
      code: 'skill_exists',
      error: 'A skill with this folder already exists. Nothing was written.',
      ...existingSkill(target),
    }
  }

  let tmp = ''
  try {
    fs.mkdirSync(skillDir, { recursive: true })
    // Same directory, so the final move stays on one volume. A dot-prefixed
    // suffix keeps a leftover temp file out of the skills scan if the process
    // dies before the rename.
    tmp = path.join(skillDir, `.SKILL.md.${process.pid}.${Date.now()}.tmp`)
    fs.writeFileSync(tmp, content, 'utf-8')

    if (replace === true) {
      // Atomic replacement: the old SKILL.md is either fully there or fully
      // replaced, never truncated by a crash midway through the write.
      fs.renameSync(tmp, target)
      tmp = ''
    } else if (!publishWithoutOverwrite(tmp, target)) {
      const existing = existingSkill(target)
      return {
        success: false,
        code: 'skill_exists',
        error: 'A skill with this folder already exists. Nothing was written.',
        ...existing,
      }
    }
    return { success: true, dirPath: skillDir }
  } catch (err) {
    return { success: false, code: 'write_failed', error: String(err) }
  } finally {
    if (tmp) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // The temp file is dot-prefixed and never scanned as a skill; failing
        // to clean it up must not turn a successful install into an error.
      }
    }
  }
}
