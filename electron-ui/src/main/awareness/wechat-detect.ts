/**
 * wechat-detect.ts — "is the user actively typing in WeChat right now?"
 *
 * Built on WindowTracker only: no pixels, no OCR, no model calls, no hooks.
 *
 * The signal used for "active" is global idle time. Windows exposes it through
 * GetLastInputInfo, which covers keyboard *and* mouse, so a user reading a long
 * message without touching anything will read as idle even though WeChat is in
 * front. That is intentional: the companion should stay quiet until the user
 * actually starts composing a reply.
 *
 * WeChat on Windows is a Qt app (window class Qt51514QWindowIcon, process
 * Weixin.exe). Its process tree also contains several helper processes, so the
 * matcher accepts any of the known executable names and keeps the check
 * case-insensitive.
 */
import { createLogger } from '../utils/logger'
import {
  windowTracker,
  type ForegroundWindow,
  type WindowTracker,
} from './window-tracker'

const log = createLogger('wechat-detect')

/** Executables that belong to the WeChat desktop client. */
const WECHAT_PROCESS_NAMES = ['weixin.exe', 'wechat.exe', 'wechatappex.exe']

/** Main-window class of WeChat 4.x (Qt 5.15.14). */
const WECHAT_WINDOW_CLASS = 'qt51514qwindowicon'

export interface WeChatDetectOptions {
  /**
   * Maximum idle time (ms) that still counts as "actively typing".
   * Default 400ms, matching the product brief. Raise it for slow typists.
   */
  idleThresholdMs?: number
  /**
   * Optional debounce: require the same conversation window to stay active for
   * this long before reporting `active`. 0 disables it (default).
   */
  sustainedTypingMs?: number
  /** Tracker instance to read from. Defaults to the process singleton. */
  tracker?: WindowTracker
}

export interface WeChatActivity {
  /** The user is in WeChat and has produced input within idleThresholdMs. */
  active: boolean
  /** A WeChat main window currently owns the foreground, regardless of idle. */
  isWeChatForeground: boolean
  /** Milliseconds since the last global input event, or -1 when unavailable. */
  idleMs: number
  /** Snapshot of the foreground window, or null when nothing could be read. */
  window: ForegroundWindow | null
  /** Process name observed, lowercased, for diagnostics. */
  processName: string | null
  /** True when the window's class matches the known WeChat main-window class. */
  classNameMatches: boolean
}

const DEFAULTS = {
  idleThresholdMs: 400,
  sustainedTypingMs: 0,
}

/** Is this foreground window a WeChat main window? */
export function isWeChatWindow(window: ForegroundWindow | null): boolean {
  if (!window) return false
  const process = (window.processName ?? '').toLowerCase()
  if (!WECHAT_PROCESS_NAMES.includes(process)) return false
  // Helper processes (WeChatAppEx.exe, tray windows) also match by name; require
  // the main-window class when we know it. Unknown classes are still accepted so
  // a WeChat UI revamp does not silently disable the feature.
  if (!window.className) return true
  return window.className.toLowerCase() === WECHAT_WINDOW_CLASS
}

export class WeChatDetector {
  private readonly options: Required<Omit<WeChatDetectOptions, 'tracker'>>
  private readonly tracker: WindowTracker

  /** Consecutive-since timestamp of the current WeChat activity streak. */
  private activeSince: number | null = null

  constructor(options: WeChatDetectOptions = {}) {
    this.options = {
      idleThresholdMs: options.idleThresholdMs ?? DEFAULTS.idleThresholdMs,
      sustainedTypingMs: options.sustainedTypingMs ?? DEFAULTS.sustainedTypingMs,
    }
    this.tracker = options.tracker ?? windowTracker
  }

  /** One-shot sample. Cheap enough to call on a 250–500ms timer. */
  sample(now = Date.now()): WeChatActivity {
    const window = this.tracker.getForeground()
    const idleMs = this.tracker.getIdleMs()
    const isWeChatForeground = isWeChatWindow(window)
    const classNameMatches = Boolean(
      window?.className && window.className.toLowerCase() === WECHAT_WINDOW_CLASS
    )

    let active = isWeChatForeground && idleMs >= 0 && idleMs < this.options.idleThresholdMs

    if (active) {
      if (this.activeSince === null) this.activeSince = now
      const streak = now - this.activeSince
      if (this.options.sustainedTypingMs > 0 && streak < this.options.sustainedTypingMs) {
        active = false
      }
    } else {
      this.activeSince = null
    }

    return {
      active,
      isWeChatForeground,
      idleMs,
      window,
      processName: window?.processName ? window.processName.toLowerCase() : null,
      classNameMatches,
    }
  }

  /**
   * Subscribe to transitions in the `active` flag. The callback fires only when
   * the boolean changes, not on every sample.
   *
   * Returns an unsubscribe function. Starts the underlying tracker if needed;
   * the caller owns the lifecycle via stop().
   */
  onActivityChange(callback: (activity: WeChatActivity) => void, intervalMs = 250): () => void {
    this.tracker.start()
    let lastActive: boolean | null = null

    const tick = (): void => {
      const sample = this.sample()
      if (sample.active === lastActive) return
      lastActive = sample.active
      try {
        callback(sample)
      } catch (err) {
        log.warn('activity listener threw:', err instanceof Error ? err.message : err)
      }
    }

    const timer = setInterval(tick, intervalMs)
    timer.unref?.()
    tick()

    return () => {
      clearInterval(timer)
    }
  }

  /** Convenience one-shot check used by the prototype and tests. */
  static isActive(options: WeChatDetectOptions = {}): boolean {
    return new WeChatDetector(options).sample().active
  }
}

/** Shared detector using the default thresholds. */
export const wechatDetector = new WeChatDetector()

/** One-call helper for callers that do not want to hold an instance. */
export function getWeChatActivity(): WeChatActivity {
  return wechatDetector.sample()
}