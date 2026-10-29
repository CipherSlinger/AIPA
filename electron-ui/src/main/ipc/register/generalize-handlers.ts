/**
 * Turn a stored conversation into a workflow draft or a SKILL.md draft.
 *
 * A workflow draft and a SKILL.md body are two questions asked of the same
 * transcript, answered by the same read-only turn. They therefore share one
 * in-flight controller, one generation counter and one cancel path: with a
 * slot each, a workflow draft and a skill draft could both hold a model turn
 * at once, and a cancel aimed at one dialog would leave the other running
 * invisibly. Keeping the dance in one module is what makes that a property of
 * the code rather than a rule two handlers have to remember.
 */
import { ipcMain } from 'electron'
import { createLogger } from '../../utils/logger'
import { loadSession as loadClaudeSession } from '../../sessions/session-reader'
import { loadSession as loadCodexSession } from '../../codex/codex-session-reader'
import {
  buildWorkflowDigest,
  buildWorkflowPrompt,
  normalizeGeneralizeLocale,
  parseWorkflowDraft,
} from '../../sessions/workflow-generalize'
import type { WorkflowDigestMeta } from '../../sessions/workflow-generalize'
import { buildSkillPrompt, parseSkillDraft } from '../../sessions/skill-generalize'
import { getPref } from '../../config/config-manager'
import { isValidSessionId } from '../../utils/validate'
import { runInternalTurn } from './cli/internal-turns'

const log = createLogger('ipc:session')

// One generalisation at a time, process-wide — workflow and skill share this
// slot. The limit is the machine's, not the artefact's: the workflow and skill
// dialogs each hold at most one model turn, and two dialogs must never both
// hold one while the other queues behind it. Unlike the ask overlay (which
// rejects a second question as "busy"), a second request here *supersedes* the
// first: a review window can be reopened on another conversation, and waiting
// up to 90 s for a draft nobody will see is worse than aborting it. The
// generation counter makes the older handler's `finally` unable to free the
// slot the newer one already owns.
let workflowGeneralizeInFlight = false
let workflowGeneralizeAbort: AbortController | null = null
let workflowGeneralizeGeneration = 0

function cancelGeneralize(): void {
  workflowGeneralizeGeneration++
  workflowGeneralizeAbort?.abort()
  workflowGeneralizeAbort = null
  workflowGeneralizeInFlight = false
}

type GeneralizeErrorCode =
  | 'missing_session'
  | 'empty_transcript'
  | 'not_procedural'
  | 'invalid_draft'
  | 'timeout'
  | 'failed'
  | 'aborted'

type GeneralizeParse<T> =
  | { ok: true; draft: T }
  | { ok: false; error: 'not_procedural'; reason?: string }
  | { ok: false; error: 'invalid_draft' }

async function generalizeFromSession<T>(opts: {
  /** Log prefix; also names the artefact in the log. */
  channel: string
  internalTag: string
  input: unknown
  buildPrompt: (
    digest: string,
    context: { locale: 'en' | 'zh-CN'; title: string | null; meta: WorkflowDigestMeta },
  ) => string
  parse: (text: string, fallbackTitle: string | null) => GeneralizeParse<T>
}): Promise<
  | { ok: true; draft: T; meta: WorkflowDigestMeta }
  | { ok: false; error: GeneralizeErrorCode; reason?: string }
