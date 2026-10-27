/**
 * window-tracker.ts — Windows foreground-window tracking for the WeChat companion.
 *
 * Scope: this module answers "which window is in front right now, who owns it,
 * where is it on screen, and how long has the user been idle". It deliberately
 * does NOT capture pixels, OCR anything, or talk to any model.
 *
 * Two native mechanisms are used:
 *   - SetWinEventHook(EVENT_SYSTEM_FOREGROUND) — event driven, near-zero cost.
 *     The hook only fires while the process has a message pump. Electron's main
 *     process has one (Chromium), so callbacks do fire there. Plain `node` does
 *     not pump messages, which is why a low-frequency poll is kept as a safety net.
 *   - GetLastInputInfo + GetTickCount — global idle time, works without hooks.
 *
 * Platform guard: user32.dll only exists on Windows. On every other platform the
 * native layer is never loaded (see initNative), start() returns false and
 * getForeground() returns null. This mirrors the isMac-style conditional loading
 * used by src/main/clawd/src/mac-window.js.
 */
import { createLogger } from '../utils/logger'

const log = createLogger('window-tracker')

const isWindows = process.platform === 'win32'

// ── Win32 constants ────────────────────────────────────────────────────────────

const EVENT_SYSTEM_FOREGROUND = 0x0003

// WINEVENT_OUTOFCONTEXT: deliver to this thread's message queue (required so the
// callback does not run inside the target process).
const WINEVENT_OUTOFCONTEXT = 0x0000
// WINEVENT_SKIPOWNPROCESS: do not report windows owned by this process.
const WINEVENT_SKIPOWNPROCESS = 0x0002

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4n

// ── Public types ──────────────────────────────────────────────────────────────

export interface WindowRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ForegroundWindow {
  /** Stable handle identity, formatted as hex (e.g. "0x70c02"). */
  hwnd: string
  pid: number
  /** Base name of the executable, e.g. "Weixin.exe". Null when access is denied. */
  processName: string | null
  className: string
  title: string
  /** Physical pixels (per-monitor DPI aware). */
  rect: WindowRect
  dpi: number
  minimized: boolean
  /** Wall-clock timestamp of the sample. */
  at: number
}

export interface WindowTrackerOptions {
  /**
   * Safety-net poll interval. The WinEvent hook usually beats this; polling only
   * covers missed events and hosts without a message pump. Set to 0 to disable.
   */
  pollIntervalMs?: number
  /** Skip windows owned by this process (reduces AIPA's own noise). */
  skipOwnProcess?: boolean
}

export type ForegroundListener = (window: ForegroundWindow) => void

// ── koffi typings (structural subset of what we actually call) ────────────────

type KoffiCallback = unknown
type KoffiType = unknown
type NativeFn = (...args: any[]) => any

interface KoffiLib {
  func(definition: string): NativeFn
}

interface KoffiApi {
  load(path: string): KoffiLib
  struct(name: string, def: Record<string, string>): KoffiType
  proto(definition: string): KoffiType
  pointer(type: KoffiType): KoffiType
  register(callback: (...args: unknown[]) => void, type: KoffiType): KoffiCallback
  unregister(callback: KoffiCallback): void
  address(pointer: unknown): bigint
  decode(buffer: Buffer, type: string, length?: number): unknown
  sizeof(type: KoffiType): number
}

interface NativeApi {
  getForegroundWindow: NativeFn
  getWindowThreadProcessId: NativeFn
  getClassNameW: NativeFn
  getWindowTextW: NativeFn
  getWindowRect: NativeFn
  getLastInputInfo: NativeFn
  getDpiForWindow: NativeFn
  isIconic: NativeFn
  setWinEventHook: NativeFn
  unhookWinEvent: NativeFn
  getTickCount: NativeFn
  openProcess: NativeFn
  queryFullProcessImageNameW: NativeFn
  closeHandle: NativeFn
  /** Byte size of the RECT struct, needed for output marshalling. */
  lastInputInfoSize: number
  winEventProcType: KoffiType
}

// ── Native layer (loaded at most once, Windows only) ──────────────────────────

let koffi: KoffiApi | null = null
let native: NativeApi | null = null
let nativeError: string | null = null

