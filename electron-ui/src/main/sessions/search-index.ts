/**
 * Incremental full-text index for cross-session search.
 *
 * Searching used to mean reading the whole transcript corpus on every settled
 * query: ~1.3 GB across 4240 Claude transcripts on this machine, about 2.5-3 s
 * of streaming I/O per query even with three concurrent readers. The prose that
 * search actually matches — text blocks of user/assistant messages — is only
 * ~5.6 MB of that, because tool results dominate the files. So the index stores
 * that prose, keyed by (mtimeMs, size), and a query becomes an in-memory scan.
 *
 * Correctness model (make-style):
 *   - every query stats the live files and re-extracts only the ones whose
 *     mtime/size changed; deleted files are dropped, new files added;
 *   - a changed file is re-extracted *before* the query answers (unless the
 *     first build is still running), so a transcript edited outside the app is
 *     visible on the next query;
 *   - files the index cannot hold are marked deferred and searched by reading
 *     them on demand, exactly like the pre-index implementation.
 *
 * Budget: 32M characters (~64 MB as UTF-16) is the whole prose corpus here with
 * a 5.7x margin; files larger than 2M characters are stored truncated and
 * verified on disk when the stored prefix misses. Eviction drops the oldest
 * files first, since search is recency-ordered and stops at the result limit.
 */
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { once } from 'events'
import { AIPA_CACHE_DIR } from './session-index-cache'
import { SEARCH_MAX_BLOCK_CHARS, capSearchText } from './search-types'
import type { SearchTextOrigin } from './search-types'

/** Bump when a stored field's meaning changes; old files are then ignored. */
export const SEARCH_INDEX_VERSION = 2

/** Total characters of indexed prose. ~64 MB of JS string data. */
export const MAX_INDEX_CHARS = 32 * 1024 * 1024

/** Per-file prose cap; longer transcripts are stored truncated (partial). */
export const MAX_FILE_CHARS = 2 * 1024 * 1024

/**
 * Per-file ceiling for tool and thinking text. Prose is never cut by this: one
 * transcript whose shell output alone runs to megabytes would otherwise use
 * the whole corpus budget and evict a hundred ordinary conversations.
 *
 * 6000 is three full per-block ceilings. On this machine's ~4240 transcripts
 * that is ~25 M characters of tool text, which together with the ~5.6 M of
 * prose still fits MAX_INDEX_CHARS — so widening the index does not push old
 * conversations out of it. A file that hits the ceiling is marked truncated,
 * and a miss in what was stored is verified on disk.
 */
export const MAX_FILE_NON_PROSE_CHARS = 6000

/**
 * How many uncached files a single query may read from disk. Deferred files are
 * pathological (the prose budget is 5x the corpus here); the cap keeps one
 * oversized corpus from turning every query back into a full scan.
 */
export const MAX_FALLBACK_READS = 64

/**
 * A first sync that finds more changed files than this is treated like a cold
 * build: it runs in the background and the query returns what is indexed so
 * far, instead of making the user wait for thousands of extractions.
 */
const MAX_AWAITED_FILES = 200

const SAVE_DEBOUNCE_MS = 3000

export interface SearchIndexFile {
  filePath: string
  /** Claude: the transcript filename. Codex: the rollout's uuid when known. */
  sessionId: string
  /** Claude: project directory name. Codex: slugified cwd. */
  projectSlug: string
  mtimeMs: number
  size: number
}

export interface SearchIndexRecord {
  /** Epoch ms of the entry that owns this text; 0 when it carried no timestamp. */
  ts: number
  role: 'user' | 'assistant'
  text: string
  /**
   * Which part of the entry `text` came from. v1 stored prose only, so a v1
   * cache cannot be read as a v2 one — hence the version bump.
   */
  origin: SearchTextOrigin
  /** This record's text was cut at the block ceiling; it is not the whole block. */
  truncated?: boolean
}

