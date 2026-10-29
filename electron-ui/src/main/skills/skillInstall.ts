/**
 * Install and edit one SKILL.md without silently destroying the one already
 * there.
 *
 * `skills:install` used to `mkdir -p` the target folder and write over whatever
 * `SKILL.md` was in it. Creating a skill whose sanitized folder was already in
 * use therefore replaced a hand-written file with no warning, and the trash
 * only covers deletes, so there was no way back. Replacement is now opt-in via
 * `replace: true`, and even then the file goes to a temp name in the same
 * folder and is renamed into place, so a crash cannot leave half a SKILL.md.
 *
 * `skills:update` (at the bottom of this file) applies the same temp-file
 * discipline to an installed skill the user is editing, preserving frontmatter
 * keys AIPA does not understand and refusing to save over an outside edit.
 *
 * `skillsRoot` is a seam for the harness only, exactly like `moveSkillToTrash`'s
 * root: it keeps a test inside a scratch directory instead of the user's real
 * `~/.claude/skills`. The IPC handler never passes it; `updateSkill` takes the
 * roots the handler resolved through `resolveSkillRoots` for the same reason.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { TextDecoder } from 'util'
import { isPathInside } from '../utils/validate'
import {
  parseSkillMd,
  rewriteSkillMd,
  sanitizeSkillDirName,
  type SkillRewriteRefusal,
} from './skillMd'

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

// ── Editing an installed skill ──────────────────────────────────────────────
//
// `skills:update` writes to a file the user may have hand-authored, so it is
// stricter than `installSkill` in three ways: it only accepts the identity the
// scheduler stores (`{ source, dir }`, never a renderer-supplied path), it
// checks the real path of the directory and file so a symlink cannot lead the
// write out of the skills root, and it refuses to save unless the caller says
// which version of the file it edited.

/** The largest SKILL.md the editor will read or rewrite. */
export const SKILL_EDIT_MAX_BYTES = 2 * 1024 * 1024

/**
 * The token a read hands to the editor and an update sends back.
 *
 * `hash` is the authority: a SHA-256 of the exact bytes read. Two tokens match
 * when the files hold identical bytes, regardless of timestamps. `mtimeMs` and
 * `size` are carried so a refusal can name the on-disk timestamp ("changed at
 * 14:32") and so a human can see that *something* moved, but they are not
 * compared — a same-content save by an editor that preserves mtime is not a
 * conflicting edit.
 *
 * What it detects: any save that changes the bytes, including one that keeps
 * the size the same and lands within the filesystem's timestamp granularity.
 * What it cannot detect: a change and a change back to byte-identical content
 * (there is nothing to lose), a SHA-256 collision (not a practical concern),
 * or a write that happens after the token comparison but before the rename
 * (the check and the rename are not one atomic operation).
 */
export interface SkillFileToken {
  hash: string
  mtimeMs: number
  size: number
}

export function makeSkillFileToken(bytes: Buffer, mtimeMs: number): SkillFileToken {
  return {
    hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    mtimeMs,
    size: bytes.length,
  }
}

