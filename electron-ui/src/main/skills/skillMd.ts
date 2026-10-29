/**
 * Read the parts of a SKILL.md that AIPA shows.
 *
 * `skills:list` sees files written by hand, by the marketplace and by two
 * different installers, so the reader stays lenient: an unknown key is ignored
 * rather than treated as an error, and nothing here rewrites the file, which is
 * what lets extra frontmatter keys survive untouched.
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
    // name/description keep their original lenient read so skills installed
    // before wave 64 list exactly as they always have.
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '')

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
