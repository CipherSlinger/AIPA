/**
 * Pure terminal-text handling for the "Run" panel on a shell code block.
 *
 * Command output arrives in arbitrary chunks: an escape sequence can be split
 * across two data events, and a progress bar can rewrite one line thousands of
 * times with carriage returns. These helpers are React-free so the behaviour
 * can be tested directly; `createShellOutputCollector` is the stateful wrapper
 * the panel uses between chunks.
 */

/** Character cap for the retained tail of a run's output. */
export const SHELL_OUTPUT_CAP = 64 * 1024

/**
 * An unterminated OSC/DCS string is held back to the next chunk, but only up to
 * this many characters. Retaining more would let a malformed control sequence
 * buffer output forever.
 */
const MAX_CARRY = 8192

export interface SplitAnsiResult {
  /** Printable text, with complete escape sequences removed. */
  text: string
  /** An incomplete trailing escape sequence, to prepend to the next chunk. */
  carry: string
}

type ScanResult = { end: number } | 'incomplete'

/** Scan a CSI body starting just after `ESC [`. */
function scanCsi(input: string, start: number): ScanResult {
  let j = start
  while (j < input.length) {
    const code = input.charCodeAt(j)
    if (code >= 0x40 && code <= 0x7e) return { end: j + 1 }
    if (code >= 0x20 && code <= 0x3f) {
      j += 1
      continue
    }
    // Malformed byte inside a CSI: drop it with the sequence rather than
    // leaving its bytes to appear as text.
    return { end: j + 1 }
  }
  return 'incomplete'
}

/** Scan an OSC (`ESC ]`) or DCS/SOS/PM/APC string; `bel` ends only OSC. */
function scanStringSequence(input: string, start: number, bel: boolean): ScanResult {
  let j = start
  while (j < input.length) {
    const ch = input[j]
    if (bel && ch === '\x07') return { end: j + 1 }
    if (ch === '\x1b') {
      if (j + 1 >= input.length) return 'incomplete'
      if (input[j + 1] === '\\') return { end: j + 2 }
    }
    if (j - start > MAX_CARRY) return { end: j + 1 }
    j += 1
  }
  return 'incomplete'
}

/** Scan one escape sequence beginning at `start` (an ESC byte). */
function scanEscape(input: string, start: number): ScanResult {
  const next = input[start + 1]
  if (next === undefined) return 'incomplete'
  if (next === '[') return scanCsi(input, start + 2)
  if (next === ']') return scanStringSequence(input, start + 2, true)
  if (next === 'P' || next === 'X' || next === '^' || next === '_') {
    return scanStringSequence(input, start + 2, false)
  }
  if ('()*+-./#'.includes(next)) {
    if (input[start + 2] === undefined) return 'incomplete'
    return { end: start + 3 }
  }
  const code = next.charCodeAt(0)
  if (code >= 0x20 && code <= 0x2f) {
    if (input[start + 2] === undefined) return 'incomplete'
    return { end: start + 3 }
  }
  // Two-character escape: ESC 7, ESC =, ESC M, ...
  return { end: start + 2 }
}

/**
 * Remove ANSI escape sequences and other non-printing control codes while
 * keeping `\n`, `\r` (needed for carriage-return handling) and `\t`.
 *
 * A sequence cut off by the end of the chunk is returned as `carry` instead of
 * being emitted as text. Feeding that carry into the next call keeps
 * `ESC[3` + `1m` from turning into the literal text `1m`.
 */
export function splitAnsiTail(input: string): SplitAnsiResult {
  let text = ''
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\x1b') {
      const scanned = scanEscape(input, i)
      if (scanned === 'incomplete') return { text, carry: input.slice(i) }
      i = scanned.end
      continue
    }
    // C1 CSI (0x9B) is the single-byte spelling of ESC [.
    if (ch === '\x9b') {
      const scanned = scanCsi(input, i + 1)
      if (scanned === 'incomplete') return { text, carry: input.slice(i) }
      i = scanned.end
      continue
    }
    const code = input.charCodeAt(i)
    if ((code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t') || code === 0x7f) {
      i += 1
      continue
    }
    text += ch
    i += 1
  }
  return { text, carry: '' }
}

