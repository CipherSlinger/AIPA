/**
 * useSessionChanges -- tracks all file changes made during a conversation session.
 *
 * Scans the message array for tool uses that modify files (Edit, Write, MultiEdit, etc.)
 * and aggregates change statistics per file and per conversation turn.
 *
 * Inspired by Claude Code official source: src/hooks/useTurnDiffs.ts
 */

import { useMemo } from 'react'
import type { StandardChatMessage, ToolUseInfo, ChatMessage } from '../types/app.types'

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
    const oldLines = oldStr ? oldStr.split('\n').length : 0
    const newLines = newStr ? newStr.split('\n').length : 0
    return {
      added: Math.max(0, newLines - oldLines),
      removed: Math.max(0, oldLines - newLines),
    }
  }

  // For Write/create tools: all lines are "added"
  if (FILE_WRITE_TOOLS.has(tool.name)) {
    const content = String(input.content || '')
    const lines = content ? content.split('\n').length : 0
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

export function useSessionChanges(messages: StandardChatMessage[] | ChatMessage[]): SessionChanges {
  return useMemo(() => {
    // Filter to only StandardChatMessages (exclude PermissionMessage, PlanMessage)
    const stdMessages = messages.filter(
      (m): m is StandardChatMessage => m.role === 'user' || m.role === 'assistant' || m.role === 'system'
    )
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
        for (const tool of msg.toolUses) {
          const filePath = extractFilePath(tool)
          if (!filePath) continue

          const lineChanges = estimateLineChanges(tool)
          const isCreate = FILE_WRITE_TOOLS.has(tool.name)
          const bn = getBasename(filePath)

          // Update global file map
          const existing = fileMap.get(filePath)
          if (existing) {
            existing.linesAdded += lineChanges.added
            existing.linesRemoved += lineChanges.removed
            existing.editCount++
          } else {
            fileMap.set(filePath, {
              filePath,
              basename: bn,
              status: isCreate ? 'created' : 'modified',
              linesAdded: lineChanges.added,
              linesRemoved: lineChanges.removed,
              editCount: 1,
            })
          }

          // Update current turn file map
          const turnExisting = currentTurnFiles.get(filePath)
          if (turnExisting) {
            turnExisting.linesAdded += lineChanges.added
            turnExisting.linesRemoved += lineChanges.removed
            turnExisting.editCount++
          } else {
            currentTurnFiles.set(filePath, {
              filePath,
              basename: bn,
              status: isCreate ? 'created' : 'modified',
              linesAdded: lineChanges.added,
              linesRemoved: lineChanges.removed,
              editCount: 1,
            })
          }
        }
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
