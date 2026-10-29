import type { ITheme } from '@xterm/xterm'

/** The app's monospace stack, shared by code blocks and the terminal. */
export const TERMINAL_FONT_FAMILY = "'Cascadia Code', 'Fira Code', Consolas, monospace"
export const TERMINAL_FONT_SIZE = 13
/** Keep enough history to scroll back through a long build, bounded. */
export const TERMINAL_SCROLLBACK = 5000

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * xterm colours come from the same CSS variables the rest of the app uses, so
 * the dock follows the theme instead of pinning a dark rectangle into a light
 * window. Callers re-read this when `data-theme` changes.
 */
export function readTerminalTheme(): ITheme {
  const background = cssVar('--bg-chat', '#0a0a12')
  const foreground = cssVar('--text-primary', 'rgba(255,255,255,0.82)')
  const accent = cssVar('--accent', '#6366f1')
  const muted = cssVar('--text-muted', 'rgba(255,255,255,0.56)')
  const red = cssVar('--error', '#f87171')
  const green = cssVar('--success', '#4ade80')
  const yellow = cssVar('--warning', '#fbbf24')
  const selection = cssVar('--bg-active', '#37373d')
  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    selectionBackground: selection,
    black: cssVar('--bg-primary', '#1e1e1e'),
    red,
    green,
    yellow,
    blue: accent,
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: foreground,
    brightBlack: muted,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: accent,
    brightMagenta: '#e879f9',
    brightCyan: '#67e8f9',
    brightWhite: cssVar('--text-bright', '#ffffff'),
  }
}