/**
 * Remove ANSI escape sequences and control codes from a complete string. An
 * incomplete trailing sequence is dropped here; callers reading chunked output
 * should use `splitAnsiTail` (or the collector) so nothing after it is lost.
 */
export function stripAnsi(text: string): string {
  return splitAnsiTail(text).text
}

/** Collapse `CR` rewrites within a line: `10%\r90%` shows only `90%`. */
function normalizeLine(line: string): string {
  if (!line.includes('\r')) return line
  const segments = line.split('\r')
  // A trailing CR just returns the cursor to the start of a line that is still
  // visible, so the last non-empty segment is what the terminal shows.
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] !== '') return segments[i]
  }
  return ''
}

/** `\r\n` → `\n`, then apply carriage-return overwrites line by line. */
export function normalizeTerminalText(text: string): string {
  if (!text) return text
  const lf = text.replace(/\r\n/g, '\n')
  return lf.split('\n').map(normalizeLine).join('\n')
}

export interface BoundedAppend {
  text: string
  truncated: boolean
  /** Characters dropped from the front of `previous + chunk` in this call. */
  droppedChars: number
}

/**
 * Append a chunk and keep only the last `cap` characters. The tail is what
 * matters for an error message; the beginning of a long build log is not.
 */
export function appendBounded(
  previous: string,
  chunk: string,
  cap: number = SHELL_OUTPUT_CAP,
): BoundedAppend {
  const limit = Math.max(0, Math.floor(cap))
  const combined = previous + chunk
  if (combined.length <= limit) {
    return { text: combined, truncated: false, droppedChars: 0 }
  }
  const droppedChars = combined.length - limit
  return { text: combined.slice(droppedChars), truncated: true, droppedChars }
}

export interface ShellOutputSnapshot {
  text: string
  truncated: boolean
  droppedChars: number
}

export interface ShellOutputCollector {
  /** Feed one data event; returns the current bounded tail. */
  push: (chunk: string) => ShellOutputSnapshot
  /** Fold the unfinished last line in and return the final text. */
  flush: () => ShellOutputSnapshot
  /** Current text without changing state. */
  snapshot: () => ShellOutputSnapshot
}

/**
 * Stateful companion to the helpers above: carries split escape sequences
 * between chunks, normalises complete lines once, and caps both the finished
 * text and an unfinished line that never receives a newline.
 */
export function createShellOutputCollector(cap: number = SHELL_OUTPUT_CAP): ShellOutputCollector {
  const limit = Math.max(0, Math.floor(cap))
  let committed = ''
  let pending = ''
  let carry = ''
  let droppedChars = 0
  let truncated = false

  const noteDrop = (count: number) => {
    if (count <= 0) return
    droppedChars += count
    truncated = true
  }

  const snapshot = (): ShellOutputSnapshot => {
    const visible = appendBounded(committed, normalizeTerminalText(pending), limit)
    return {
      text: visible.text,
      truncated: truncated || visible.truncated,
      droppedChars: droppedChars + (visible.truncated ? visible.droppedChars : 0),
    }
  }

  return {
    push(chunk: string) {
      const split = splitAnsiTail(carry + chunk)
      carry = split.carry
      pending += split.text

      const lastNewline = pending.lastIndexOf('\n')
      if (lastNewline !== -1) {
        const complete = pending.slice(0, lastNewline + 1)
        pending = pending.slice(lastNewline + 1)
        const appended = appendBounded(committed, normalizeTerminalText(complete), limit)
        committed = appended.text
        noteDrop(appended.droppedChars)
      }

      // A progress loop can rewrite one line without ever emitting `\n`.
      if (pending.length > limit) {
        const excess = pending.length - limit
        pending = pending.slice(excess)
        noteDrop(excess)
      }
      return snapshot()
    },

    flush() {
      if (pending) {
        const appended = appendBounded(committed, normalizeTerminalText(pending), limit)
        committed = appended.text
        noteDrop(appended.droppedChars)
        pending = ''
      }
      carry = ''
      return snapshot()
    },

    snapshot,
  }
}
