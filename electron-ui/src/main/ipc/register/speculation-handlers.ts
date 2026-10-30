import { createLogger } from '../../utils/logger'
import { speculationManager, isSafeToSpeculate } from '../../pty/speculation-bridge'
import { resolveAuxiliaryEngine } from '../../llm/auxiliary-engine'
import { safeHandle } from './safe-handle'

const log = createLogger('ipc')

// ----------------------------------------
// Speculation handlers (Iteration 489)
// ----------------------------------------
export function registerSpeculationHandlers(): void {
  // Check if a prompt is safe to speculate on
  safeHandle('speculation:isSafe', (_e, { prompt }: { prompt: string }) => {
    return isSafeToSpeculate(prompt)
  })

  // Start a speculation turn — resolves with SpeculationResult when done
  safeHandle('speculation:run', async (
    _e,
    { id, prompt, cwd, model, env }: {
      id: string
      prompt: string
      cwd: string
      model: string
      env: Record<string, string>
    }
  ) => {
    if (!isSafeToSpeculate(prompt)) {
      return { id, error: 'unsafe_prompt' }
    }
    // Speculation executes the guessed prompt in an isolated overlay using the
    // legacy CLI's `--print`/`--skip-permissions` loop. Codex's app-server has
    // no equivalent, and running the guess on the Codex engine would spend the
    // user's quota on a message they never sent. Off is the honest state on
    // every other engine (the hook already treats an error as "idle").
    const engine = resolveAuxiliaryEngine()
    if (engine.kind !== 'claude') {
      return { id, error: 'engine_unavailable' }
    }
    // The resolved engine's credentials must reach the child; renderer-provided
    // vars still win, mirroring how chat routing passes its env.
    const effectiveEnv = { ...engine.env, ...(env || {}) }
    // Abort any previous speculation with the same id
    speculationManager.abort(id)
    const bridge = speculationManager.create(id)
    try {
      const result = await bridge.run(prompt, cwd, model, effectiveEnv)
      speculationManager.remove(id)
      return result
    } catch (err) {
      speculationManager.remove(id)
      log.warn('Speculation run error:', String(err))
      return { id, error: String(err) }
    }
  })

  // Accept: merge overlay files back to real cwd
  safeHandle('speculation:accept', (_e, { id }: { id: string }) => {
    const bridge = speculationManager.get(id)
    if (!bridge) return { merged: [] }
    // The merge target is the cwd the speculation was started for, held by the
    // main process — never a path the renderer supplies at accept time.
    const merged = bridge.mergeToReal()
    speculationManager.remove(id)
    return { merged }
  })

  // Reject: discard overlay
  safeHandle('speculation:reject', (_e, { id }: { id: string }) => {
    speculationManager.abort(id)
    return { ok: true }
  })

  // Abort a running speculation
  safeHandle('speculation:abort', (_e, { id }: { id: string }) => {
    speculationManager.abort(id)
    return { ok: true }
  })
}