export interface SearchIndexDoc {
  filePath: string
  sessionId: string
  projectSlug: string
  /** Codex only: the real cwd the session ran in (the rollouts' `project`). */
  project?: string
  mtimeMs: number
  size: number
  /** Newest transcript timestamp the pre-index scan would have reported. */
  timestamp: number
  /** Claude: last `session-title` line. Codex: title derived from the first prompt. */
  title?: string
  records: SearchIndexRecord[]
  /** Records cover only the start of the file; a miss must be verified on disk. */
  partial?: boolean
  /**
   * Some block text was cut or skipped for budget while every entry is still
   * represented. Prose is unaffected, so excerpt extraction may reuse the
   * cached records; search must verify a miss on disk.
   */
  truncated?: boolean
  /** Not in memory (over budget); search must read it on demand. */
  deferred?: boolean
}

export interface SearchIndexCandidate extends SearchIndexFile {
  /** In-memory document, or null when it has to be read from disk. */
  doc: SearchIndexDoc | null
  /**
   * Why `doc` is null. `pending` means a build is still working on it — the
   * query should answer with what is indexed rather than start its own read.
   * `deferred` means it was evicted for budget (or never fitted) and the caller
   * should fall back to reading it, exactly as before the index existed.
   */
  state: 'indexed' | 'pending' | 'deferred'
}

export interface SearchIndexStats {
  docs: number
  deferred: number
  chars: number
  building: boolean
  /** True once a persisted index was loaded or a build completed in this process. */
  warm: boolean
}

export type SearchDocExtractor = (file: SearchIndexFile) => Promise<SearchIndexDoc | null>

/**
 * Running totals while one transcript is extracted. Both readers use the same
 * arithmetic so a Claude transcript and a Codex rollout are budgeted alike.
 */
export interface SearchRecordState {
  /** Characters stored in `records` so far (prose + non-prose). */
  chars: number
  /** Characters contributed by tool and thinking text so far. */
  nonProseChars: number
  /** Records stop before the end of the file (file cap reached). */
  partial: boolean
  /** Some block text was cut or skipped; a miss must be verified on disk. */
  truncated: boolean
  /**
   * Entry the previous block came from. Blocks merge only within one entry, so
   * a record never concatenates text from two transcript rows: a snippet taken
   * from it would otherwise show a sentence from the assistant and one from a
   * tool result as if they were adjacent.
   */
  lastGroup?: number
}

export function createSearchRecordState(): SearchRecordState {
  return { chars: 0, nonProseChars: 0, partial: false, truncated: false }
}

/**
 * Append one capped block to a document, enforcing the per-file budgets.
 *
 * `maxChars` is the store cap (Infinity when an excerpt extractor lifts it);
 * the non-prose ceiling is per file and never cuts prose, so a transcript with
 * megabytes of shell output still keeps every user/assistant message intact.
 * Neighbouring blocks of the same origin/entry merge into one record, which is
 * what the old prose-only index did for text blocks.
 */
export function appendSearchRecord(
  state: SearchRecordState,
  records: SearchIndexRecord[],
  block: {
    ts: number
    role: 'user' | 'assistant'
    origin: SearchTextOrigin
    text: string
    truncated?: boolean
    /** Entry index; blocks of one entry may merge, different entries never do. */
    group?: number
  },
  maxChars: number,
): void {
  if (state.partial || !block.text) return

  let text = block.text
  let truncated = block.truncated === true
  if (block.origin !== 'prose') {
    // Per block first, then per file: one oversized read must not consume the
    // whole transcript's allowance.
    const perBlock = capSearchText(text, SEARCH_MAX_BLOCK_CHARS)
    text = perBlock.text
    truncated = truncated || perBlock.truncated

    const room = MAX_FILE_NON_PROSE_CHARS - state.nonProseChars
    if (room <= 0) {
      // The transcript has spent its tool/thinking allowance. Later blocks are
      // not indexed at all; the flag is what keeps that from being silent.
      state.truncated = true
      return
    }
    if (text.length > room) {
      const capped = capSearchText(text, room)
      text = capped.text
      truncated = true
    }
    state.nonProseChars += text.length
  }
  if (truncated) state.truncated = true

  if (state.chars + text.length > maxChars) {
    // Keep the metadata pass running, but stop growing the buffer; a miss in
    // the prefix is verified on disk.
    state.partial = true
    return
  }

  const sameEntry = block.group === undefined || block.group === state.lastGroup
  state.lastGroup = block.group
  const last = records[records.length - 1]
  if (sameEntry && last && last.ts === block.ts && last.role === block.role && last.origin === block.origin) {
    last.text += `\n${text}`
    if (truncated) last.truncated = true
  } else {
    records.push({
      ts: block.ts,
      role: block.role,
      origin: block.origin,
      text,
      ...(truncated ? { truncated: true } : {}),
    })
  }
  state.chars += text.length
}

