/**
 * Prompt memory assembly — the canonical implementation, owned by the main
 * process.
 *
 * A manual chat turn assembles memory in the renderer (`promptMemory.ts`), but a
 * scheduled automation or a plugin `chat.ask` turn runs with no window to call
 * it. This module is the one assembler both paths share: the renderer asks for
 * the block over `memory:buildContext`, and hidden turns call it directly.
 *
 * PARITY CONTRACT
 * ---------------
 * This file must reproduce the renderer's five tiers exactly — same ordering,
 * same `<memory>` headers, same 12,000-character total budget, same
 * de-duplication, same truncation marker. `promptMemory.ts` keeps its local
 * implementation only as an offline fallback (no IPC, e.g. a bare harness) and
 * must emit a byte-identical block for identical inputs. Any behavioural change
 * here belongs in that file too, and the parity harness under
 * `.scratch/headless-context-harness/` compares the two directly.
 *
 * Tiers, in prompt order:
 *   global             ~/.claude/MEMORY.md
 *   project            <cwd>/.claude/MEMORY.md
 *   global-structured  ~/.claude/memory/*.md
 *   project-structured ~/.claude/projects/<slug>/memory/*.md
 *   personal           prefs.memories (AIPA's electron-store list)
 *
 * Budgets are characters, not tokens, so the cap is deterministic. The total is
 * smaller than the sum of the per-tier caps: a memory file that grows without
 * bound gets truncated or dropped, it can never crowd out the conversation.
 */
import * as fs from 'fs'
import * as os from 'os'
import { getRawPref } from '../config/config-manager'
import { listMemoryFiles, type MemoryFile } from './memory-manager'

export interface PersonalMemoryLike {
  content: string
  category?: string
  memoryType?: string
  pinned?: boolean
  updatedAt: number
}

export const MEMORY_TIER_BUDGETS = {
  globalDoc: 3_000,
  projectDoc: 4_000,
  globalStructured: 2_000,
  projectStructured: 3_000,
  personal: 2_000,
} as const

/**
 * Hard ceiling for the whole `<memory_context>` block including its preamble
 * and per-tier tags (~3k tokens at 4 chars/token). The content allocation
 * reserves FRAMING_ALLOWANCE so the emitted string itself never exceeds this.
 */
export const MEMORY_TOTAL_BUDGET = 12_000

/** Preamble (~400 chars) plus five `<memory>` wrappers (~300 chars), rounded up. */
const FRAMING_ALLOWANCE = 800

/** A single structured memory file may not monopolise its tier. */
const PER_FILE_CHARS = 600

type TierKey = keyof typeof MEMORY_TIER_BUDGETS

const TIER_ORDER: TierKey[] = [
  'globalDoc',
  'projectDoc',
  'globalStructured',
  'projectStructured',
  'personal',
]

/** Project memory outranks global memory when the total budget is tight. */
const ALLOCATION_PRIORITY: TierKey[] = [
  'projectDoc',
  'projectStructured',
  'personal',
  'globalDoc',
  'globalStructured',
]

interface TierMeta {
  tier: string
  source: string
}

const TIER_META: Record<TierKey, TierMeta> = {
  globalDoc: { tier: 'global', source: '~/.claude/MEMORY.md' },
  projectDoc: { tier: 'project', source: '<cwd>/.claude/MEMORY.md' },
  globalStructured: { tier: 'global-structured', source: '~/.claude/memory/' },
  projectStructured: {
    tier: 'project-structured',
    source: '~/.claude/projects/<project>/memory/',
  },
  personal: { tier: 'personal', source: 'AIPA personal memory store' },
}

const TRUNCATION_MARKER = '\n… [truncated to fit the memory budget]'

export interface MemoryContextResult {
  /** The block to append to the system prompt, or '' when no tier had content. */
  text: string
  /** Tiers that made it into the prompt, in prompt order. */
  applied: TierKey[]
  /** Tiers that existed but were dropped by the budget. */
  omitted: TierKey[]
  /** Characters of content that survived per tier (labels excluded). */
  used: Partial<Record<TierKey, number>>
}

/**
 * The slug Claude uses for `~/.claude/projects/<slug>/`.
 *
 * Claude replaces *every* non-alphanumeric character with `-`, not just the
 * path separators and the drive colon. Verified on this machine:
 * `C:\Users\jiany\.aipa\plugin-data` lives in
 * `C--Users-jiany--aipa-plugin-data` (note `-aipa`, not `.aipa`). Replacing
 * only `[/\\:]` produced `C--Users-jiany-.aipa-plugin-data`, so project-scoped
 * structured memory silently never matched any cwd containing a dot or a space
 * (`my.app`, `node.js`, `My Project`).
 *
 * The renderer's `promptMemory.ts` carries the same function; the parity
 * harness compares them.
 */
export function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * The personal tier's source. `memories` is a renderer-owned pref stored
 * outside `StoreSchema`, so it is read raw (and validated) here.
 */
export function readPersonalMemories(): PersonalMemoryLike[] {
  const raw = getRawPref('memories')
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is PersonalMemoryLike =>
      !!m && typeof m === 'object' && typeof (m as PersonalMemoryLike).content === 'string',
  )
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function formatStructured(files: MemoryFile[]): string {
  return files
    .slice()
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    .map((f) => {
      const body = collapseWhitespace(f.content).slice(0, PER_FILE_CHARS)
      const head = `- [${f.type || 'unknown'}] ${f.name || '(unnamed)'}`
      const description = f.description ? ` — ${collapseWhitespace(f.description)}` : ''
      return `${head}${description}: ${body}`
    })
    .join('\n')
}

