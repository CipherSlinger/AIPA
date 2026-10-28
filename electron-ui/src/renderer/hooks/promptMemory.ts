/**
 * Prompt memory assembly.
 *
 * The README promises a four-tier memory hierarchy. Before this module existed
 * the prompt only received `prefs.memories` (AIPA's electron-store list); the
 * `.claude/MEMORY.md` documents and the `~/.claude/*\/memory/` memdir files were
 * read by the Memory console and never reached a model. This module reads the
 * tiers that actually exist on disk and turns them into one bounded prompt
 * block:
 *
 *   global            ~/.claude/MEMORY.md
 *   project           <cwd>/.claude/MEMORY.md          (written by MemoryPanel)
 *   global-structured ~/.claude/memory/*.md            (memdir, YAML frontmatter)
 *   project-structured ~/.claude/projects/<slug>/memory/*.md
 *   personal          prefs.memories                    (auto-memory writes here)
 *
 * Budgets are characters, not tokens, so the cap is deterministic. The total is
 * deliberately smaller than the sum of the per-tier caps: a memory file that
 * grows without bound gets truncated or dropped, it can never crowd out the
 * conversation.
 */
import type { AppPrefs, MemoryItem } from '../types/app.types'

export interface StructuredMemoryFile {
  filePath: string
  name: string
  description: string
  type: string
  content: string
  scope: 'global' | 'project'
  projectHash?: string
  mtime: number
}

/** Everything the renderer needs from the main process / disk. Injectable so
 *  the assembly can be exercised by a harness without Electron. */
export interface PromptMemoryIo {
  homeDir(): Promise<string>
  readFile(path: string): Promise<string | null>
  listStructured(): Promise<StructuredMemoryFile[]>
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
 * Kept local so the assembly has no React imports.
 */
export function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function createElectronMemoryIo(): PromptMemoryIo {
  return {
    homeDir: () => window.electronAPI.fsGetHome(),
    readFile: async (filePath) => {
      try {
        const result = await window.electronAPI.fsReadFile(filePath)
        // fs:readFile reports "not found" as { error } rather than throwing.
        if (!result || typeof result.content !== 'string') return null
        return result.content
      } catch {
        return null
      }
    },
    listStructured: async () => {
      try {
        const files = await window.electronAPI.memoryList('all')
        return (files || []).map((f) => ({
          filePath: f.filePath,
          name: f.name,
          description: f.description,
          type: f.type,
          content: f.content,
          scope: f.scope === 'global' ? 'global' : 'project',
          projectHash: f.projectHash,
          mtime: f.mtime,
        }))
      } catch {
        return []
      }
    },
  }
}

// `memory:list` parses every structured file on every call, so its result is
// cached by the (path, mtime) signature: the formatting work is skipped until
// a file actually changes. Docs have no stat channel exposed to the renderer;
// they are re-read once per turn, which is the assembly boundary (never per
// keystroke).
const structuredTierCache = new Map<
  string,
  { signature: string; text: string }
>()

function structuredSignature(files: StructuredMemoryFile[]): string {
  return files
    .map((f) => `${f.filePath}:${f.mtime}`)
    .sort()
    .join('|')
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function formatStructured(files: StructuredMemoryFile[]): string {
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

function cachedStructuredText(key: string, files: StructuredMemoryFile[]): string {
  const signature = structuredSignature(files)
  const hit = structuredTierCache.get(key)
  if (hit && hit.signature === signature) return hit.text
  const text = formatStructured(files)
  structuredTierCache.set(key, { signature, text })
  return text
}

function formatPersonal(memories: MemoryItem[]): string {
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

function readDoc(io: PromptMemoryIo, filePath: string): Promise<string> {
  return io.readFile(filePath).then((raw) => (raw ? raw.replace(/^\uFEFF/, '').trim() : ''))
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
 * Assemble the five memory tiers into one bounded, labelled prompt block.
 * Reads are best-effort: a missing file or failed IPC simply drops that tier.
 */
export async function assembleMemoryContext(input: {
  prefs: AppPrefs
  cwd: string
  io: PromptMemoryIo
}): Promise<MemoryContextResult> {
  const { prefs, cwd, io } = input

  let home = ''
  try {
    home = await io.homeDir()
  } catch {
    home = ''
  }

  const projectSlug = cwd ? cwdToProjectSlug(cwd) : ''

  const [globalDoc, projectDoc, structured] = await Promise.all([
    home ? readDoc(io, joinPath(home, '.claude', 'MEMORY.md')) : Promise.resolve(''),
    cwd ? readDoc(io, joinPath(cwd, '.claude', 'MEMORY.md')) : Promise.resolve(''),
    io.listStructured().catch(() => [] as StructuredMemoryFile[]),
  ])

  const raw: Record<TierKey, string> = {
    globalDoc,
    projectDoc,
    globalStructured: cachedStructuredText(
      'global',
      structured.filter((f) => f.scope === 'global'),
    ),
    projectStructured: cachedStructuredText(
      `project:${projectSlug}`,
      structured.filter((f) => f.scope === 'project' && f.projectHash === projectSlug),
    ),
    personal: formatPersonal(prefs.memories || []),
  }

  // Allocate the total budget in priority order: a large global file loses to
  // the project's own memory. Then emit in the order the README promises.
  const allocated = new Map<TierKey, string>()
  const omitted: TierKey[] = []
  let remaining = MEMORY_TOTAL_BUDGET - FRAMING_ALLOWANCE

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
