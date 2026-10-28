/**
 * Display titles for session rows.
 *
 * Transcripts record harness chatter as user messages — slash commands, shell
 * round-trips, hook output, image placeholders, interruption notices. The main
 * process cleans these before writing the session list, but a summary cache
 * from an older build can still hand one to us as `title` or `lastPrompt`, and
 * importing the main-process helper is impossible (the two bundles are built
 * separately). This is a deliberately small copy of those rules so the UI degrades
 * to "Untitled" instead of painting noise.
 */

const WRAPPER_RE = /<\/?(?:command-name|command-args|command-message|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook|system-reminder|task-notification)\b/i
const IMAGE_MARKER_RE = /\[Image(?:\s*#[0-9]+|\s*:[^\]]*)\]/gi
const INTERRUPTED_RE = /\[Request interrupted by user[^\]]*\]/gi
const BARE_COMMAND_RE = /^(?:[>❯]\s*)?\/[a-z][\w-]*$/i
const UNTITLED_RE = /^untitled(?: session)?$/i

/** True when a stored title or preview is transcript noise, not user intent. */
export function isNoisyTitle(text: string | null | undefined): boolean {
  if (!text) return true
  const trimmed = text.trim()
  if (!trimmed || UNTITLED_RE.test(trimmed)) return true
  // The main process strips wrappers before judging; a stale value that still
  // carries one is not safe to show as-is.
  if (WRAPPER_RE.test(trimmed)) return true
  const lines = trimmed
    .replace(IMAGE_MARKER_RE, ' ')
    .replace(INTERRUPTED_RE, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  return lines.length === 0 || lines.every(line => BARE_COMMAND_RE.test(line))
}

/**
 * The line a row should show. An explicit title wins; otherwise the first
 * meaningful line of the last prompt; otherwise the caller's untitled label.
 */
export function displayTitle(
  session: { title?: string | null; lastPrompt?: string | null },
  untitled: string,
  maxLen?: number,
): string {
  const stored = session.title?.trim() ?? ''
  const prompt = isNoisyTitle(session.lastPrompt) ? '' : firstMeaningfulLine(session.lastPrompt)
  const title = !isNoisyTitle(stored) ? stored : prompt
  const result = title || untitled
  return maxLen && maxLen > 0 ? result.slice(0, maxLen) : result
}

/** Skip marker-only and bare-command lines so the preview starts at real prose. */
function firstMeaningfulLine(text: string | null | undefined): string {
  if (!text) return ''
  for (const line of text.split('\n')) {
    const cleaned = line
      .replace(IMAGE_MARKER_RE, ' ')
      .replace(INTERRUPTED_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned && !BARE_COMMAND_RE.test(cleaned)) return cleaned
  }
  return ''
}
