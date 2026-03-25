import fs from 'fs'
import path from 'path'
import os from 'os'

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

export function addToolPermission(toolName: string): void {
  const settings = readSettings() as Record<string, unknown>
  const perms = (settings.permissions ?? {}) as Record<string, unknown>
  const allow = Array.isArray(perms.allow) ? [...perms.allow] : []
  if (!allow.includes(toolName)) {
    allow.push(toolName)
  }
  const merged = { ...settings, permissions: { ...perms, allow } }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8')
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
              } catch {}
            }

            if (timestamp > 0) {
              sessions.push({ sessionId, lastPrompt, timestamp, project, projectSlug })
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
  if (!fs.existsSync(PROJECTS_DIR)) return false

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
