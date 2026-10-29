/**
 * "Ask AIPA about your history": local retrieval first, then one private turn
 * on the engine this profile can authenticate with.
 *
 * One ask at a time, process-wide. The digest is a few thousand characters and
 * the turn is read-only, but two concurrent asks would fight over each
 * reader's search epoch (the newer call cancels the older one) and produce an
 * empty digest for whoever lost.
 */
import { ipcMain } from 'electron'
import { createLogger } from '../../utils/logger'
import {
  historyAskStatus,
  historyIndexBuilding,
  collectHistoryDigest,
  buildAskPrompt,
  sanitizeAskHistory,
} from '../../sessions/ask-history'
import { parseScopeSessionIds } from '../../sessions/ask-scope'
import { getPref } from '../../config/config-manager'
import { runInternalTurn } from './cli/internal-turns'

const log = createLogger('ipc:session')

let askHistoryInFlight = false
// Abort plumbing for that single ask. `generation` keeps a cancelled handler's
// `finally` from clearing the state of the ask that replaced it: cancelling
// hands the slot back immediately, so a new question may already be running
// by the time the aborted one unwinds.
let askHistoryAbort: AbortController | null = null
let askHistoryGeneration = 0

export function registerAskHistoryHandlers(): void {
  // ── Ask AIPA about your history ──
  //
  // A question from the global search overlay: local retrieval first, then one
  // private turn on the engine this profile can authenticate with. The prompt
  // is never logged and the result carries only the answer plus the cited
  // sources; everything the model saw stays in this process.
  ipcMain.handle('session:askHistoryStatus', (): { available: boolean; reason?: string } => {
    return historyAskStatus()
  })

  // The overlay unmounts mid-run when it is closed. Without this the handler
  // kept the slot "busy" until the 90 s turn timed out, and the next question
  // was rejected even though nobody would ever see the old answer.
  ipcMain.handle('session:askHistoryCancel', (): void => {
    askHistoryGeneration++
    askHistoryAbort?.abort()
    askHistoryAbort = null
    askHistoryInFlight = false
  })

  ipcMain.handle('session:askHistory', async (
    event: Electron.IpcMainInvokeEvent,
    { question, locale, requestId, history, scopeSessionIds }: {
      question: string
      locale?: string
      requestId?: string
      /** Last exchange(s) from the overlay; validated below, never trusted. */
      history?: unknown
      /** Session ids the evidence must come from; validated below, never trusted. */
      scopeSessionIds?: unknown
    },
  ): Promise<{
    ok: boolean
    answer?: string
    sources?: Awaited<ReturnType<typeof collectHistoryDigest>>['sources']
    /** A zero-source answer was answered while an index was still building. */
    indexing?: boolean
    error?: string
    available?: boolean
    reason?: string
  }> => {
    const trimmed = typeof question === 'string' ? question.trim() : ''
    if (!trimmed || trimmed.length > 500) return { ok: false, error: 'invalid_question' }

    // `null` means unscoped (search everything); an array — even an empty one —
    // means the caller named a scope. Ids are never logged: they identify this
    // machine's conversations.
    const parsedScope = parseScopeSessionIds(scopeSessionIds)
    const allowed = parsedScope ? new Set(parsedScope.ids) : undefined

    const status = historyAskStatus()
    if (!status.available) return { ok: false, available: false, reason: status.reason }
    if (askHistoryInFlight) return { ok: false, error: 'busy' }

    const generation = ++askHistoryGeneration
    const controller = new AbortController()
    askHistoryAbort = controller
    askHistoryInFlight = true
    let progressTimer: ReturnType<typeof setInterval> | null = null
    try {
      const normalizedLocale = /^zh/i.test(locale || '') ? 'zh-CN' : 'en'
      let { sources, digest, indexing } = await collectHistoryDigest(trimmed, {
        locale: normalizedLocale,
        signal: controller.signal,
        allowedSessionIds: allowed,
      })
      if (controller.signal.aborted) return { ok: false, error: 'aborted' }

      // A cold index answers from whatever is already extracted and builds the
      // rest in the background, so zero hits can mean "not indexed yet". Wait
      // briefly (polling, so a cancel is honoured) and ask once more before
      // telling the user the history is silent.
      if (sources.length === 0 && historyIndexBuilding()) {
        const deadline = Date.now() + 2_000
        while (!controller.signal.aborted && Date.now() < deadline && historyIndexBuilding()) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(done, 150)
            function done(): void {
              clearTimeout(timer)
              controller.signal.removeEventListener('abort', done)
              resolve()
            }
            controller.signal.addEventListener('abort', done, { once: true })
          })
        }
        if (controller.signal.aborted) return { ok: false, error: 'aborted' }
        // The retry must carry the same scope. Forgetting it here would answer
        // a department question from the whole history, and the answer would
        // look exactly like a valid one.
        const retry = await collectHistoryDigest(trimmed, {
          locale: normalizedLocale,
          signal: controller.signal,
          allowedSessionIds: allowed,
        })
        sources = retry.sources
        digest = retry.digest
        indexing = retry.indexing
        if (controller.signal.aborted) return { ok: false, error: 'aborted' }
      }

      // Nothing matched. Skipping the turn is honest and saves a model call:
      // the renderer shows its own "no matching history" copy, or an
      // "indexing" note when `indexing` says the search was provisional.
      if (sources.length === 0) {
        return { ok: true, answer: '', sources: [], indexing }
      }

      // The overlay paints tokens as they arrive instead of spinning for up to
      // 90 s. The buffer is filled by `runInternalTurn`'s tap and pushed on a
      // timer so a fast model cannot flood the IPC channel with one event per
      // token. Nothing is pushed for callers that did not ask for progress.
      let draft = ''
      if (typeof requestId === 'string' && requestId) {
        let lastSent = ''
        progressTimer = setInterval(() => {
          // A cancelled or superseded ask must never paint the overlay.
          if (askHistoryGeneration !== generation) return
          if (event.sender.isDestroyed()) return
          // The answer is ≤200 words; this only guards a runaway generation.
          const text = draft.slice(0, 12_000)
          if (text === lastSent) return
          lastSent = text
          try {
            event.sender.send('session:askHistoryProgress', { requestId, text })
          } catch {
            // The renderer went away between the check and the send.
          }
        }, 120)
        progressTimer.unref?.()
      }

      // A stale renderer may still send the old shape; sanitize rather than
      // reject, so a follow-up never fails because of its own context.
      const safeHistory = sanitizeAskHistory(history)
      const result = await runInternalTurn({
        prompt: buildAskPrompt(trimmed, digest, sources, normalizedLocale, safeHistory, parsedScope !== null),
        timeoutMs: 90_000,
        internalTag: 'ask-history',
        // Answer from the excerpts alone; a read-only turn must not reach for
        // tools (the Claude bridge needs the empty tool list for that).
        answerOnly: true,
        cwd: getPref('workingDir'),
      }, controller.signal, (text) => {
        draft = text
      })

      if (!result.success) {
        const code = result.error === 'aborted'
          ? 'aborted'
          : /timed out/i.test(result.error || '') ? 'timeout' : 'failed'
        if (code !== 'aborted') {
          log.warn(`session:askHistory ${code}:`, String(result.error || 'unknown').slice(0, 300))
        }
        return { ok: false, error: code }
      }
      const answer = (result.text || '').trim()
      if (!answer) return { ok: false, error: 'empty_response' }
      return { ok: true, answer, sources }
    } catch (err) {
      log.warn('session:askHistory error:', String(err).slice(0, 300))
      return { ok: false, error: 'failed' }
    } finally {
      // The timer must not outlive the handler: after the invoke settles the
      // renderer's final answer supersedes every progress event.
      if (progressTimer) clearInterval(progressTimer)
      // A cancellation already handed the slot to the next ask: only the
      // handler that still owns this generation may clear the state.
      if (askHistoryGeneration === generation) {
        askHistoryInFlight = false
        if (askHistoryAbort === controller) askHistoryAbort = null
      }
    }
  })
}
