/**
 * The pure half of AIPA's dream pass: build a bounded extraction prompt,
 * validate the model's answer, deduplicate it, and render one reviewable
 * memory file.
 *
 * Nothing here spawns a process or touches Electron, so the exact behaviour
 * (budgets, secret filtering, provenance format) can be exercised by a
 * scratch-profile harness.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  DREAM_DIGEST_BUDGET,
  DREAM_EXISTING_BUDGET,
  DREAM_INPUT_BUDGET,
  DREAM_MAX_ENTRIES,
  DREAM_MAX_ENTRY_CHARS,
  DREAM_MAX_FILE_CHARS,
} from './dream-types'
import type { DreamCandidate, DreamMemoryKind, DreamTurn } from './dream-types'
import { sessionFileSlug } from './dream-paths'

const KINDS: DreamMemoryKind[] = ['user', 'feedback', 'project', 'reference']

/**
 * Credential-shaped strings are never written to a memory tier, even when the
 * model confidently labels them as a useful fact.
 *
 * This is intentionally patterns, not entropy: a random 40-char hex string is
 * usually a commit hash, while the shapes below are how providers actually
 * spell keys. A false negative is a credential on disk; a false positive only
 * drops one candidate.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:sk|rk|pk|ghp|gho|ghu|ghs|github_pat|xox[baprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{10,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
]

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some(re => re.test(text))
}

/**
 * Comparison form for deduplication. Markdown markers, punctuation, case and
 * whitespace are noise: "Prefers concise answers." and
 * "- [feedback] prefers CONCISE answers" are the same memory.
 */
export function normalizeMemoryStatement(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[-*]\s+/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/`+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Build a tail-first digest. Newest turns win the budget because a
 * consolidation mostly needs the state the conversation ended in; older
 * context is summarised by the assistant's own replies anyway.
 */
export function buildTranscriptDigest(
  turns: DreamTurn[],
  maxChars = DREAM_DIGEST_BUDGET,
): { text: string; includedTurns: number; omittedTurns: number } {
  const usable = turns.filter(t => t.text.trim().length > 0)
  if (usable.length === 0) return { text: '', includedTurns: 0, omittedTurns: 0 }

  const lines: string[] = []
  let used = 0
  let included = 0

  for (let i = usable.length - 1; i >= 0; i--) {
    const turn = usable[i]
    const label = turn.role === 'user' ? 'USER' : 'ASSISTANT'
    const body = collapse(turn.text).slice(0, 500)
    const line = `${label}: ${body}`
    // Reserve room for the omission marker when this is not the whole tail.
    if (used + line.length + 1 > maxChars) break
    lines.push(line)
    used += line.length + 1
    included++
  }

  lines.reverse()
  const omitted = usable.length - included
  const prefix = omitted > 0 ? `[${omitted} earlier turns omitted to fit the digest budget]\n` : ''
  return { text: prefix + lines.join('\n'), includedTurns: included, omittedTurns: omitted }
}

/**
 * The extraction prompt. It asks for JSON *lines* rather than an array so a
 * truncated final object cannot make the whole answer unparseable; each line
 * stands on its own.
 */
export function buildDreamPrompt(input: {
  digest: string
  existingStatements: string[]
  includedTurns: number
}): string {
  const existingBudget = DREAM_EXISTING_BUDGET
  const existingLines: string[] = []
  let existingUsed = 0
  for (const statement of input.existingStatements) {
    const line = `- ${collapse(statement).slice(0, 200)}`
    if (!line.trim() || existingUsed + line.length + 1 > existingBudget) break
    existingLines.push(line)
    existingUsed += line.length + 1
  }

  return [
    'You are AIPA\'s memory consolidation pass. A conversation has gone idle.',
    'Extract only durable, reusable memories that would help in a future conversation.',
    'Prefer fewer, higher-confidence entries. It is correct to return nothing.',
    '',
    'OUTPUT FORMAT (strict):',
    'One JSON object per line, no array, no prose, no code fence:',
    '{"statement":"...","kind":"user|feedback|project|reference","confidence":0.0}',
    '',
    'RULES:',
    `- Return 0 to ${DREAM_MAX_ENTRIES} lines. Each statement is self-contained and at most ${DREAM_MAX_ENTRY_CHARS} characters.`,
    '- Do not repeat or paraphrase anything under EXISTING MEMORY.',
    '- Never output credentials, API keys, tokens, passwords, or private keys, even if the transcript contains them.',
    '- Do not output transient task status, tool output, or anything already obvious from the code in the working directory.',
    '- kind: user = who the person is / stable preferences; feedback = how to approach work (corrections and confirmations); project = ongoing goals, decisions, deadlines; reference = where information lives.',
    '',
    `INPUT BUDGET: the transcript digest below is at most ${DREAM_DIGEST_BUDGET} characters ` +
      `(${input.includedTurns} recent turns) and EXISTING MEMORY is at most ${DREAM_EXISTING_BUDGET} characters; ` +
      `total ${DREAM_INPUT_BUDGET}. Do not ask for more context.`,
    '',
    'TRANSCRIPT DIGEST:',
    input.digest,
    '',
    'EXISTING MEMORY (do not repeat):',
    existingLines.length > 0 ? existingLines.join('\n') : '(none)',
    '',
    'Return JSON lines now:',
  ].join('\n')
}

interface ParsedAnswer {
  candidates: DreamCandidate[]
  /** Output was non-empty but yielded zero valid candidates: junk. */
  hadOutput: boolean
  /** Output explicitly said there was nothing to remember. */
  explicitEmpty: boolean
  rejected: number
  secretSkipped: number
}

function candidateFromObject(value: unknown): DreamCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  const rawStatement = typeof obj.statement === 'string' ? obj.statement : ''
  const kind = typeof obj.kind === 'string' ? obj.kind.toLowerCase() : ''
  if (!KINDS.includes(kind as DreamMemoryKind)) return null

  const statement = collapse(
    rawStatement
      .replace(/^[-*]\s+/, '')
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/^["'`]+|["'`]+$/g, ''),
  ).slice(0, DREAM_MAX_ENTRY_CHARS)
  if (statement.length < 12) return null

  const confidenceRaw = typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence)
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.5

  return { statement, kind: kind as DreamMemoryKind, confidence }
}