/** Decode UTF-8 strictly: rewriting a file we cannot read would corrupt it. */
export function decodeSkillBytes(bytes: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export interface EditableSkillRef {
  source: 'personal' | 'project'
  /** One directory segment under the root, or `''` for a root-level SKILL.md. */
  dir: string
}

export type SkillUpdateErrorCode =
  | 'invalid_input'
  | 'outside_skills'
  | 'symlink'
  | 'not_found'
  | 'unreadable'
  | 'file_too_large'
  | 'unparsable'
  | 'changed_on_disk'
  | 'write_failed'

export type SkillUpdateResult =
  | {
      success: true
      /** The token for the bytes just written, so the editor keeps editing. */
      token: SkillFileToken
      /** The exact file content that was written; the preview can show it. */
      content: string
      dirPath: string
    }
  | {
      success: false
      code: SkillUpdateErrorCode
      error: string
      /** Set for `changed_on_disk`: when the file was last written. */
      currentMtimeMs?: number
      /** Set for `changed_on_disk`: the token of the on-disk bytes. */
      token?: SkillFileToken
      /** Set for `unparsable`: which part of the frontmatter defeated us. */
      reason?: SkillRewriteRefusal
    }

export interface UpdateSkillInput {
  ref: EditableSkillRef
  /** The roots for `ref.source`, resolved by the caller with `resolveSkillRoots`. */
  roots: string[]
  name: string
  description: string
  body: string
  /** The token returned by the read this edit was based on. */
  token?: SkillFileToken
  /** Only after the user was told the file changed underneath them. */
  force?: boolean
}

interface ResolvedEditableSkill {
  root: string
  dirPath: string
  filePath: string
}

type ResolveEditableResult =
  | { ok: true; skill: ResolvedEditableSkill }
  | {
      ok: false
      code: 'outside_skills' | 'symlink' | 'not_found' | 'unreadable'
      error: string
    }

function refusal(code: SkillUpdateErrorCode, error: string): SkillUpdateResult {
  return { success: false, code, error }
}

/**
 * Turn an identity into the one file this module may rewrite.
 *
 * The identity is one segment, not a path: a separator, an absolute path, `.`
 * or `..` is refused outright, and the resolved directory is checked against
 * the root again afterwards. `isPathInside` is deliberately *strict* (the root
 * itself is not inside itself), so a root-level skill (`dir: ''`) is handled
 * separately. Real paths are then checked too, because `stat` follows
 * symlinks: a skill directory that is a junction to somewhere outside would
 * otherwise pass the lexical test.
 */
function resolveEditableSkill(ref: EditableSkillRef, roots: string[]): ResolveEditableResult {
  const dir = ref.dir
  if (
    typeof dir !== 'string'
    || dir.includes('\0')
    || path.isAbsolute(dir)
    || dir.includes('/')
    || dir.includes('\\')
    || dir === '.'
    || dir === '..'
  ) {
    return {
      ok: false,
      code: 'outside_skills',
      error: 'A skill is named by one folder directly inside the skills directory',
    }
  }

  let sawExisting = false
  for (const root of roots) {
    const resolvedRoot = path.resolve(root)
    const dirPath = dir ? path.resolve(resolvedRoot, dir) : resolvedRoot
    if (dir && (dirPath === resolvedRoot || !isPathInside(resolvedRoot, dirPath))) {
      return {
        ok: false,
        code: 'outside_skills',
        error: 'A skill folder must sit directly inside the skills directory',
      }
    }
    const filePath = path.join(dirPath, 'SKILL.md')

    let realRoot: string
    let realDir: string
    let realFile: string
    try {
      realRoot = fs.realpathSync(resolvedRoot)
      realDir = fs.realpathSync(dirPath)
      realFile = fs.realpathSync(filePath)
    } catch {
      if (fs.existsSync(dirPath) || fs.existsSync(filePath)) sawExisting = true
      continue
    }

    // `realDir === realRoot` is the root-level skill; anything else must be
    // strictly inside. The file itself must live inside the same root.
    if (realDir !== realRoot && !isPathInside(realRoot, realDir)) {
      return {
        ok: false,
        code: 'outside_skills',
        error: 'That skill folder resolves outside the skills directory',
      }
    }
    if (realFile !== realRoot && !isPathInside(realRoot, realFile)) {
      return {
        ok: false,
        code: 'outside_skills',
        error: 'That SKILL.md resolves outside the skills directory',
      }
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(realFile)
    } catch {
      sawExisting = true
      continue
    }
    if (!stat.isFile()) continue
    // A symlinked SKILL.md that stays inside the root would still be replaced
    // as a link by an atomic rename; refuse it instead of quietly turning the
    // user's link into a plain file.
    try {
      if (fs.lstatSync(filePath).isSymbolicLink()) {
        return {
          ok: false,
          code: 'symlink',
          error: 'SKILL.md is a symbolic link. Editing it would replace the link, so nothing was written.',
        }
      }
    } catch {
      sawExisting = true
      continue
    }
    return { ok: true, skill: { root: resolvedRoot, dirPath, filePath: realFile } }
  }

  if (sawExisting) {
    return {
      ok: false,
      code: 'unreadable',
      error: 'The skill exists but its SKILL.md could not be read',
    }
  }
  return { ok: false, code: 'not_found', error: 'That skill is no longer in the skills directory' }
}

/**
 * Rewrite one installed skill's SKILL.md.
 *
 * The file is read and parsed here, from disk — not sent by the renderer — so
 * every unknown frontmatter key survives even when the preview and the save
 * disagree about the file. The write publishes a complete temp file with a
 * rename in the same directory, exactly like `installSkill`'s replace path.
 */
export function updateSkill(input: UpdateSkillInput): SkillUpdateResult {
  if (
    typeof input.name !== 'string'
    || typeof input.description !== 'string'
    || typeof input.body !== 'string'
    || !Array.isArray(input.roots)
  ) {
    return refusal('invalid_input', 'A skill update needs a name, a description and a body')
  }
  if (!input.ref || (input.ref.source !== 'personal' && input.ref.source !== 'project')) {
    return refusal('invalid_input', 'A skill update needs a known source')
  }

  const resolved = resolveEditableSkill(input.ref, input.roots)
  if (!resolved.ok) return refusal(resolved.code, resolved.error)
  const { filePath, dirPath } = resolved.skill

  let stat: fs.Stats
  let bytes: Buffer
  try {
    stat = fs.statSync(filePath)
    if (stat.size > SKILL_EDIT_MAX_BYTES) {
      return refusal('file_too_large', 'This SKILL.md is too large to edit here')
    }
    bytes = fs.readFileSync(filePath)
  } catch (err) {
    return refusal('unreadable', String(err))
  }
  const current = makeSkillFileToken(bytes, stat.mtimeMs)

  if (input.force !== true) {
    if (!input.token || typeof input.token.hash !== 'string') {
      return {
        success: false,
        code: 'changed_on_disk',
        error: 'The edit was not based on a readable version of this file.',
        currentMtimeMs: current.mtimeMs,
        token: current,
      }
    }
    if (input.token.hash !== current.hash) {
      return {
        success: false,
        code: 'changed_on_disk',
        error: 'This file changed on disk after the edit started. Nothing was written.',
        currentMtimeMs: current.mtimeMs,
        token: current,
      }
    }
  }

  const source = decodeSkillBytes(bytes)
  if (source === null) {
    return refusal('unreadable', 'SKILL.md is not valid UTF-8, so rewriting it would corrupt it')
  }
  const rewritten = rewriteSkillMd(source, {
    name: input.name,
    description: input.description,
    body: input.body,
  })
  if (!rewritten.ok) {
    return {
      success: false,
      code: 'unparsable',
      error: 'The frontmatter of this SKILL.md cannot be parsed, so nothing was written.',
      reason: rewritten.reason,
    }
  }

  let tmp = ''
  try {
    // Same directory, so the rename stays on one volume and the target is
    // either the old file or the complete new one — never truncated.
    tmp = path.join(path.dirname(filePath), `.SKILL.md.${process.pid}.${Date.now()}.tmp`)
    fs.writeFileSync(tmp, rewritten.content, 'utf-8')
    fs.renameSync(tmp, filePath)
    tmp = ''
    const written = Buffer.from(rewritten.content, 'utf-8')
    const writtenStat = fs.statSync(filePath)
    return {
      success: true,
      token: makeSkillFileToken(written, writtenStat.mtimeMs),
      content: rewritten.content,
      dirPath,
    }
  } catch (err) {
    return refusal('write_failed', String(err))
  } finally {
    if (tmp) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // Dot-prefixed, and never scanned as a skill; a leftover temp file
        // must not turn a failed write into a different failure.
      }
    }
  }
}
