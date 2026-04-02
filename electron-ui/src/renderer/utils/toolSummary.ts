/**
 * Tool Use Summary Label Generator
 *
 * Generates human-readable one-line summary labels for completed tool calls.
 * Inspired by Claude Code official source: src/services/toolUseSummary/toolUseSummaryGenerator.ts
 *
 * All generation is client-side algorithmic (no API calls needed).
 */

import type { ToolUseInfo } from '../types/app.types'

/** Extract just the filename from a path */
function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

/** Extract hostname from URL */
function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.slice(0, 40)
  }
}

/** Truncate string with ellipsis */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '\u2026'
}

/** Get first meaningful line from a multi-line command */
function firstLine(cmd: string): string {
  const lines = cmd.split('\n').filter(l => l.trim())
  return lines[0]?.trim() || cmd.trim()
}

/** Strip leading $, >, or # from shell commands */
function stripPrompt(cmd: string): string {
  return cmd.replace(/^\s*[$>#]\s*/, '')
}

/**
 * Generate a human-readable summary label for a tool use.
 * Returns a short past-tense description of what the tool did.
 */
export function generateToolSummary(tool: ToolUseInfo): string {
  const { name, input } = tool

  switch (name) {
    case 'Bash':
    case 'computer': {
      const cmd = String(input.command || '')
      const clean = stripPrompt(firstLine(cmd))
      return clean ? truncate(clean, 50) : 'Ran command'
    }

    case 'Edit':
    case 'str_replace_editor':
    case 'str_replace_based_edit_tool': {
      const filePath = String(input.path || input.file_path || '')
      return filePath ? `Edited ${basename(filePath)}` : 'Edited file'
    }

    case 'MultiEdit': {
      const filePath = String(input.path || input.file_path || '')
      const edits = Array.isArray(input.edits) ? input.edits.length : '?'
      return filePath
        ? `Edited ${edits} sections in ${basename(filePath)}`
        : `Edited ${edits} sections`
    }

    case 'Write':
    case 'create_file': {
      const filePath = String(input.path || input.file_path || '')
      const file = filePath ? basename(filePath) : 'file'
      // Heuristic: if content is provided and file path doesn't exist yet, it's "Created"
      // Otherwise fall back to "Wrote"
      return input.content !== undefined ? `Created ${file}` : `Wrote ${file}`
    }

    case 'Read':
    case 'read_file': {
      const filePath = String(input.path || input.file_path || '')
      return filePath ? `Read ${basename(filePath)}` : 'Read file'
    }

    case 'Grep': {
      const pattern = String(input.pattern || '')
      return pattern ? `Searched for '${truncate(pattern, 30)}'` : 'Searched content'
    }

    case 'Glob': {
      const pattern = String(input.pattern || '')
      return pattern ? `Found files matching ${truncate(pattern, 30)}` : 'Found files'
    }

    case 'LS': {
      const dir = String(input.path || '')
      return dir ? `Listed ${truncate(dir, 40)}` : 'Listed files'
    }

    case 'WebFetch': {
      const url = String(input.url || '')
      return url ? `Fetched ${hostname(url)}` : 'Fetched URL'
    }

    case 'WebSearch': {
      const query = String(input.query || '')
      return query ? `Web search: ${truncate(query, 40)}` : 'Web search'
    }

    case 'NotebookEdit': {
      const notebook = String(input.notebook_path || input.path || '')
      return notebook ? `Edited notebook ${basename(notebook)}` : 'Edited notebook'
    }

    default:
      // Fallback: show raw tool name
      return name
  }
}

/**
 * Tool type categories for batch grouping
 */
const TOOL_CATEGORIES: Record<string, string> = {
  Bash: 'command',
  computer: 'command',
  Edit: 'edit',
  MultiEdit: 'edit',
  str_replace_editor: 'edit',
  str_replace_based_edit_tool: 'edit',
  Write: 'write',
  create_file: 'write',
  Read: 'read',
  read_file: 'read',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  WebFetch: 'web',
  WebSearch: 'web',
}

/** Get category for batch grouping */
export function getToolCategory(toolName: string): string {
  return TOOL_CATEGORIES[toolName] || toolName
}

/**
 * Generate a batch summary label for a group of same-category tool uses.
 */
export function generateBatchSummary(tools: ToolUseInfo[]): string {
  if (tools.length === 0) return ''
  if (tools.length === 1) return generateToolSummary(tools[0])

  const category = getToolCategory(tools[0].name)
  const count = tools.length

  switch (category) {
    case 'read':
      return `Read ${count} files`
    case 'edit':
      return `Edited ${count} files`
    case 'write':
      return `Wrote ${count} files`
    case 'search':
      return `Searched ${count} times`
    case 'command':
      return `Ran ${count} commands`
    case 'web':
      return `Fetched ${count} URLs`
    default:
      return `${tools[0].name} x${count}`
  }
}

/**
 * Group consecutive tool uses of the same category into batches.
 * Only groups 3+ consecutive same-category tools.
 * Returns an array of groups, where each group is either a single tool or a batch.
 */
export interface ToolGroup {
  type: 'single' | 'batch'
  tools: ToolUseInfo[]
  summary: string
}

export function groupToolUses(tools: ToolUseInfo[]): ToolGroup[] {
  if (!tools || tools.length === 0) return []

  const groups: ToolGroup[] = []
  let currentBatch: ToolUseInfo[] = [tools[0]]
  let currentCategory = getToolCategory(tools[0].name)

  for (let i = 1; i < tools.length; i++) {
    const cat = getToolCategory(tools[i].name)
    if (cat === currentCategory) {
      currentBatch.push(tools[i])
    } else {
      // Flush current batch
      flushBatch(currentBatch, groups)
      currentBatch = [tools[i]]
      currentCategory = cat
    }
  }
  // Flush last batch
  flushBatch(currentBatch, groups)

  return groups
}

function flushBatch(batch: ToolUseInfo[], groups: ToolGroup[]): void {
  if (batch.length >= 3) {
    groups.push({
      type: 'batch',
      tools: batch,
      summary: generateBatchSummary(batch),
    })
  } else {
    // Not enough for a batch -- add as individual items
    for (const tool of batch) {
      groups.push({
        type: 'single',
        tools: [tool],
        summary: generateToolSummary(tool),
      })
    }
  }
}
