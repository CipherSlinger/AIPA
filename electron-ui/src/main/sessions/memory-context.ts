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
import * as path from 'path'
import { getRawPref } from '../config/config-manager'
import {
  isMemoryFilePath,
  listMemoryFilesDetailed,
  MAX_MEMORY_UNREADABLE,
  type MemoryFile,
  type MemoryUnreadable,
} from './memory-manager'

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

/** Most recent unpinned personal notes that may enter the block. */
const PERSONAL_MAX_ITEMS = 20

type TierKey = keyof typeof MEMORY_TIER_BUDGETS

/** The assembler's internal tier key; exported for the digest's label mapping. */
export type MemoryTierKey = TierKey

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

/**
 * Cap on per-source entries. A project memdir could hold thousands of files;
 * the receipt rides in every conversation row and is persisted with it, so the
 * provenance has to stay as bounded as the diagnostics do.
 */
export const MAX_MEMORY_SOURCES = 200

/**
 * One thing that contributed to the emitted block.
 *
 * This is metadata *about* `MemoryContextResult.text`, never part of it — the
 * prompt stays byte-identical, because telling the model which file a line came
 * from would invite it to reason about the storage layout instead of the
 * content. The fields are deliberately enough to let the transcript name a
 * source and offer to forget a file, and no more.
 */
export interface MemorySourceEntry {
  /** Absolute path, present only when the source is a memory file. */
  path?: string
  /** Display label for a source that is not a file (a personal-store note). */
  label?: string
  /** The tier key that carried it. */
  tier: TierKey
  /** Characters this source contributed to the emitted block, 0 when omitted. */
  chars: number
  /** True when a cap shortened this source's own body (or the tier's tail). */
  truncated: boolean
  /** True when this source existed but its whole tier was dropped by the budget. */
  omitted: boolean
  /**
   * True only for a path `memory:delete` would accept. Documents under
   * `.claude/MEMORY.md` and consolidation files (owned by the dream pass log)
   * are deliberately not deletable through the memory delete channel.
   */
  deletable: boolean
  /**
   * True when the existing memory console can address this source. The receipt
   * links there instead of inventing a second delete path.
   */
  console: boolean
}

export interface MemoryContextResult {
  /** The block to append to the system prompt, or '' when no tier had content. */
  text: string
  /** Tiers that made it into the prompt, in prompt order. */
  applied: TierKey[]
  /** Tiers that existed but were dropped by the budget. */
  omitted: TierKey[]
  /** Characters of content that survived per tier (labels excluded). */
  used: Partial<Record<TierKey, number>>
  /**
   * Tiers whose content was shortened by a budget — a per-file cap, the tier's
   * own cap, or the total. Exposed separately from `used` so a caller can
   * report truncation instead of inferring it from a count that happens to
   * equal a budget.
   */
  truncated: TierKey[]
  /**
   * Memory paths that existed but could not be read. Diagnostics only: none of
   * this enters `text`, because the model must never see why a file was
   * skipped and might mistake it for memory content.
   */
  unreadable: MemoryUnreadable[]
  /**
   * What each tier was built from, in prompt order. Metadata only: the sum of
   * non-omitted `chars` never exceeds `used` for the tier it belongs to, and
   * `text` is unchanged by its presence.
   */
  sources: MemorySourceEntry[]
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

/**
 * Format one tier's content, reporting whether a per-tier budget clipped it.
 * The formatted text is exactly what it was before this signal existed; only
 * the digest consumes `capped`.
 */
interface TierSegment {
  /** Set only for a file-backed source. */
  path?: string
  /** Set only for a non-file source. */
  label?: string
  /** Character range in the tier's formatted text, end-exclusive. */
  start: number
  end: number
  /** True when a per-file cap cut this source's own body. */
  capped: boolean
  /** True when the memory console can address this source. */
  console: boolean
}

interface FormattedTier {
  text: string
  capped: boolean
  /** The same text, sliced by contributor. Sum of lengths + separators = text.length. */
  segments: TierSegment[]
}

function formatStructured(
  files: MemoryFile[],
  options: { console: boolean },
): FormattedTier {
  let capped = false
  const pieces: string[] = []
  const segments: TierSegment[] = []
  let cursor = 0
  for (const f of files.slice().sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))) {
    const flat = collapseWhitespace(f.content)
    const cut = flat.length > PER_FILE_CHARS
    if (cut) capped = true
    const body = flat.slice(0, PER_FILE_CHARS)
    const head = `- [${f.type || 'unknown'}] ${f.name || '(unnamed)'}`
    const description = f.description ? ` — ${collapseWhitespace(f.description)}` : ''
    const piece = `${head}${description}: ${body}`
    // The '\n' between pieces belongs to no source; account for it before the
    // segment starts so ranges remain contiguous within the joined text.
    if (pieces.length > 0) cursor += 1
    segments.push({
      path: f.filePath,
      start: cursor,
      end: cursor + piece.length,
      capped: cut,
      // A consolidation file is owned by the dream pass log, which the memory
      // console's consolidation tab can address; ordinary structured files are
      // forgettable here and need no link.
      console: options.console || isConsolidationFile(f.filePath),
    })
    pieces.push(piece)
    cursor += piece.length
  }
  return { text: pieces.join('\n'), capped, segments }
}

