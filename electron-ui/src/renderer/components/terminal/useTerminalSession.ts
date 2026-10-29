import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalStore } from '../../store/terminalStore'
import { useSessionStore } from '../../store'
import { shortCwd, type TerminalTab } from '../../store/terminalTabs'
import { getT } from '../../i18n'
import { describePtyFailure } from './ptyFailure'
import { createPtySessionId, startPtySession, type PtySessionHandle } from './ptySession'
import { registerTerminalHandle } from './terminalRegistry'
import {
  readTerminalTheme,
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  TERMINAL_SCROLLBACK,
} from './terminalTheme'

/**
 * Owns one xterm instance for as long as its tab exists.
 *
 * The Terminal is constructed inside an effect keyed on the tab id (a tab id
 * never changes), never in render and never in a dependency list that updates
 * with status/title — otherwise every output chunk would recreate the widget
 * and lose the scrollback. Status updates go through the Zustand store instead.
 */
export function useTerminalSession(
  tab: TerminalTab,
  active: boolean,
  visible: boolean,
): RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionRef = useRef<PtySessionHandle | null>(null)
  const activeRef = useRef(active)
  const cwdRef = useRef(tab.cwd)
  /** Keystrokes typed before `pty:create` answered, flushed on ready. */
  const pendingInputRef = useRef<string[]>([])

  cwdRef.current = tab.cwd

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    const tabId = tab.id
    const term = new Terminal({
      scrollback: TERMINAL_SCROLLBACK,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      cursorBlink: true,
      // PTY output already carries CRLF; converting again would double the CR.
      convertEol: false,
      theme: readTerminalTheme(),
    })
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(webLinksAddon)
    term.open(host)
    terminalRef.current = term
    fitRef.current = fitAddon

    const unregister = registerTerminalHandle(tabId, {
      clear: () => term.clear(),
      focus: () => term.focus(),
    })

    const fit = () => {
      try { fitAddon.fit() } catch { /* hidden or not laid out yet */ }
    }

    // The theme is applied by App to <html data-theme>; observing that
    // attribute covers manual theme switches and the OS-following 'system'
    // mode without the dock subscribing to the preferences store.
    const themeObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => { term.options.theme = readTerminalTheme() })
      : null
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        if (!activeRef.current) return
        fit()
        sessionRef.current?.resize(term.cols, term.rows)
      })
      : null
    resizeObserver?.observe(host)

    const initialFrame = requestAnimationFrame(fit)

    // Input is buffered only until the session exists; after that the PTY owns
    // echoing, and a shell that exited stops accepting keystrokes.
    const inputSubscription = term.onData((data) => {
      const session = sessionRef.current
      if (session) session.write(data)
      else pendingInputRef.current.push(data)
    })

    let disposed = false
    let startPromise: Promise<PtySessionHandle | null> = Promise.resolve(null)

    // Wait for the first layout pass so `fit` produces real cols/rows; the
    // shell must be spawned with the size the user is actually looking at.
    const start = async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (disposed) return
      fit()
      startPromise = startPtySession(window.electronAPI, {
        sessionId: createPtySessionId(tabId),
        cwd: cwdRef.current,
        cols: term.cols || 80,
        rows: term.rows || 24,
        kind: 'shell',
      }, {
        onData: (data) => {
          if (!disposed) term.write(data)
        },
        onExit: (info) => {
          if (disposed) return
          // Keep the tab and its output; only the status changes.
          useTerminalStore.getState().markExited(tabId, info.exitCode ?? null)
        },
        onReady: (ready) => {
          if (disposed) return
          const store = useTerminalStore.getState()
          store.markRunning(tabId, ready.ptyId)
          if (ready.fallback) store.markFallback(tabId)
          if (ready.shell) {
            const home = useSessionStore.getState().homeDir
            store.retitleTab(tabId, `${ready.shell} · ${shortCwd(cwdRef.current, home)}`)
          }
        },
        onFailure: (reason) => {
          if (disposed) return
          const message = describePtyFailure(reason, getT())
          useTerminalStore.getState().markFailed(tabId, message)
          // A named reason, not a fake prompt: the user can see why this tab
          // never produced a shell.
          term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`)
        },
      })

      const session = await startPromise
      if (!session) return
      if (disposed) {
        session.destroy()
        return
      }
      sessionRef.current = session
      session.resize(term.cols, term.rows)
      const pending = pendingInputRef.current.splice(0)
      for (const chunk of pending) session.write(chunk)
      // A command handed over before the PTY answered is typed in now, without
      // a submit. Taking it clears the entry, so a later tab reusing this id
      // cannot receive it again.
      const queued = useTerminalStore.getState().flushQueuedInput(tabId)
      if (queued) session.write(queued)
    }
    void start()

    return () => {
      disposed = true
      cancelAnimationFrame(initialFrame)
      themeObserver?.disconnect()
      resizeObserver?.disconnect()
      inputSubscription.dispose()
      unregister()
      const session = sessionRef.current
      sessionRef.current = null
      // Exactly once: handle.destroy is idempotent and also unsubscribes both
      // pty:data and pty:exit. A session still being created destroys itself
      // in `start()` once the promise settles.
      session?.destroy()
      // The async path may have resolved after this cleanup; make sure a
      // just-created PTY is not leaked when `sessionRef` was already read.
      startPromise.then((late) => { if (late && late !== session) late.destroy() }).catch(() => { /* already failed */ })
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
    // Deliberately only the tab identity: status/title changes must not rebuild
    // the terminal. `cwdRef` carries the folder without adding a dependency.
  }, [tab.id])

  // Refit on tab activation and on the dock becoming visible again: while the
  // dock is hidden its container measures 0x0, so the xterm keeps the size it
  // had when it was last on screen until this runs.
  useEffect(() => {
    activeRef.current = active
    if (!active || !visible) return
    const frame = requestAnimationFrame(() => {
      try { fitRef.current?.fit() } catch { /* not laid out yet */ }
      const term = terminalRef.current
      const session = sessionRef.current
      if (term) {
        if (session) session.resize(term.cols, term.rows)
        term.focus()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [active, visible])

  return containerRef
}
