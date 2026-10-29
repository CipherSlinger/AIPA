/**
 * The truth about the global shortcuts AIPA tried to claim at launch.
 *
 * Registration happens exactly once, in `index.ts`'s `whenReady` handler; this
 * module only remembers what the OS answered. Nothing here retries, and nothing
 * here may advertise a chord as available unless the OS accepted it. The
 * renderer's Settings panel and the shortcut cheatsheet read this snapshot
 * instead of guessing from the documentation.
 *
 * The two chords/labels that also appear in UI copy live here so the snapshot
 * and the surfaces that register or display them cannot drift apart.
 */
import type { SummonChordChoice } from './summon'

/** The chord registered for the clipboard quick action. */
export const CLIPBOARD_QUICK_ACTION_CHORD = 'Ctrl+Shift+G'

/**
 * The label of the `View → …` menu item that always brings AIPA forward. It is
 * the fallback when another application owns every summon chord, so the
 * snapshot and the menu must show the same words.
 */
export const SHOW_AIPA_MENU_LABEL = {
  en: 'Show AIPA',
  zh: '显示 AIPA',
} as const

export function showAipaMenuLabel(isZh: boolean): string {
  return isZh ? SHOW_AIPA_MENU_LABEL.zh : SHOW_AIPA_MENU_LABEL.en
}

export interface ShortcutAttemptData {
  chord: string
  claimed: boolean
}

/**
 * What the renderer is shown. `attempts` is every chord tried for the summon
 * action, in order; `chord` is the one that won, or null when none did.
 *
 * An empty `attempts` list with a null chord means registration has not run
 * yet — the renderer treats that as "unknown", not as "unavailable".
 */
export interface ShortcutStatusSnapshot {
  summon: {
    chord: string | null
    attempts: ShortcutAttemptData[]
  }
  clipboard: {
    chord: string
    registered: boolean
  }
  menuFallback: {
    label: string
    available: true
  }
}

let summonChoice: SummonChordChoice | null = null
let clipboardRegistered = false

/** Called by main with exactly the result `claimSummonChord` produced. */
export function recordSummonRegistration(choice: SummonChordChoice): void {
  summonChoice = {
    chord: choice.chord,
    attempts: choice.attempts.map(attempt => ({ chord: attempt.chord, claimed: attempt.claimed })),
  }
}

/** Called by main with exactly the boolean `globalShortcut.register` returned. */
export function recordClipboardRegistration(registered: boolean): void {
  clipboardRegistered = registered
}

/**
 * A structured, honest snapshot. `isZh` selects the same menu label the menu
 * itself renders, rather than a second translation that could disagree.
 */
export function shortcutStatusSnapshot(options: { isZh: boolean }): ShortcutStatusSnapshot {
  return {
    summon: {
      chord: summonChoice ? summonChoice.chord : null,
      attempts: summonChoice
        ? summonChoice.attempts.map(attempt => ({ chord: attempt.chord, claimed: attempt.claimed }))
        : [],
    },
    clipboard: {
      chord: CLIPBOARD_QUICK_ACTION_CHORD,
      registered: clipboardRegistered,
    },
    menuFallback: {
      label: showAipaMenuLabel(options.isZh),
      available: true,
    },
  }
}
