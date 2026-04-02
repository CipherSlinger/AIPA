/**
 * tipRegistry -- Contextual feature discovery tips.
 * Inspired by Claude Code's services/tips/tipRegistry.ts.
 *
 * Each tip targets a specific user behavior pattern and offers
 * a relevant feature suggestion. Tips are shown once per session
 * per ID, with a cooldown period between displays.
 */

export interface Tip {
  id: string
  /** i18n key for the tip content (e.g. 'tips.tip_shortcuts') */
  contentKey: string
  /** Minimum number of messages before showing this tip */
  minMessages?: number
  /** Only show after user has N sessions */
  minSessions?: number
}

/**
 * All registered tips. The UI picks one to show based on context.
 */
export const TIPS: Tip[] = [
  { id: 'shortcuts',     contentKey: 'tips.tip_shortcuts',  minMessages: 5 },
  { id: 'model',         contentKey: 'tips.tip_model',      minMessages: 10 },
  { id: 'memory',        contentKey: 'tips.tip_memory',     minMessages: 15 },
  { id: 'workflows',     contentKey: 'tips.tip_workflows',  minMessages: 20 },
  { id: 'personas',      contentKey: 'tips.tip_personas',   minSessions: 3 },
  { id: 'notes',         contentKey: 'tips.tip_notes',      minMessages: 8 },
  { id: 'theme',         contentKey: 'tips.tip_theme',      minMessages: 3 },
  { id: 'language',      contentKey: 'tips.tip_language',    minMessages: 3 },
  { id: 'search',        contentKey: 'tips.tip_search',     minSessions: 2 },
  { id: 'snippets',      contentKey: 'tips.tip_snippets',   minMessages: 25 },
  { id: 'focus',         contentKey: 'tips.tip_focus',      minMessages: 12 },
  { id: 'pin',           contentKey: 'tips.tip_pin',        minMessages: 6 },
  { id: 'clipboard',     contentKey: 'tips.tip_clipboard',  minMessages: 5 },
  { id: 'export',        contentKey: 'tips.tip_export',     minSessions: 3 },
  { id: 'tone',          contentKey: 'tips.tip_tone',       minMessages: 15 },
]

/** Cooldown: don't show the same tip within 24 hours */
const TIP_COOLDOWN_MS = 24 * 60 * 60 * 1000

/**
 * Pick a tip to show, given the current context.
 * Returns null if no tip is appropriate right now.
 */
export function pickTip(opts: {
  messageCount: number
  sessionCount: number
  tipHistory: Record<string, number>  // tipId -> last-shown timestamp
}): Tip | null {
  const now = Date.now()
  const eligible = TIPS.filter(tip => {
    // Check message count threshold
    if (tip.minMessages && opts.messageCount < tip.minMessages) return false
    // Check session count threshold
    if (tip.minSessions && opts.sessionCount < tip.minSessions) return false
    // Check cooldown
    const lastShown = opts.tipHistory[tip.id] || 0
    if (now - lastShown < TIP_COOLDOWN_MS) return false
    return true
  })

  if (eligible.length === 0) return null

  // Pick a random eligible tip for variety
  return eligible[Math.floor(Math.random() * eligible.length)]
}
