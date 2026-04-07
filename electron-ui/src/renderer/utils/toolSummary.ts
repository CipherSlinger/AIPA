/**
 * Tool Use Summary Label Generator
 *
 * Generates human-readable one-line summary labels for completed tool calls.
 * Inspired by Claude Code official source: src/services/toolUseSummary/toolUseSummaryGenerator.ts
 *
 * All generation is client-side algorithmic (no API calls needed).
 */

import type { ToolUseInfo } from '../types/app.types'
import { firstLineOf } from './stringUtils'

/** Translation function type -- accepts a key and optional params */
export type TranslateFn = (key: string, params?: Record<string, string>) => string

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
  return firstLineOf(cmd.trim()) || cmd.trim()
}

/** Strip leading $, >, or # from shell commands */
function stripPrompt(cmd: string): string {
  return cmd.replace(/^\s*[$>#]\s*/, '')
}

/**
 * Generate a human-readable summary label for a tool use.
 * Returns a short past-tense description of what the tool did.
 * When a translation function `t` is provided, uses i18n keys for localized output.
 */
export function generateToolSummary(tool: ToolUseInfo, t?: TranslateFn): string {
  const { name, input } = tool

  switch (name) {
    case 'Bash':
    case 'computer': {
      const cmd = String(input.command || '')
      const clean = stripPrompt(firstLine(cmd))
      return clean
        ? (t ? t('tool.summaryRan', { cmd: truncate(clean, 50) }) : truncate(clean, 50))
        : (t ? t('tool.summaryRan', { cmd: 'command' }) : 'Ran command')
    }

    case 'Edit':
    case 'str_replace_editor':
    case 'str_replace_based_edit_tool': {
      const filePath = String(input.path || input.file_path || '')
      const file = filePath ? basename(filePath) : 'file'
      return t ? t('tool.summaryEdited', { file }) : `Edited ${file}`
    }

    case 'MultiEdit': {
      const filePath = String(input.path || input.file_path || '')
      const edits = String(Array.isArray(input.edits) ? input.edits.length : '?')
      const file = filePath ? basename(filePath) : 'file'
      return t
        ? t('tool.summaryMultiEdit', { count: edits, file })
        : `Edited ${edits} sections in ${file}`
    }

    case 'Write':
    case 'create_file': {
      const filePath = String(input.path || input.file_path || '')
      const file = filePath ? basename(filePath) : 'file'
      if (input.content !== undefined) {
        return t ? t('tool.summaryCreated', { file }) : `Created ${file}`
      }
      return t ? t('tool.summaryWrote', { file }) : `Wrote ${file}`
    }

    case 'Read':
    case 'read_file': {
      const filePath = String(input.path || input.file_path || '')
      const file = filePath ? basename(filePath) : 'file'
      return t ? t('tool.summaryRead', { file }) : `Read ${file}`
    }

    case 'Grep': {
      const pattern = String(input.pattern || '')
      return pattern
        ? (t ? t('tool.summarySearched', { pattern: truncate(pattern, 30) }) : `Searched for '${truncate(pattern, 30)}'`)
        : (t ? t('tool.summarySearched', { pattern: '...' }) : 'Searched content')
    }

    case 'Glob': {
      const pattern = String(input.pattern || '')
      return pattern
        ? (t ? t('tool.summaryFoundFiles', { pattern: truncate(pattern, 30) }) : `Found files matching ${truncate(pattern, 30)}`)
        : (t ? t('tool.summaryFoundFiles', { pattern: '*' }) : 'Found files')
    }

    case 'LS': {
      const dir = String(input.path || '')
      return dir
        ? (t ? t('tool.summaryListed', { dir: truncate(dir, 40) }) : `Listed ${truncate(dir, 40)}`)
        : (t ? t('tool.summaryListed', { dir: '.' }) : 'Listed files')
    }

    case 'WebFetch': {
      const url = String(input.url || '')
      const host = url ? hostname(url) : 'URL'
      return t ? t('tool.summaryFetched', { host }) : `Fetched ${host}`
    }

    case 'WebSearch': {
      const query = String(input.query || '')
      return query
        ? (t ? t('tool.summaryWebSearch', { query: truncate(query, 40) }) : `Web search: ${truncate(query, 40)}`)
        : (t ? t('tool.summaryWebSearch', { query: '...' }) : 'Web search')
    }

    case 'NotebookEdit': {
      const notebook = String(input.notebook_path || input.path || '')
      const file = notebook ? basename(notebook) : 'notebook'
      return t ? t('tool.summaryEdited', { file }) : `Edited notebook ${file}`
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
export function generateBatchSummary(tools: ToolUseInfo[], t?: TranslateFn): string {
  if (tools.length === 0) return ''
  if (tools.length === 1) return generateToolSummary(tools[0], t)

  const category = getToolCategory(tools[0].name)
  const count = String(tools.length)

  if (t) {
    switch (category) {
      case 'read': return t('tool.batchRead', { count })
      case 'edit': return t('tool.batchEdited', { count })
      case 'write': return t('tool.batchWrote', { count })
      case 'search': return t('tool.batchSearched', { count })
      case 'command': return t('tool.batchRan', { count })
      case 'web': return t('tool.batchFetched', { count })
      default: return `${tools[0].name} x${count}`
    }
  }

  switch (category) {
    case 'read': return `Read ${count} files`
    case 'edit': return `Edited ${count} files`
    case 'write': return `Wrote ${count} files`
    case 'search': return `Searched ${count} times`
    case 'command': return `Ran ${count} commands`
    case 'web': return `Fetched ${count} URLs`
    default: return `${tools[0].name} x${count}`
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

export function groupToolUses(tools: ToolUseInfo[], t?: TranslateFn): ToolGroup[] {
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
      flushBatch(currentBatch, groups, t)
      currentBatch = [tools[i]]
      currentCategory = cat
    }
  }
  // Flush last batch
  flushBatch(currentBatch, groups, t)

  return groups
}

function flushBatch(batch: ToolUseInfo[], groups: ToolGroup[], t?: TranslateFn): void {
  if (batch.length >= 3) {
    groups.push({
      type: 'batch',
      tools: batch,
      summary: generateBatchSummary(batch, t),
    })
  } else {
    // Not enough for a batch -- add as individual items
    for (const tool of batch) {
      groups.push({
        type: 'single',
        tools: [tool],
        summary: generateToolSummary(tool, t),
      })
    }
  }
}
