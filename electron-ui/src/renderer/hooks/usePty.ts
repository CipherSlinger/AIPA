import { useEffect, useRef, useCallback } from 'react'
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
  const { prefs } = usePrefsStore()

  const initPty = useCallback(async () => {
    if (!containerRef.current || ptySessionId.current) return

    const home = await window.electronAPI.fsGetHome()
    const cwd = prefs.workingDir || home

    const cols = termRef.current?.cols || 80
    const rows = termRef.current?.rows || 24

    await window.electronAPI.ptyCreate({
      sessionId,
      cwd,
      cols,
      rows,
      env: prefs.apiKey ? { ANTHROPIC_API_KEY: prefs.apiKey } : {},
    })
    ptySessionId.current = sessionId

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

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
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
    })
    resizeObserver.observe(containerRef.current)

    // Start the PTY process
    let cleanup: (() => void) | undefined
    initPty().then((c) => { cleanup = c })

    return () => {
      resizeObserver.disconnect()
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

  return { term: termRef, refitTerminal }
}
