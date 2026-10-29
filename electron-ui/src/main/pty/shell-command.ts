import path from 'path'

/**
 * The user's own login shell, resolved by the main process.
 *
 * This is the one place that decides which executable a terminal is allowed to
 * run. The renderer never supplies an executable (or an argument vector): a
 * terminal is the user opening *their* shell, which is the consent boundary —
 * but the path still comes from the environment main was started with, not
 * from an IPC payload.
 */
export interface ShellCommand {
  /** Absolute path or a PATH-resolved name from the environment. */
  file: string
  args: string[]
  /** Short name for the tab (e.g. "cmd.exe" or "bash"), never a full path. */
  label: string
}

export function resolveShellCommand(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ShellCommand {
  if (platform === 'win32') {
    const file = env.COMSPEC?.trim() || 'cmd.exe'
    return { file, args: [], label: path.basename(file) || 'cmd.exe' }
  }
  const file = env.SHELL?.trim() || '/bin/bash'
  return { file, args: ['-l'], label: path.basename(file) || 'bash' }
}
