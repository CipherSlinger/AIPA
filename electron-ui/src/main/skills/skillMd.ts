/**
 * Read, name and build the SKILL.md files AIPA shows and installs.
 *
 * `skills:list` sees files written by hand, by the marketplace and by two
 * different installers, so the reader stays lenient: an unknown key is ignored
 * rather than treated as an error, and nothing here rewrites the file, which is
 * what lets extra frontmatter keys survive untouched.
 *
 * This module is also the one place the create form and the installer agree on
 * a skill's folder name and on the bytes of a new file. It is deliberately free
 * of Electron and Node imports so the renderer can preview exactly what main
 * will do.
 *
 * The provenance keys (`source_conversation`, `source_title`, `created_at`) are
 * written only for conversation-derived skills from wave 64 on. Their absence
 * is normal and must keep an older skill listing exactly as it did before.
 */

export interface ParsedSkillMd {
  name?: string
  description?: string
  /** Absent for skills installed before wave 64 and for hand-written skills. */
  sourceConversation?: string
  sourceTitle?: string
  createdAt?: string
  body: string
}

/** The skills list is a list; a one-line summary that never ends is not one. */
export const SKILL_DESCRIPTION_MAX = 120

/**
 * The directory name `skills:install` creates for a skill.
 *
 * This is the authority for both sides of the install: the handler uses it to
 * choose the folder and the creator page uses it for the path it previews, so
 * the two cannot show different destinations. It lives here, in a module the
 * renderer already imports (`parseSkillMd`), rather than in the IPC handler,
 * because importing the handler would pull `electron` into the renderer.
 *
 * A title written entirely in a non-Latin script sanitizes to nothing usable
 * ("技能" -> "-"), which used to produce a folder of hyphens. A deterministic
 * hash of the original title is stable across the preview and the install, so
 * the two agree even though a readable transliteration is not something we can
 * honestly promise.
 *
 * An empty name returns `''` rather than a hash: there is no title to hash, and
 * the installer refuses it explicitly instead of inventing a folder.
 */
export function sanitizeSkillDirName(raw: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (/[a-z0-9]/.test(slug)) return slug.slice(0, 48)

  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `session-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function escapeFrontmatter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' ')
}

export interface SkillFileInput {
  name: string
  description: string
  /**
   * The body of SKILL.md — what the assistant is told to do. Deliberately a
   * separate field from `description`: repeating a one-line summary as the
   * instructions produces a file that tells the model nothing.
   */
  instructions: string
}

export interface BuiltSkillFile {
  content: string
  /** The one-line description actually written, after trimming and the cap. */
  description: string
  /** True when the user's description was longer than `SKILL_DESCRIPTION_MAX`. */
  descriptionTruncated: boolean
  /** True when there is no body; the installer/form should refuse this. */
  instructionsEmpty: boolean
}

/**
 * Build the exact SKILL.md the create-skill form writes.
 *
 * Pure so both the form's preview and the installer write the same bytes, and
 * so a harness can exercise it without a DOM. `description` is frontmatter
 * metadata only; `instructions` is the body.
 */
export function buildSkillFile({ name, description, instructions }: SkillFileInput): BuiltSkillFile {
  const flatDescription = description.replace(/\s*\n\s*/g, ' ').trim()
  const cappedDescription = flatDescription.slice(0, SKILL_DESCRIPTION_MAX)
  const body = instructions.trim()
  const content = [
    '---',
    `name: "${escapeFrontmatter(name.trim())}"`,
    `description: "${escapeFrontmatter(cappedDescription)}"`,
    '---',
    '',
    body,
    '',
  ].join('\n')
  return {
    content,
    description: cappedDescription,
    descriptionTruncated: flatDescription.length > SKILL_DESCRIPTION_MAX,
    instructionsEmpty: body.length === 0,
  }
}

/**
 * Unwrap a quoted scalar and undo `assembleSkillContent`'s escaping.
 *
 * A title may contain a colon, an em dash or escaped quotes; none of those may
 * break the read. An unquoted value is returned as written, so a hand-edited
 * frontmatter line is still usable instead of throwing.
 */
function unquoteValue(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseSkillMd(content: string): ParsedSkillMd {
  // Parse YAML frontmatter from SKILL.md
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!fmMatch) {
    const firstLine = content.split('\n').find(l => l.trim()) || ''
    return { body: content, description: firstLine.replace(/^#+\s*/, '').slice(0, 120) }
  }
  const frontmatter = fmMatch[1]
  const body = fmMatch[2]
  let name: string | undefined
  let description: string | undefined
  let sourceConversation: string | undefined
  let sourceTitle: string | undefined
  let createdAt: string | undefined
  for (const line of frontmatter.split('\n')) {
    // `unquoteValue` is what the provenance keys already use: it unwraps the
    // quotes and undoes the escaping the writers apply. Applying it here too
    // means a description containing a quote reads back the way it was typed;
    // an unquoted, hand-edited line still comes back unchanged.
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) name = unquoteValue(nameMatch[1])
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) description = unquoteValue(descMatch[1])

    const sourceMatch = line.match(/^source_conversation:\s*(.+)/)
    if (sourceMatch) {
      const value = unquoteValue(sourceMatch[1])
      if (value) sourceConversation = value
    }
    const titleMatch = line.match(/^source_title:\s*(.+)/)
    if (titleMatch) {
      const value = unquoteValue(titleMatch[1])
      if (value) sourceTitle = value
    }
    const createdMatch = line.match(/^created_at:\s*(.+)/)
    if (createdMatch) {
      const value = unquoteValue(createdMatch[1])
      if (value) createdAt = value
    }
  }
  if (!description) {
    const firstLine = body.split('\n').find(l => l.trim()) || ''
    description = firstLine.replace(/^#+\s*/, '').slice(0, 120)
  }
  return { name, description, sourceConversation, sourceTitle, createdAt, body }
}
