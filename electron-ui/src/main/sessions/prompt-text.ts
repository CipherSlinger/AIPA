/**
 * Prompt text hygiene for session lists.
 *
 * A transcript's `user` entries are not all things a human typed: the harness
 * records slash commands, shell round-trips, hook output, image placeholders
 * and reminders as user messages. The sidebar and the archive ledger used to
 * take the last of those verbatim, so a session whose final entry was
 * `/clear` was titled `/clear`.
 *
 * These helpers are pure string functions on purpose: both readers (Claude and
 * Codex) use them, and the rules can be checked without touching disk. The
 * renderer carries a small copy of the same patterns (see
 * src/renderer/lib/sessionTitle.ts) because the two bundles cannot import each
 * other.
 */

/**
 * Harness wrappers whose body is machine output, never user prose. The last
 * three are current-transcript variants that lead user entries in practice:
 * slash-command echoes, local-command caveats, and background-task notices.
 */
const WRAPPER_NAMES = [
  'command-name',
  'command-args',
  'command-message',
  'local-command-stdout',
  'local-command-stderr',
  'local-command-caveat',
  'bash-input',
  'bash-stdout',
  'bash-stderr',
  'user-prompt-submit-hook',
  'system-reminder',
  'task-notification',
]

const WRAPPER_BLOCK_RE = new RegExp(
  `<(${WRAPPER_NAMES.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  'gi',
)
/**
 * Task notifications are written without a closing tag; the notice is the
 * whole entry, so the body runs to the end of the string.
 */
const UNCLOSED_WRAPPER_RE = /<task-notification\b[^>]*>[\s\S]*$/i
/** Stray opening/closing tags left when a block is malformed or truncated. */
const WRAPPER_TAG_RE = new RegExp(`<\\/?(?:${WRAPPER_NAMES.join('|')})\\b[^>]*>`, 'gi')
/** Cheap pre-check so ordinary messages never pay for the block regex. */
const HAS_WRAPPER_RE = new RegExp(`<\\/?(?:${WRAPPER_NAMES.join('|')})\\b`, 'i')

const IMAGE_MARKER_RE = /\[Image(?:\s*#[0-9]+|\s*:[^\]]*)\]/gi
const INTERRUPTED_RE = /\[Request interrupted by user[^\]]*\]/gi
/**
 * A slash command with no arguments or prose. The optional glyph covers a
 * command echoed back from a shell prompt ("❯ /clear"), which the CLI records
 * verbatim.
 */
const BARE_COMMAND_RE = /^(?:[>❯]\s*)?\/[a-z][\w-]*$/i

/** Strip the placeholder tokens that stand in for attachments and aborts. */
function stripMarkers(text: string): string {
  return text.replace(IMAGE_MARKER_RE, ' ').replace(INTERRUPTED_RE, ' ')
}

/** True when every non-empty line is a command, not a message. */
function isOnlyCommands(text: string): boolean {
  const lines = stripMarkers(text).split('\n').map(line => line.trim()).filter(Boolean)
  return lines.length === 0 || lines.every(line => BARE_COMMAND_RE.test(line))
}

/**
 * Remove harness wrappers and normalize whitespace. The result is the part of
 * the message a human actually wrote, or '' when nothing of that remains.
 *
 * Single newlines survive: a title is the first line of the prompt, and a
 * pasted log on line two must not leak into it.
 */
export function cleanPrompt(text: string): string {
  if (!text) return ''
  return text
    .replace(WRAPPER_BLOCK_RE, ' ')
    .replace(UNCLOSED_WRAPPER_RE, ' ')
    .replace(WRAPPER_TAG_RE, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * True when an entry carries no human intent: empty, only harness wrappers,
 * only attachment/interruption markers, or a bare slash command.
 */
export function isSyntheticPrompt(text: string): boolean {
  if (!text || !text.trim()) return true

  // Fast path: every synthetic form starts with a tag, a marker, or a command
  // glyph, so ordinary prose never pays for the scans below. A wrapper followed
  // by real prose starts with prose too — and that is a real prompt.
  if (!/^[<\[/>❯]/.test(text.trim())) return false

  // Markers first: this catches "[Image #1]" before the wrapper regex runs.
  if (isOnlyCommands(text)) return true

  if (!HAS_WRAPPER_RE.test(text)) return false

  // A wrapper plus real prose is a real prompt; only wrappers is noise.
  return isOnlyCommands(cleanPrompt(text))
}

/**
 * A short label derived from a prompt. Used when no explicit session title
 * exists, so the first thing the user said becomes the session's name.
 */
export function deriveTitle(text: string, maxLen = 80): string {
  const cleaned = cleanPrompt(text)
  if (!cleaned) return ''

  // Skip command echoes and marker-only lines so neither "❯ /clear" nor a
  // pasted image placeholder on line one names the session.
  const firstLine = cleaned
    .split('\n')
    .map(line => stripMarkers(line).replace(/[^\S\n]+/g, ' ').trim())
    .find(line => line && !BARE_COMMAND_RE.test(line)) ?? ''
  if (!firstLine) return ''
  const withoutEllipsis = firstLine.replace(/(?:\.{3}|…)+$/, '').trim() || firstLine
  if (withoutEllipsis.length <= maxLen) return withoutEllipsis

  const head = withoutEllipsis.slice(0, maxLen)
  const lastSpace = head.lastIndexOf(' ')
  // Prefer a word boundary, but do not surrender most of the budget to it.
  if (lastSpace >= Math.floor(maxLen * 0.6)) return head.slice(0, lastSpace).trim()
  return head.trim()
}
