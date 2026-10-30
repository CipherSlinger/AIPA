/**
 * AI report generation (replaces the aPaaS capabilityClient stream):
 * material → prompt template → Codex stream → create / overwrite report.
 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store

  var INSTRUCTIONS =
    WC.L('你是嵌入在「工作日历」桌面插件中的报告写作助手。', 'You are a report-writing assistant embedded in the "Work Calendar" desktop plugin. ') +
    WC.L('只根据用户消息中提供的素材撰写报告，直接输出 Markdown 格式的报告正文，', 'Write the report only from the material provided in the user message and output the report body directly in Markdown. ') +
    WC.L('不要输出任何前言、说明或结束语。不要执行命令、读取文件或调用任何工具。', 'Do not add any preamble, explanation or closing remarks. Do not run commands, read files or call any tools.')

  var busy = false
  var busyListeners = []

  function setBusy(v) {
    busy = v
    busyListeners.forEach(function (fn) { fn(v) })
  }

  /**
   * Generation has no implicit model: a blank setting stops here, before any
   * modal opens or any AI request leaves. Falling back to the app's chat model
   * would spend tokens on a choice the user never made.
   */
  function requireModel() {
    var settings = store.state.settings
    if (settings && typeof settings.model === 'string' && settings.model.trim()) return true
    AIPA.toast('error', WC.L('请先在「设置」中选择生成模型', 'Choose a generation model in Settings first'))
    return false
  }

  function buildMaterialText(m) {
    var lines = []
    lines.push(WC.L('【完成任务】（', '[Completed tasks] (') + m.completedCount + WC.L(' 项）', ')'))
    lines.push(m.completedTasks.length ? m.completedTasks.map(function (t) { return '- ' + t }).join('\n') : WC.L('无', 'None'))
    lines.push('')
    lines.push(WC.L('【进行中任务】', '[In-progress tasks]'))
    lines.push(m.inProgressTasks.length ? m.inProgressTasks.map(function (t) { return '- ' + t }).join('\n') : WC.L('无', 'None'))
    lines.push('')
    lines.push(WC.L('【逾期任务】', '[Overdue tasks]'))
    lines.push(m.overdueTasks.length ? m.overdueTasks.map(function (t) { return '- ' + t }).join('\n') : WC.L('无', 'None'))
    var sources = m.sourceMaterials.filter(function (s) { return s.items.length > 0 })
    if (sources.length) {
      lines.push('')
      lines.push(WC.L('【工作源记录】', '[Work source records]'))
      sources.forEach(function (s) {
        lines.push('■ ' + s.sourceName + WC.L('（', ' (') + (s.sourceType === 'github' ? WC.L('GitHub 提交', 'GitHub commits') : WC.L('文件变更', 'File changes')) + WC.L('）', ')'))
        lines.push(s.items.map(function (it) { return '- ' + it.title + WC.L('（', ' (') + it.desc + WC.L('）', ')') }).join('\n'))
      })
    }
    return lines.join('\n')
  }

  /** Person-days as prompt material: the quarter total plus one line per entry. */
  function buildPersonDaysText(entries) {
    var total = 0
    entries.forEach(function (e) { total += Number(e.days) || 0 })
    var lines = [WC.L('【人天投入】（合计 ', '[Person-days] (total ') + Math.round(total * 10) / 10 +
      WC.L(' 人天，', ' person-days, ') + entries.length + WC.L(' 条记录）', ' entries)')]
    lines.push(entries.length ? entries.map(function (e) {
      return '- ' + e.weekStart + WC.L('：', ': ') + e.workDesc +
        WC.L('（', ' (') + (Math.round((Number(e.days) || 0) * 10) / 10) + WC.L(' 人天）', ' person-days)')
    }).join('\n') : WC.L('无', 'None'))
    return lines.join('\n')
  }

  /** Work sources that could not be pulled, as one "name: error" string each. */
  function warningsOf(mat) {
    return mat.sourceMaterials.filter(function (s) { return s.error })
      .map(function (s) { return s.sourceName + WC.L('：', ': ') + s.error })
  }

  function toastWarnings(warnings) {
    warnings.forEach(function (w) { AIPA.toast('warning', WC.L('工作源拉取失败，已跳过 — ', 'Some work sources failed and were skipped — ') + w) })
  }

  // A parse failure is not an empty result — each reason says what happened.
  var OKR_FAIL_REASON = {
    empty: WC.L('模型返回了空内容，没有可保存的 OKR。', 'The model returned nothing to save.'),
    no_json: WC.L('模型没有按 JSON 格式回答，下面是它的原文——可以复制后手动整理，或重试。',
      'The model did not answer in JSON. Its raw reply is below — copy it and tidy it by hand, or retry.'),
    bad_shape: WC.L('模型返回的 JSON 结构不符合 OKR 格式，下面是它的原文。',
      'The JSON the model returned does not have the OKR shape. Its raw reply is below.'),
    no_objectives: WC.L('模型返回的 JSON 里没有可用的目标，下面是它的原文。',
      'The JSON contained no usable objective. Its raw reply is below.'),
  }

  /** Merge the month's weekly reports into material for a monthly report. */
  function buildWeeklyMergeMaterial(from, to) {
    var related = store.listReports('weekly')
      .filter(function (r) { return r.periodStart <= to && r.periodEnd >= from })
      .sort(function (a, b) { return a.periodStart.localeCompare(b.periodStart) })
    if (!related.length) return null
    var lines = [WC.L('【本月周报汇总】', '[This month\'s weekly reports]')]
    related.forEach(function (r) {
      lines.push('')
      lines.push(WC.L('■ 周报 ', '■ Weekly report ') + r.periodStart + WC.L(' 至 ', ' to ') + r.periodEnd)
      lines.push(r.content)
    })
    return lines.join('\n')
  }

  function fillTemplate(template, period, material) {
    var t = template && template.trim() ? template : ''
    var hasMaterialSlot = t.indexOf('{{material}}') !== -1
    var out = t.replace(/\{\{\s*period\s*\}\}/g, period).replace(/\{\{\s*material\s*\}\}/g, material)
    // A custom template without the slot still needs the material
    if (!hasMaterialSlot) out += WC.L('\n\n时间周期：', '\n\nPeriod: ') + period + WC.L('\n工作素材：\n', '\nMaterial:\n') + material
    return out
  }

  /**
   * @param {'weekly'|'monthly'} reportType
   * @param {{ existingId?: string, materialOverride?: string }} [opts]
   * @returns {Promise<object|null>} saved report, or null when cancelled/failed
   */
  function generate(reportType, from, to, opts) {
    opts = opts || {}
    if (!requireModel()) return Promise.resolve(null)
    if (busy) {
      AIPA.toast('info', WC.L('已有报告正在生成，请稍候', 'A report is already being generated, please wait'))
      return Promise.resolve(null)
    }
    setBusy(true)
    var typeLabel = WC.REPORT_TYPE[reportType]
    var title = typeLabel + ' ' + from + WC.L(' 至 ', ' to ') + to
    var job = null
    var cancelled = false

    var m = WC.modal({
      title: WC.L('<span class="spinner"></span><span>正在生成', '<span class="spinner"></span><span>Generating ') + WC.esc(title) + '</span>',
      sub: opts.existingId ? WC.L('将覆盖原报告内容', 'This will overwrite the existing report') : WC.L('生成完成后自动保存到历史报告', 'Saved to report history when generation finishes'),
      wide: true,
      dismissible: false,
      body: WC.L('<div class="stream-status" data-status><span>正在收集任务素材...</span></div><div class="report-box md" data-content></div>', '<div class="stream-status" data-status><span>Collecting task material...</span></div><div class="report-box md" data-content></div>'),
      foot: WC.L('<button class="btn" data-cancel>取消生成</button>', '<button class="btn" data-cancel>Cancel</button>'),
    })
    var statusEl = m.el.querySelector('[data-status]')
    var contentEl = m.el.querySelector('[data-content]')
    var bodyEl = m.el.querySelector('.modal-body')
    function setStatus(text) { statusEl.innerHTML = '<span>' + WC.esc(text) + '</span>' }

    m.el.querySelector('[data-cancel]').addEventListener('click', function () {
      cancelled = true
      if (job) job.abort()
      else { m.close(); setBusy(false) }
    })

    var pending = null
    function render(text) {
      // Coalesce rapid deltas into one paint per frame
      pending = text
      requestAnimationFrame(function () {
        if (pending === null) return
        var stick = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 24
        contentEl.innerHTML = WC.markdown(pending)
        pending = null
        if (stick) bodyEl.scrollTop = bodyEl.scrollHeight
      })
    }

    var materialPromise = opts.materialOverride
      ? Promise.resolve({ text: opts.materialOverride, warnings: [] })
      : store.getMaterial(from, to).then(function (mat) {
        return { text: buildMaterialText(mat), warnings: warningsOf(mat) }
      })

    return materialPromise.then(function (material) {
      if (cancelled) throw new Error(WC.L('已取消生成', 'Generation cancelled'))
      toastWarnings(material.warnings)
      setStatus(WC.L('AI 正在撰写', 'AI is writing') + typeLabel + '...')
      var settings = store.state.settings
      var template = reportType === 'weekly' ? settings.weeklyPrompt : settings.monthlyPrompt
      job = AIPA.ai.generate({
        prompt: fillTemplate(template, from + WC.L(' 至 ', ' to ') + to, material.text),
        instructions: INSTRUCTIONS,
        model: settings.model,
        onDelta: function (text) {
          setStatus(WC.L('AI 正在撰写', 'AI is writing') + typeLabel + '...')
          render(text)
        },
        onStatus: function (msg) { setStatus(WC.L('连接波动，', 'Connection unstable, ') + msg) },
      })
      return job.promise
    }).then(function (text) {
      var content = String(text || '').trim()
      if (!content) throw new Error(WC.L('生成内容为空，请重试', 'Generated content is empty, please retry'))
      if (opts.existingId) {
        return store.updateReport(opts.existingId, { content: content }).then(function (r) {
          AIPA.toast('success', typeLabel + WC.L('已重新生成并更新', 'Regenerated and updated'))
          return r
        })
      }
      return store.createReport({ reportType: reportType, title: title, periodStart: from, periodEnd: to, content: content })
        .then(function (r) {
          AIPA.toast('success', typeLabel + WC.L('已生成并保存到历史报告', 'Generated and saved to report history'))
          return r
        })
    }).catch(function (err) {
      AIPA.toast(cancelled ? 'info' : 'error', cancelled ? WC.L('已取消生成', 'Generation cancelled') : WC.errMsg(err))
      return null
    }).then(function (result) {
      m.close()
      setBusy(false)
      return result
    })
  }

  function generateWeekly(weekStartKey) {
    return generate('weekly', weekStartKey, D.addDays(weekStartKey, 6))
  }

  function generateMonthly(year, month, existingId) {
    var from = D.monthStart(year, month)
    var to = D.monthEnd(year, month)
    var material = buildWeeklyMergeMaterial(from, to)
    if (!material) {
      AIPA.toast('error', existingId ? WC.L('该周期暂无周报，无法重新生成月报', 'No weekly reports in this period, cannot regenerate the monthly report') : WC.L('本月暂无周报，无法合并生成月报', 'No weekly reports this month, cannot build a monthly report'))
      return Promise.resolve(null)
    }
    return generate('monthly', from, to, { existingId: existingId, materialOverride: material })
  }

  /** Regenerate a report in place (weekly re-pulls material; monthly re-merges weeklies). */
  function regenerate(report) {
    if (report.reportType === 'monthly') {
      var material = buildWeeklyMergeMaterial(report.periodStart, report.periodEnd)
      if (!material) {
        AIPA.toast('error', WC.L('该周期暂无周报，无法重新生成月报', 'No weekly reports in this period, cannot regenerate the monthly report'))
        return Promise.resolve(null)
      }
      return generate('monthly', report.periodStart, report.periodEnd, { existingId: report.id, materialOverride: material })
    }
    return generate('weekly', report.periodStart, report.periodEnd, { existingId: report.id })
  }

  /**
   * 一键拉取: pull every work source bound to tasks active in the period and
   * store the result as lastPull (so it can be reviewed before regenerating).
   */
  function pullSourcesForPeriod(from, to) {
    var ids = []
    store.tasksInRange(from, to).forEach(function (t) {
      if (t.workSourceId && ids.indexOf(t.workSourceId) === -1) ids.push(t.workSourceId)
    })
    var sources = ids.map(store.getSource).filter(Boolean)
    if (!sources.length) {
      AIPA.toast('info', WC.L('该周期内没有绑定工作源的任务，无需拉取', 'No tasks in this period are bound to a work source, nothing to pull'))
      return Promise.resolve()
    }
    var weekStart = D.weekStart(from)
    var ok = 0
    var failures = []
    return sources.reduce(function (chain, source) {
      return chain.then(function () {
        return store.pullSource(source.id, weekStart).then(function (s) {
          ok++
          if (!s.lastPull.itemCount) AIPA.toast('info', WC.L('「', '"') + source.name + WC.L('」该周期没有符合条件的记录', '" has no matching records in this period'))
        }).catch(function (err) {
          failures.push(source.name + WC.L('（', ' (') + WC.errMsg(err) + WC.L('）', ')'))
        })
      })
    }, Promise.resolve()).then(function () {
      if (failures.length) AIPA.toast('error', WC.L('拉取完成：', 'Pull finished: ') + ok + WC.L(' 个成功，', ' succeeded, ') + failures.length + WC.L(' 个失败 — ', ' failed — ') + failures.join(WC.L('、', ', ')))
      else AIPA.toast('success', WC.L('已拉取 ', 'Pulled ') + ok + WC.L(' 个工作源，可点击「重新生成」生成最新周报', ' work source(s); click "Regenerate" to rebuild the weekly report'))
    })
  }

  /**
   * Draft one quarter's OKR from that quarter's material.
   * The raw JSON is never streamed into the modal — it is unreadable while it
   * is half-written; the status line is the only progress shown. A reply that
   * cannot be parsed is kept, not discarded: the user gets the reason and the
   * raw text to copy or retry.
   *
   * @param {string} periodKey   e.g. 2026-Q3
   * @param {{ replace?: boolean }} [opts]
   * @returns {Promise<object|null>} saved set, or null when cancelled/failed
   */
  function generateOkr(periodKey, opts) {
    opts = opts || {}
    if (!requireModel()) return Promise.resolve(null)
    if (busy) {
      AIPA.toast('info', WC.L('已有内容正在生成，请稍候', 'Content is already being generated, please wait'))
      return Promise.resolve(null)
    }
    var period = WC.okr.parsePeriodKey(periodKey)
    if (!period) {
      AIPA.toast('error', WC.L('季度参数非法，无法生成 OKR', 'Invalid quarter, cannot generate an OKR'))
      return Promise.resolve(null)
    }
    setBusy(true)
    var job = null
    var cancelled = false
    var keepOpen = false
    // Set once the material is collected, so a retry reuses it instead of
    // re-running the live work-source pulls.
    var materialOverride = opts.materialOverride || null

    var m = WC.modal({
      title: '<span class="spinner"></span><span>' + WC.L('正在生成 OKR', 'Generating OKR') + '</span>' +
        '<span class="okr-quarter">' + WC.esc(period.label) + '</span>',
      sub: opts.replace
        ? WC.L('将覆盖该季度已有的 OKR', 'This will replace the existing OKR for this quarter')
        : WC.L('生成完成后自动保存到该季度', 'Saved to this quarter when generation finishes'),
      wide: true,
      dismissible: false,
      body: WC.L('<div class="stream-status" data-status><span>正在收集该季度的任务、工作源与人天素材...</span></div>',
        '<div class="stream-status" data-status><span>Collecting this quarter\'s tasks, work sources and person-days...</span></div>'),
      foot: WC.L('<button class="btn" data-cancel>取消生成</button>', '<button class="btn" data-cancel>Cancel</button>'),
      onClose: function () { document.removeEventListener('keydown', onEsc) },
    })
    var statusEl = m.el.querySelector('[data-status]')
    function setStatus(text) { statusEl.innerHTML = '<span>' + WC.esc(text) + '</span>' }

    // Coalesce the per-delta character count into one paint per frame.
    var pendingCount = null
    var countFrame = false
    function paintCount() {
      countFrame = false
      if (pendingCount === null) return
      var n = pendingCount
      pendingCount = null
      setStatus(WC.L('AI 正在起草目标与关键结果...', 'AI is drafting objectives and key results...') +
        WC.L('（已接收 ', ' (') + n + WC.L(' 字符）', ' characters)'))
    }
    function queueCount(text) {
      pendingCount = String(text || '').length
      if (countFrame) return
      countFrame = true
      requestAnimationFrame(paintCount)
    }
    function flushCount() { if (pendingCount !== null) paintCount() }

    function cancel() {
      cancelled = true
      if (job) job.abort()
      else { m.close(); setBusy(false) }
    }
    function onEsc(e) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (keepOpen) m.close()
      else cancel()
    }
    document.addEventListener('keydown', onEsc)
    m.el.querySelector('[data-cancel]').addEventListener('click', cancel)

    /** Keep the reply on screen with the reason, its raw text, and a way out. */
    function showRaw(parsed) {
      var bodyEl = m.el.querySelector('.modal-body')
      var footEl = m.el.querySelector('.modal-foot')
      bodyEl.innerHTML =
        '<div class="okr-raw"><div class="okr-raw-note">' + WC.icon('info', 14) + '<span>' +
          (OKR_FAIL_REASON[parsed.reason] || OKR_FAIL_REASON.no_json) + '</span></div>' +
        WC.L('<div class="okr-raw-label">模型原文</div>', '<div class="okr-raw-label">Raw reply</div>') +
        '<pre class="okr-raw-pre">' + WC.esc(parsed.raw || WC.L('（空）', '(empty)')) + '</pre></div>'
      footEl.innerHTML =
        '<button class="btn" data-raw="copy">' + WC.icon('copy', 13) + WC.L('复制原文', 'Copy raw') + '</button>' +
        '<button class="btn" data-raw="retry">' + WC.icon('refresh', 13) + WC.L('重试', 'Retry') + '</button>' +
        '<button class="btn btn-primary" data-raw="close">' + WC.L('关闭', 'Close') + '</button>'
      footEl.querySelector('[data-raw="copy"]').addEventListener('click', function () {
        WC.copyText(String(parsed.raw || ''))
      })
      footEl.querySelector('[data-raw="retry"]').addEventListener('click', function () {
        m.close()
        generateOkr(periodKey, { replace: !!opts.replace, materialOverride: materialOverride })
      })
      footEl.querySelector('[data-raw="close"]').addEventListener('click', function () { m.close() })
    }

    var materialPromise = materialOverride
      ? Promise.resolve({ text: materialOverride, warnings: [] })
      : Promise.all([
        store.getMaterial(period.from, period.to),
        store.personDaysInRange(period.from, period.to),
      ]).then(function (out) {
        var mat = out[0]
        var personDays = out[1] || []
        materialOverride = buildMaterialText(mat) + '\n\n' + buildPersonDaysText(personDays)
        return { text: materialOverride, warnings: warningsOf(mat) }
      })

    return materialPromise.then(function (material) {
      if (cancelled) throw new Error(WC.L('已取消生成', 'Generation cancelled'))
      toastWarnings(material.warnings)
      setStatus(WC.L('AI 正在起草目标与关键结果...', 'AI is drafting objectives and key results...'))
      var settings = store.state.settings
      var previousText = WC.okr.buildPreviousText(store.listOkrs(), periodKey)
      job = AIPA.ai.generate({
        prompt: WC.okr.buildPrompt({
          template: settings.okrPrompt,
          periodLabel: period.label,
          periodRange: period.from + WC.L(' 至 ', ' to ') + period.to,
          materialText: material.text,
          previousText: previousText,
        }),
        instructions: WC.okr.INSTRUCTIONS,
        model: settings.model,
        onDelta: queueCount,
        onStatus: function (msg) {
          flushCount()
          setStatus(WC.L('连接波动，', 'Connection unstable, ') + msg)
        },
      })
      return job.promise
    }).then(function (text) {
      flushCount()
      var parsed = WC.okr.parseGenerated(text)
      if (!parsed.ok) { showRaw(parsed); keepOpen = true; return null }
      return WC.attempt(function () {
        return store.createOkr({
          periodKey: periodKey,
          objectives: parsed.objectives,
          source: 'ai',
          replace: !!opts.replace,
        })
      }).then(function (set) {
        var krCount = parsed.objectives.reduce(function (n, o) { return n + ((o.keyResults || []).length) }, 0)
        var msg = WC.L('已生成 ', 'Generated ') + parsed.objectives.length + WC.L(' 个目标、', ' objective(s), ') +
          krCount + WC.L(' 条关键结果', ' key result(s)')
        if (parsed.dropped > 0) msg += WC.L('；已忽略 ', '; ignored ') + parsed.dropped + WC.L(' 条不合规的关键结果', ' invalid key result(s)')
        AIPA.toast('success', msg)
        return set
      })
    }).catch(function (err) {
      flushCount()
      AIPA.toast(cancelled ? 'info' : 'error', cancelled ? WC.L('已取消生成', 'Generation cancelled') : WC.errMsg(err))
      return null
    }).then(function (result) {
      if (!keepOpen) m.close()
      setBusy(false)
      return result
    })
  }

  WC.gen = {
    isBusy: function () { return busy },
    onBusy: function (fn) { busyListeners.push(fn) },
    generateWeekly: generateWeekly,
    generateMonthly: generateMonthly,
    generateOkr: generateOkr,
    regenerate: regenerate,
    pullSourcesForPeriod: pullSourcesForPeriod,
    buildMaterialText: buildMaterialText,
  }
})()
