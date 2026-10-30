/**
 * OKR core: quarter arithmetic, prompt assembly, generation parsing, progress
 * scoring and Markdown export. Pure functions only — no storage, no DOM — so
 * the data layer and the views share one set of honesty rules.
 *
 * Loaded before store.js (index.html order: util → cron → okr → store).
 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date

  var MAX_OBJECTIVES = 8
  var MAX_KEY_RESULTS = 8
  var MAX_TITLE = 300

  var INSTRUCTIONS =
    WC.L('你是嵌入在「工作日历」插件里的 OKR 助手。', 'You are an OKR assistant embedded in the "Work Calendar" plugin. ') +
    WC.L('只能使用用户消息中提供的工作素材提出目标与关键结果，不得虚构素材里没有的工作。', 'Propose objectives and key results only from the work material in the user message; never invent work that is not in it. ') +
    WC.L('只输出严格 JSON（形如 {"objectives":[{"title":"…","keyResults":[{"title":"…","target":"…","percent":null}]}]}），', 'Output strict JSON only (shape: {"objectives":[{"title":"…","keyResults":[{"title":"…","target":"…","percent":null}]}]}) ') +
    WC.L('不要输出解释、前言、结束语或 Markdown 代码块。不要执行命令、读取文件或调用任何工具。', 'with no explanation, preamble, closing remarks or Markdown fence. Do not run commands, read files or call any tools.')

  var DEFAULT_PROMPT = [
    WC.L('你是 OKR 撰写助手。请为一个季度提出 3-5 个目标（Objective），每个目标配 3-5 个可衡量的关键结果（Key Result）。', 'You are an OKR assistant. Propose 3-5 Objectives for one quarter, each with 3-5 measurable Key Results.'),
    '',
    WC.L('周期：{{period}}', 'Period: {{period}}'),
    WC.L('时间范围：{{range}}', 'Date range: {{range}}'),
    '',
    WC.L('上一周期 OKR（仅用于延续，可能为空）：', 'Previous-period OKR (for continuity; may be empty):'),
    '{{previous}}',
    '',
    WC.L('工作素材：', 'Material:'),
    '{{material}}',
    '',
    WC.L('生成要求：', 'Requirements:'),
    WC.L('1. 目标必须来自工作素材中真实做过或明确计划过的工作，不得虚构。', '1. Objectives must come from work actually recorded or clearly planned in the material; do not invent any.'),
    WC.L('2. 每个关键结果都要可衡量：写清指标与目标值（如「合并 12 个 PR」「覆盖率达到 80%」）。', '2. Every Key Result must be measurable: state the metric and its target (e.g. "merge 12 PRs", "reach 80% coverage").'),
    WC.L('3. 新提出的关键结果尚未开始，percent 一律写 null，不要写 0。', '3. New Key Results have not started, so set percent to null for all of them — never 0.'),
    WC.L('4. 只输出严格 JSON，不要 Markdown 代码块，不要任何解释：', '4. Output strict JSON only — no Markdown fence and no explanation:'),
    '{"objectives":[{"title":"…","keyResults":[{"title":"…","target":"…","percent":null}]}]}',
  ].join('\n')

  // ── Quarters ──────────────────────────────────────────
  function makePeriod(year, quarter) {
    var startMonth = (quarter - 1) * 3
    return {
      year: year,
      quarter: quarter,
      key: year + '-Q' + quarter,
      from: D.monthStart(year, startMonth),
      to: D.monthEnd(year, startMonth + 2),
      label: WC.L(year + ' 年 Q' + quarter, 'Q' + quarter + ' ' + year),
    }
  }

  /** '2026-Q4' -> period object; anything else -> null (never a guess). */
  function parsePeriodKey(key) {
    var m = /^(\d{4})-Q([1-4])$/.exec(String(key == null ? '' : key).trim())
    return m ? makePeriod(Number(m[1]), Number(m[2])) : null
  }

  /** Move N quarters, across year boundaries. */
  function shiftPeriod(period, delta) {
    var index = period.year * 4 + (period.quarter - 1) + delta
    return makePeriod(Math.floor(index / 4), (index % 4) + 1)
  }

  function quarterOf(dateKey) {
    if (!D.isDateKey(dateKey)) return null
    var d = D.parseKey(dateKey)
    // isDateKey only checks the shape — 2026-13-01 must not become 2027-Q1
    if (D.toKey(d) !== dateKey) return null
    return makePeriod(d.getFullYear(), Math.floor(d.getMonth() / 3) + 1)
  }

  /** Previous, current and next quarter for the given day (defaults to today). */
  function quarterOptions(todayKey) {
    var base = quarterOf(todayKey) || quarterOf(D.todayKey())
    return [shiftPeriod(base, -1), base, shiftPeriod(base, 1)]
  }

  // ── Prompt ────────────────────────────────────────────
  function slotPattern(name) { return new RegExp('\\{\\{\\s*' + name + '\\s*\\}\\}', 'g') }
  function fillSlot(template, name, value) {
    // A function replacement keeps `$&`/`$1` in the value literal
    return template.replace(slotPattern(name), function () { return value })
  }

  /**
   * Resolve the template. A blank template falls back to the default one, and
   * material is appended when the (user's) template has no {{material}} slot —
   * the material is the point of the prompt, so it is never silently dropped.
   */
  function buildPrompt(opts) {
    opts = opts || {}
    var text = function (v) { return v == null ? '' : String(v) }
    var template = text(opts.template)
    var resolved = template.trim() ? template : DEFAULT_PROMPT
    var materialText = text(opts.materialText)
    // Fresh regex each call, so lastIndex never carries over between prompts
    var hasMaterialSlot = slotPattern('material').test(resolved)

    var out = fillSlot(resolved, 'period', text(opts.periodLabel))
    out = fillSlot(out, 'range', text(opts.periodRange))
    out = fillSlot(out, 'previous', text(opts.previousText))
    out = fillSlot(out, 'material', materialText)
    if (!hasMaterialSlot) out += WC.L('\n\n工作素材：\n', '\n\nMaterial:\n') + materialText
    return out
  }

  function scoreText(percent) {
    if (percent == null) return WC.L('（未评分）', ' (unscored)')
    return WC.L('（', ' (') + percent + '%' + WC.L('）', ')')
  }

  /** The set from the quarter immediately before `periodKey`, as prompt text. */
  function buildPreviousText(okrSets, periodKey) {
    var period = parsePeriodKey(periodKey)
    if (!period) return ''
    var prev = shiftPeriod(period, -1)
    var sets = Array.isArray(okrSets) ? okrSets : []
    var set = sets.find(function (s) {
      var p = s && parsePeriodKey(s.periodKey)
      return !!p && p.key === prev.key
    })
    if (!set) return ''

    var lines = [String(set.title || '').trim() || prev.label]
    var objectives = Array.isArray(set.objectives) ? set.objectives : []
    objectives.forEach(function (o, oi) {
      lines.push('O' + (oi + 1) + '. ' + String((o && o.title) || ''))
      var krs = o && Array.isArray(o.keyResults) ? o.keyResults : []
      krs.forEach(function (kr) {
        var target = String((kr && kr.target) || '').trim()
        lines.push('- ' + String((kr && kr.title) || '') + (target ? ' — ' + target : '') + scoreText(percentOf(kr)))
      })
    })
    return lines.join('\n')
  }

  // ── Generation parsing ────────────────────────────────
  function failResult(reason, raw) { return { ok: false, reason: reason, raw: raw } }

  function tryParse(text) {
    if (!text) return { ok: false }
    try { return { ok: true, value: JSON.parse(text) } } catch (e) { return { ok: false } }
  }

  /** Text from the first '{' to the last '}' — the JSON a model wrapped in prose. */
  function braceSlice(text) {
    var s = String(text == null ? '' : text)
    var first = s.indexOf('{')
    var last = s.lastIndexOf('}')
    return first !== -1 && last > first ? s.slice(first, last + 1) : ''
  }

  function cut(text, max) { return text.length > max ? text.slice(0, max) : text }

  function clampPercent(n) { return n < 0 ? 0 : n > 100 ? 100 : n }

  /** '85'/'85%'/85 -> 85; unparseable or absent -> null (unscored, not zero). */
  function toPercent(value) {
    if (typeof value === 'number') return isFinite(value) ? clampPercent(Math.round(value)) : null
    if (typeof value !== 'string') return null
    var s = value.trim().replace(/%$/, '')
    if (!s) return null
    var n = Number(s)
    return isFinite(n) ? clampPercent(Math.round(n)) : null
  }

  function toTarget(value) {
    if (typeof value === 'string') return cut(value.trim(), MAX_TITLE)
    if (typeof value === 'number' && isFinite(value)) return String(value)
    return ''
  }

  /** One KR, or null when it cannot be used (missing/non-string title). */
  function normalizeKeyResult(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    if (typeof raw.title !== 'string') return null
    var title = cut(raw.title.trim(), MAX_TITLE)
    if (!title) return null
    return { title: title, target: toTarget(raw.target), percent: toPercent(raw.percent) }
  }

  /**
   * Parse model output into objectives without inventing anything: entries that
   * are malformed or over the caps are removed and counted in `dropped`.
   */
  function parseGenerated(text) {
    var raw = text == null ? '' : String(text)
    if (!raw.trim()) return failResult('empty', raw)

    var fence = /```[a-zA-Z]*\s*([\s\S]*?)```/.exec(raw)
    var candidates = fence ? [fence[1], braceSlice(fence[1])] : []
    candidates.push(braceSlice(raw))
    var attempts = []
    candidates.forEach(function (c) {
      var t = String(c == null ? '' : c).trim()
      if (attempts.indexOf(t) === -1) attempts.push(t)
    })

    var parsed
    for (var a = 0; a < attempts.length && parsed === undefined; a++) {
      var res = tryParse(attempts[a])
      if (res.ok) parsed = res.value
    }
    if (parsed === undefined) return failResult('no_json', raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.objectives)) {
      return failResult('bad_shape', raw)
    }

    var dropped = 0
    var objectives = []
    parsed.objectives.forEach(function (rawObj) {
      if (objectives.length >= MAX_OBJECTIVES) { dropped++; return }
      if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) { dropped++; return }
      if (typeof rawObj.title !== 'string') { dropped++; return }
      var title = cut(rawObj.title.trim(), MAX_TITLE)
      if (!title) { dropped++; return }

      var rawKrs = Array.isArray(rawObj.keyResults) ? rawObj.keyResults : []
      var keyResults = []
      rawKrs.forEach(function (rawKr) {
        if (keyResults.length >= MAX_KEY_RESULTS) { dropped++; return }
        var kr = normalizeKeyResult(rawKr)
        if (!kr) { dropped++; return }
        keyResults.push(kr)
      })
      objectives.push({ title: title, keyResults: keyResults })
    })

    if (!objectives.length) return failResult('no_objectives', raw)
    return { ok: true, objectives: objectives, dropped: dropped }
  }

  // ── Progress ──────────────────────────────────────────
  function percentOf(kr) {
    var p = kr && kr.percent
    return typeof p === 'number' && isFinite(p) ? p : null
  }

  /** Average over scored KRs only; null when nothing is scored (absent ≠ 0). */
  function summarize(krs) {
    var total = 0
    var scored = 0
    var sum = 0
    var list = Array.isArray(krs) ? krs : []
    list.forEach(function (kr) {
      total++
      var p = percentOf(kr)
      if (p === null) return
      scored++
      sum += p
    })
    return { percent: scored ? Math.round(sum / scored) : null, scored: scored, total: total }
  }

  function objectiveProgress(objective) {
    return summarize(objective && objective.keyResults)
  }

  function setProgress(set) {
    var all = []
    var objectives = set && Array.isArray(set.objectives) ? set.objectives : []
    objectives.forEach(function (o) {
      if (o && Array.isArray(o.keyResults)) all = all.concat(o.keyResults)
    })
    return summarize(all)
  }

  /** Coarse band for a badge: no data is not the same as zero progress. */
  function progressBand(percent) {
    if (percent == null || typeof percent !== 'number' || !isFinite(percent)) return 'none'
    if (percent < 30) return 'off'
    if (percent < 70) return 'risk'
    if (percent < 100) return 'on'
    return 'done'
  }

  // ── Markdown ──────────────────────────────────────────
  function toMarkdown(set) {
    if (!set) return ''
    var period = parsePeriodKey(set.periodKey)
    var title = String(set.title || '').trim() || (period ? period.label : 'OKR')
    var lines = ['# ' + title]
    if (period) {
      lines.push('')
      lines.push(WC.L('周期：' + period.from + ' 至 ' + period.to, 'Period: ' + period.from + ' to ' + period.to))
    }
    var objectives = Array.isArray(set.objectives) ? set.objectives : []
    objectives.forEach(function (o, i) {
      lines.push('')
      lines.push('## O' + (i + 1) + ' ' + String((o && o.title) || ''))
      var krs = o && Array.isArray(o.keyResults) ? o.keyResults : []
      krs.forEach(function (kr) {
        var p = percentOf(kr)
        var target = String((kr && kr.target) || '').trim()
        lines.push('- [' + (p !== null && p >= 100 ? 'x' : ' ') + '] ' + String((kr && kr.title) || '') +
          (target ? ' — ' + target : '') + scoreText(p))
      })
    })
    return lines.join('\n')
  }

  WC.okr = {
    INSTRUCTIONS: INSTRUCTIONS,
    DEFAULT_PROMPT: DEFAULT_PROMPT,
    LIMITS: { objectives: MAX_OBJECTIVES, keyResults: MAX_KEY_RESULTS, title: MAX_TITLE },
    parsePeriodKey: parsePeriodKey,
    quarterOf: quarterOf,
    quarterOptions: quarterOptions,
    buildPrompt: buildPrompt,
    buildPreviousText: buildPreviousText,
    parseGenerated: parseGenerated,
    objectiveProgress: objectiveProgress,
    setProgress: setProgress,
    progressBand: progressBand,
    toMarkdown: toMarkdown,
  }
})()
