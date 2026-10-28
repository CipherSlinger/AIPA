/**
 * Session-scoped model overrides.
 *
 * Personas are bound per session and prompt assembly reads the model from that
 * binding. The header model picker used to write only `prefs.model`, so in a
 * persona conversation it changed the global default and the badge while every
 * turn kept running on the persona's model and provider — the UI lied.
 *
 * An explicit pick now records an override for *this* conversation. It outranks
 * both the persona and the global default, and clearing it falls back to the
 * persona's model. Storage mirrors the persona binding
 * (`aipa:session-persona:<id>`): an in-memory store field for the live
 * conversation, a localStorage record once the session has an id, and the tab
 * snapshot so switching tabs does not lose it.
 */
import type { AppPrefs } from '../types/app.types'

export function sessionModelStorageKey(sessionId: string): string {
  return `aipa:session-model:${sessionId}`
}

/** Read the persisted override, tolerating a profile where localStorage is off. */
export function readSessionModelOverride(sessionId: string): string | undefined {
  try {
    return localStorage.getItem(sessionModelStorageKey(sessionId)) || undefined
  } catch {
    return undefined
  }
}

/**
 * The model a turn actually runs on.
 *
 * Deliberately uses `||` rather than `??`: an empty string is "not set" here,
 * and the persona/global fallbacks are the documented behaviour.
 */
export function resolveEffectiveModel(
  globalModel: string,
  personaModel: string | undefined,
  override: string | undefined,
): string {
  return override || personaModel || globalModel
}

/** The model of the persona currently bound to this session, if it still exists. */
export function personaModelOf(prefs: AppPrefs, sessionPersonaId: string | undefined): string | undefined {
  if (!sessionPersonaId) return undefined
  return (prefs.personas || []).find((p) => p.id === sessionPersonaId)?.model
}
