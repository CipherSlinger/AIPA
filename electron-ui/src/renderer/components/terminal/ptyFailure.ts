/**
 * Turn a main-process PTY failure into a named, translated message.
 *
 * Main prefixes every failure with a stable `PTY_*` code (`PTY_CWD_REJECTED`,
 * `PTY_NATIVE_UNAVAILABLE`, …). Electron wraps IPC rejections in
 * `Error invoking remote method 'pty:create': Error: …`, so a raw string shown
 * in a tab would leak that plumbing. This module strips the wrapper and maps
 * the code to a sentence the user can act on.
 */

export type TerminalTranslate = (key: string, params?: Record<string, string | number>) => string

const PTY_CODE_RE = /\bPTY_[A-Z_]+\b/

export function ptyFailureCode(message: string): string | null {
  const match = message.match(PTY_CODE_RE)
  return match ? match[0] : null
}

function stripIpcWrapper(message: string): string {
  const marker = message.lastIndexOf('Error: ')
  return (marker >= 0 ? message.slice(marker + 'Error: '.length) : message).trim()
}

/** The useful part of a failure, without the IPC wrapper or the code token. */
export function ptyFailureDetail(message: string, code: string | null = ptyFailureCode(message)): string {
  let detail = stripIpcWrapper(message)
  if (code) {
    const at = detail.indexOf(code)
    if (at >= 0) detail = detail.slice(at + code.length)
    detail = detail.replace(/^[:\s-]+/, '')
  }
  return detail.trim() || stripIpcWrapper(message)
}

export function describePtyFailure(message: string, t: TerminalTranslate): string {
  const code = ptyFailureCode(message)
  const detail = ptyFailureDetail(message, code)
  switch (code) {
    case 'PTY_NATIVE_UNAVAILABLE':
      return t('terminal.errors.nativeUnavailable')
    case 'PTY_CWD_INVALID':
    case 'PTY_CWD_REJECTED':
      return t('terminal.errors.cwdRejected', { reason: detail })
    case 'PTY_CWD_MISSING':
    case 'PTY_CWD_NOT_DIRECTORY':
      return t('terminal.errors.cwdMissing', { reason: detail })
    case 'PTY_KIND_INVALID':
      return t('terminal.errors.kindInvalid')
    case 'PTY_ARGS_INVALID':
      return t('terminal.errors.invalidRequest')
    case 'PTY_SHELL_UNAVAILABLE':
    case 'PTY_CODEX_UNAVAILABLE':
    case 'PTY_SPAWN_FAILED':
      return t('terminal.errors.spawnFailed', { reason: detail })
    default:
      return t('terminal.errors.unknown', { reason: detail })
  }
}
