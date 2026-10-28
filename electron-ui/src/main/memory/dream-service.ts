/**
 * Orchestrates AIPA's dream pass: activity tracking, idle/eligibility checks,
 * one private model turn, validation, and the append-only file it writes.
 *
 * The service is a factory with injected clock, transcript reader and model
 * runner. The app wires the real ones; a harness can drive the same code with
 * a scratch memory root and a stub model, which is how the trigger/dedupe/
 * delete behaviour is verified without touching the user's `~/.claude`.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { isValidSessionId } from '../utils/validate'
import {
  buildDreamPrompt,
  buildTranscriptDigest,
  collectExistingStatements,
  normalizeMemoryStatement,
  parseDreamCandidates,
  renderDreamFile,
  selectDreamCandidates,
} from './dream-consolidator'
import {
  cwdToProjectSlug,
  dreamProjectMemoryDir,
  dreamProjectsRoot,
  localDate,
  localTimeSlug,
} from './dream-paths'
import { loadDreamStore, saveDreamStore } from './dream-store'
import {
  DREAM_CHECK_INTERVAL_MS,
  DREAM_IDLE_MS,
  DREAM_MIN_NEW_TURNS,
  DREAM_PASS_RETENTION,
  DREAM_RETRY_MS,
  DREAM_STARTUP_DELAY_MS,
  DREAM_SUPPRESSED_RETENTION,
  DREAM_TURN_TIMEOUT_MS,
} from './dream-types'
import type {
  DreamEngine,
  DreamPassRecord,
  DreamPassStatus,
  DreamSessionState,
  DreamStoreData,
} from './dream-types'
import type { DreamTranscriptReader } from './dream-transcript'

const log = createLogger('dream-service')

export interface DreamTurnResult {
  success: boolean
  text?: string
  error?: string
}

export interface DreamServiceDeps {
  /** App userData path; never inside a memory tier. */
  storePath: string
  /** Usually `<home>/.claude`. */
  claudeDir: string
  /**
   * Write a new consolidation file. The app wires the validated atomic writer
   * from memory-manager so the memory:list cache is invalidated immediately.
   */
  writeMemoryFile(filePath: string, content: string): void
  deleteMemoryFile(filePath: string): void
  isEnabled(): boolean
  runTurn(prompt: string, options: { timeoutMs: number; cwd?: string }): Promise<DreamTurnResult>
  readTranscript: DreamTranscriptReader
  getPersonalMemories(): string[]
  emitPass?(record: DreamPassRecord): void
  now?(): number
}

export interface DreamRunNowResult {
  ok: boolean
  record?: DreamPassRecord
  error?: string
}

export interface DreamServiceStatus {
  enabled: boolean
  running: boolean
  pendingSessions: number
  passes: number
}

export interface DreamService {
  noteTurnStart(bridgeId: string, cwd?: string): void
  noteTurnEnd(bridgeId: string, sessionId: string | null, options: {
    success: boolean
    engine: DreamEngine
    cwd?: string
  }): void
  noteTurnCancelled(bridgeId: string): void
  checkDue(): Promise<DreamPassRecord | null>
  runNow(sessionId?: string): Promise<DreamRunNowResult>
  listPasses(): DreamPassRecord[]
  deletePass(passId: string): { ok: boolean; error?: string }
  getStatus(): DreamServiceStatus
  start(): void
  stop(): void
}

/** A state file path is not a security boundary; the pass id lookup is. */
function isConsolidationFilePath(claudeDir: string, filePath: string): boolean {
  const root = dreamProjectsRoot(claudeDir)
  const resolved = path.resolve(filePath)
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false
  const parts = relative.split(path.sep)
  return parts.length === 3 &&
    parts[1] === 'memory' &&
    parts[2].startsWith('dream-') &&
    parts[2].endsWith('.md')
}

function isUnavailable(error: string | undefined): boolean {
  return /no authenticated engine|not authenticated|missing (?:api key|credentials)|unauthori[sz]ed|401/i
    .test(error || '')
}

