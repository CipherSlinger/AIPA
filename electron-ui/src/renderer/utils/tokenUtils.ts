/**
 * tokenUtils.ts — Frontend token estimation utilities.
 * Inspired by Claude Code's services/compact/microCompact.ts estimateMessageTokens().
 *
 * These are rough estimates — actual tokenization is server-side.
 * Useful for context usage warnings, compaction decisions, and UI hints.
 */
import { StandardChatMessage } from '../types/app.types'

/**
 * Estimate token count for a single message.
 * Uses a 4/3 character-per-token approximation with a small overhead pad.
 * Inspired by Claude Code sourcemap's estimateMessageTokens().
 */
export function estimateMessageTokens(msg: StandardChatMessage): number {
  const CHARS_PER_TOKEN = 4
  const OVERHEAD = 4  // role/formatting overhead per message

  let charCount = (msg.content?.length || 0)

  // Add tool use content if present
  if (msg.toolUses && msg.toolUses.length > 0) {
    for (const tu of msg.toolUses) {
      charCount += (tu.name?.length || 0) + (tu.input ? JSON.stringify(tu.input).length : 0)
      if (tu.result) {
        charCount += typeof tu.result === 'string' ? tu.result.length : JSON.stringify(tu.result).length
      }
    }
  }

  return Math.ceil(charCount / CHARS_PER_TOKEN) + OVERHEAD
}

/**
 * Estimate total token count for an array of messages.
 */
export function estimateConversationTokens(messages: StandardChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}

/**
 * Build a per-tool breakdown of estimated token usage.
 * Returns a map of tool name → estimated tokens consumed by that tool's results.
 */
export function estimateToolBreakdown(messages: StandardChatMessage[]): Record<string, number> {
  const breakdown: Record<string, number> = {}
  const CHARS_PER_TOKEN = 4

  for (const msg of messages) {
    if (!msg.toolUses) continue
    for (const tu of msg.toolUses) {
      const name = tu.name || 'unknown'
      const resultLen = tu.result
        ? (typeof tu.result === 'string' ? tu.result.length : JSON.stringify(tu.result).length)
        : 0
      breakdown[name] = (breakdown[name] || 0) + Math.ceil(resultLen / CHARS_PER_TOKEN)
    }
  }

  return breakdown
}

/**
 * Parse token budget shorthand strings into numbers.
 * Supports: "+500k", "2M", "1.5M", "use 2M tokens", "100000"
 * Inspired by Claude Code's utils/tokenBudget.ts.
 */
export function parseTokenBudget(input: string): number | null {
  const s = input.trim().toLowerCase()

  // Strip "use ... tokens" wrapper
  const useMatch = s.match(/use\s+([\d.]+)\s*([km]?)\s*tokens?/i)
  if (useMatch) {
    return applyMultiplier(parseFloat(useMatch[1]), useMatch[2])
  }

  // "+500k" or "500k" or "2M" prefix
  const shorthand = s.match(/^[+]?([\d.]+)\s*([km])$/)
  if (shorthand) {
    return applyMultiplier(parseFloat(shorthand[1]), shorthand[2])
  }

  // Plain number
  const plain = parseFloat(s.replace(/,/g, ''))
  if (!isNaN(plain) && plain > 0) return Math.round(plain)

  return null
}

function applyMultiplier(n: number, suffix: string): number {
  if (suffix === 'k') return Math.round(n * 1_000)
  if (suffix === 'm') return Math.round(n * 1_000_000)
  return Math.round(n)
}
