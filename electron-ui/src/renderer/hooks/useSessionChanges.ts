/**
 * useSessionChanges -- tracks all file changes made during a conversation session.
 *
 * Scans the message array for tool uses that modify files (Edit, Write, MultiEdit, etc.)
 * and aggregates change statistics per file and per conversation turn.
 *
 * Inspired by Claude Code official source: src/hooks/useTurnDiffs.ts
 */

import { useMemo, useRef } from 'react'
import type { StandardChatMessage, ToolUseInfo, ChatMessage } from '../types/app.types'
import { countCharInString } from '../utils/stringUtils'

export interface FileChange {
  filePath: string
  basename: string
  status: 'created' | 'modified'
  linesAdded: number
  linesRemoved: number
  editCount: number
}

export interface TurnChange {
  turnIndex: number
  userPromptPreview: string
  timestamp: number
  files: FileChange[]
  stats: {
    filesChanged: number
    linesAdded: number
    linesRemoved: number
  }
}

export interface SessionChanges {
  totalFilesChanged: number
  totalLinesAdded: number
  totalLinesRemoved: number
  files: FileChange[]
  turns: TurnChange[]
}

const FILE_EDIT_TOOLS = new Set([
  'Edit', 'MultiEdit', 'str_replace_editor', 'str_replace_based_edit_tool',
])
const FILE_WRITE_TOOLS = new Set(['Write', 'create_file'])
const FILE_CHANGE_TOOLS = new Set([
  ...FILE_EDIT_TOOLS, ...FILE_WRITE_TOOLS,
])

function getBasename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

function truncatePrompt(prompt: string, max = 40): string {
  const clean = prompt.replace(/\n/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1) + '\u2026'
}

function estimateLineChanges(tool: ToolUseInfo): { added: number; removed: number } {
  const input = tool.input || {}

  // For Edit tools: compare old_str/new_str line counts
  if (FILE_EDIT_TOOLS.has(tool.name)) {
    const oldStr = String(input.old_str || input.old_string || '')
    const newStr = String(input.new_str || input.new_string || '')
    const oldLines = oldStr ? countCharInString(oldStr, '\n') + 1 : 0
    const newLines = newStr ? countCharInString(newStr, '\n') + 1 : 0
    return {
      added: Math.max(0, newLines - oldLines),
      removed: Math.max(0, oldLines - newLines),
    }
  }

  // For Write/create tools: all lines are "added"
  if (FILE_WRITE_TOOLS.has(tool.name)) {
    const content = String(input.content || '')
    const lines = content ? countCharInString(content, '\n') + 1 : 0
    return { added: lines, removed: 0 }
  }

  return { added: 0, removed: 0 }
}

function extractFilePath(tool: ToolUseInfo): string | null {
  if (!FILE_CHANGE_TOOLS.has(tool.name)) return null
  const input = tool.input || {}
  const p = String(input.path || input.file_path || '')
  return p || null
}

interface ExtractedChange {
  filePath: string
  basename: string
  isCreate: boolean
  added: number
  removed: number
}

interface ChangeCacheEntry {
  toolUses: ToolUseInfo[] | undefined
  changes: ExtractedChange[]
}

export function useSessionChanges(messages: StandardChatMessage[] | ChatMessage[]): SessionChanges {
  // PERF: extracting line changes scans tool inputs (potentially large strings).
  // Cache the result per message id + toolUses identity so streaming deltas only
  // re-scan the one message that actually changed.
  const changeCacheRef = useRef<Map<string, ChangeCacheEntry>>(new Map())

  return useMemo(() => {
    const changeCache = changeCacheRef.current
    // Filter to only StandardChatMessages (exclude PermissionMessage, PlanMessage)
    const stdMessages: StandardChatMessage[] = []
    for (const m of messages) {
      if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
        stdMessages.push(m as StandardChatMessage)
      }
    }
    const fileMap = new Map<string, FileChange>()
    const turns: TurnChange[] = []

    let turnIndex = 0
    let currentUserPrompt = ''
    let currentUserTimestamp = 0
    const currentTurnFiles = new Map<string, FileChange>()

    function flushTurn() {
      if (currentTurnFiles.size > 0) {
        const files = Array.from(currentTurnFiles.values())
        let added = 0
        let removed = 0
        for (const f of files) {
          added += f.linesAdded
          removed += f.linesRemoved
        }
        turns.push({
          turnIndex,
          userPromptPreview: truncatePrompt(currentUserPrompt),
          timestamp: currentUserTimestamp,
          files,
          stats: {
            filesChanged: files.length,
            linesAdded: added,
            linesRemoved: removed,
          },
        })
      }
      currentTurnFiles.clear()
      turnIndex++
    }

    for (const msg of stdMessages) {
      if (msg.role === 'user') {
        // New user turn: flush the previous turn
        flushTurn()
        currentUserPrompt = msg.content || ''
        currentUserTimestamp = msg.timestamp || 0
      }

      // Process tool uses in assistant messages
      if (msg.role === 'assistant' && msg.toolUses) {
        let cached = changeCache.get(msg.id)
        if (!cached || cached.toolUses !== msg.toolUses) {
          const changes: ExtractedChange[] = []
          for (const tool of msg.toolUses) {
            const filePath = extractFilePath(tool)
            if (!filePath) continue
            const lineChanges = estimateLineChanges(tool)
            changes.push({
              filePath,
              basename: getBasename(filePath),
              isCreate: FILE_WRITE_TOOLS.has(tool.name),
              added: lineChanges.added,
              removed: lineChanges.removed,
            })
          }
          cached = { toolUses: msg.toolUses, changes }
          changeCache.set(msg.id, cached)
        }

        for (const change of cached.changes) {
          const { filePath, basename: bn, isCreate } = change

          // Update global file map
          const existing = fileMap.get(filePath)
          if (existing) {
            existing.linesAdded += change.added
            existing.linesRemoved += change.removed
            existing.editCount++
          } else {
            fileMap.set(filePath, {
              filePath,
              basename: bn,
              status: isCreate ? 'created' : 'modified',
              linesAdded: change.added,
              linesRemoved: change.removed,
              editCount: 1,
            })
          }

          // Update current turn file map
          const turnExisting = currentTurnFiles.get(filePath)
          if (turnExisting) {
            turnExisting.linesAdded += change.added
            turnExisting.linesRemoved += change.removed
            turnExisting.editCount++
          } else {
            currentTurnFiles.set(filePath, {
              filePath,
              basename: bn,
              status: isCreate ? 'created' : 'modified',
              linesAdded: change.added,
              linesRemoved: change.removed,
              editCount: 1,
            })
          }
        }
      }
    }

    // Drop cache entries for messages that are no longer in the conversation
    if (changeCache.size > stdMessages.length) {
      const liveIds = new Set<string>()
      for (const m of stdMessages) liveIds.add(m.id)
      for (const id of changeCache.keys()) {
        if (!liveIds.has(id)) changeCache.delete(id)
      }
    }

    // Flush the last turn
    flushTurn()

    // Sort files by total changes (descending)
    const files = Array.from(fileMap.values()).sort(
      (a, b) => (b.linesAdded + b.linesRemoved) - (a.linesAdded + a.linesRemoved)
    )

    let totalAdded = 0
    let totalRemoved = 0
    for (const f of files) {
      totalAdded += f.linesAdded
      totalRemoved += f.linesRemoved
    }

    return {
      totalFilesChanged: files.length,
      totalLinesAdded: totalAdded,
      totalLinesRemoved: totalRemoved,
      files,
      turns: turns.filter(t => t.stats.filesChanged > 0),
    }
  }, [messages])
}