/**
 * Accept JSON lines first; also accept a JSON array because models sometimes
 * ignore the line format. Anything that is not an object with a usable
 * statement/kind is discarded rather than guessed at.
 */
export function parseDreamCandidates(raw: string): ParsedAnswer {
  const text = raw.trim()
  const hadOutput = text.length > 0
  const explicitEmpty =
    /^\[\s*\]$/.test(text) ||
    /^(?:none|no new memories|nothing to remember)\.?$/i.test(text)

  if (!hadOutput) {
    return { candidates: [], hadOutput: false, explicitEmpty: true, rejected: 0, secretSkipped: 0 }
  }

  const objects: unknown[] = []
  let rejected = 0

  const tryPush = (value: unknown) => {
    const candidate = candidateFromObject(value)
    if (candidate) objects.push(candidate)
    else rejected++
  }

  // Whole-answer array.
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) parsed.forEach(tryPush)
      else rejected++
    } catch {
      rejected++
    }
  }

  // JSON lines (the requested format). Lines that are fences, prose or a
  // malformed trailing object are ignored; they do not poison valid lines.
  if (objects.length === 0 && !explicitEmpty) {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
      if (!line) continue
      const start = line.indexOf('{')
      const end = line.lastIndexOf('}')
      if (start < 0 || end <= start) continue
      try {
        tryPush(JSON.parse(line.slice(start, end + 1)))
      } catch {
        rejected++
      }
    }
  }

  let secretSkipped = 0
  const candidates: DreamCandidate[] = []
  for (const candidate of objects as DreamCandidate[]) {
    if (looksLikeSecret(candidate.statement)) {
      secretSkipped++
      continue
    }
    candidates.push(candidate)
  }

  return { candidates, hadOutput, explicitEmpty, rejected, secretSkipped }
}

export interface SelectDreamCandidatesResult {
  selected: DreamCandidate[]
  duplicates: number
  suppressed: number
}

/**
 * Deduplicate against existing memory and against deleted passes. Exact
 * normalised equality catches most repeats; substring containment catches the
 * common case where a later pass writes a longer version of a note.
 */
