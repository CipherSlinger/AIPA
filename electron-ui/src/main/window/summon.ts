/**
 * Pure decisions behind "summon AIPA from anywhere".
 *
 * A global shortcut cannot be exercised in a test (it needs a real window
 * server and a real keyboard), so the two decisions that can be wrong — which
 * chord to try and what to do to the window before the renderer is told to
 * focus the composer — live here with no Electron import. `index.ts` owns the
 * side effects; the harness bundles this file and tests it for real.
 */

/**
 * Chords to claim, in priority order. Alt+Space is the Windows system menu and
 * Shift+Space is a selection gesture in many editors, so the first choice is
 * the one least likely to collide with ordinary typing. The other two are
 * fallbacks only: a chord another application owns must not collapse into
 * "no hotkey" while an acceptable one is still free.
 */
export const SUMMON_CHORDS = [
  'CommandOrControl+Alt+Space',
  'CommandOrControl+Shift+Space',
  'CommandOrControl+Alt+A',
] as const

export type SummonChord = (typeof SUMMON_CHORDS)[number]

export interface SummonChordAttempt {
  chord: SummonChord
  /** True when the OS accepted this chord. */
  claimed: boolean
}

export interface SummonChordChoice {
  /** The chord that was claimed, or null when every chord was refused. */
  chord: SummonChord | null
  /** Every chord that was tried, including the failed ones before the winner. */
  attempts: SummonChordAttempt[]
}

/**
 * Claim the first chord the OS accepts.
 *
 * `claim` is where the side effect lives — in main it calls
 * `globalShortcut.register`. Keeping the callback outside this module is what
 * makes the fallback order testable. It must stop at the first success: trying
 * a later chord after one is already bound would leave two live accelerators
 * firing the same action.
 */
export function claimSummonChord(claim: (chord: SummonChord) => boolean): SummonChordChoice {
  const attempts: SummonChordAttempt[] = []
  for (const chord of SUMMON_CHORDS) {
    const claimed = claim(chord)
    attempts.push({ chord, claimed })
    if (claimed) return { chord, attempts }
  }
  return { chord: null, attempts }
}

export type SummonWindowAction = 'show' | 'restore' | 'focus'

export interface SummonWindowState {
  visible: boolean
  minimized: boolean
}

/**
 * What to do to the main window before announcing a capture request.
 *
 * `show` alone does not un-minimize a window on Windows, and `focus` on a
 * hidden window is a no-op there too — which is why a minimized window needs
 * the full sequence. A window already on screen only needs focus; the caller
 * must not hide or toggle it, because the hotkey means "bring it to me", not
 * "flip its visibility".
 */
export function summonWindowActions(state: SummonWindowState): SummonWindowAction[] {
  if (state.minimized) return ['show', 'restore', 'focus']
  if (!state.visible) return ['show', 'focus']
  return ['focus']
}
