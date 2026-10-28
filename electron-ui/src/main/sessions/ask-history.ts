/**
 * "Ask AIPA about your history" — local retrieval plus one bounded LLM turn.
 *
 * The question typed into the global search overlay is first turned into a
 * handful of search terms, run against BOTH transcript indexes (Claude and
 * Codex). Only the sessions that actually matched are opened, and only the
 * message lines that contain a term survive into a single, hard-capped digest.
 * The model sees that digest and nothing else; its answer cites the numbered
 * sources, which the renderer turns into chips that reveal the original
 * transcript row.
 *
 * Why retrieval lives here and not in the renderer: the corpus is on disk in
 * two different formats, and the readers already own parsing, path validation
 * and incremental indexes. The renderer never holds more than the answer and
 * a source list.
 *
 * Everything is local: the only outbound call is the caller's own configured
 * engine, via `runInternalTurn`.
 */
import {
  getSearchIndexStats as getClaudeSearchIndexStats,
  searchSessions as searchClaudeSessions,
  readSessionProse as readClaudeSessionProse,
  type SearchResult,
} from './session-reader'
import {
  getSearchIndexStats as getCodexSearchIndexStats,
  searchSessions as searchCodexSessions,
  readSessionProse as readCodexSessionProse,
} from '../codex/codex-session-reader'
import type { SearchIndexRecord } from './search-index'
import { resolveAuxiliaryEngine } from '../llm/auxiliary-engine'

/**
 * One cited session. It is a superset of `SessionSearchResultData` from the
 * preload bridge: `revealSessionEvidence` can take it unchanged, and the extra
 * excerpt is what the source row shows under the answer.
 */
export interface AskSource {
  sessionId: string
  title?: string
  project: string
  /** Always `content`: a source is only cited when an excerpt was found. */
  matchType: 'content'
  engine: 'claude' | 'codex'
  timestamp: number
  /** Epoch ms of the first message this source's excerpts came from. */
  messageTimestamp?: number
  messageRole?: 'user' | 'assistant'
  /** The excerpt that surfaced this session (newest matching line, trimmed). */
  snippet: string
  /**
   * A search term `snippet` contains. The renderer highlights it in the opened
   * transcript instead of the whole question, which contains words the matched
   * line does not. Empty when the 400-character snippet cap cut the matched
   * term away; the renderer then falls back to the asked question.
   */
  matchedTerm: string
}

export interface HistoryDigest {
  sources: AskSource[]
  /** Numbered evidence blocks, ready to paste into the ask prompt. */
  digest: string
  /**
   * True when a zero-source result was answered while an index was still
   * building, so "no matches" is provisional rather than a verdict.
   */
  indexing: boolean
}

export interface CollectHistoryOptions {
  /** Upper bound on cited sessions. */
  maxSessions?: number
  /** Character budget for one session's excerpt block. */
  perSourceChars?: number
  /** Character budget for the whole digest. */
  totalChars?: number
  /** Hits requested per term per reader. */
  searchLimit?: number
  /** UI locale, used for the fallback labels inside the digest. */
  locale?: string
  /**
   * Stops retrieval between steps. The overlay can close while a question is
   * being prepared; without this the abandoned digest keeps issuing searches,
   * and those searches bump the readers' epochs, cancelling the scans of the
   * question that replaced it.
   */
  signal?: AbortSignal
}

const MAX_TERMS = 4
const DEFAULT_SEARCH_LIMIT = 20
const DEFAULT_MAX_SESSIONS = 8
const DEFAULT_PER_SOURCE_CHARS = 1_400
const DEFAULT_TOTAL_CHARS = 8_000
const MAX_EXCERPT_LINE = 400
const TRUNCATION_MARK = '…[truncated]'

// ── Term extraction ──────────────────────────────────

