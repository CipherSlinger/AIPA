// Whether this build can record speech at all.
//
// The Web Speech API is not part of every Chromium build a renderer can end up
// in. The hook used to probe for it inside `toggleSpeech`, which meant the
// toolbar only learned the answer after the user pressed a button that then did
// nothing. Availability is a property of the build, not of a render, so it is
// resolved once here and the caller can decide whether to offer the control at
// all.
//
// No React: this is a lookup over a global, and the harness can hand it a scope.

/** The constructor shape `new SpeechRecognition()` needs. */
export type SpeechRecognitionCtor = new () => SpeechRecognition

export interface SpeechScope {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

/**
 * The first usable constructor in a scope, or null.
 *
 * Both spellings are real: Chromium historically exposed the prefixed name, and
 * a build may carry either, both, or neither.
 */
export function resolveSpeechRecognition(
  scope: SpeechScope | null | undefined,
): SpeechRecognitionCtor | null {
  if (!scope) return null
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function currentScope(): SpeechScope | null {
  if (typeof window === 'undefined') return null
  return window as unknown as SpeechScope
}

/**
 * Probed once at module load. Stable for the life of the renderer, so a button
 * does not appear or disappear between renders.
 */
export const SPEECH_RECOGNITION_SUPPORTED: boolean =
  resolveSpeechRecognition(currentScope()) !== null

/** The constructor to start, or null when this build has none. */
export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  return resolveSpeechRecognition(currentScope())
}
