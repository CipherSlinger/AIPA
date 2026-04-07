import fs from 'fs'
import path from 'path'
import os from 'os'

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')

export interface SessionStats {
  totalSessions: number
  totalMessages: { user: number; assistant: number; tool: number }
  totalTokens: { input: number; output: number } | null
  toolUsage: { name: string; count: number }[]
  dailyActivity: { date: string; sessions: number; messages: number }[]
  averageSessionMessages: number
  dateRange: { from: string; to: string }
}

// 5-minute in-memory cache
let statsCache: { data: SessionStats; ts: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

// Cutoff: only scan files modified in the last 90 days
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function dateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function getSessionStats(): SessionStats {
  const now = Date.now()
  if (statsCache && now - statsCache.ts < CACHE_TTL_MS) {
    return statsCache.data
  }

  const totalMessages = { user: 0, assistant: 0, tool: 0 }
  const toolCounts: Record<string, number> = {}
  const dailyMap: Record<string, { sessions: number; messages: number }> = {}
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let hasTokenData = false
  let totalSessions = 0
  const cutoff = now - NINETY_DAYS_MS

  if (!fs.existsSync(PROJECTS_DIR)) {
    return buildEmpty()
  }

  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of projectDirs) {
      const dirPath = path.join(PROJECTS_DIR, dir.name)
      let files: string[]
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))
      } catch {
        continue
      }

      for (const file of files) {
        const filePath = path.join(dirPath, file)
        try {
          const stat = fs.statSync(filePath)
          if (stat.mtimeMs < cutoff) continue

          const raw = fs.readFileSync(filePath, 'utf-8')
          const lines = raw.split('\n').filter(l => l.trim())
          if (lines.length === 0) continue

          totalSessions++
          let sessionMsgCount = 0
          let sessionTs: number | null = null

          for (const line of lines) {
            let entry: Record<string, unknown>
            try {
              entry = JSON.parse(line)
            } catch {
              continue
            }

            // Determine timestamp for this entry
            const ts = typeof entry.timestamp === 'string'
              ? new Date(entry.timestamp).getTime()
              : typeof entry.timestamp === 'number'
                ? entry.timestamp
                : null

            if (ts && !sessionTs) sessionTs = ts

            const role = entry.role as string | undefined
            const type = entry.type as string | undefined

            // Count messages by role
            if (role === 'user') {
              totalMessages.user++
              sessionMsgCount++
            } else if (role === 'assistant') {
              totalMessages.assistant++
              sessionMsgCount++
            }

            // Tool use entries
            if (type === 'tool_use' || (role === 'assistant' && entry.type === 'tool_use')) {
              const toolName = (entry.name as string) || 'unknown'
              toolCounts[toolName] = (toolCounts[toolName] || 0) + 1
              totalMessages.tool++
            }

            // Parse nested message object (CLI stream-json format)
            const msg = entry.message as Record<string, unknown> | undefined
            if (msg) {
              const msgRole = msg.role as string | undefined
              if (msgRole === 'user') {
                totalMessages.user++
                sessionMsgCount++
              } else if (msgRole === 'assistant') {
                totalMessages.assistant++
                sessionMsgCount++
              }

              // Tool use in content array
              const content = msg.content as unknown[]
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block && typeof block === 'object') {
                    const b = block as Record<string, unknown>
                    if (b.type === 'tool_use') {
                      const toolName = (b.name as string) || 'unknown'
                      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1
                      totalMessages.tool++
                    }
                  }
                }
              }

              // Token usage
              const usage = msg.usage as Record<string, unknown> | undefined
              if (usage) {
                const inp = usage.input_tokens as number | undefined
                const out = usage.output_tokens as number | undefined
                if (typeof inp === 'number') { totalInputTokens += inp; hasTokenData = true }
                if (typeof out === 'number') { totalOutputTokens += out; hasTokenData = true }
              }
            }

            // Top-level usage (result entries)
            const usage = entry.usage as Record<string, unknown> | undefined
            if (usage) {
              const inp = usage.input_tokens as number | undefined
              const out = usage.output_tokens as number | undefined
              if (typeof inp === 'number') { totalInputTokens += inp; hasTokenData = true }
              if (typeof out === 'number') { totalOutputTokens += out; hasTokenData = true }
            }
          }

          // Daily activity: key by session's first timestamp
          const dayKey = sessionTs ? dateKey(sessionTs) : dateKey(stat.mtimeMs)
          if (!dailyMap[dayKey]) dailyMap[dayKey] = { sessions: 0, messages: 0 }
          dailyMap[dayKey].sessions++
          dailyMap[dayKey].messages += sessionMsgCount
        } catch {
          continue
        }
      }
    }
  } catch {
    return buildEmpty()
  }

  // Build sorted tool usage top list
  const toolUsage = Object.entries(toolCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Build daily activity array for last 90 days, sorted ascending
  const today = dateKey(now)
  const allDays: { date: string; sessions: number; messages: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000)
    const key = dateKey(d.getTime())
    allDays.push({ date: key, ...(dailyMap[key] || { sessions: 0, messages: 0 }) })
  }

  const averageSessionMessages = totalSessions > 0
    ? Math.round((totalMessages.user + totalMessages.assistant) / totalSessions)
    : 0

  const dates = Object.keys(dailyMap).sort()
  const dateRange = {
    from: dates[0] || today,
    to: dates[dates.length - 1] || today,
  }

  const result: SessionStats = {
    totalSessions,
    totalMessages,
    totalTokens: hasTokenData ? { input: totalInputTokens, output: totalOutputTokens } : null,
    toolUsage,
    dailyActivity: allDays,
    averageSessionMessages,
    dateRange,
  }

  statsCache = { data: result, ts: now }
  return result
}

function buildEmpty(): SessionStats {
  const today = dateKey(Date.now())
  return {
    totalSessions: 0,
    totalMessages: { user: 0, assistant: 0, tool: 0 },
    totalTokens: null,
    toolUsage: [],
    dailyActivity: [],
    averageSessionMessages: 0,
    dateRange: { from: today, to: today },
  }
}