function initNative(): NativeApi | null {
  if (native) return native
  if (nativeError) return null
  if (!isWindows) {
    nativeError = `unsupported platform: ${process.platform}`
    return null
  }

  try {
    // Dynamic require keeps koffi (and user32.dll) out of non-Windows builds.
    koffi = require('koffi') as KoffiApi

    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    // Struct/proto names are registered globally inside koffi; declare them
    // before the function prototypes that reference them.
    koffi.struct('AIPA_RECT', {
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long',
    })
    const lastInputInfo = koffi.struct('AIPA_LASTINPUTINFO', {
      cbSize: 'uint',
      dwTime: 'uint32_t',
    })
    const winEventProc = koffi.proto(
      'void __stdcall AIPA_WINEVENTPROC(void *hWinEventHook, uint32_t event, void *hwnd, ' +
        'int32_t idObject, int32_t idChild, uint32_t idEventThread, uint32_t dwmsEventTime)'
    )

    native = {
      getForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
      getWindowThreadProcessId: user32.func(
        'uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)'
      ),
      getClassNameW: user32.func(
        'int __stdcall GetClassNameW(void *hWnd, _Out_ uint16_t *lpClassName, int nMaxCount)'
      ),
      getWindowTextW: user32.func(
        'int __stdcall GetWindowTextW(void *hWnd, _Out_ uint16_t *lpString, int nMaxCount)'
      ),
      getWindowRect: user32.func(
        'bool __stdcall GetWindowRect(void *hWnd, _Out_ AIPA_RECT *lpRect)'
      ),
      getLastInputInfo: user32.func(
        'bool __stdcall GetLastInputInfo(_Inout_ AIPA_LASTINPUTINFO *plii)'
      ),
      getDpiForWindow: user32.func('uint32_t __stdcall GetDpiForWindow(void *hwnd)'),
      isIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
      setWinEventHook: user32.func(
        'void * __stdcall SetWinEventHook(uint32_t eventMin, uint32_t eventMax, void *hmodWinEventProc, ' +
          'void *lpfnWinEventProc, uint32_t idProcess, uint32_t idThread, uint32_t dwFlags)'
      ),
      unhookWinEvent: user32.func('bool __stdcall UnhookWinEvent(void *hWinEventHook)'),
      getTickCount: kernel32.func('uint32_t __stdcall GetTickCount()'),
      openProcess: kernel32.func('void * __stdcall OpenProcess(uint32_t, bool, uint32_t)'),
      queryFullProcessImageNameW: kernel32.func(
        'bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, ' +
          '_Inout_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'
      ),
      closeHandle: kernel32.func('bool __stdcall CloseHandle(void *hObject)'),
      // Derived from the struct definition so a layout change cannot desync it.
      lastInputInfoSize: koffi.sizeof(lastInputInfo),
      winEventProcType: winEventProc,
    }

    enableDpiAwareness(user32)

    log.debug('Windows native layer ready')
    return native
  } catch (err) {
    nativeError = err instanceof Error ? err.message : String(err)
    log.warn('Windows native layer unavailable:', nativeError)
    native = null
    koffi = null
    return null
  }
}

/**
 * Make sure GetWindowRect returns physical pixels. Chromium normally sets this
 * already, in which case the call simply fails with ERROR_ACCESS_DENIED and we
 * ignore it.
 */
function enableDpiAwareness(user32: KoffiLib): void {
  try {
    const setContext = user32.func(
      'bool __stdcall SetProcessDpiAwarenessContext(intptr_t value)'
    )
    setContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
  } catch {
    // Older Windows builds: fall back silently. Chromium's own setting is fine.
    try {
      const legacy = user32.func('bool __stdcall SetProcessDPIAware()')
      legacy()
    } catch {
      /* ignore */
    }
  }
}

// ── Handle helpers ────────────────────────────────────────────────────────────

function handleAddress(pointer: unknown): bigint {
  if (!koffi) return 0n
  try {
    return koffi.address(pointer)
  } catch {
    return 0n
  }
}

function isValidHandle(pointer: unknown): boolean {
  return handleAddress(pointer) !== 0n
}

function handleKey(pointer: unknown): string {
  return `0x${handleAddress(pointer).toString(16)}`
}

