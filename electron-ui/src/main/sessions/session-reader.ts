import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json')
const HISTORY_PATH = path.join(CLAUDE_DIR, 'history.jsonl')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

export interface ClaudeSettings {
  apiKeyHelper?: string
  model?: string
  [key: string]: unknown
}

export interface SessionListItem {
  sessionId: string
  lastPrompt: string
  timestamp: number
  project: string
  projectSlug: string
  title?: string
}

export interface SessionMessage {
  type: string
  role?: string
  content?: unknown
  message?: unknown
  timestamp?: number
  [key: string]: unknown
}

export function readSettings(): ClaudeSettings {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {}
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    return JSON.parse(raw) as ClaudeSettings
  } catch {
    return {}
  }
}

export function writeSettings(patch: Partial<ClaudeSettings>): void {
  const current = readSettings()
  const merged = { ...current, ...patch }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8')
}

export function listSessions(): SessionListItem[] {
  const sessions: SessionListItem[] = []

  if (!fs.existsSync(PROJECTS_DIR)) return sessions

  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of projectDirs) {
      const projectSlug = dir.name
      const dirPath = path.join(PROJECTS_DIR, projectSlug)

      try {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.jsonl'))

        for (const file of files) {
          const sessionId = file.replace('.jsonl', '')
          const filePath = path.join(dirPath, file)

          try {
            const lines = fs.readFileSync(filePath, 'utf-8')
              .split('\n')
              .filter(l => l.trim())

            let lastPrompt = ''
            let timestamp = 0
            let project = decodeProjectSlug(projectSlug)
            let title: string | undefined

            for (const line of lines) {
              try {
                const entry = JSON.parse(line)
                if (entry.timestamp) {
                  const t = new Date(entry.timestamp).getTime()
                  if (t > timestamp) timestamp = t
                }
                if (entry.type === 'last-prompt' && entry.prompt) {
                  lastPrompt = String(entry.prompt).slice(0, 120)
                }
                if (entry.type === 'user' && entry.message?.content) {
                  const content = entry.message.content
                  if (typeof content === 'string') lastPrompt = content.slice(0, 120)
                  else if (Array.isArray(content)) {
                    const textPart = content.find((c: Record<string, unknown>) => c.type === 'text')
                    if (textPart?.text) lastPrompt = String(textPart.text).slice(0, 120)
                  }
                }
                if (entry.type === 'session-title' && entry.title) {
                  title = String(entry.title)
                }
              } catch {}
            }

            if (timestamp > 0) {
              sessions.push({ sessionId, lastPrompt, timestamp, project, projectSlug, title })
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  return sessions.sort((a, b) => b.timestamp - a.timestamp)
}

export function loadSession(sessionId: string): SessionMessage[] {
  if (!fs.existsSync(PROJECTS_DIR)) return []

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => { try { return JSON.parse(l) as SessionMessage } catch { return null } })
        .filter(Boolean) as SessionMessage[]
    }
  }
  return []
}

export function deleteSession(sessionId: string): boolean {

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  }
  return false
}

function decodeProjectSlug(slug: string): string {
  // Claude stores project paths as slug by replacing / and \ with -
  // Try to reverse it to a readable path
  try {
    return slug.replace(/-/g, path.sep)
  } catch {
    return slug
  }
}

export function forkSession(sessionId: string, upToMessageIndex: number): string | null {
  if (!fs.existsSync(PROJECTS_DIR)) return null

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(l => l.trim())
      const truncated = lines.slice(0, upToMessageIndex + 1)
      const newSessionId = `fork-${Date.now()}`
      const newFilePath = path.join(PROJECTS_DIR, dir.name, `${newSessionId}.jsonl`)
      fs.writeFileSync(newFilePath, truncated.join('\n') + '\n', 'utf-8')
      return newSessionId
    }
  }
  return null
}

export function renameSession(sessionId: string, title: string): boolean {
  if (!fs.existsSync(PROJECTS_DIR)) return false

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      const titleEntry = JSON.stringify({ type: 'session-title', title, timestamp: new Date().toISOString() })
      fs.appendFileSync(filePath, titleEntry + '\n', 'utf-8')
      return true
    }
  }
  return false
}

export interface McpServerEntry {
  name: string
  command?: string
  args?: string[]
  disabled?: boolean
  type?: string
}

export function getMcpServers(): McpServerEntry[] {
  const settings = readSettings() as Record<string, unknown>
  const mcpServers = settings.mcpServers as Record<string, Record<string, unknown>> | undefined
  if (!mcpServers) return []
  return Object.entries(mcpServers).map(([name, cfg]) => ({
    name,
    command: cfg.command as string | undefined,
    args: cfg.args as string[] | undefined,
    disabled: cfg.disabled as boolean | undefined,
    type: cfg.type as string | undefined,
  }))
}

export function setMcpServerEnabled(serverName: string, enabled: boolean): void {
  const settings = readSettings() as Record<string, unknown>
  const mcpServers = { ...(settings.mcpServers as Record<string, unknown> || {}) }
  if (mcpServers[serverName]) {
    mcpServers[serverName] = { ...(mcpServers[serverName] as Record<string, unknown>), disabled: !enabled }
  }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...settings, mcpServers }, null, 2), 'utf-8')
}

export function generateSessionTitle(description: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const proc = spawn(nodePath, [
      cliPath,
      'generate-session-title',
      '--description', description.slice(0, 200),
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(output.trim())
        resolve(parsed.title || parsed.result || output.trim().slice(0, 80))
      } catch {
        resolve(output.trim().slice(0, 80) || description.slice(0, 40))
      }
    })
    // Timeout after 8 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve(description.slice(0, 40)) }, 8000)
  })
}

export function rewindSession(sessionId: string, beforeTimestamp: string, cliPath: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    if (!fs.existsSync(PROJECTS_DIR)) {
      resolve({ success: false, error: 'Projects directory not found' })
      return
    }
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    let sessionFound = false
    for (const dir of projectDirs) {
      const fp = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
      if (fs.existsSync(fp)) { sessionFound = true; break }
    }
    if (!sessionFound) {
      resolve({ success: false, error: `Session ${sessionId} not found` })
      return
    }

    const proc = spawn(nodePath, [
      cliPath,
      '--resume', sessionId,
      '--resume-session-at', beforeTimestamp,
      '--rewind-files',
      '--print',
      '--output-format', 'stream-json',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve({ success: true })
      else resolve({ success: false, error: stderr.slice(0, 500) || `Exit code ${code}` })
    })
    setTimeout(() => { try { proc.kill() } catch {} resolve({ success: false, error: 'Timeout after 15s' }) }, 15000)
  })
}