/**
 * Words that carry no retrieval value in a "what did I do" question. English
 * gets the usual question/function words plus coarse time words ("last week"
 * is a time filter, not a search term); Chinese needs both multi-character
 * phrases and single function characters, because Chinese questions arrive
 * without spaces.
 */
const EN_STOPWORDS = new Set([
  'a', 'about', 'after', 'ago', 'all', 'also', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'been', 'before', 'but', 'by', 'can', 'could', 'day', 'days', 'did',
  'do', 'does', 'doing', 'earlier', 'for', 'from', 'had', 'has', 'have', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'last', 'later', 'like',
  'me', 'month', 'months', 'more', 'most', 'my', 'now', 'of', 'on', 'one',
  'only', 'or', 'our', 'over', 'past', 'previous', 'recent', 'recently',
  'should', 'so', 'some', 'than', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'to', 'today', 'up', 'us', 'very',
  'was', 'we', 'week', 'weeks', 'were', 'what', 'when', 'where', 'which', 'who',
  'why', 'will', 'with', 'would', 'year', 'years', 'yesterday', 'you', 'your',
])

const ZH_STOPWORDS = [
  '有没有', '是不是', '为什么', '什么时候', '什么', '怎么', '怎样', '如何',
  '哪些', '哪个', '哪里', '是否', '多少', '多久', '我们', '你们', '他们',
  '我的', '你的', '之前', '之后', '以前', '以后', '当时', '现在', '目前',
  '最近', '上周', '上个月', '去年', '昨天', '今天', '明天', '这周', '本周',
  '这个月', '那个', '这里', '那里', '一个', '一下', '一些', '告诉', '请问',
  '记得', '说过', '聊过', '讨论过', '关于', '以及', '还有', '然后', '所以',
  '因为', '但是', '不过', '如果', '可以', '需要', '应该', '已经', '还是',
  '或者', '一起', '事情', '东西', '的是', '了吗', '了呢', '的', '了', '我',
  '你', '您', '他', '她', '它', '们', '是', '在', '有', '和', '与', '及',
  '就', '也', '都', '而', '但', '被', '把', '给', '对', '从', '到', '上',
  '下', '中', '里', '啊', '吗', '呢', '吧', '呀', '么', '着', '过', '还',
  '又', '很', '太', '这', '那', '哪', '个', '些', '请', '帮', '想', '要',
  '会', '能', '可', '让',
]

// Longest first so "为什么" wins over "什么" and "有没有" over "有".
const ZH_STOP_RE = new RegExp(
  [...ZH_STOPWORDS].sort((a, b) => b.length - a.length).join('|'),
  'g',
)
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/
const TOKEN_RE = /[^\p{L}\p{N}]+/gu

/**
 * Split a token into maximal runs of one script. `TOKEN_RE` has already removed
 * punctuation, so a token is letters/digits; a run is either CJK or Latin
 * (digits ride with the Latin run, keeping "gpt5" / "react" whole).
 */
function scriptRuns(token: string): string[] {
  const runs: string[] = []
  let current = ''
  let currentIsCjk: boolean | null = null
  for (const ch of token) {
    const isCjk = CJK_RE.test(ch)
    if (current && isCjk !== currentIsCjk) {
      runs.push(current)
      current = ''
    }
    current += ch
    currentIsCjk = isCjk
  }
  if (current) runs.push(current)
  return runs
}

/**
 * Turn a natural-language question into at most four search terms.
 *
 * Latin text tokenizes on whitespace/punctuation. CJK runs have no spaces, so
 * the function characters above are treated as delimiters and the remaining
 * runs are sliced into aligned two-character bigrams (Chinese words are
 * mostly two characters, so stride 2 recovers them instead of producing
 * overlapping junk like "付模" from "支付模块"). Very short runs stay whole.
 *
 * A token can mix scripts ("React组件"). Each token is split at the Latin/CJK
 * boundary first: the Latin run stays a whole word, and only the CJK run goes
 * through the stopword/bigram path. Without that split "React组件怎么拆分" fell
 * into the CJK branch and produced "re", "ac", "t组" — the two-letter bigrams
 * match nearly every transcript, and the actual word "React" was never
 * searched.
 *
 * The cap is deliberate: every term costs a pair of index scans, and four
 * common words from a question already describe what the user is after.
 */