export function selectDreamCandidates(
  candidates: DreamCandidate[],
  existingStatements: string[],
  suppressedStatements: string[],
  maxEntries = DREAM_MAX_ENTRIES,
): SelectDreamCandidatesResult {
  const existingSet = new Set<string>()
  const existingList: string[] = []
  const addExisting = (raw: string) => {
    const norm = normalizeMemoryStatement(raw)
    if (!norm) return
    existingSet.add(norm)
    existingList.push(norm)
  }
  existingStatements.forEach(addExisting)
  // Suppressed statements are also treated as existing for containment, but
  // counted separately so the pass log can say why nothing was written.
  const suppressedSet = new Set(
    suppressedStatements
      .map(normalizeMemoryStatement)
      .filter(Boolean),
  )
  for (const normalized of suppressedSet) {
    if (!existingSet.has(normalized)) {
      existingSet.add(normalized)
      existingList.push(normalized)
    }
  }

  const selected: DreamCandidate[] = []
  let duplicates = 0
  let suppressed = 0

  // Highest confidence gets the limited slots; ties keep model order.
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => b.candidate.confidence - a.candidate.confidence || a.index - b.index)
    .map(entry => entry.candidate)

  for (const candidate of ordered) {
    const norm = normalizeMemoryStatement(candidate.statement)
    if (!norm) continue
    if (suppressedSet.has(norm)) {
      suppressed++
      continue
    }
    if (existingSet.has(norm)) {
      duplicates++
      continue
    }
    const containmentHit = existingList.some(existing =>
      existing.length >= 24 && norm.length >= 24 &&
      (existing.includes(norm) || norm.includes(existing)),
    )
    if (containmentHit) {
      duplicates++
      continue
    }
    selected.push(candidate)
    existingSet.add(norm)
    existingList.push(norm)
    if (selected.length >= maxEntries) break
  }

  return { selected, duplicates, suppressed }
}

export interface RenderedDreamFile {
  content: string
  entries: DreamCandidate[]
}

/**
 * One pass = one file. Append-only at the file level: a later pass picks a new
 * name rather than editing this one, so deleting the file undoes exactly that
 * pass and nothing else.
 */
export function renderDreamFile(input: {
  sessionId: string
  passId: string
  date: string
  timeSlug: string
  candidates: DreamCandidate[]
}): RenderedDreamFile {
  const shortSession = sessionFileSlug(input.sessionId)
  const header = [
    '---',
    `name: dream-${input.date}-${input.timeSlug}-${shortSession}`,
    `description: AIPA consolidated memory from session ${shortSession} on ${input.date}`,
    'type: project',
    '---',
    `<!-- dream:pass id="${input.passId}" session="${input.sessionId}" date="${input.date}" entries="${input.candidates.length}" -->`,
    `Memory consolidated by AIPA from session ${input.sessionId} on ${input.date}.`,
    'Delete this file to undo this pass; no other memory file is changed.',
    '',
  ].join('\n')

  const chunks: string[] = []
  const accepted: DreamCandidate[] = []
  let length = header.length

  for (const candidate of input.candidates) {
    const chunk = [
      `- [${candidate.kind}] ${candidate.statement}`,
      `  provenance: session ${input.sessionId} · ${input.date} · confidence ${candidate.confidence.toFixed(2)}`,
    ].join('\n')
    // Leave room for a separating newline; drop the lowest-confidence tail
    // rather than truncate a sentence into a misleading claim.
    if (length + chunk.length + 1 > DREAM_MAX_FILE_CHARS) break
    chunks.push(chunk)
    accepted.push(candidate)
    length += chunk.length + 1
  }

  return {
    content: `${header}${chunks.join('\n\n')}\n`,
    entries: accepted,
  }
}

/** Read bullet/paragraph lines from one memory file, ignoring frontmatter. */
export function readMemoryStatementLines(filePath: string, maxBytes = 512 * 1024): string[] {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return []
    // Memory files are small; the cap only stops a pathological hand-edited
    // file from becoming a main-process allocation spike.
    const raw = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' }).slice(0, maxBytes)
    const body = raw
      .replace(/^﻿/, '')
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    return body
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line =>
        line.length > 0 &&
        !line.startsWith('#') &&
        !line.startsWith('<!--') &&
        !line.startsWith('```') &&
        line !== '---',
      )
      .map(line =>
        line
          .replace(/^[-*]\s+/, '')
          .replace(/^\[[^\]]+\]\s*/, '')
          .replace(/\s+provenance:\s.*$/i, '')
          .trim(),
      )
      .filter(line => line.length > 0)
  } catch {
    return []
  }
}

function listMarkdownFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(name => name.endsWith('.md'))
      .map(name => path.join(dir, name))
  } catch {
    return []
  }
}

/**
 * Existing memory the next pass must not repeat. Structured memdirs are the
 * source; the two human-edited MEMORY.md docs and the personal store are
 * included because the prompt injects them as peers.
 */
export function collectExistingStatements(input: {
  dirs: string[]
  docs?: string[]
  personal?: string[]
}): string[] {
  const statements: string[] = []
  for (const dir of input.dirs) {
    for (const file of listMarkdownFiles(dir)) {
      statements.push(...readMemoryStatementLines(file))
    }
  }
  for (const doc of input.docs ?? []) {
    statements.push(...readMemoryStatementLines(doc))
  }
  for (const item of input.personal ?? []) {
    const trimmed = collapse(item)
    if (trimmed) statements.push(trimmed)
  }
  return statements
}
