import { ipcMain, BrowserWindow, dialog } from 'electron'
import { ptyManager } from '../pty/pty-manager'
import { streamBridgeManager } from '../pty/stream-bridge'
import { readSettings, writeSettings, listSessions, loadSession, deleteSession } from '../sessions/session-reader'
import { getApiKey, setApiKey, getPref, setPref, getAllPrefs } from '../config/config-manager'
import fs from 'fs'
import path from 'path'
import os from 'os'

export function registerAllHandlers(win: BrowserWindow): void {
  const send = (channel: string, ...args: unknown[]) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
  registerPtyHandlers(win, send)
  registerCliHandlers(win, send)
  registerSessionHandlers()
  registerConfigHandlers()
  registerFsHandlers()
}

// ────────────────────────────────────────────
// PTY handlers
// ────────────────────────────────────────────
function registerPtyHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  ipcMain.handle('pty:create', (_e, args) => {
    const sessionId = ptyManager.create(args)

    ptyManager.on(`data:${sessionId}`, (data: string) => {
      send('pty:data', sessionId, data)
    })

    ptyManager.on(`exit:${sessionId}`, (info: { exitCode: number; signal: string }) => {
      send('pty:exit', sessionId, info)
    })

    return sessionId
  })

  ipcMain.handle('pty:write', (_e, { sessionId, data }) => {
    ptyManager.write(sessionId, data)
  })

  ipcMain.handle('pty:resize', (_e, { sessionId, cols, rows }) => {
    ptyManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('pty:destroy', (_e, sessionId) => {
    ptyManager.destroy(sessionId)
  })
}

// ────────────────────────────────────────────
// CLI stream-json handlers
// ────────────────────────────────────────────
function registerCliHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  ipcMain.handle('cli:sendMessage', async (_e, args) => {
    // args.sessionId = real Claude session to resume (may be null for new chat)
    const bridgeId = `bridge-${Date.now()}`
    const bridge = streamBridgeManager.create(bridgeId)

    // Forward all events to renderer
    bridge.on('textDelta', (d) => send('cli:assistantText', d))
    bridge.on('thinkingDelta', (d) => send('cli:thinkingDelta', d))
    bridge.on('toolUse', (d) => send('cli:toolUse', d))
    bridge.on('toolResult', (d) => send('cli:toolResult', d))
    bridge.on('messageStop', (d) => send('cli:messageEnd', d))
    bridge.on('result', (d) => send('cli:result', d))
    bridge.on('processExit', (d) => send('cli:processExit', d))
    bridge.on('stderr', (d) => send('cli:error', { sessionId: bridgeId, error: d }))

    // Inject API key from prefs if not in env
    if (!args.env?.ANTHROPIC_API_KEY) {
      args.env = { ...(args.env || {}), ANTHROPIC_API_KEY: getApiKey() }
    }

    // Strip CLAUDECODE to allow nesting
    args.env = { ...args.env, CLAUDECODE: '' }

    try {
      await bridge.sendMessage({
        ...args,
        resumeSessionId: args.sessionId || undefined, // real Claude session ID
        sessionId: bridgeId,                          // internal bridge ID
      })
      return { success: true, sessionId: bridgeId }
    } catch (err) {
      send('cli:error', { sessionId: bridgeId, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('cli:abort', (_e, sessionId) => {
    streamBridgeManager.abort(sessionId)
  })
}

// ────────────────────────────────────────────
// Session handlers
// ─────────────────────���──────────────────────
function registerSessionHandlers(): void {
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:load', (_e, id) => loadSession(id))
  ipcMain.handle('session:delete', (_e, id) => deleteSession(id))
}

// ────────────────────────────────────────────
// Config handlers
// ────────────────────────────────────────────
function registerConfigHandlers(): void {
  ipcMain.handle('config:read', () => readSettings())
  ipcMain.handle('config:write', (_e, patch) => writeSettings(patch))
  ipcMain.handle('config:getEnv', () => ({
    apiKey: getApiKey(),
    hasApiKey: Boolean(getApiKey()),
  }))
  ipcMain.handle('config:setApiKey', (_e, key) => setApiKey(key))

  ipcMain.handle('prefs:get', (_e, key) => getPref(key))
  ipcMain.handle('prefs:set', (_e, key, value) => setPref(key, value))
  ipcMain.handle('prefs:getAll', () => getAllPrefs())
}

// ────────────────────────────────────────────
// File system handlers
// ────────────────────────────────────────────
function registerFsHandlers(): void {
  ipcMain.handle('fs:listDir', (_e, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        path: path.join(dirPath, e.name),
      })).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:showOpenDialog', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:getHome', () => os.homedir())
  ipcMain.handle('fs:ensureDir', (_e, dirPath: string) => {
    fs.mkdirSync(dirPath, { recursive: true })
    return dirPath
  })
}