function formatPersonal(memories: PersonalMemoryLike[]): string {
  if (memories.length === 0) return ''
  const pinned = memories.filter((m) => m.pinned)
  const recent = memories
    .filter((m) => !m.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
  return [...pinned, ...recent]
    .map((m) => {
      const kind = m.memoryType || m.category || 'context'
      return `- [${kind}]${m.pinned ? ' (pinned)' : ''} ${collapseWhitespace(m.content)}`
    })
    .join('\n')
}

function readDoc(filePath: string): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return raw ? raw.replace(/^\uFEFF/, '').trim() : ''
  } catch {
    return ''
  }
}

function joinPath(dir: string, ...parts: string[]): string {
  const base = dir.replace(/[/\\]+$/, '')
  return [base, ...parts].join('/')
}

function truncateToBudget(text: string, allowed: number): { text: string; truncated: boolean } | null {
  if (allowed <= 0) return null
  if (text.length <= allowed) return { text, truncated: false }
  // Do not emit a marker with nothing behind it.
  if (allowed <= TRUNCATION_MARKER.length + 80) return null
  return {
    text: text.slice(0, allowed - TRUNCATION_MARKER.length) + TRUNCATION_MARKER,
    truncated: true,
  }
}

/**
 * Read the tiers from disk and assemble the labelled prompt block.
 *
 * Reads are best-effort: a missing file or an unreadable memory directory
 * simply drops that tier. `budgetChars` exists for deterministic tests; callers
 * in production use the default and therefore the renderer's 12,000-char cap.
 */
export async function assembleMemoryContext(input: {
  cwd: string
  personalMemories?: PersonalMemoryLike[]
  budgetChars?: number
}): Promise<MemoryContextResult> {
  const { cwd, personalMemories = [], budgetChars = MEMORY_TOTAL_BUDGET } = input

  // Same home the renderer uses: `fs:getHome` is os.homedir().
  const home = (() => {
    try { return os.homedir() } catch { return '' }
  })()

  const projectSlug = cwd ? cwdToProjectSlug(cwd) : ''

  let structured: MemoryFile[] = []
  try {
    structured = listMemoryFiles('all')
  } catch {
    structured = []
  }

  const raw: Record<TierKey, string> = {
    globalDoc: home ? readDoc(joinPath(home, '.claude', 'MEMORY.md')) : '',
    projectDoc: cwd ? readDoc(joinPath(cwd, '.claude', 'MEMORY.md')) : '',
    globalStructured: formatStructured(structured.filter((f) => f.scope === 'global')),
    projectStructured: formatStructured(
      structured.filter((f) => f.scope === 'project' && f.projectHash === projectSlug),
    ),
    personal: formatPersonal(personalMemories),
  }

  // Allocate the total budget in priority order: a large global file loses to
  // the project's own memory. Then emit in the order the README promises.
  const allocated = new Map<TierKey, string>()
  const omitted: TierKey[] = []
  let remaining = budgetChars - FRAMING_ALLOWANCE

  for (const key of ALLOCATION_PRIORITY) {
    const text = raw[key].trim()
    if (!text) continue
    const allowed = Math.min(MEMORY_TIER_BUDGETS[key], remaining)
    const fitted = truncateToBudget(text, allowed)
    if (!fitted) {
      omitted.push(key)
      continue
    }
    allocated.set(key, fitted.text)
    remaining -= fitted.text.length
  }

  const applied = TIER_ORDER.filter((key) => allocated.has(key))
  if (applied.length === 0) {
    return { text: '', applied, omitted, used: {} }
  }

  const blocks = applied.map((key) => {
    const meta = TIER_META[key]
    const body = allocated.get(key) as string
    return `<memory tier="${meta.tier}" source="${meta.source}">\n${body}\n</memory>`
  })

  const used: Partial<Record<TierKey, number>> = {}
  for (const key of applied) used[key] = (allocated.get(key) as string).length

  // Naming the tiers is not decoration: the model should treat a project line
  // as a repository convention and a personal line as a note about the user.
  const preamble =
    'The blocks below are persistent memory, injected by tier. "global" is the user\'s cross-project memory; ' +
    '"project" describes conventions for the current working directory and outranks global when they conflict; ' +
    'the "structured" tiers are per-item notes; "personal" is AIPA\'s own saved notes about the user.'

  return {
    text: `<memory_context>\n${preamble}\n\n${blocks.join('\n\n')}\n</memory_context>`,
    applied,
    omitted,
    used,
  }
}

/**
 * Prepend the assembled block to one prompt, exactly the way the renderer's
 * system prefix does (`parts.join('\n\n') + '\n\n'`).
 *
 * An empty block adds nothing at all — no header, no stray blank line — so a
 * user with no memory sees the same prompt a manual turn sends.
 */
export function prefixWithMemoryContext(prompt: string, memoryText: string | undefined | null): string {
  const text = (memoryText ?? '').trim()
  return text ? `${text}\n\n${prompt}` : prompt
}

/**
 * Assemble the memory block for a headless turn. Best-effort by construction: a
 * failed read yields '', and the caller still sends the user's prompt unchanged.
 */
export async function buildMemoryBlockForTurn(cwd: string): Promise<string> {
  try {
    const result = await assembleMemoryContext({
      cwd,
      personalMemories: readPersonalMemories(),
    })
    return result.text
  } catch {
    return ''
  }
}