function formatPersonal(memories: PersonalMemoryLike[]): FormattedTier {
  if (memories.length === 0) return { text: '', capped: false, segments: [] }
  const pinned = memories.filter((m) => m.pinned)
  const unpinned = memories
    .filter((m) => !m.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const recent = unpinned.slice(0, PERSONAL_MAX_ITEMS)
  const pieces: string[] = []
  const segments: TierSegment[] = []
  let cursor = 0
  for (const m of [...pinned, ...recent]) {
    const kind = m.memoryType || m.category || 'context'
    const content = collapseWhitespace(m.content)
    const piece = `- [${kind}]${m.pinned ? ' (pinned)' : ''} ${content}`
    if (pieces.length > 0) cursor += 1
    // A personal note has no path (it lives in electron-store); the label is
    // what the transcript can show instead of pretending it is a file.
    segments.push({
      label: `${kind}${m.pinned ? ' (pinned)' : ''}: ${content.length > 60 ? `${content.slice(0, 60)}…` : content}`,
      start: cursor,
      end: cursor + piece.length,
      capped: false,
      console: true,
    })
    pieces.push(piece)
    cursor += piece.length
  }
  return { text: pieces.join('\n'), capped: unpinned.length > recent.length, segments }
}

interface DocRead {
  text: string
  /** True only when the file exists but could not be read; missing is not an error. */
  error?: boolean
}

function readDoc(filePath: string): DocRead {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return { text: raw ? raw.replace(/^\uFEFF/, '').trim() : '' }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    return { text: '', error: code !== 'ENOENT' && code !== 'ENOTDIR' }
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
 * Consolidation files belong to the dream pass log. Deleting one through
 * `memory:delete` would remove the file but leave its pass record claiming it
 * wrote something, so the receipt marks it as console-managed instead.
 */
function isConsolidationFile(filePath: string): boolean {
  const base = path.basename(filePath)
  return base.startsWith('dream-') && base.endsWith('.md')
}

/**
 * Turn per-tier segments into receipt sources, charging only the slice that
 * actually survived the budget.
 *
 * `fitted` is null when the whole tier was dropped: every source is then
 * reported as omitted with zero characters rather than pretending it reached
 * the model. When a tier was truncated, the trailing marker occupies real
 * characters but is not content, so it is excluded from every source range.
 */
function toSourceEntries(
  tier: TierKey,
  segments: TierSegment[],
  fitted: { text: string; truncated: boolean } | null,
): MemorySourceEntry[] {
  return segments.map((segment) => {
    const base = {
      ...(segment.path ? { path: segment.path } : {}),
      ...(segment.label ? { label: segment.label } : {}),
      tier,
    }
    // `isMemoryFilePath` is the same predicate the delete channel applies;
    // consolidation files are excluded because the dream log owns them.
    const filePath = segment.path
    const deletable = !!filePath && isMemoryFilePath(filePath) && !isConsolidationFile(filePath)
    if (!fitted) {
      return {
        ...base,
        chars: 0,
        truncated: false,
        omitted: true,
        // The file still exists and will be considered next turn, so the row
        // may offer to forget it even though this turn dropped it.
        deletable,
        console: segment.console,
      }
    }
    const contentLength = fitted.truncated
      ? Math.max(0, fitted.text.length - TRUNCATION_MARKER.length)
      : fitted.text.length
    const visibleEnd = Math.min(segment.end, contentLength)
    const visibleStart = Math.min(segment.start, contentLength)
    return {
      ...base,
      chars: Math.max(0, visibleEnd - visibleStart),
      truncated: segment.capped || visibleEnd < segment.end,
      omitted: false,
      deletable,
      console: segment.console,
    }
  })
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
  let structuredUnreadable: MemoryUnreadable[] = []
  try {
    const listing = listMemoryFilesDetailed('all')
    structured = listing.files
    structuredUnreadable = listing.unreadable
  } catch {
    structured = []
  }

  const globalStructured = formatStructured(
    structured.filter((f) => f.scope === 'global'),
    { console: false },
  )
  const projectStructured = formatStructured(
    structured.filter((f) => f.scope === 'project' && f.projectHash === projectSlug),
    { console: false },
  )
  const personal = formatPersonal(personalMemories)

  const globalDocPath = home ? joinPath(home, '.claude', 'MEMORY.md') : ''
  const projectDocPath = cwd ? joinPath(cwd, '.claude', 'MEMORY.md') : ''
  const globalDoc: DocRead = globalDocPath ? readDoc(globalDocPath) : { text: '' }
  const projectDoc: DocRead = projectDocPath ? readDoc(projectDocPath) : { text: '' }

  // A document tier is one file: its segment spans the whole (already trimmed)
  // text. The path is real only when the file actually produced content.
  const docSegment = (path: string, text: string): TierSegment[] =>
    text ? [{ path, start: 0, end: text.length, capped: false, console: false }] : []

  // Diagnostics never enter `raw`: they are for the run record and the Memory
  // panel, not for the model.
  const unreadable: MemoryUnreadable[] = []
  if (globalDoc.error) unreadable.push({ path: globalDocPath, scope: 'global', reason: 'read' })
  if (projectDoc.error) unreadable.push({ path: projectDocPath, scope: 'project', reason: 'read' })
  unreadable.push(...structuredUnreadable)
  if (unreadable.length > MAX_MEMORY_UNREADABLE) unreadable.length = MAX_MEMORY_UNREADABLE

  const raw: Record<TierKey, string> = {
    globalDoc: globalDoc.text,
    projectDoc: projectDoc.text,
    globalStructured: globalStructured.text,
    projectStructured: projectStructured.text,
    personal: personal.text,
  }

  const segments: Record<TierKey, TierSegment[]> = {
    globalDoc: docSegment(globalDocPath, globalDoc.text),
    projectDoc: docSegment(projectDocPath, projectDoc.text),
    globalStructured: globalStructured.segments,
    projectStructured: projectStructured.segments,
    personal: personal.segments,
  }

  // Caps applied while formatting a tier, before the block budget runs.
  const capped = new Set<TierKey>()
  if (globalStructured.capped) capped.add('globalStructured')
  if (projectStructured.capped) capped.add('projectStructured')
  if (personal.capped) capped.add('personal')

  // Allocate the total budget in priority order: a large global file loses to
  // the project's own memory. Then emit in the order the README promises.
  const allocated = new Map<TierKey, string>()
  const omitted: TierKey[] = []
  const truncated: TierKey[] = []
  const tierSources = new Map<TierKey, MemorySourceEntry[]>()
  let remaining = budgetChars - FRAMING_ALLOWANCE

  for (const key of ALLOCATION_PRIORITY) {
    const text = raw[key].trim()
    if (!text) continue
    const allowed = Math.min(MEMORY_TIER_BUDGETS[key], remaining)
    const fitted = truncateToBudget(text, allowed)
    if (!fitted) {
      omitted.push(key)
      // The sources existed and were read, but reached no prompt. Report them
      // as omitted instead of silently dropping the provenance.
      tierSources.set(key, toSourceEntries(key, segments[key], null))
      continue
    }
    if (fitted.truncated || capped.has(key)) truncated.push(key)
    allocated.set(key, fitted.text)
    tierSources.set(key, toSourceEntries(key, segments[key], fitted))
    remaining -= fitted.text.length
  }

  // Prompt order, not allocation order: the transcript lists sources in the
  // same order their tiers appear in the block. Stop at the cap instead of
  // building an unbounded list and trimming it afterwards.
  const sources: MemorySourceEntry[] = []
  for (const key of TIER_ORDER) {
    for (const entry of tierSources.get(key) ?? []) {
      if (sources.length >= MAX_MEMORY_SOURCES) break
      sources.push(entry)
    }
    if (sources.length >= MAX_MEMORY_SOURCES) break
  }

  const applied = TIER_ORDER.filter((key) => allocated.has(key))
  if (applied.length === 0) {
    return { text: '', applied, omitted, used: {}, truncated, unreadable, sources }
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
    truncated,
    unreadable,
    sources,
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
 * One read of the memory tiers for a headless turn, with the structured result
 * kept so a caller can describe what the run saw.
 *
 * `failed` is the signal an empty `text` cannot carry: today a read that throws
 * and a user with no memory both produce ''. A scheduled run must be able to
 * tell those apart after the fact.
 */
export interface MemorySnapshot {
  /** The block to prefix; '' when no tier had content or the read failed. */
  text: string
  /** Structured assembler output; null exactly when the read failed. */
  context: MemoryContextResult | null
  /** True when assembly threw, as opposed to legitimately finding no memory. */
  failed: boolean
}

/**
 * Assemble the memory block for a headless turn. Best-effort by construction: a
 * failed read yields an empty block and a `failed` snapshot, so the caller still
 * sends the user's prompt unchanged while reporting the failure.
 */
export async function buildMemorySnapshotForTurn(cwd: string): Promise<MemorySnapshot> {
  try {
    const context = await assembleMemoryContext({
      cwd,
      personalMemories: readPersonalMemories(),
    })
    return { text: context.text, context, failed: false }
  } catch {
    return { text: '', context: null, failed: true }
  }
}

/**
 * Assemble the memory block for a headless turn, text only.
 *
 * Callers that only prefix a prompt use this; a caller that must report the
 * snapshot's shape uses `buildMemorySnapshotForTurn` instead.
 */
export async function buildMemoryBlockForTurn(cwd: string): Promise<string> {
  return (await buildMemorySnapshotForTurn(cwd)).text
}
