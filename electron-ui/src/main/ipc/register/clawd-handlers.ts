import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { isClawdRunning, launchClawd } from '../../clawd-bridge'
import {
  applyClawdPetPref,
  getClawdInitError,
  getClawdLanguage,
  showClawdNotice,
  withClawdMainWindow,
  type ClawdBubbleKind,
} from '../../clawd-integration'
import { clearClawdNotices, listClawdNotices } from '../../clawd-notifications'
import { openClawdNoticeCenter } from '../../clawd-notice-center'
import { showClawdTestNotice } from '../../clawd-notice-sources'
import { safeHandle } from './safe-handle'

const NOTICE_KINDS: ClawdBubbleKind[] = [
  'system', 'info', 'success', 'warning', 'error', 'quest', 'approval', 'clarification',
]

function cleanText(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Focus the main window, optionally opening a session at the same time. */
function bringAipaForward(sessionId: string | null): void {
  withClawdMainWindow(win => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (sessionId) {
      win.webContents.send('menu:openSession', sessionId)
    }
  })
}

// ----------------------------------------
// Clawd desktop pet handlers (Iteration 615)
// ----------------------------------------
export function registerClawdHandlers(): void {
  safeHandle('clawd:launch', async () => {
    try {
      const running = await isClawdRunning()
      if (!running) {
        launchClawd()
      }
      return { success: true, alreadyRunning: running }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  safeHandle('clawd:isRunning', async () => {
    try {
      return { running: await isClawdRunning() }
    } catch {
      return { running: false }
    }
  })

  safeHandle('clawd:getInitError', async () => {
    return { error: getClawdInitError() }
  })

  /**
   * Visible strings for the pet rows in Settings. The app's locale JSON is
   * owned by the shared translation surface; the pet's own table already
   * carries these sentences in en/zh/ko, so the page asks for exactly the six
   * it needs in the app's resolved language instead of duplicating them. The
   * keys stay a fixed, named set — this is not a general translation channel.
   */
  safeHandle('clawd:getStrings', async (_e, lang: unknown) => {
    const { i18n } = require('../../clawd/src/i18n') as {
      i18n: Record<string, Record<string, string>>
    }
    const code = lang === 'zh' || lang === 'zh-CN' ? 'zh' : lang === 'ko' ? 'ko' : 'en'
    const dict = i18n[code] || i18n.en
    const pick = (key: string) => dict[key] || i18n.en[key] || ''
    return {
      strings: {
        needsYouBadge: pick('settingsPetNeedsYouBadge'),
        needsYouBadgeHint: pick('settingsPetNeedsYouBadgeHint'),
        morningBrief: pick('settingsPetMorningBrief'),
        morningBriefHint: pick('settingsPetMorningBriefHint'),
        eveningWrap: pick('settingsPetEveningWrap'),
        eveningWrapHint: pick('settingsPetEveningWrapHint'),
      },
    }
  })

  // Read/write clawd prefs from the embedded pet's prefs file
  safeHandle('clawd:getPrefs', async () => {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'clawd-prefs.json')
      const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
      return { prefs: raw }
    } catch {
      return { prefs: {} }
    }
  })

  safeHandle('clawd:setPrefs', async (_e, key: string, value: unknown) => {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'clawd-prefs.json')
      let prefs: Record<string, unknown> = {}
      try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')) } catch {}
      prefs[key] = value
      fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))

      // Apply to the running pet in-process. Writing the file alone was not
      // enough: the live instance keeps its own copy and never re-reads it.
      applyClawdPetPref(key, value)

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  /**
   * Ask the pet to say something passive. Used by the renderer for events it
   * already knows about (context running low, a background task finished) and
   * by Settings to preview a notice. Returns `{ shown: false }` when the pet
   * cannot speak right now — the caller keeps its own fallback.
   */
  safeHandle('clawd:notify', async (_e, input: {
    kind?: string
    title?: string
    message?: string
    detail?: string
    pill?: string
    ttlMs?: number
    sessionId?: string
    meta?: Array<{ label?: string; value?: string }>
  }) => {
    const title = cleanText(input?.title, 200)
    const message = cleanText(input?.message)
    if (!title) return { shown: false }
    const kind = (NOTICE_KINDS as string[]).includes(String(input?.kind))
      ? input?.kind as ClawdBubbleKind
      : 'info'
    const sessionId = cleanText(input?.sessionId, 200) || null
    const meta = Array.isArray(input?.meta)
      ? input.meta
          .map(row => ({
            label: cleanText(row?.label, 40),
            value: cleanText(row?.value, 120),
          }))
          .filter(row => row.label && row.value)
          .slice(0, 4)
      : []
    const ttlMs = typeof input?.ttlMs === 'number' && Number.isFinite(input.ttlMs)
      ? input.ttlMs
      : 7000
    const shown = showClawdNotice({
      kind,
      title,
      message,
      pill: cleanText(input?.pill, 24),
      mode: 'done',
      lang: getClawdLanguage(),
      clickAction: 'open',
      typed: true,
      ...(meta.length ? { meta } : {}),
      countdownMs: ttlMs,
    }, ttlMs, () => bringAipaForward(sessionId))
    return { shown }
  })

  /** Preview the HUD card from Settings, with a progress bar and meta rows. */
  safeHandle('clawd:testNotice', async () => ({ shown: showClawdTestNotice() }))

  /** Newest-first history of everything the pet announced. */
  safeHandle('clawd:notices', async () => {
    try {
      return { notices: listClawdNotices() }
    } catch {
      return { notices: [] }
    }
  })

  /**
   * Open the browsable notice log centre-right of the primary display. Unlike
   * the pet's own menu it takes no anchor, because Settings is not next to the
   * pet. `opened:false` means the window could not be created at all; a page
   * that fails to load later closes itself.
   */
  safeHandle('clawd:openNoticeCenter', async () => {
    try {
      return { opened: openClawdNoticeCenter() }
    } catch {
      return { opened: false }
    }
  })

  safeHandle('clawd:clearNotices', async () => {
    try {
      clearClawdNotices()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
