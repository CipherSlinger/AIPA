/**
 * Process-wide handle to the dream service.
 *
 * The IPC layer creates the service once; the bridge wiring is registered
 * earlier/later depending on the handler, so it calls these thin hooks rather
 * than holding a second reference to the service.
 */
import type { DreamEngine } from './dream-types'
import type { DreamService } from './dream-service'

let service: DreamService | null = null

export function setDreamService(next: DreamService | null): void {
  service = next
}

export function getDreamService(): DreamService | null {
  return service
}

export function dreamNoteTurnStart(bridgeId: string, cwd?: string): void {
  service?.noteTurnStart(bridgeId, cwd)
}

export function dreamNoteTurnEnd(
  bridgeId: string,
  sessionId: string | null,
  options: { success: boolean; engine: DreamEngine; cwd?: string },
): void {
  service?.noteTurnEnd(bridgeId, sessionId, options)
}

export function dreamNoteTurnCancelled(bridgeId: string): void {
  service?.noteTurnCancelled(bridgeId)
}