function charsOf(doc: SearchIndexDoc): number {
  let n = 0
  for (const record of doc.records) n += record.text.length
  return n
}

function emptyDoc(file: SearchIndexFile): SearchIndexDoc {
  return {
    filePath: file.filePath,
    sessionId: file.sessionId,
    projectSlug: file.projectSlug,
    mtimeMs: file.mtimeMs,
    size: file.size,
    timestamp: file.mtimeMs,
    records: [],
  }
}

function immediate(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

/**
 * Bounded-concurrency map. Freshness needs one stat per transcript on every
 * query; 4080 sequential `fsp.stat` calls take ~210 ms here, while 32 in flight
 * take ~27 ms. Order of the result is preserved.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      out[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Async line iterator over a JSONL transcript. `readline` keeps a single huge
 * line intact without quadratic re-splitting, and the stream yields between
 * chunks so a 72 MB transcript cannot stall the main process in one tick.
 */
export async function* readJsonlLines(filePath: string): AsyncGenerator<string> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 256 * 1024 })
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of lines) yield line
  } finally {
    lines.close()
    stream.destroy()
  }
}

function docFromJson(raw: unknown, engine: string): SearchIndexDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.filePath !== 'string' || !d.filePath) return null
  if (typeof d.sessionId !== 'string') return null
  if (typeof d.projectSlug !== 'string') return null
  if (typeof d.mtimeMs !== 'number' || typeof d.size !== 'number') return null
  if (typeof d.timestamp !== 'number') return null
  if (!Array.isArray(d.records)) return null

  const records: SearchIndexRecord[] = []
  for (const entry of d.records) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    if (typeof r.text !== 'string' || !r.text) continue
    if (typeof r.ts !== 'number') continue
    if (r.role !== 'user' && r.role !== 'assistant') continue
    // A record without a known origin cannot be labelled in the result row, so
    // it is dropped rather than guessed as prose. The version header already
    // rejects v1 caches; this guards a hand-edited or half-written file.
    if (r.origin !== 'prose' && r.origin !== 'tool' && r.origin !== 'thinking') continue
    records.push({
      ts: r.ts,
      role: r.role,
      text: r.text,
      origin: r.origin,
      ...(r.truncated === true ? { truncated: true } : {}),
    })
  }

  return {
    filePath: d.filePath,
    sessionId: d.sessionId,
    projectSlug: d.projectSlug,
    project: typeof d.project === 'string' ? d.project : undefined,
    mtimeMs: d.mtimeMs,
    size: d.size,
    timestamp: d.timestamp,
    title: typeof d.title === 'string' ? d.title : undefined,
    records,
    partial: d.partial === true,
    truncated: d.truncated === true,
    deferred: d.deferred === true,
  }
}

export class SessionSearchIndex {
  private docs = new Map<string, SearchIndexDoc>()
  private totalChars = 0
  private loaded: Promise<void> | null = null
  private loadedFromCache = false
  private builtThisProcess = false
  private building = false
  private dirty = false
  private saveTimer: NodeJS.Timeout | null = null
  private saving = false
  private readonly maxChars: number

  constructor(
    private readonly engine: 'claude' | 'codex',
    private readonly extract: SearchDocExtractor,
    /** Budget override; tests use a tiny one to exercise eviction. */
    limits: { maxChars?: number } = {},
  ) {
    this.maxChars = limits.maxChars ?? MAX_INDEX_CHARS
  }

  private get cachePath(): string {
    return path.join(AIPA_CACHE_DIR, `search-index-${this.engine}.ndjson`)
  }

  get stats(): SearchIndexStats {
    let deferred = 0
    for (const doc of this.docs.values()) if (doc.deferred) deferred++
    return {
      docs: this.docs.size,
      deferred,
      chars: this.totalChars,
      building: this.building,
      warm: this.warm(),
    }
  }