function readUtf16(buffer: Buffer, length: number): string {
  if (!koffi || length <= 0) return ''
  const decoded = koffi.decode(buffer, 'char16_t', length)
  return typeof decoded === 'string' ? decoded : ''
}

// ── Tracker ───────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 500
const PROCESS_NAME_CACHE_LIMIT = 128

export class WindowTracker {
  private readonly options: Required<WindowTrackerOptions>
  private readonly listeners = new Set<ForegroundListener>()
  private readonly processNames = new Map<number, string | null>()

  private pollTimer: NodeJS.Timeout | null = null
  private hook: unknown = null
  private hookCallback: KoffiCallback | null = null
  private pendingCheck = false

  private started = false
  private lastEmittedHwnd: string | null = null

  constructor(options: WindowTrackerOptions = {}) {
    this.options = {
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      skipOwnProcess: options.skipOwnProcess ?? false,
    }
  }

  /** True when the native layer loaded (Windows only). */
  static isSupported(): boolean {
    return initNative() !== null
  }

  /**
   * Begin listening for foreground changes. Hooks fail silently on platforms or
   * environments that cannot host them; polling still keeps the tracker useful.
   */
  start(): boolean {
    const api = initNative()
    if (!api) {
      log.debug('start() ignored —', nativeError)
      return false
    }
    if (this.started) return true
    this.started = true

    this.installHook(api)

    if (this.options.pollIntervalMs > 0) {
      this.pollTimer = setInterval(() => this.checkForChange(), this.options.pollIntervalMs)
      // Never keep the host process alive just for tracking.
      this.pollTimer.unref?.()
    }

    // Emit the current window immediately so subscribers do not wait a tick.
    this.emitCurrent(true)
    return true
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.hook) {
      try {
        initNative()?.unhookWinEvent(this.hook)
      } catch (err) {
        log.debug('UnhookWinEvent failed:', err instanceof Error ? err.message : err)
      }
      this.hook = null
    }
    if (this.hookCallback && koffi) {
      try {
        koffi.unregister(this.hookCallback)
      } catch (err) {
        log.debug('koffi.unregister failed:', err instanceof Error ? err.message : err)
      }
      this.hookCallback = null
    }
    this.started = false
    this.lastEmittedHwnd = null
  }

  /** Query the current foreground window. Always hits the OS (cheap: ~5 syscalls). */
  getForeground(): ForegroundWindow | null {
    const api = initNative()
    if (!api) return null
    try {
      const hwnd = api.getForegroundWindow()
      if (!isValidHandle(hwnd)) return null
      return this.describe(hwnd, api)
    } catch (err) {
      log.warn('getForeground failed:', err instanceof Error ? err.message : err)
      return null
    }
  }

  /** Subscribe to foreground-window changes. Returns an unsubscribe function. */
  onForegroundChange(listener: ForegroundListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Milliseconds since the last input event anywhere in the session.
   * Returns -1 when unavailable (non-Windows or native failure).
   */
  getIdleMs(): number {
    const api = initNative()
    if (!api) return -1
    try {
      const info: { cbSize: number; dwTime: number } = { cbSize: api.lastInputInfoSize, dwTime: 0 }
      if (!api.getLastInputInfo(info)) return -1
      const now = Number(api.getTickCount()) >>> 0
      const last = Number(info.dwTime) >>> 0
      // GetTickCount wraps every ~49.7 days; unsigned subtraction handles the wrap.
      return (now - last) >>> 0
    } catch (err) {
      log.debug('getIdleMs failed:', err instanceof Error ? err.message : err)
      return -1
    }
  }

  /** True while at least one listener is attached. */
  get isRunning(): boolean {
    return this.started
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private installHook(api: NativeApi): void {
    if (!koffi) return
    try {
      // Registered (not transient) because Windows calls this long after
      // SetWinEventHook returns.
      this.hookCallback = koffi.register(() => this.onNativeForegroundEvent(), koffi.pointer(api.winEventProcType))
      const flags =
        WINEVENT_OUTOFCONTEXT | (this.options.skipOwnProcess ? WINEVENT_SKIPOWNPROCESS : 0)
      this.hook = api.setWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_FOREGROUND,
        null,
        this.hookCallback,
        0,
        0,
        flags
      )
      if (!isValidHandle(this.hook)) {
        log.warn('SetWinEventHook returned a null handle; relying on polling')
        this.hook = null
      }
    } catch (err) {
      log.warn('SetWinEventHook failed; relying on polling:', err instanceof Error ? err.message : err)
      this.hook = null
    }
  }

  /**
   * Called from native code. Never make FFI calls here — defer to the JS loop so
   * we cannot re-enter the hook while the native frame is still on the stack.
   */
  private onNativeForegroundEvent(): void {
    if (this.pendingCheck) return
    this.pendingCheck = true
    setImmediate(() => {
      this.pendingCheck = false
      if (this.started) this.checkForChange()
    })
  }

  private checkForChange(): void {
    this.emitCurrent(false)
  }

  private emitCurrent(force: boolean): void {
    const current = this.getForeground()
    if (!current) return
    if (!force && current.hwnd === this.lastEmittedHwnd) return

    this.lastEmittedHwnd = current.hwnd

    for (const listener of this.listeners) {
      try {
        listener(current)
      } catch (err) {
        log.warn('foreground listener threw:', err instanceof Error ? err.message : err)
      }
    }
  }

  private describe(hwnd: unknown, api: NativeApi): ForegroundWindow | null {
    const pidOut: (number | null)[] = [null]
    const tid = Number(api.getWindowThreadProcessId(hwnd, pidOut)) >>> 0
    const pid = Number(pidOut[0] ?? 0) >>> 0
    if (tid === 0 && pid === 0) return null

    const rectOut: Record<string, number> = {}
    const hasRect = Boolean(api.getWindowRect(hwnd, rectOut))
    const left = Number(rectOut.left ?? 0)
    const top = Number(rectOut.top ?? 0)
    const right = Number(rectOut.right ?? 0)
    const bottom = Number(rectOut.bottom ?? 0)

    const classBuffer = Buffer.alloc(512)
    const classLength = Number(api.getClassNameW(hwnd, classBuffer, 256)) || 0

    const titleBuffer = Buffer.alloc(2048)
    const titleLength = Number(api.getWindowTextW(hwnd, titleBuffer, 1024)) || 0

    let dpi = 96
    try {
      const value = Number(api.getDpiForWindow(hwnd)) || 0
      if (value > 0) dpi = value
    } catch {
      /* older Windows builds lack GetDpiForWindow */
    }

    return {
      hwnd: handleKey(hwnd),
      pid,
      processName: this.resolveProcessName(pid, api),
      className: readUtf16(classBuffer, classLength),
      title: readUtf16(titleBuffer, titleLength),
      rect: {
        left,
        top,
        right,
        bottom,
        width: hasRect ? Math.max(0, right - left) : 0,
        height: hasRect ? Math.max(0, bottom - top) : 0,
      },
      dpi,
      minimized: Boolean(api.isIconic(hwnd)),
      at: Date.now(),
    }
  }

  private resolveProcessName(pid: number, api: NativeApi): string | null {
    if (pid === 0) return null
    const cached = this.processNames.get(pid)
    if (cached !== undefined) return cached

    let name: string | null = null
    let handle: unknown = null
    try {
      handle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
      if (isValidHandle(handle)) {
        const buffer = Buffer.alloc(2048)
        const size: number[] = [1024]
        const ok = Boolean(api.queryFullProcessImageNameW(handle, 0, buffer, size))
        if (ok) {
          const chars = Number(size[0]) || 0
          const fullPath = readUtf16(buffer, chars)
          name = fullPath.split(/[\\/]/).pop() || null
        }
      }
    } catch (err) {
      log.debug('resolveProcessName failed for pid', pid, err instanceof Error ? err.message : err)
    } finally {
      if (isValidHandle(handle)) {
        try {
          api.closeHandle(handle)
        } catch {
          /* ignore */
        }
      }
    }

    if (this.processNames.size >= PROCESS_NAME_CACHE_LIMIT) this.processNames.clear()
    this.processNames.set(pid, name)
    return name
  }
}

/** Process-wide singleton — the native hook is a limited resource, so share it. */
export const windowTracker = new WindowTracker()

/** True when this build can track windows natively. */
export function isWindowTrackingSupported(): boolean {
  return WindowTracker.isSupported()
}