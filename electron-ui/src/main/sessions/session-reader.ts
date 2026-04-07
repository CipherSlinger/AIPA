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
  messageCount?: number
  firstTimestamp?: number
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
            let firstTimestamp = Infinity
            let project = decodeProjectSlug(projectSlug)
            let title: string | undefined
            let messageCount = 0

            for (const line of lines) {
              try {
                const entry = JSON.parse(line)
                if (entry.timestamp) {
                  const t = new Date(entry.timestamp).getTime()
                  if (t > timestamp) timestamp = t
                  if (t < firstTimestamp) firstTimestamp = t
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
                if (entry.type === 'user' || entry.type === 'assistant') {
                  messageCount++
                }
              } catch {}
            }

            if (timestamp > 0) {
              const ft = firstTimestamp < Infinity ? firstTimestamp : undefined
              sessions.push({ sessionId, lastPrompt, timestamp, project, projectSlug, title, messageCount, firstTimestamp: ft })
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

/**
 * Detect turn interruption in a session's JSONL file.
 * Inspired by Claude Code's utils/conversationRecovery.ts detectTurnInterruption().
 *
 * Returns:
 * - 'none'                 — session completed normally
 * - 'interrupted_prompt'   — user sent a message but AI never responded
 * - 'interrupted_turn'     — AI was mid-response when the session ended
 */
export type TurnInterruptionResult = 'none' | 'interrupted_prompt' | 'interrupted_turn'

export function detectTurnInterruption(sessionId: string): TurnInterruptionResult {
  if (!fs.existsSync(PROJECTS_DIR)) return 'none'

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (!fs.existsSync(filePath)) continue

    const lines = fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)

    if (lines.length === 0) return 'none'

    // Walk backward from end to find the last meaningful event
    let lastUserIdx = -1
    let lastAssistantIdx = -1
    let lastResultIdx = -1

    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = lines[i] as Record<string, unknown>
      if (lastUserIdx < 0 && entry.type === 'user') lastUserIdx = i
      if (lastAssistantIdx < 0 && (entry.type === 'assistant' || entry.role === 'assistant')) lastAssistantIdx = i
      if (lastResultIdx < 0 && entry.type === 'result') lastResultIdx = i
      if (lastUserIdx >= 0 && lastAssistantIdx >= 0 && lastResultIdx >= 0) break
    }

    // If we have a result event, the session completed normally
    if (lastResultIdx >= 0 && lastResultIdx > lastUserIdx) return 'none'

    // User sent message but no assistant response followed
    if (lastUserIdx >= 0 && lastAssistantIdx < lastUserIdx) return 'interrupted_prompt'

    // Assistant was responding but no result event after the last assistant message
    if (lastAssistantIdx >= 0 && lastResultIdx < lastAssistantIdx) return 'interrupted_turn'

    return 'none'
  }

  return 'none'
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

/**
 * Generate a prompt suggestion (predict what the user will type next)
 * using a lightweight CLI call with --print mode.
 * Context: last few user/assistant message pairs for prediction.
 */
export function generatePromptSuggestion(context: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const systemPrompt = 'You are a prompt predictor. Given the conversation context, predict what the user would naturally type next as their follow-up message. Output ONLY the predicted prompt text (2-12 words). Match the user\'s language and style. No quotes, no explanation.'
    const proc = spawn(nodePath, [
      cliPath,
      '--print',
      '--output-format', 'text',
      '--max-turns', '1',
      '--append-system-prompt', systemPrompt,
      '-p', `Conversation context:\n${context}\n\nPredict the user's next message (2-12 words):`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      const suggestion = output.trim().replace(/^["']|["']$/g, '').trim()
      resolve(suggestion.length > 0 && suggestion.length <= 120 ? suggestion : '')
    })
    // Timeout after 10 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve('') }, 10000)
  })
}

/**
 * Generate an "away summary" — a short 1-3 sentence recap of the conversation
 * context for the "while you were away" dialog. Uses a lightweight CLI call.
 */
export function generateAwaySummary(context: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const systemPrompt = 'You are a session recap assistant. The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task — what they are building or debugging, not implementation details. Next: the concrete next step. Skip status reports and commit recaps. Match the user\'s language.'
    const proc = spawn(nodePath, [
      cliPath,
      '--print',
      '--output-format', 'text',
      '--max-turns', '1',
      '--append-system-prompt', systemPrompt,
      '-p', `Conversation context:\n${context}\n\nWrite a 1-3 sentence recap of where we left off:`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      const summary = output.trim()
      resolve(summary.length > 0 && summary.length <= 500 ? summary : '')
    })
    // Timeout after 10 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve('') }, 10000)
  })
}

export interface SearchResult {
  sessionId: string
  title?: string
  project: string
  matchType: 'title' | 'content'
  snippet: string
  timestamp: number
}

export function searchSessions(query: string, limit = 30): SearchResult[] {
  if (!query || query.length < 2 || !fs.existsSync(PROJECTS_DIR)) return []

  const results: SearchResult[] = []
  const lowerQuery = query.toLowerCase()

  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of projectDirs) {
      if (results.length >= limit) break
      const projectSlug = dir.name
      const dirPath = path.join(PROJECTS_DIR, projectSlug)

      try {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))

        for (const file of files) {
          if (results.length >= limit) break
          const sessionId = file.replace('.jsonl', '')
          const filePath = path.join(dirPath, file)

          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const lines = content.split('\n').filter(l => l.trim())

            let title: string | undefined
            let timestamp = 0
            let titleMatched = false
            let bestSnippet = ''

            for (const line of lines) {
              try {
                const entry = JSON.parse(line)

                if (entry.timestamp) {
                  const t = new Date(entry.timestamp).getTime()
                  if (t > timestamp) timestamp = t
                }

                if (entry.type === 'session-title' && entry.title) {
                  title = String(entry.title)
                  if (title.toLowerCase().includes(lowerQuery)) {
                    titleMatched = true
                  }
                }

                // Search in message content
                if (!bestSnippet && (entry.type === 'user' || entry.type === 'assistant')) {
                  let text = ''
                  if (entry.message?.content) {
                    const c = entry.message.content
                    if (typeof c === 'string') text = c
                    else if (Array.isArray(c)) {
                      const textPart = c.find((p: Record<string, unknown>) => p.type === 'text')
                      if (textPart?.text) text = String(textPart.text)
                    }
                  }
                  const lowerText = text.toLowerCase()
                  const idx = lowerText.indexOf(lowerQuery)
                  if (idx !== -1) {
                    const start = Math.max(0, idx - 40)
                    const end = Math.min(text.length, idx + query.length + 40)
                    bestSnippet = (start > 0 ? '...' : '') +
                      text.slice(start, end).replace(/\n/g, ' ') +
                      (end < text.length ? '...' : '')
                  }
                }
              } catch {}
            }

            if (titleMatched) {
              results.push({
                sessionId,
                title,
                project: decodeProjectSlug(projectSlug),
                matchType: 'title',
                snippet: title || '',
                timestamp,
              })
            } else if (bestSnippet) {
              results.push({
                sessionId,
                title,
                project: decodeProjectSlug(projectSlug),
                matchType: 'content',
                snippet: bestSnippet,
                timestamp,
              })
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
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