export function extractSearchTerms(question: string, limit = MAX_TERMS): string[] {
  const terms: string[] = []
  const seen = new Set<string>()
  const full = (): boolean => terms.length >= limit

  const push = (term: string): void => {
    const value = term.trim()
    if (Array.from(value).length < 2 || seen.has(value)) return
    seen.add(value)
    terms.push(value)
  }

  const addCjkRun = (run: string): void => {
    // Stopwords split the run rather than being concatenated away: "模块的测试"
    // must not become the unmatchable "模块测试".
    const chunks = run.replace(ZH_STOP_RE, '\u0000').split('\u0000')
    for (const chunk of chunks) {
      const chars = Array.from(chunk)
      if (chars.length < 2) continue
      if (chars.length <= 3) {
        push(chunk)
      } else {
        // Aligned bigrams: Chinese words are mostly two characters, so stride
        // 2 recovers "支付" + "模块" from "支付模块改" without "付模".
        for (let i = 0; i < chars.length - 1; i += 2) {
          push(chars.slice(i, i + 2).join(''))
          if (full()) break
        }
      }
      if (full()) break
    }
  }

  for (const raw of question.toLowerCase().split(TOKEN_RE)) {
    if (!raw) continue
    for (const run of scriptRuns(raw)) {
      if (CJK_RE.test(run)) {
        addCjkRun(run)
      } else {
        if (EN_STOPWORDS.has(run) || /^\d+$/.test(run)) continue
        push(run)
      }
      if (full()) break
    }
    if (full()) break
  }

  return terms
}

/**
 * A short question is often a noun phrase on its own ("支付模块", "搜索索引").
 * Probing that exact string as one more term is cheap and beats the bigram
 * fragments when the transcript uses the phrase verbatim.
 */
export function wholeStringProbe(question: string): string | null {
  const stripped = question.trim().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '')
  const length = Array.from(stripped).length
  if (length < 2 || length > 6) return null
  const lowered = stripped.toLowerCase()
  // "What?" and "1234" are questions, not noun phrases. Probing the literal
  // string would search every transcript for a stopword, fill the digest with
  // noise and pay for a model call instead of answering "no match".
  if (EN_STOPWORDS.has(lowered) || /^\d+$/.test(lowered)) return null
  if (!/\p{L}/u.test(lowered) && !CJK_RE.test(lowered)) return null
  return lowered
}

/**
 * Merge per-term hits into one ranked list.
 *
 * A session's score is the number of distinct terms it matched; ties go to the
 * more recent session. That combination favours "this is the conversation
 * about that topic" over "this file happens to mention one word", which is
 * what the digest needs — it has room for only a handful of transcripts.
 *
 * The list is deliberately not truncated here: a title-only hit has no prose to
 * quote, so callers must be able to walk past it and backfill the slot. Pass
 * `limit` only when a caller really wants a pre-sliced ranking.
 */