> {
  try {
    const raw = opts.input && typeof opts.input === 'object' && !Array.isArray(opts.input)
      ? opts.input as { sessionId?: unknown; locale?: unknown; title?: unknown }
      : {}
    const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : ''
    // `loadSession` itself refuses an unusable id; checking here keeps the
    // "no session" answer distinct from "session exists but has no turns".
    if (!sessionId || !isValidSessionId(sessionId)) return { ok: false, error: 'missing_session' }

    let messages: Array<Record<string, unknown>>
    try {
      // Codex is the primary engine, and its transcripts live in Codex's own
      // rollout format. Both readers normalise to the same transcript shape
      // (`type`, `message.content`, `tool_use` blocks), so the digest and the
      // parsers below do not care which engine wrote the conversation — but
      // asking only the Claude reader would answer "no stored transcript" for
      // half of the app's history. Codex first, as `session:load` does.
      const codexMessages = loadCodexSession(sessionId)
      messages = (codexMessages.length > 0
        ? codexMessages
        : loadClaudeSession(sessionId)) as Array<Record<string, unknown>>
    } catch {
      // A read failure is reported as a missing session rather than leaking a
      // path or an fs error across IPC.
      return { ok: false, error: 'missing_session' }
    }
    if (messages.length === 0) return { ok: false, error: 'missing_session' }

    const { digest, meta } = buildWorkflowDigest(messages)
    if (meta.turnsUsed === 0) return { ok: false, error: 'empty_transcript' }

    const locale = normalizeGeneralizeLocale(typeof raw.locale === 'string' ? raw.locale : undefined)
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null
    const prompt = opts.buildPrompt(digest, { locale, title, meta })

    // Newest wins across both kinds: abort the turn this one replaces, then
    // take the slot. The digest above is synchronous, so no other invoke can
    // interleave here.
    if (workflowGeneralizeInFlight) workflowGeneralizeAbort?.abort()
    const generation = ++workflowGeneralizeGeneration
    const controller = new AbortController()
    workflowGeneralizeAbort = controller
    workflowGeneralizeInFlight = true

    try {
      const result = await runInternalTurn({
        prompt,
        timeoutMs: 90_000,
        internalTag: opts.internalTag,
        // The draft must come from the digest alone; a read-only internal
        // turn must not reach for tools either.
        answerOnly: true,
        cwd: getPref('workingDir'),
      }, controller.signal)

      if (controller.signal.aborted || workflowGeneralizeGeneration !== generation) {
        return { ok: false, error: 'aborted' }
      }
      if (!result.success) {
        const code: GeneralizeErrorCode = result.error === 'aborted'
          ? 'aborted'
          : /timed out/i.test(result.error || '') ? 'timeout' : 'failed'
        // Error code only: `result.error` can quote model output, and the
        // prompt itself is transcript text.
        log.warn(`${opts.channel} ${code}`)
        return { ok: false, error: code }
      }

      const parsed = opts.parse(result.text || '', title)
      if (!parsed.ok) {
        if (parsed.error === 'not_procedural') {
          return parsed.reason
            ? { ok: false, error: 'not_procedural', reason: parsed.reason }
            : { ok: false, error: 'not_procedural' }
        }
        log.warn(`${opts.channel} invalid_draft`)
        return { ok: false, error: 'invalid_draft' }
      }
      return { ok: true, draft: parsed.draft, meta }
    } finally {
      // A superseding call already owns the state; only the current
      // generation may hand the slot back.
      if (workflowGeneralizeGeneration === generation) {
        workflowGeneralizeInFlight = false
        if (workflowGeneralizeAbort === controller) workflowGeneralizeAbort = null
      }
    }
  } catch {
    // Code only: this path can quote the prompt or the model's answer, and
    // neither belongs in the log.
    log.warn(`${opts.channel} failed`)
    return { ok: false, error: 'failed' }
  }
}

export function registerGeneralizeHandlers(): void {
  ipcMain.handle('session:generalizeWorkflowCancel', (): void => cancelGeneralize())

  ipcMain.handle('session:generalizeWorkflow', async (
    _e: Electron.IpcMainInvokeEvent,
    input: unknown,
  ) => generalizeFromSession({
    channel: 'session:generalizeWorkflow',
    internalTag: 'generalize-workflow',
    input,
    buildPrompt: (digest, context) => buildWorkflowPrompt(digest, context),
    parse: (text, fallbackTitle) => parseWorkflowDraft(text, { fallbackTitle }),
  }))

  // ── Generalise a stored conversation into a SKILL.md draft ──
  //
  // The same read-only turn, asked for a markdown skill body instead: when to
  // use it, steps, checks, pitfalls, with placeholders where that run's own
  // values were. Nothing is installed; the renderer reviews the body and the
  // installer adds the frontmatter.
  ipcMain.handle('session:generalizeSkillCancel', (): void => cancelGeneralize())

  ipcMain.handle('session:generalizeSkill', async (
    _e: Electron.IpcMainInvokeEvent,
    input: unknown,
  ) => generalizeFromSession({
    channel: 'session:generalizeSkill',
    internalTag: 'generalize-skill',
    input,
    buildPrompt: (digest, context) => buildSkillPrompt(digest, context),
    parse: (text, fallbackTitle) => parseSkillDraft(text, { fallbackTitle }),
  }))
}
