// Non-attention things the desktop pet says on its own.
//
// `clawd-attention` owns everything that needs an answer or reports a failure.
// A greeting at launch is neither: nothing is wrong, nothing is waiting. It
// goes through `showClawdNotice`, which can never replace an actionable card,
// respects DND / hidden bubbles, and expires on its own.
import { app } from 'electron'
import { getPref } from './config/config-manager'
import { getClawdLanguage, showClawdNotice, showClawdTestNotice } from './clawd-integration'

const { createTranslator } = require('./clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}
const petT = createTranslator(() => getClawdLanguage())

/** Long enough for the window and the pet to settle, short enough to feel like a boot line. */
const BOOT_GREETING_DELAY_MS = 6000
const BOOT_GREETING_TTL_MS = 6500

let bootGreetingTimer: NodeJS.Timeout | null = null

export { showClawdTestNotice }

/** Say hello once, a few seconds after launch. No-op when disabled. */
export function scheduleClawdBootGreeting(): void {
  cancelClawdBootGreeting()
  if (getPref('petBootGreeting' as any) === false) return
  bootGreetingTimer = setTimeout(() => {
    bootGreetingTimer = null
    showClawdNotice(
      {
        kind: 'system',
        title: petT('noticeBootTitle'),
        message: petT('noticeBootBody'),
        pill: petT('noticeBootPill'),
        mode: 'done',
        lang: getClawdLanguage(),
        clickAction: 'open',
        typed: true,
        meta: [{ label: 'AIPA', value: `v${app.getVersion()}` }],
      },
      BOOT_GREETING_TTL_MS,
    )
  }, BOOT_GREETING_DELAY_MS)
  // A greeting must never keep the process alive on quit.
  bootGreetingTimer.unref?.()
}

/** Drop a greeting that has not fired yet (app quitting, pet shut down). */
export function cancelClawdBootGreeting(): void {
  if (!bootGreetingTimer) return
  clearTimeout(bootGreetingTimer)
  bootGreetingTimer = null
}