export function createDreamService(deps: DreamServiceDeps): DreamService {
  const clock = deps.now ?? (() => Date.now())
  const store: DreamStoreData = loadDreamStore(deps.storePath)

  /** Bridges with a user turn in flight. A pass never overlaps one. */
  const activeBridges = new Set<string>()
  const bridgeCwd = new Map<string, string>()
  let running = false
  let timer: NodeJS.Timeout | null = null
  let kickoff: NodeJS.Timeout | null = null

  function persist(): void {
    // Keep the state file bounded: recent sessions plus anything still
    // awaiting consolidation. An old session with no pending turns is only
    // useful for the console's pass log, which lives independently.
    const all = Object.values(store.sessions)
      .sort((a, b) => b.lastActivity - a.lastActivity)
    const keep = new Set(
      all.slice(0, 200)
        .map(session => session.sessionId),
    )
    for (const session of all) {
      if (session.turnsSeen > session.turnsConsolidated) keep.add(session.sessionId)
    }
    for (const sessionId of Object.keys(store.sessions)) {
      if (!keep.has(sessionId)) delete store.sessions[sessionId]
    }
    store.passes = store.passes
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, DREAM_PASS_RETENTION)
    store.suppressed = store.suppressed.slice(-DREAM_SUPPRESSED_RETENTION)
    saveDreamStore(deps.storePath, store)
  }

  function makeRecord(input: {
    sessionId: string
    projectSlug: string
    trigger: 'idle' | 'manual'
    status: DreamPassStatus
    note?: string
    filePath?: string
    entryCount?: number
    statements?: string[]
  }): DreamPassRecord {
    return {
      id: `dream-${clock()}-${Math.random().toString(36).slice(2, 8)}`,
      status: input.status,
      createdAt: clock(),
      sessionId: input.sessionId,
      projectSlug: input.projectSlug,
      filePath: input.filePath ?? '',
      entryCount: input.entryCount ?? 0,
      statements: input.statements ?? [],
      trigger: input.trigger,
      note: input.note,
    }
  }

  function recordPass(record: DreamPassRecord): void {
    store.passes.unshift(record)
    persist()
    try {
      deps.emitPass?.(record)
    } catch (err) {
      log.warn('Could not emit dream pass:', String(err))
    }
  }

  function writePassFile(input: {
    projectMemoryDir: string
    baseName: string
    content: string
  }): string {
    fs.mkdirSync(input.projectMemoryDir, { recursive: true })
    // The model writer is `wx`: a name collision is impossible in practice
    // (seconds + random id), but retrying keeps a stray file from becoming a
    // failed pass.
    for (let attempt = 1; attempt <= 50; attempt++) {
      const fileName = attempt === 1 ? `${input.baseName}.md` : `${input.baseName}-${attempt}.md`
      const filePath = path.join(input.projectMemoryDir, fileName)
      if (fs.existsSync(filePath)) continue
      try {
        deps.writeMemoryFile(filePath, input.content)
        return filePath
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        if (code === 'EEXIST') continue
        throw err
      }
    }
    throw new Error('Could not allocate a consolidation file name')
  }

  async function runPass(
    state: DreamSessionState,
    trigger: 'idle' | 'manual',
  ): Promise<DreamPassRecord | null> {
    if (!deps.isEnabled()) return null
    if (running) return null
    running = true
    const attemptAt = clock()
    const consolidatedBefore = state.turnsConsolidated
    state.lastAttemptAt = attemptAt

    try {
      const transcript = deps.readTranscript({
        sessionId: state.sessionId,
        engine: state.engine,
        cwd: state.cwd,
        projectSlug: state.projectSlug,
      })

      if (!transcript) {
        persist()
        if (trigger === 'manual') throw new Error('transcript-unavailable')
        return null
      }

      // The transcript is the source of truth for how many turns exist; a
      // crash mid-turn may have skipped an activity increment.
      state.turnsSeen = Math.max(state.turnsSeen, transcript.userTurnCount)
      const projectSlug = transcript.projectSlug || state.projectSlug ||
        (transcript.cwd ? cwdToProjectSlug(transcript.cwd) : '')
      if (transcript.cwd) state.cwd = transcript.cwd
      if (projectSlug) state.projectSlug = projectSlug

      if (!projectSlug) {
        persist()
        if (trigger === 'manual') throw new Error('project-unavailable')
        return null
      }

      const digest = buildTranscriptDigest(transcript.turns)
      if (!digest.text) {
        state.turnsConsolidated = state.turnsSeen
        const record = makeRecord({
          sessionId: state.sessionId,
          projectSlug,
          trigger,
          status: 'empty',
          note: 'empty-transcript',
        })
        recordPass(record)
        return record
      }

      const projectMemoryDir = dreamProjectMemoryDir(deps.claudeDir, projectSlug)
      const existing = collectExistingStatements({
        dirs: [
          projectMemoryDir,
          path.join(deps.claudeDir, 'memory'),
        ],
        docs: [
          path.join(deps.claudeDir, 'MEMORY.md'),
          ...(transcript.cwd ? [path.join(transcript.cwd, '.claude', 'MEMORY.md')] : []),
        ],
        personal: deps.getPersonalMemories(),
      })

      const prompt = buildDreamPrompt({
        digest: digest.text,
        existingStatements: existing,
        includedTurns: digest.includedTurns,
      })

      let result: DreamTurnResult
      try {
        result = await deps.runTurn(prompt, {
          timeoutMs: DREAM_TURN_TIMEOUT_MS,
          cwd: transcript.cwd || state.cwd,
        })
      } catch (err) {
        result = { success: false, error: String(err) }
      }

      if (!result.success) {
        if (isUnavailable(result.error)) {
          // One notice per outage: retries every six hours must not turn the
          // console into a wall of "model unavailable" rows.
          const lastNotice = store.unavailableNotifiedAt ?? 0
          if (clock() - lastNotice < DREAM_RETRY_MS) {
            persist()
            // A user who just pressed the button deserves the real reason even
            // though the outage was already reported; returning a synthetic
            // (unrecorded) row avoids a second log entry or toast.
            if (trigger === 'manual') {
              return makeRecord({
                sessionId: state.sessionId,
                projectSlug,
                trigger,
                status: 'unavailable',
                note: 'model-unavailable',
              })
            }
            return null
          }
          store.unavailableNotifiedAt = clock()
          const record = makeRecord({
            sessionId: state.sessionId,
            projectSlug,
            trigger,
            status: 'unavailable',
            note: 'model-unavailable',
          })
          recordPass(record)
          return record
        }

        // Do not advance turnsConsolidated: a transient failure must be
        // retried, not silently marked as reviewed.
        const record = makeRecord({
          sessionId: state.sessionId,
          projectSlug,
          trigger,
          status: 'error',
          note: 'engine-error',
        })
        recordPass(record)
        return record
      }

      // A working engine clears the outage latch, so the next outage is
      // announced once again instead of being suppressed forever.
      store.unavailableNotifiedAt = undefined

      const parsed = parseDreamCandidates(result.text ?? '')
      if (parsed.candidates.length === 0) {
        state.turnsConsolidated = state.turnsSeen
        const status: DreamPassStatus =
          parsed.hadOutput && !parsed.explicitEmpty ? 'junk' : 'empty'
        const note = status === 'junk'
          ? `unparseable-output${parsed.rejected ? `:${parsed.rejected}` : ''}`
          : (parsed.secretSkipped > 0 ? 'only-secrets' : 'nothing-new')
        const record = makeRecord({
          sessionId: state.sessionId,
          projectSlug,
          trigger,
          status,
          note,
        })
        recordPass(record)
        return record
      }

      const deduped = selectDreamCandidates(
        parsed.candidates,
        existing,
        store.suppressed,
      )

      if (deduped.selected.length === 0) {
        state.turnsConsolidated = state.turnsSeen
        const record = makeRecord({
          sessionId: state.sessionId,
          projectSlug,
          trigger,
          status: 'empty',
          note: `duplicates:${deduped.duplicates + deduped.suppressed}`,
        })
        recordPass(record)
        return record
      }

      const passId = `dream-${clock()}-${Math.random().toString(36).slice(2, 8)}`
      const date = localDate(clock())
      const timeSlug = localTimeSlug(clock())
      const rendered = renderDreamFile({
        sessionId: state.sessionId,
        passId,
        date,
        timeSlug,
        candidates: deduped.selected,
      })
      if (rendered.entries.length === 0) {
        // The character cap is far above a normal pass; if it somehow rejects
        // every entry, record the discard instead of writing an empty file.
        state.turnsConsolidated = state.turnsSeen
        const record = makeRecord({
          sessionId: state.sessionId,
          projectSlug,
          trigger,
          status: 'junk',
          note: 'over-budget',
        })
        recordPass(record)
        return record
      }

      const baseName = `dream-${date}-${timeSlug}-${state.sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'session'}`
      const filePath = writePassFile({
        projectMemoryDir,
        baseName,
        content: rendered.content,
      })

      state.turnsConsolidated = state.turnsSeen
      const record = makeRecord({
        sessionId: state.sessionId,
        projectSlug,
        trigger,
        status: 'written',
        filePath,
        entryCount: rendered.entries.length,
        statements: rendered.entries.map(entry => entry.statement),
      })
      recordPass(record)
      return record
    } finally {
      // Keep the 6h retry throttle only for passes that could not move the
      // session forward. A pass that consolidated its turns (written or
      // correctly empty) must not delay the *next* batch of new turns by six
      // hours — that would make a busy conversation consolidatable once a day.
      state.lastAttemptAt = state.turnsConsolidated > consolidatedBefore
        ? undefined
        : clock()
      running = false
      persist()
    }
  }

  async function checkDue(): Promise<DreamPassRecord | null> {
    if (!deps.isEnabled() || running) return null
    // A user turn in any tab is a hard stop: the pass spawns its own hidden
    // bridge, but the memory it reads must not be a conversation still moving.
    if (activeBridges.size > 0) return null

    const current = clock()
    const due = Object.values(store.sessions)
      .filter(session =>
        session.turnsSeen - session.turnsConsolidated >= DREAM_MIN_NEW_TURNS &&
        current - session.lastActivity >= DREAM_IDLE_MS &&
        (!session.lastAttemptAt || current - session.lastAttemptAt >= DREAM_RETRY_MS),
      )
      .sort((a, b) => a.lastActivity - b.lastActivity)

    for (const session of due) {
      // Re-check after each await: a new user turn may have started while a
      // pass was running, and the next due session must wait.
      if (activeBridges.size > 0) return null
      try {
        const record = await runPass(session, 'idle')
        if (record) return record
      } catch (err) {
        log.warn('Dream pass failed:', String(err))
      }
    }
    return null
  }

  function noteTurnStart(bridgeId: string, cwd?: string): void {
    if (!bridgeId) return
    activeBridges.add(bridgeId)
    if (cwd) bridgeCwd.set(bridgeId, cwd)
  }

  function noteTurnEnd(
    bridgeId: string,
    sessionId: string | null,
    options: { success: boolean; engine: DreamEngine; cwd?: string },
  ): void {
    const cwd = options.cwd || bridgeCwd.get(bridgeId)
    // Only a turn whose start was recorded counts. Slash commands (a bare
    // `/compact`) and any other bridge activity that never called
    // `noteTurnStart` must not inflate the "turns waiting" counter.
    const wasActive = activeBridges.delete(bridgeId)
    bridgeCwd.delete(bridgeId)
    if (!wasActive) return

    // With the feature off, do not even record activity: an off switch should
    // not create a state file or accumulate turns that would fire a catch-up
    // pass the moment it is re-enabled.
    if (!deps.isEnabled()) return

    // A failed turn still happened, but it is not something to consolidate.
    if (!options.success || !sessionId || !isValidSessionId(sessionId)) return

    const existing = store.sessions[sessionId]
    const projectSlug = cwd
      ? cwdToProjectSlug(cwd)
      : (existing?.projectSlug ?? '')
    const state: DreamSessionState = existing ?? {
      sessionId,
      engine: options.engine,
      cwd,
      projectSlug,
      turnsSeen: 0,
      turnsConsolidated: 0,
      lastActivity: clock(),
    }
    state.engine = options.engine
    if (cwd) state.cwd = cwd
    if (projectSlug) state.projectSlug = projectSlug
    state.turnsSeen += 1
    state.lastActivity = clock()
    store.sessions[sessionId] = state
    persist()
  }

  function noteTurnCancelled(bridgeId: string): void {
    activeBridges.delete(bridgeId)
    bridgeCwd.delete(bridgeId)
  }

  async function runNow(sessionId?: string): Promise<DreamRunNowResult> {
    if (!deps.isEnabled()) return { ok: false, error: 'disabled' }
    if (running) return { ok: false, error: 'running' }
    if (activeBridges.size > 0) return { ok: false, error: 'busy' }

    let state: DreamSessionState | undefined
    if (sessionId) {
      if (!isValidSessionId(sessionId)) return { ok: false, error: 'invalid-session' }
      state = store.sessions[sessionId]
      if (!state) {
        state = {
          sessionId,
          projectSlug: '',
          turnsSeen: 0,
          turnsConsolidated: 0,
          lastActivity: clock(),
        }
        store.sessions[sessionId] = state
      }
    } else {
      // Only sessions the user actually chatted in are tracked; automation and
      // internal turns never reach `noteTurnEnd`, so they cannot be selected.
      state = Object.values(store.sessions)
        .sort((a, b) => b.lastActivity - a.lastActivity)[0]
    }
    if (!state) return { ok: false, error: 'no-session' }

    try {
      const record = await runPass(state, 'manual')
      return record ? { ok: true, record } : { ok: false, error: 'nothing-to-do' }
    } catch (err) {
      log.warn('Manual dream pass failed:', String(err))
      return { ok: false, error: String(err) }
    }
  }

  function listPasses(): DreamPassRecord[] {
    return store.passes
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(record => ({ ...record }))
  }

  function deletePass(passId: string): { ok: boolean; error?: string } {
    if (!passId) return { ok: false, error: 'invalid-pass' }
    const index = store.passes.findIndex(record => record.id === passId)
    if (index < 0) return { ok: false, error: 'not-found' }
    const record = store.passes[index]

    if (record.status === 'written' && record.filePath) {
      if (!isConsolidationFilePath(deps.claudeDir, record.filePath)) {
        return { ok: false, error: 'invalid-path' }
      }
      try {
        deps.deleteMemoryFile(record.filePath)
      } catch (err) {
        // The user may have deleted the file by hand already; the pass row is
        // still theirs to remove. Refuse only on a real permission failure.
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          return { ok: false, error: String(err) }
        }
      }
    }

    // Remember the deleted statements so re-running the same conversation
    // cannot resurrect what the user explicitly removed.
    for (const statement of record.statements) {
      const normalized = normalizeMemoryStatement(statement)
      if (normalized) store.suppressed.push(normalized)
    }

    store.passes.splice(index, 1)
    persist()
    return { ok: true }
  }

  function getStatus(): DreamServiceStatus {
    return {
      enabled: deps.isEnabled(),
      running,
      pendingSessions: Object.values(store.sessions)
        .filter(session => session.turnsSeen > session.turnsConsolidated).length,
      passes: store.passes.length,
    }
  }

  function start(): void {
    if (timer) return
    timer = setInterval(() => { void checkDue() }, DREAM_CHECK_INTERVAL_MS)
    timer.unref?.()
    // A pass that became due while the app was closed should not wait a full
    // interval, but it must not race window creation either.
    kickoff = setTimeout(() => { void checkDue() }, DREAM_STARTUP_DELAY_MS)
    kickoff.unref?.()
  }

  function stop(): void {
    if (timer) clearInterval(timer)
    if (kickoff) clearTimeout(kickoff)
    timer = null
    kickoff = null
  }

  return {
    noteTurnStart,
    noteTurnEnd,
    noteTurnCancelled,
    checkDue,
    runNow,
    listPasses,
    deletePass,
    getStatus,
    start,
    stop,
  }
}
