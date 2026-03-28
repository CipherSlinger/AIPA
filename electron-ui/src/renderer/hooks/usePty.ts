import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { usePrefsStore } from '../store'

const VS_CODE_THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
  selectionBackground: '#264f78',
}

export function usePty(containerRef: React.RefObject<HTMLDivElement>, sessionId: string) {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptySessionId = useRef<string | null>(null)
  const [ptyError, setPtyError] = useState<string | null>(null)
  const { prefs } = usePrefsStore()

  const initPty = useCallback(async () => {
    if (!containerRef.current || ptySessionId.current) return

    const home = await window.electronAPI.fsGetHome()
    const cwd = prefs.workingDir || home

    const cols = termRef.current?.cols || 80
    const rows = termRef.current?.rows || 24

    try {
      await window.electronAPI.ptyCreate({
        sessionId,
        cwd,
        cols,
        rows,
        env: prefs.apiKey ? { ANTHROPIC_API_KEY: prefs.apiKey } : {},
      })
      ptySessionId.current = sessionId
      setPtyError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPtyError(msg)
      // Write error to terminal for inline visibility
      if (termRef.current) {
        termRef.current.write(
          '\x1b[31m' +  // red
          'Terminal Error: Failed to initialize PTY\r\n\r\n' +
          '\x1b[33m' +  // yellow
          (msg.includes('PTY_NATIVE_UNAVAILABLE')
            ? 'The node-pty native module is not compiled for your platform.\r\n\r\n' +
              '\x1b[37mTo fix this:\r\n' +
              '  1. Open a terminal in the electron-ui/ folder\r\n' +
              '  2. Run: npm run rebuild-pty\r\n' +
              '  3. Restart the app\r\n\r\n' +
              '\x1b[90mNote: On Windows, this requires Visual Studio C++ Build Tools.\r\n' +
              'Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/\r\n'
            : `Error: ${msg}\r\n`) +
          '\x1b[0m'  // reset
        )
      }
      return
    }

    // Listen for PTY output
    const unsubData = window.electronAPI.onPtyData(sessionId, (data) => {
      termRef.current?.write(data)
    })

    const unsubExit = window.electronAPI.onPtyExit(sessionId, ({ exitCode }) => {
      termRef.current?.write(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      ptySessionId.current = null
    })

    return () => {
      unsubData()
      unsubExit()
    }
  }, [sessionId, prefs.workingDir, prefs.apiKey])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: VS_CODE_THEME,
      fontFamily: prefs.fontFamily || "'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: prefs.fontSize || 14,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Forward keystrokes to PTY
    term.onData((data) => {
      if (ptySessionId.current) {
        window.electronAPI.ptyWrite({ sessionId: ptySessionId.current, data })
      }
    })

    // Handle resize — throttled to max 10 calls/sec (100ms)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const throttledResize = () => {
      if (resizeTimer) return
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit()
          if (ptySessionId.current) {
            window.electronAPI.ptyResize({
              sessionId: ptySessionId.current,
              cols: term.cols,
              rows: term.rows,
            })
          }
        } catch {}
        resizeTimer = null
      }, 100)
    }
    const resizeObserver = new ResizeObserver(throttledResize)
    resizeObserver.observe(containerRef.current)

    // Start the PTY process
    let cleanup: (() => void) | undefined
    initPty().then((c) => { cleanup = c })

    return () => {
      resizeObserver.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      cleanup?.()
      if (ptySessionId.current) {
        window.electronAPI.ptyDestroy(ptySessionId.current)
      }
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      ptySessionId.current = null
    }
  }, [sessionId])

  const refitTerminal = useCallback(() => {
    fitAddonRef.current?.fit()
  }, [])

  return { term: termRef, refitTerminal, ptyError }
}