export function rankHistoryHits(
  matches: Array<{ term: string; hit: SearchResult }>,
  limit?: number,
): Array<{ hit: SearchResult; termsHit: number }> {
  const bySession = new Map<string, { hit: SearchResult; terms: Set<string> }>()

  for (const { term, hit } of matches) {
    const existing = bySession.get(hit.sessionId)
    if (!existing) {
      bySession.set(hit.sessionId, { hit, terms: new Set([term]) })
      continue
    }
    existing.terms.add(term)
    // Keep the newest evidence for the same session: the message excerpt and
    // the reveal target should come from the most recent matching turn. A
    // content hit always wins over a title-only one — a title match has no
    // prose to quote, and dropping the content hit would make the session
    // uncitable even though one of its terms did match its body. Otherwise only
    // a hit of the same kind may replace: a newer title-only hit must not
    // displace an older content hit, or the excerpt below is silently lost.
    const preferContent = existing.hit.matchType === 'title' && hit.matchType === 'content'
    const sameKindNewer = existing.hit.matchType === hit.matchType
      && hit.timestamp > existing.hit.timestamp
    if (preferContent || sameKindNewer) existing.hit = hit
  }

  const ranked = [...bySession.values()]
    .map(entry => ({ hit: entry.hit, termsHit: entry.terms.size }))
    .sort((a, b) => b.termsHit - a.termsHit || b.hit.timestamp - a.hit.timestamp)
  return typeof limit === 'number' ? ranked.slice(0, Math.max(1, limit)) : ranked
}

// ── Transcript excerpts ─────────────────────────────

interface Excerpt {
  text: string
  snippet: string
  /** A term visible in `snippet`; empty when the cap cut every term away. */
  matchedTerm: string
  messageTimestamp?: number
  messageRole?: 'user' | 'assistant'
}

function capLine(text: string, max: number): string {
  // `max` counts UTF-16 units, the same unit as the budget arithmetic in
  // `collectHistoryDigest`. Code points would let a digest dense in astral
  // characters grow to nearly twice its character budget.
  if (text.length <= max) return text
  let cut = Math.max(0, max)
  // Never split a surrogate pair: back off one unit when the cut would fall
  // between a high and a low surrogate.
  const last = cut > 0 ? text.charCodeAt(cut - 1) : 0
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1
  return `${text.slice(0, cut).trimEnd()}…`
}

/**
 * Select the matching prose lines for one session.
 *
 * Selection walks newest -> oldest, because the digest promises the most recent
 * matching turn: in a long session the early proposal used to fill the 1,400
 * character budget and the later decision was cut. The collected lines are
 * reversed before they are emitted, so the block still reads chronologically,
 * and the truncation mark leads it (it stands for the older lines left out).
 *
 * `snippet`, `messageTimestamp` and `messageRole` describe the newest matched
 * line — that is what the citation opens, so it must be the line the UI
 * highlights rather than the first hit in file order.
 */
function excerptForSession(
  records: SearchIndexRecord[],
  terms: string[],
  perSourceChars: number,
): Excerpt {
  const lowered = terms.map(term => term.toLowerCase())
  const selected: string[] = []
  let used = 0
  let snippet = ''
  let matchedTerm = ''
  let messageTimestamp: number | undefined
  let messageRole: 'user' | 'assistant' | undefined
  let truncated = false

  outer:
  for (let m = records.length - 1; m >= 0; m--) {
    const record = records[m]
    // Within one message, later lines are also the newer text.
    const lines = record.text.split(/\r?\n/)
    for (let l = lines.length - 1; l >= 0; l--) {
      const line = lines[l].replace(/\s+/g, ' ').trim()
      if (!line) continue
      const lower = line.toLowerCase()
      const matched = lowered.findIndex(term => lower.includes(term))
      if (matched < 0) continue

      const excerpt = capLine(line, MAX_EXCERPT_LINE)
      if (!snippet) {
        snippet = excerpt
        // The renderer highlights this exact text inside the opened line, so
        // it must be a term that survived the 400-character cap. Falling back
        // to the full-line match would point at text the snippet does not
        // contain; an empty value lets the renderer highlight the question.
        const visible = lowered.findIndex(term => excerpt.toLowerCase().includes(term))
        matchedTerm = visible >= 0 ? terms[visible] : ''
        if (record.ts > 0) {
          messageTimestamp = record.ts
          messageRole = record.role
        }
      }
      const rendered = `${record.role}: ${excerpt}`
      if (used + rendered.length + 2 > perSourceChars) {
        truncated = selected.length > 0
        break outer
      }
      selected.push(rendered)
      used += rendered.length + 2
    }
  }

  selected.reverse()
  const parts = truncated ? [TRUNCATION_MARK, ...selected] : selected
  return { text: parts.join('\n'), snippet, matchedTerm, messageTimestamp, messageRole }
}