  /**
   * The indexed document for a reader-facing session id, or null when the file
   * has not been extracted yet. Used by excerpt extraction: the search that
   * produced the hits has just reconciled this index, so quoting a session is a
   * map walk instead of a fresh multi-megabyte read.
   */
  findBySessionId(sessionId: string): SearchIndexDoc | null {
    for (const doc of this.docs.values()) {
      if (doc.sessionId === sessionId) return doc
    }
    return null
  }

  private warm(): boolean {
    return this.loadedFromCache || this.builtThisProcess
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loaded) this.loaded = this.loadFromDisk()
    return this.loaded
  }

  private async loadFromDisk(): Promise<void> {
    try {
      await fs.promises.access(this.cachePath)
    } catch {
      return
    }

    const stream = fs.createReadStream(this.cachePath, { encoding: 'utf-8' })
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
    let lineNo = 0
    try {
      for await (const line of lines) {
        if (!line) continue
        lineNo++
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          continue
        }
        if (lineNo === 1) {
          const header = parsed as { version?: number; engine?: string }
          if (header?.version !== SEARCH_INDEX_VERSION || header?.engine !== this.engine) return
          continue
        }
        const doc = docFromJson(parsed, this.engine)
        if (!doc) continue
        const existing = this.docs.get(doc.filePath)
        if (existing) this.totalChars -= charsOf(existing)
        this.docs.set(doc.filePath, doc)
        this.totalChars += charsOf(doc)
      }
    } catch {
      // A truncated cache is still useful; the next sync repairs what it can.
    } finally {
      lines.close()
      stream.destroy()
    }
    // A cache written under a larger budget (or edited by hand) must not push
    // the process past the current cap.
    if (this.totalChars > this.maxChars) this.evictOverBudget()
    this.loadedFromCache = this.docs.size > 0
  }

  /**
   * Reconcile the index with the live file list and return one candidate per
   * file (in the caller's order) carrying the cached document when one exists.
   *
   * Awaits incremental re-extraction so a file edited outside the app is
   * searchable immediately. During the first build (or a bulk import) it
   * returns the current partial state instead — never blocks the query.
   */
  async sync(files: SearchIndexFile[]): Promise<SearchIndexCandidate[]> {
    await this.ensureLoaded()

    const live = new Set<string>()
    for (const file of files) live.add(file.filePath)
    for (const [filePath, doc] of this.docs) {
      if (live.has(filePath)) continue
      this.totalChars -= charsOf(doc)
      this.docs.delete(filePath)
      this.dirty = true
    }

    const pending: SearchIndexFile[] = []
    for (const file of files) {
      const doc = this.docs.get(file.filePath)
      if (doc && doc.mtimeMs === file.mtimeMs && doc.size === file.size) continue
      // A changed file replaces its document; an unchanged deferred one stays
      // deferred so an oversized corpus does not churn through it every query.
      pending.push(file)
    }

    if (pending.length > 0 && !this.building) {
      if (!this.warm() || pending.length > MAX_AWAITED_FILES) {
        // Cold start or bulk import: build in the background and answer with
        // whatever is indexed so far. A running build is left alone; the next
        // query reconciles the files it has not reached yet.
        this.startBuild(pending)
      } else {
        await this.runExclusive(() => this.extractAll(pending))
      }
    }

    return files.map(file => {
      const doc = this.docs.get(file.filePath)
      if (!doc) return { ...file, doc: null, state: 'pending' as const }
      if (doc.deferred) return { ...file, doc: null, state: 'deferred' as const }
      if (doc.mtimeMs !== file.mtimeMs || doc.size !== file.size) {
        // Changed while a build was in flight; its new text is not ready yet.
        return { ...file, doc: null, state: 'pending' as const }
      }
      return { ...file, doc, state: 'indexed' as const }
    })
  }

  private async runExclusive(work: () => Promise<void>): Promise<void> {
    this.building = true
    try {
      await work()
    } finally {
      this.building = false
      this.builtThisProcess = true
    }
  }

  /** Background build: newest files first, so partial answers are the useful ones. */
  private startBuild(pending: SearchIndexFile[]): void {
    if (this.building) return
    void this.runExclusive(() => this.extractAll(pending)).catch(() => {
      // Extraction is best-effort; the next query retries the changed files.
    })
  }

  private async extractAll(pending: SearchIndexFile[]): Promise<void> {
    pending.sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const file of pending) {
      // Over budget: this document would be evicted right away, so spend no
      // I/O on it. Ordered newest-first, so everything left is older.
      if (this.totalChars >= this.maxChars) {
        this.defer(file)
        await immediate()
        continue
      }

      let doc: SearchIndexDoc | null = null
      try {
        doc = await this.extract(file)
      } catch {
        doc = null
      }

      const next = doc ?? emptyDoc(file)
      next.filePath = file.filePath
      next.sessionId = next.sessionId || file.sessionId
      next.projectSlug = next.projectSlug || file.projectSlug
      next.mtimeMs = file.mtimeMs
      next.size = file.size
      next.deferred = false

      const previous = this.docs.get(file.filePath)
      if (previous) this.totalChars -= charsOf(previous)
      this.docs.set(file.filePath, next)
      this.totalChars += charsOf(next)
      if (this.totalChars > this.maxChars) this.evictOverBudget()
      this.dirty = true

      // Let IPC, the renderer and every other main-process timer run between
      // files. One transcript is typically a few ms of parsing.
      await immediate()
    }
    this.scheduleSave()
  }

  private defer(file: SearchIndexFile): void {
    const previous = this.docs.get(file.filePath)
    if (previous) this.totalChars -= charsOf(previous)
    this.docs.set(file.filePath, { ...emptyDoc(file), deferred: true })
    this.dirty = true
  }

  /** Drop the oldest documents until the budget is met. */
  private evictOverBudget(): void {
    while (this.totalChars > this.maxChars) {
      let victim: SearchIndexDoc | null = null
      for (const doc of this.docs.values()) {
        if (doc.deferred) continue
        if (!victim || doc.mtimeMs < victim.mtimeMs) victim = doc
      }
      if (!victim) return
      this.totalChars -= charsOf(victim)
      victim.records = []
      victim.partial = false
      victim.truncated = false
      victim.deferred = true
    }
  }

  private scheduleSave(): void {
    this.dirty = true
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.writeToDisk()
    }, SAVE_DEBOUNCE_MS)
    // Never keep the process alive just to flush an index.
    if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref()
  }

  /** One JSON document per line: streaming keeps the write off the main thread. */
  private async writeToDisk(): Promise<void> {
    if (!this.dirty) return
    if (this.saving) {
      // A write is already streaming; re-arm so the newer state is not lost.
      this.scheduleSave()
      return
    }
    this.dirty = false
    this.saving = true
    const tmp = `${this.cachePath}.${process.pid}.tmp`
    let stream: fs.WriteStream | null = null
    let renamed = false
    try {
      await fs.promises.mkdir(AIPA_CACHE_DIR, { recursive: true })
      stream = fs.createWriteStream(tmp, { flags: 'w', encoding: 'utf-8' })
      stream.on('error', () => { /* handled by the write path below */ })

      const write = async (text: string) => {
        if (!stream) return
        if (!stream.write(text)) await once(stream, 'drain')
      }

      await write(JSON.stringify({ version: SEARCH_INDEX_VERSION, engine: this.engine }) + '\n')
      let written = 0
      for (const doc of this.docs.values()) {
        await write(JSON.stringify(doc) + '\n')
        // 400 docs is roughly 1-2 MB of NDJSON.
        if (++written % 400 === 0) await immediate()
      }
      stream.end()
      await once(stream, 'finish')
      await fs.promises.rename(tmp, this.cachePath)
      renamed = true
    } catch {
      // A cache that cannot be written is only a performance regression.
      this.dirty = true
    } finally {
      this.saving = false
      if (!renamed) {
        try { stream?.destroy() } catch { /* already gone */ }
        try { await fs.promises.unlink(tmp) } catch { /* already gone */ }
      }
    }
  }

  /** Flush immediately (tests, and callers that want a deterministic cache). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.writeToDisk()
  }

  /** Test hook: forget everything held in memory. */
  resetForTests(): void {
    this.docs.clear()
    this.totalChars = 0
    this.loaded = null
    this.loadedFromCache = false
    this.builtThisProcess = false
    this.building = false
    this.dirty = false
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }
}
