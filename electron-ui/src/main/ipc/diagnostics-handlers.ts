import { ipcMain, app } from 'electron'
import { ptyManager } from '../pty/pty-manager'
import { listSessions } from '../sessions/session-reader'
import { getApiKey } from '../config/config-manager'
import { getCliPath } from '../utils/cli-path'
import fs from 'fs'
import path from 'path'
import os from 'os'

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle('system:runDiagnostics', async () => {
    const results: {
      id: string
      label: string
      status: 'ok' | 'warning' | 'error'
      detail: string
      subDetail?: string
    }[] = []

    // 1. CLI Engine check
    try {
      const cliPath = getCliPath()
      if (cliPath && fs.existsSync(cliPath)) {
        results.push({ id: 'cli', label: 'CLI Engine', status: 'ok', detail: 'cli.js found', subDetail: `Path: ${cliPath}` })
      } else {
        results.push({ id: 'cli', label: 'CLI Engine', status: 'error', detail: 'cli.js not found', subDetail: 'Check CLAUDE_CLI_PATH env var' })
      }
    } catch (err) {
      results.push({ id: 'cli', label: 'CLI Engine', status: 'error', detail: String(err) })
    }

    // 2. PTY check
    try {
      const ptyAvailable = ptyManager.isAvailable()
      if (ptyAvailable) {
        results.push({ id: 'pty', label: 'Terminal (PTY)', status: 'ok', detail: 'node-pty OK' })
      } else {
        const loadErr = ptyManager.getLoadError()
        results.push({ id: 'pty', label: 'Terminal (PTY)', status: 'warning', detail: 'node-pty unavailable', subDetail: loadErr || 'Fallback shell mode active' })
      }
    } catch (err) {
      results.push({ id: 'pty', label: 'Terminal (PTY)', status: 'warning', detail: String(err) })
    }

    // 3. API Key check
    try {
      const apiKey = getApiKey()
      if (apiKey) {
        const masked = apiKey.slice(0, 7) + '...' + apiKey.slice(-4)
        results.push({ id: 'apikey', label: 'API Key', status: 'ok', detail: 'Configured', subDetail: masked })
      } else {
        results.push({ id: 'apikey', label: 'API Key', status: 'error', detail: 'Not configured', subDetail: 'Set your API key in Settings' })
      }
    } catch (err) {
      results.push({ id: 'apikey', label: 'API Key', status: 'error', detail: String(err) })
    }

    // 4. System info
    try {
      const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
      results.push({
        id: 'system',
        label: 'System',
        status: 'ok',
        detail: `${os.type()} ${os.release()}`,
        subDetail: `Electron ${process.versions.electron} | Node ${process.versions.node} | Memory: ${memMB} MB`,
      })
    } catch (err) {
      results.push({ id: 'system', label: 'System', status: 'warning', detail: String(err) })
    }

    // 5. Sessions stats
    try {
      const sessions = await listSessions()
      const claudeDir = path.join(os.homedir(), '.claude', 'projects')
      let diskSizeMB = 0
      if (fs.existsSync(claudeDir)) {
        const getDirSize = (dir: string): number => {
          let total = 0
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
              const entryPath = path.join(dir, entry.name)
              if (entry.isFile()) {
                try { total += fs.statSync(entryPath).size } catch { /* skip */ }
              } else if (entry.isDirectory()) {
                total += getDirSize(entryPath)
              }
            }
          } catch { /* skip */ }
          return total
        }
        diskSizeMB = Math.round(getDirSize(claudeDir) / 1024 / 1024 * 10) / 10
      }
      results.push({
        id: 'sessions',
        label: 'Sessions',
        status: 'ok',
        detail: `${sessions.length} sessions`,
        subDetail: `Disk: ${diskSizeMB} MB in ~/.claude/projects/`,
      })
    } catch (err) {
      results.push({ id: 'sessions', label: 'Sessions', status: 'warning', detail: String(err) })
    }

    return results
  })
}
