import React from 'react'
import {
  Star,
  BookOpen,
  Lightbulb,
  Info,
  User,
  MessageSquare,
  FolderOpen,
  Link,
} from 'lucide-react'
import { MemoryCategory, MemoryType } from '../../types/app.types'
import { escapeRegExp } from '../../utils/stringUtils'
import { count } from '../../utils/arrayUtils'

export const CATEGORY_CONFIG: Record<MemoryCategory, { icon: React.ReactNode; color: string; labelKey: string }> = {
  preference: { icon: React.createElement(Star, { size: 12 }), color: '#f59e0b', labelKey: 'memory.catPreference' },
  fact:       { icon: React.createElement(BookOpen, { size: 12 }), color: '#3b82f6', labelKey: 'memory.catFact' },
  instruction:{ icon: React.createElement(Lightbulb, { size: 12 }), color: '#10b981', labelKey: 'memory.catInstruction' },
  context:    { icon: React.createElement(Info, { size: 12 }), color: '#8b5cf6', labelKey: 'memory.catContext' },
}

/**
 * Claude Code-aligned memory type config (Iteration 480).
 * Maps semantic type to display properties for the type badge shown below the content.
 */
export const MEMORY_TYPE_CONFIG: Record<MemoryType, { icon: React.ReactNode; color: string; labelKey: string; description: string }> = {
  user:      { icon: React.createElement(User, { size: 10 }), color: '#3b82f6', labelKey: 'memory.typeUser', description: "About the user's role, goals, and preferences" },
  feedback:  { icon: React.createElement(MessageSquare, { size: 10 }), color: '#f59e0b', labelKey: 'memory.typeFeedback', description: 'Guidance on how to approach work (corrections + confirmations)' },
  project:   { icon: React.createElement(FolderOpen, { size: 10 }), color: '#8b5cf6', labelKey: 'memory.typeProject', description: 'Ongoing work, goals, decisions, deadlines' },
  reference: { icon: React.createElement(Link, { size: 10 }), color: '#10b981', labelKey: 'memory.typeReference', description: 'Pointers to external systems and resources' },
}

export const MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference']

/**
 * Suggest a MemoryType based on content keywords (Iteration 480).
 * Mirrors Claude Code's memory type taxonomy.
 */
export function suggestMemoryType(content: string): MemoryType {
  const lower = content.toLowerCase()
  const userWords = ['i am', 'i\'m', 'my role', 'i work', 'i use', 'i prefer', 'i like', 'i want', 'my background', 'expertise', 'years of']
  const feedbackWords = ['don\'t', 'do not', 'stop', 'never', 'always', 'please', 'prefer', 'instead', 'avoid', 'keep doing', 'yes exactly', 'perfect']
  const projectWords = ['project', 'deadline', 'working on', 'we are', 'sprint', 'release', 'team', 'goal', 'milestone', 'by', 'until', 'freeze']
  const referenceWords = ['http', 'url', 'board', 'dashboard', 'jira', 'linear', 'slack', 'github', 'repo', 'wiki', 'docs', 'at ', 'tracker', 'channel']

  const scores = {
    user: count(userWords, w => lower.includes(w)),
    feedback: count(feedbackWords, w => lower.includes(w)),
    project: count(projectWords, w => lower.includes(w)),
    reference: count(referenceWords, w => lower.includes(w)),
  }

  const max = Math.max(...Object.values(scores))
  if (max === 0) return 'user'
  return (Object.entries(scores).find(([, v]) => v === max)?.[0] as MemoryType) ?? 'user'
}

export const CATEGORIES: MemoryCategory[] = ['preference', 'fact', 'instruction', 'context']
export const MAX_MEMORIES = 200
export const MAX_CONTENT_LENGTH = 500

/** Fuzzy search scoring: returns 0 (no match) or positive score (higher = better) */
export function fuzzyScore(text: string, query: string): number {
  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase()
  // Exact substring match gets highest base score
  if (textLower.includes(queryLower)) {
    // Bonus for match at start of word boundary
    const wordBoundaryIdx = textLower.search(new RegExp(`\\b${escapeRegExp(queryLower)}`))
    if (wordBoundaryIdx === 0) return 100  // starts with query
    if (wordBoundaryIdx > 0) return 90     // word-boundary match
    return 80                               // substring match
  }
  // Multi-word: all query words must appear (AND logic)
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0)
  if (queryWords.length > 1) {
    const allMatch = queryWords.every(w => textLower.includes(w))
    if (allMatch) return 70
  }
  // Fuzzy: allow 1-char skips (for typos) — check if query chars appear in order
  let qi = 0
  let matched = 0
  for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
    if (textLower[ti] === queryLower[qi]) {
      matched++
      qi++
    }
  }
  if (qi === queryLower.length) {
    // All query chars found in order — score based on density
    const density = matched / text.length
    return Math.round(30 + density * 40)  // 30-70 range
  }
  // Partial match: at least 70% of query chars found in order
  if (matched >= queryLower.length * 0.7) {
    return Math.round(10 + (matched / queryLower.length) * 20)  // 10-30 range
  }
  return 0
}

/** Auto-suggest category based on content keywords */
export function suggestCategory(content: string): MemoryCategory {
  const lower = content.toLowerCase()
  const preferenceWords = ['prefer', 'like', 'want', 'favorite', 'always', 'never', 'don\'t', 'please', 'style', 'format', 'tone', 'mode']
  const instructionWords = ['should', 'must', 'rule', 'when', 'if', 'how to', 'make sure', 'remember to', 'do not', 'use']
  const contextWords = ['project', 'team', 'company', 'working on', 'currently', 'role', 'job', 'deadline', 'using']

  const prefScore = count(preferenceWords, w => lower.includes(w))
  const instrScore = count(instructionWords, w => lower.includes(w))
  const ctxScore = count(contextWords, w => lower.includes(w))

  if (prefScore > instrScore && prefScore > ctxScore) return 'preference'
  if (instrScore > prefScore && instrScore > ctxScore) return 'instruction'
  if (ctxScore > prefScore && ctxScore > instrScore) return 'context'
  return 'fact'
}

/** Highlight matching search terms in text */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  try {
    const escaped = escapeRegExp(query)
    const regex = new RegExp(`(${escaped})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part)
        ? React.createElement('mark', {
            key: i,
            style: {
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 2,
              padding: '0 1px',
            },
          }, part)
        : part
    )
  } catch {
    return text
  }
}

/** Format relative time for memory items */
export function formatRelativeTime(ts: number, t: (key: string) => string): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('memory.justNow')
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}
