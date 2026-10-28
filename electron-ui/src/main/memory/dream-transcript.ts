/**
 * Turns an on-disk session transcript into the small, engine-neutral stream
 * the dream consolidator understands.
 *
 * Both readers already normalise to the Claude transcript shape, so the only
 * engine-specific work is choosing the loader and learning the project slug
 * (Claude stores it as the directory name; Codex stores a cwd).
 */
import {
  loadSession as loadClaudeSession,
  listSessions as listClaudeSessions,
} from '../sessions/session-reader'
import {
  loadSession as loadCodexSession,
  listSessions as listCodexSessions,
} from '../codex/codex-session-reader'
import { isSyntheticPrompt } from '../sessions/prompt-text'
import { cwdToProjectSlug } from './dream-paths'
import type { DreamEngine, DreamTranscript, DreamTurn } from './dream-types'

export interface DreamTranscriptHint {
  sessionId: string
  engine?: DreamEngine
  cwd?: string
  projectSlug?: string
}

export type DreamTranscriptReader = (hint: DreamTranscriptHint) => DreamTranscript | null

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part)
      continue
    }
    if (!part || typeof part !== 'object') continue
    const record = part as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('\n')
}

function timestampOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normaliseTurns(entries: Array<Record<string, unknown>>): DreamTurn[] {
  const turns: DreamTurn[] = []
  for (const entry of entries) {
    const role = entry.type === 'user' || entry.type === 'assistant'
      ? entry.type
      : entry.role
    if (role !== 'user' && role !== 'assistant') continue

    const message = entry.message as { content?: unknown } | undefined
    const text = (textFromContent(message?.content ?? entry.content) || '').trim()
    if (!text) continue
    // Harness wrappers, attachment placeholders and bare slash commands are
    // not conversation content the user would recognise in a memory.
    if (isSyntheticPrompt(text)) continue

    const timestamp = timestampOf(entry.timestamp)
    turns.push({ role, text, ...(timestamp !== undefined ? { timestamp } : {}) })
  }
  return turns
}

function toTranscript(input: {
  sessionId: string
  entries: Array<Record<string, unknown>>
  cwd?: string
  projectSlug?: string
}): DreamTranscript | null {
  const turns = normaliseTurns(input.entries)
  if (turns.length === 0) return null
  return {
    sessionId: input.sessionId,
    cwd: input.cwd,
    projectSlug: input.projectSlug,
    turns,
    userTurnCount: turns.filter(turn => turn.role === 'user').length,
  }
}

function readCodex(hint: DreamTranscriptHint): DreamTranscript | null {
  const entries = loadCodexSession(hint.sessionId) as unknown as Array<Record<string, unknown>>
  if (entries.length === 0) return null
  const meta = listCodexSessions().find(item => item.sessionId === hint.sessionId)
  const cwd = hint.cwd || meta?.cwd
  const projectSlug = hint.projectSlug || meta?.projectSlug || (cwd ? cwdToProjectSlug(cwd) : '')
  return toTranscript({ sessionId: hint.sessionId, entries, cwd, projectSlug })
}

function readClaude(hint: DreamTranscriptHint): DreamTranscript | null {
  const entries = loadClaudeSession(hint.sessionId) as unknown as Array<Record<string, unknown>>
  if (entries.length === 0) return null
  const meta = listClaudeSessions().find(item => item.sessionId === hint.sessionId)
  const projectSlug = hint.projectSlug || meta?.projectSlug || ''
  return toTranscript({ sessionId: hint.sessionId, entries, cwd: hint.cwd, projectSlug })
}

/**
 * Read the session using the engine recorded at turn end; fall back to the
 * other reader for sessions opened before the feature (or after a state loss).
 */
export function createDreamTranscriptReader(): DreamTranscriptReader {
  return (hint) => {
    if (!hint.sessionId) return null
    if (hint.engine === 'codex') {
      return readCodex(hint) ?? readClaude(hint)
    }
    if (hint.engine === 'claude') {
      return readClaude(hint) ?? readCodex(hint)
    }
    // Claude's loader only walks ~/.claude/projects, while Codex's may scan
    // every rollout: try the cheap one first.
    return readClaude(hint) ?? readCodex(hint)
  }
}
