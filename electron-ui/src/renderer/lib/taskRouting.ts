// Department routing *suggestion*, never routing.
//
// The user picks a department; this module only proposes one when the task's
// own words overlap a department's identity enough to be worth a one-click
// chip. It is deliberately a local heuristic: no model call, no background
// write, and no caller may apply the answer without a click. A task that
// matches nothing stays unassigned — a coin flip would be worse than silence.
//
// Scoring is normalised token overlap. Department text becomes tokens
// (lower-case Latin words and CJK bigrams, so "采购部" yields 采购/购部 and a
// Chinese task title needs no spaces to match); each token that appears in the
// task text contributes to the field that named it. Name is the strongest
// signal, a seat title second, the handbook (unbounded prose) weakest.
//
// The threshold is a heuristic, not a rule. It exists so a single incidental
// word in a long handbook cannot fill the picker with suggestions; the user
// remains free to choose any department (or none) and nothing here writes a
// record.

import type { Department, LocalizedText, Position } from '../store/departmentStore'

/** How much each field can contribute. The sum is the score's denominator. */
export const ROUTING_WEIGHTS = { name: 3, positions: 2, handbook: 1 } as const
const WEIGHT_TOTAL = ROUTING_WEIGHTS.name + ROUTING_WEIGHTS.positions + ROUTING_WEIGHTS.handbook

/**
 * Below this the suggestion is dropped. 0.15 admits a full name match on a
 * three-token name, a title-half match on two seats, or three handbook terms;
 * below it the evidence is one incidental word, which is not worth a chip.
 */
export const SUGGESTION_THRESHOLD = 0.15

/** How many matched terms `explain` shows; the chip has one line. */
const EXPLAIN_TERMS = 4

export interface TaskRoutingInput {
  /** The task's title. Empty means no suggestion, whatever the materials say. */
  title: string
  /** Material file names (not paths); the extension is harmless. */
  materialNames?: readonly string[]
  /** Optional short excerpts, e.g. a handoff's latest messages. */
  excerpts?: readonly string[]
  departments: ReadonlyArray<Pick<Department, 'id' | 'name' | 'presetName' | 'positions' | 'handbook'>>
}

export interface DepartmentSuggestion {
  departmentId: string
  /** 0..1, rounded for display; see the weights above. */
  score: number
  /** The department-side tokens that were found, in field order. */
  matched: string[]
  /** Human-readable terms for a chip: "采购 / supplier". */
  explain: string
}

interface TokenSet {
  tokens: string[]
  lookup: Map<string, string>
}

type DepartmentLike = TaskRoutingInput['departments'][number]

const CJK_RE = /[㐀-鿿豈-﫿]+/g
const LATIN_RE = /[a-z0-9]+/g
const MIN_LATIN_LENGTH = 2

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * A stable comparison key for a Latin word. Dropping a trailing plural "s"
 * lets "suppliers" meet "supplier"; it is applied to both sides, so an
 * unrelated word cannot match merely because one side was inflected.
 */
function latinKey(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

/**
 * Tokens of one department field, deduplicated in first-seen order. CJK runs
 * use overlapping bigrams because Chinese has no word separators and a whole
 * run would only match itself; one-character runs stay whole.
 */
function tokensOf(text: string): TokenSet {
  const tokens: string[] = []
  const lookup = new Map<string, string>()
  const normalized = normalizeText(text)
  for (const match of normalized.match(LATIN_RE) ?? []) {
    if (match.length < MIN_LATIN_LENGTH) continue
    const key = latinKey(match)
    if (lookup.has(key)) continue
    lookup.set(key, match)
    tokens.push(match)
  }
  for (const run of normalized.match(CJK_RE) ?? []) {
    if (run.length === 1) {
      if (!lookup.has(run)) {
        lookup.set(run, run)
        tokens.push(run)
      }
      continue
    }
    for (let i = 0; i < run.length - 1; i++) {
      const gram = run.slice(i, i + 2)
      if (lookup.has(gram)) continue
      lookup.set(gram, gram)
      tokens.push(gram)
    }
  }
  return { tokens, lookup }
}

function localizedText(value: LocalizedText | undefined): string[] {
  if (!value) return []
  return [value.en, value.zh].filter(text => typeof text === 'string' && text.trim().length > 0)
}

function nameText(dept: DepartmentLike): string {
  return [dept.name, ...localizedText(dept.presetName)].join(' ')
}

function positionsText(dept: DepartmentLike): string {
  return (dept.positions ?? [])
    .map((position: Position) => [position.title, ...localizedText(position.presetTitle)].join(' '))
    .join(' ')
}

function matchedTokens(field: TokenSet, queryLatin: Set<string>, queryText: string): string[] {
  const matched: string[] = []
  for (const token of field.tokens) {
    const hit = /^[a-z0-9]+$/.test(token)
      ? queryLatin.has(latinKey(token))
      : queryText.includes(token)
    if (hit) matched.push(token)
  }
  return matched
}

function coverage(matched: string[], total: number): number {
  return total > 0 ? matched.length / total : 0
}

/**
 * Suggest at most one department. Deterministic: equal scores prefer the
 * larger name coverage, then the lexicographically smaller id, so the chip
 * does not change between renders for the same input.
 */
export function suggestDepartment(input: TaskRoutingInput): DepartmentSuggestion | null {
  const title = (input.title ?? '').trim()
  if (!title) return null
  if (!Array.isArray(input.departments) || input.departments.length === 0) return null

  const queryText = normalizeText([
    title,
    ...(input.materialNames ?? []),
    ...(input.excerpts ?? []),
  ].join(' '))
  const queryLatin = new Set((queryText.match(LATIN_RE) ?? [])
    .filter(word => word.length >= MIN_LATIN_LENGTH)
    .map(latinKey))

  let best: { dept: DepartmentLike; score: number; nameCoverage: number; matched: string[] } | null = null
  for (const dept of input.departments) {
    if (!dept || typeof dept.id !== 'string' || !dept.id) continue

    const name = tokensOf(nameText(dept))
    const positions = tokensOf(positionsText(dept))
    const handbook = tokensOf(dept.handbook ?? '')
    const matchedName = matchedTokens(name, queryLatin, queryText)
    const matchedPositions = matchedTokens(positions, queryLatin, queryText)
    const matchedHandbook = matchedTokens(handbook, queryLatin, queryText)

    const nameCoverage = coverage(matchedName, name.tokens.length)
    const score = (
      ROUTING_WEIGHTS.name * nameCoverage +
      ROUTING_WEIGHTS.positions * coverage(matchedPositions, positions.tokens.length) +
      // Handbooks are unbounded; three distinct terms are enough to saturate
      // an otherwise tiny field, without requiring the whole book to match.
      ROUTING_WEIGHTS.handbook * Math.min(1, matchedHandbook.length / 3)
    ) / WEIGHT_TOTAL
    if (score < SUGGESTION_THRESHOLD) continue

    // Field order is also "strongest evidence first" for the chip.
    const matched = [...new Set([...matchedName, ...matchedPositions, ...matchedHandbook])]
    if (!best ||
      score > best.score ||
      (score === best.score && nameCoverage > best.nameCoverage) ||
      (score === best.score && nameCoverage === best.nameCoverage && dept.id < best.dept.id)
    ) {
      best = { dept, score, nameCoverage, matched }
    }
  }

  if (!best) return null
  const explain = best.matched.slice(0, EXPLAIN_TERMS).join(' / ')
  return {
    departmentId: best.dept.id,
    score: Math.round(best.score * 1000) / 1000,
    matched: best.matched,
    explain,
  }
}