/** Local calendar date (YYYY-MM-DD); UTC would show a neighbouring day. */
export function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDate(timestamp: number, locale: string): string {
  if (!timestamp) return locale.startsWith('zh') ? '日期未知' : 'date unknown'
  return formatLocalDate(timestamp)
}

function toSource(hit: SearchResult, excerpt: Excerpt): AskSource {
  return {
    sessionId: hit.sessionId,
    title: hit.title,
    project: hit.project,
    matchType: 'content',
    engine: hit.engine,
    timestamp: hit.timestamp,
    snippet: excerpt.snippet,
    matchedTerm: excerpt.matchedTerm,
    ...(excerpt.messageTimestamp ? { messageTimestamp: excerpt.messageTimestamp } : {}),
    ...(excerpt.messageRole ? { messageRole: excerpt.messageRole } : {}),
  }
}

// ── Status ───────────────────────────────────────────

/**
 * Whether an ask can run at all. Cheap on purpose: the overlay calls this on
 * every mount and hides the entry point when it says no.
 */
export function historyAskStatus(): { available: boolean; reason?: string } {
  const engine = resolveAuxiliaryEngine()
  return engine.kind === 'none'
    ? { available: false, reason: engine.reason }
    : { available: true }
}

/**
 * Whether either transcript index is still building. A cold index answers a
 * search from whatever is already extracted, so a zero-hit retrieval during a
 * build is not evidence that the history is silent.
 */
export function historyIndexBuilding(): boolean {
  return getClaudeSearchIndexStats().building || getCodexSearchIndexStats().building
}

// ── Retrieval ────────────────────────────────────────

/**
 * Retrieve and bound the evidence for one question.
 *
 * Terms are searched one at a time. Both readers keep a module-level epoch to
 * cancel a superseded query, so issuing them concurrently would have each
 * term cancel the previous one and silently return nothing.
 */
export async function collectHistoryDigest(
  question: string,
  opts: CollectHistoryOptions = {},
): Promise<HistoryDigest> {
  const locale = opts.locale || 'en'
  const terms = extractSearchTerms(question)
  const probe = wholeStringProbe(question)
  const probes = probe && !terms.includes(probe) ? [...terms, probe] : terms
  if (probes.length === 0) {
    return { sources: [], digest: '', indexing: historyIndexBuilding() }
  }

  const searchLimit = Math.max(1, opts.searchLimit ?? DEFAULT_SEARCH_LIMIT)
  const matches: Array<{ term: string; hit: SearchResult }> = []

  for (const term of probes) {
    if (opts.signal?.aborted) break
    const [codexHits, claudeHits] = await Promise.all([
      searchCodexSessions(term, searchLimit),
      searchClaudeSessions(term, searchLimit),
    ])
    for (const hit of codexHits) matches.push({ term, hit })
    for (const hit of claudeHits) matches.push({ term, hit })
  }

  const maxSessions = Math.max(1, opts.maxSessions ?? DEFAULT_MAX_SESSIONS)
  // Walk the whole ranking, not a pre-cut top-N: a title-only hit has no prose
  // to quote, and slicing before excerpts let it consume a slot that a later
  // content match would have filled.
  const ranked = rankHistoryHits(matches)
  const perSourceChars = Math.max(200, opts.perSourceChars ?? DEFAULT_PER_SOURCE_CHARS)
  const totalChars = Math.max(500, opts.totalChars ?? DEFAULT_TOTAL_CHARS)

  const sources: AskSource[] = []
  const blocks: string[] = []
  let used = 0

  for (const { hit } of ranked) {
    if (sources.length >= maxSessions || opts.signal?.aborted) break
    // A title-only hit cannot produce an excerpt; skip the read altogether.
    if (hit.matchType === 'title') continue

    const records = hit.engine === 'codex'
      ? await readCodexSessionProse(hit.sessionId)
      : await readClaudeSessionProse(hit.sessionId)
    const excerpt = excerptForSession(records, probes, perSourceChars)
    if (!excerpt.text) continue

    const index = sources.length + 1
    const title = hit.title || (locale.startsWith('zh') ? '未命名会话' : 'Untitled session')
    const project = hit.project || (locale.startsWith('zh') ? '未归属' : 'Unfiled')
    const header = `[${index}] ${title} — ${project} — ${formatDate(hit.timestamp, locale)}`
    const block = `${header}\n${excerpt.text}`

    if (used + block.length + 2 > totalChars) {
      // Make the cut explicit rather than silently dropping the tail.
      const room = totalChars - used - 2
      const textRoom = room - header.length - 1 - TRUNCATION_MARK.length
      if (textRoom < 120) break
      const trimmed = capLine(excerpt.text, textRoom)
      blocks.push(`${header}\n${trimmed}${TRUNCATION_MARK}`)
      sources.push(toSource(hit, excerpt))
      break
    }

    blocks.push(block)
    used += block.length + 2
    sources.push(toSource(hit, excerpt))
  }

  return {
    sources,
    digest: blocks.join('\n\n'),
    // Only a zero-source digest needs the distinction: a non-empty answer was
    // built from transcripts that were indexed, so a background build cannot
    // change what it says.
    indexing: sources.length === 0 ? historyIndexBuilding() : false,
  }
}

