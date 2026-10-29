/**
 * Pure view model for the global-hotkey status shown in Settings and marked in
 * the shortcut cheatsheet.
 *
 * Registration is attempted once in main; this module only translates that
 * recorded truth into rows. It never turns an unknown snapshot into
 * "available": an unread or failed status is its own state, and a refused
 * chord stays refused. No Electron or React imports, so the harness bundles
 * and tests it for real.
 */

export type ShortcutAvailability = 'available' | 'unavailable' | 'unknown'
export type GlobalShortcutKind = 'summon' | 'clipboard'
export type HotkeyId = GlobalShortcutKind | 'menuFallback'

export interface ShortcutAttemptData {
  chord: string
  claimed: boolean
}

/**
 * Mirrors `ShortcutStatusSnapshot` in `src/main/window/shortcut-status.ts`.
 * `attempts` is empty when registration has not run; that is "unknown", not
 * "unavailable".
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

export type HotkeyTranslate = (key: string, params?: Record<string, string | number>) => string

export interface HotkeyRow {
  id: HotkeyId
  label: string
  /** Display form of the claimed chord; null when no chord was claimed. */
  chord: string | null
  state: ShortcutAvailability
  stateLabel: string
  detail: string
}

const CHORD_ALIASES: Record<string, string> = {
  commandorcontrol: 'Ctrl',
  cmdorctrl: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  cmd: 'Ctrl',
  command: 'Ctrl',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  space: 'Space',
}

/** `CommandOrControl+Alt+Space` → `Ctrl + Alt + Space`, matching the cheatsheet. */
export function formatChord(chord: string): string {
  return chord
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const alias = CHORD_ALIASES[part.toLowerCase()]
      if (alias) return alias
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join(' + ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Guards the IPC boundary. A malformed payload is not a status: callers treat
 * a false return as unknown instead of rendering half a snapshot.
 */
export function isShortcutStatusSnapshot(value: unknown): value is ShortcutStatusSnapshot {
  if (!isRecord(value)) return false
  const summon = value.summon
  if (!isRecord(summon)) return false
  if (!(summon.chord === null || typeof summon.chord === 'string')) return false
  if (!Array.isArray(summon.attempts)) return false
  if (!summon.attempts.every(attempt =>
    isRecord(attempt) && typeof attempt.chord === 'string' && typeof attempt.claimed === 'boolean')) {
    return false
  }
  const clipboard = value.clipboard
  if (!isRecord(clipboard)) return false
  if (typeof clipboard.chord !== 'string' || typeof clipboard.registered !== 'boolean') return false
  const menu = value.menuFallback
  if (!isRecord(menu)) return false
  if (typeof menu.label !== 'string' || menu.available !== true) return false
  return true
}

/**
 * Per-registration availability. Unknown is returned for a missing snapshot,
 * and for the summon action when registration has not run yet (no attempts).
 */
export function shortcutAvailability(
  status: ShortcutStatusSnapshot | null | undefined,
  kind: HotkeyId,
): ShortcutAvailability {
  if (!status) return 'unknown'
  if (kind === 'menuFallback') return status.menuFallback.available === true ? 'available' : 'unavailable'
  if (kind === 'summon') {
    if (status.summon.chord) return 'available'
    return status.summon.attempts.length > 0 ? 'unavailable' : 'unknown'
  }
  return status.clipboard.registered ? 'available' : 'unavailable'
}

function stateLabel(state: ShortcutAvailability, t: HotkeyTranslate): string {
  if (state === 'available') return t('settings.hotkeys.stateAvailable')
  if (state === 'unavailable') return t('settings.hotkeys.stateUnavailable')
  return t('settings.hotkeys.stateUnknown')
}

/**
 * Build the three rows Settings renders. The menu row is included in the
 * unknown path too, because the menu fallback is not a chord registration —
 * only its label is unknown until the snapshot arrives.
 */
export function buildHotkeyRows(
  status: ShortcutStatusSnapshot | null | undefined,
  t: HotkeyTranslate,
): HotkeyRow[] {
  const summonLabel = t('settings.hotkeys.summonLabel')
  const clipboardLabel = t('settings.hotkeys.clipboardLabel')
  const menuLabel = status
    ? t('settings.hotkeys.menuRowLabel', { label: status.menuFallback.label })
    : t('settings.hotkeys.menuRowGenericLabel')

  if (!status) {
    const detail = t('settings.hotkeys.statusUnknownDetail')
    return [
      { id: 'summon', label: summonLabel, chord: null, state: 'unknown', stateLabel: stateLabel('unknown', t), detail },
      { id: 'clipboard', label: clipboardLabel, chord: null, state: 'unknown', stateLabel: stateLabel('unknown', t), detail },
      { id: 'menuFallback', label: menuLabel, chord: null, state: 'unknown', stateLabel: stateLabel('unknown', t), detail },
    ]
  }

  const summonState = shortcutAvailability(status, 'summon')
  const refusedChords = status.summon.attempts
    .filter(attempt => !attempt.claimed)
    .map(attempt => formatChord(attempt.chord))
  const claimedChord = status.summon.chord ? formatChord(status.summon.chord) : null

  let summonDetail: string
  if (summonState === 'available' && claimedChord) {
    summonDetail = refusedChords.length > 0
      ? t('settings.hotkeys.summonFallbackDetail', {
        refused: refusedChords.join(', '),
        chord: claimedChord,
      })
      : t('settings.hotkeys.summonClaimedDetail')
  } else if (summonState === 'unavailable') {
    summonDetail = t('settings.hotkeys.summonNoneDetail', {
      tried: refusedChords.join(', '),
      menuLabel: status.menuFallback.label,
    })
  } else {
    summonDetail = t('settings.hotkeys.summonNotAttemptedDetail')
  }

  const clipboardChord = formatChord(status.clipboard.chord)
  const clipboardState = shortcutAvailability(status, 'clipboard')

  return [
    {
      id: 'summon',
      label: summonLabel,
      chord: claimedChord,
      state: summonState,
      stateLabel: stateLabel(summonState, t),
      detail: summonDetail,
    },
    {
      id: 'clipboard',
      label: clipboardLabel,
      chord: clipboardChord,
      state: clipboardState,
      stateLabel: stateLabel(clipboardState, t),
      detail: clipboardState === 'available'
        ? t('settings.hotkeys.clipboardClaimedDetail')
        : t('settings.hotkeys.clipboardRefusedDetail', { chord: clipboardChord }),
    },
    {
      id: 'menuFallback',
      label: menuLabel,
      chord: null,
      state: 'available',
      stateLabel: stateLabel('available', t),
      detail: t('settings.hotkeys.menuAvailableDetail'),
    },
  ]
}
