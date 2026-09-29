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
    '你是嵌入在「工作日历」桌面插件中的报告写作助手。' +
    '只根据用户消息中提供的素材撰写报告，直接输出 Markdown 格式的报告正文，' +
    '不要输出任何前言、说明或结束语。不要执行命令、读取文件或调用任何工具。'

  var busy = false
  var busyListeners = []

  function setBusy(v) {
    busy = v
    busyListeners.forEach(function (fn) { fn(v) })
  }

  function buildMaterialText(m) {
    var lines = []
    lines.push('【完成任务】（' + m.completedCount + ' 项）')
    lines.push(m.completedTasks.length ? m.completedTasks.map(function (t) { return '- ' + t }).join('\n') : '无')
    lines.push('')
    lines.push('【进行中任务】')
    lines.push(m.inProgressTasks.length ? m.inProgressTasks.map(function (t) { return '- ' + t }).join('\n') : '无')
    lines.push('')
    lines.push('【逾期任务】')
    lines.push(m.overdueTasks.length ? m.overdueTasks.map(function (t) { return '- ' + t }).join('\n') : '无')
    var sources = m.sourceMaterials.filter(function (s) { return s.items.length > 0 })
    if (sources.length) {
      lines.push('')
      lines.push('【工作源记录】')
      sources.forEach(function (s) {
        lines.push('■ ' + s.sourceName + '（' + (s.sourceType === 'github' ? 'GitHub 提交' : '文件变更') + '）')
        lines.push(s.items.map(function (it) { return '- ' + it.title + '（' + it.desc + '）' }).join('\n'))
      })
    }
    return lines.join('\n')
  }

  /** Merge the month's weekly reports into material for a monthly report. */
  function buildWeeklyMergeMaterial(from, to) {
    var related = store.listReports('weekly')
      .filter(function (r) { return r.periodStart <= to && r.periodEnd >= from })
      .sort(function (a, b) { return a.periodStart.localeCompare(b.periodStart) })
    if (!related.length) return null
    var lines = ['【本月周报汇总】']
    related.forEach(function (r) {
      lines.push('')
      lines.push('■ 周报 ' + r.periodStart + ' 至 ' + r.periodEnd)
      lines.push(r.content)
    })
    return lines.join('\n')
  }

  function fillTemplate(template, period, material) {
    var t = template && template.trim() ? template : ''
    var hasMaterialSlot = t.indexOf('{{material}}') !== -1
    var out = t.replace(/\{\{\s*period\s*\}\}/g, period).replace(/\{\{\s*material\s*\}\}/g, material)
    // A custom template without the slot still needs the material
    if (!hasMaterialSlot) out += '\n\n时间周期：' + period + '\n工作素材：\n' + material
    return out
  }

  /**
   * @param {'weekly'|'monthly'} reportType
   * @param {{ existingId?: string, materialOverride?: string }} [opts]
   * @returns {Promise<object|null>} saved report, or null when cancelled/failed
   */
  function generate(reportType, from, to, opts) {
    opts = opts || {}
    if (busy) {
      AIPA.toast('info', '已有报告正在生成，请稍候')
      return Promise.resolve(null)
    }
    setBusy(true)
    var typeLabel = WC.REPORT_TYPE[reportType]
    var title = typeLabel + ' ' + from + ' 至 ' + to
    var job = null
    var cancelled = false

    var m = WC.modal({
      title: '<span class="spinner"></span><span>正在生成' + WC.esc(title) + '</span>',
      sub: opts.existingId ? '将覆盖原报告内容' : '生成完成后自动保存到历史报告',
      wide: true,
      dismissible: false,
      body: '<div class="stream-status" data-status><span>正在收集任务素材...</span></div><div class="report-box md" data-content></div>',
      foot: '<button class="btn" data-cancel>取消生成</button>',
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
        return {
          text: buildMaterialText(mat),
          warnings: mat.sourceMaterials.filter(function (s) { return s.error }).map(function (s) { return s.sourceName + '：' + s.error }),
        }
      })

    return materialPromise.then(function (material) {
      if (cancelled) throw new Error('已取消生成')
      material.warnings.forEach(function (w) { AIPA.toast('warning', '工作源拉取失败，已跳过 — ' + w) })
      setStatus('AI 正在撰写' + typeLabel + '...')
      var settings = store.state.settings
      var template = reportType === 'weekly' ? settings.weeklyPrompt : settings.monthlyPrompt
      job = AIPA.ai.generate({
        prompt: fillTemplate(template, from + ' 至 ' + to, material.text),
        instructions: INSTRUCTIONS,
        model: settings.model || undefined,
        onDelta: function (text) {
          setStatus('AI 正在撰写' + typeLabel + '...')
          render(text)
        },
        onStatus: function (msg) { setStatus('连接波动，' + msg) },
      })
      return job.promise
    }).then(function (text) {
      var content = String(text || '').trim()
      if (!content) throw new Error('生成内容为空，请重试')
      if (opts.existingId) {
        return store.updateReport(opts.existingId, { content: content }).then(function (r) {
          AIPA.toast('success', typeLabel + '已重新生成并更新')
          return r
        })
      }
      return store.createReport({ reportType: reportType, title: title, periodStart: from, periodEnd: to, content: content })
        .then(function (r) {
          AIPA.toast('success', typeLabel + '已生成并保存到历史报告')
          return r
        })
    }).catch(function (err) {
      AIPA.toast(cancelled ? 'info' : 'error', cancelled ? '已取消生成' : WC.errMsg(err))
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
      AIPA.toast('error', existingId ? '该周期暂无周报，无法重新生成月报' : '本月暂无周报，无法合并生成月报')
      return Promise.resolve(null)
    }
    return generate('monthly', from, to, { existingId: existingId, materialOverride: material })
  }

  /** Regenerate a report in place (weekly re-pulls material; monthly re-merges weeklies). */
  function regenerate(report) {
    if (report.reportType === 'monthly') {
      var material = buildWeeklyMergeMaterial(report.periodStart, report.periodEnd)
      if (!material) {
        AIPA.toast('error', '该周期暂无周报，无法重新生成月报')
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
      AIPA.toast('info', '该周期内没有绑定工作源的任务，无需拉取')
      return Promise.resolve()
    }
    var weekStart = D.weekStart(from)
    var ok = 0
    var failures = []
    return sources.reduce(function (chain, source) {
      return chain.then(function () {
        return store.pullSource(source.id, weekStart).then(function (s) {
          ok++
          if (!s.lastPull.itemCount) AIPA.toast('info', '「' + source.name + '」该周期没有符合条件的记录')
        }).catch(function (err) {
          failures.push(source.name + '（' + WC.errMsg(err) + '）')
        })
      })
    }, Promise.resolve()).then(function () {
      if (failures.length) AIPA.toast('error', '拉取完成：' + ok + ' 个成功，' + failures.length + ' 个失败 — ' + failures.join('、'))
      else AIPA.toast('success', '已拉取 ' + ok + ' 个工作源，可点击「重新生成」生成最新周报')
    })
  }

  WC.gen = {
    isBusy: function () { return busy },
    onBusy: function (fn) { busyListeners.push(fn) },
    generateWeekly: generateWeekly,
    generateMonthly: generateMonthly,
    regenerate: regenerate,
    pullSourcesForPeriod: pullSourcesForPeriod,
    buildMaterialText: buildMaterialText,
  }
})()