// ── Prompt ───────────────────────────────────────────

/**
 * One self-contained prompt: evidence, rules, output shape.
 *
 * The digest is the only context the model gets. It is already numbered to
 * match `sources`, so the citation instruction is mechanical — every `[n]`
 * points at a row the renderer can open. When the evidence is silent the model
 * is told to say so; an invented answer here would be indistinguishable from a
 * real memory.
 */
export function buildAskPrompt(
  question: string,
  digest: string,
  sources: AskSource[],
  locale: string,
): string {
  const chinese = /^zh/i.test(locale)
  const today = formatLocalDate(Date.now())

  if (chinese) {
    return [
      `今天日期：${today}`,
      '你在回答用户关于其自己过往工作会话的问题。这些会话是用户与编码助手之间的本地对话记录。',
      '',
      `问题：${question}`,
      '',
      `以下是检索到的 ${sources.length} 个会话中的相关片段（编号与引用编号一致）：`,
      '',
      digest || '（没有检索到相关片段）',
      '',
      '回答规则：',
      '- 使用简体中文回答。',
      '- 只使用上面的片段，不要补充片段以外的知识或猜测。',
      '- 每一个事实性陈述后面都标注来源编号，例如 [1] 或 [2][3]。',
      '- 如果片段中没有答案，直接说明“记录里没有找到相关内容”，不要编造。',
      '- 不超过 300 个汉字。',
      '- 不要开场白、不要标题、不要分点罗列，直接给答案。',
    ].join('\n')
  }

  return [
    `Today's date: ${today}`,
    "You are answering a question about the user's own past work sessions. These are local transcripts of conversations between the user and a coding assistant.",
    '',
    `Question: ${question}`,
    '',
    `Relevant excerpts from ${sources.length} retrieved session(s), numbered to match the citation numbers:`,
    '',
    digest || '(No relevant excerpts were found.)',
    '',
    'Rules:',
    '- Answer in English.',
    '- Use ONLY the excerpts above. Do not add outside knowledge and do not guess.',
    '- Cite the source number after every factual claim, e.g. [1] or [2][3].',
    '- If the excerpts do not contain the answer, say so plainly ("the history does not show that") instead of inventing one.',
    '- Keep it under 200 words.',
    '- No preamble, no headings, no bullet lists — just the answer.',
  ].join('\n')
}
