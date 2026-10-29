import { ipcMain } from 'electron'

/**
 * Safely register an IPC handle, removing any previous handler first.
 * This prevents "Attempted to register a second handler" crashes.
 *
 * This is the only copy in the main process: every IPC group imports it, so a
 * hot reload or a second `registerAllHandlers` call cannot crash the app on any
 * channel.
 */
export function safeHandle(channel: string, handler: (...args: any[]) => any): void {
  try { ipcMain.removeHandler(channel) } catch { /* no previous handler */ }
  ipcMain.handle(channel, handler)
}
