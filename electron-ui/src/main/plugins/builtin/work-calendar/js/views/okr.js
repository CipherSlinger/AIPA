/** OKR：按季度把已记录的工作变成可量化的目标与关键结果。 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store
  var okr = WC.okr
  var gen = WC.gen

  var view = { root: null, periodKey: null }

  // ── Periods ──────────────────────────────────────
  function currentPeriod() {
    return okr && okr.quarterOf ? okr.quarterOf(D.todayKey()) : null
  }

  /** Previous / current / next quarter, plus any other quarter that already has a set. */
  function periodOptions() {
    var options = okr.quarterOptions(D.todayKey()).slice()
    var keys = options.map(function (o) { return o.key })
    store.listOkrs().forEach(function (set) {
      if (keys.indexOf(set.periodKey) !== -1) return
      var p = okr.parsePeriodKey(set.periodKey)
      if (!p) return
      keys.push(p.key)
      options.push({ key: p.key, label: p.label, from: p.from, to: p.to })
    })
    options.sort(function (a, b) { return a.from.localeCompare(b.from) })
    return options
  }

  function findOption(options, key) {
    for (var i = 0; i < options.length; i++) if (options[i].key === key) return options[i]
    return null
  }

  // ── Render ───────────────────────────────────────
  function pctLabel(v) { return Math.round(v) + '%' }

  function pageHead(options) {
    var seg = options.map(function (o) {
      return '<button data-act="quarter" data-key="' + WC.esc(o.key) + '" class="' + (o.key === view.periodKey ? 'active' : '') + '">' + WC.esc(o.label) + '</button>'
    }).join('')
    return '<div class="page-head"><div><div class="page-title">' + WC.L('OKR', 'OKR') + '</div>' +
      WC.L('<div class="page-sub">每个季度一份：素材取自该季度的任务、工作源记录与人天投入，由 AI 起草目标与可量化的关键结果</div>',
        '<div class="page-sub">One set per quarter, drafted by AI from that quarter\'s tasks, work-source records and person-days</div>') +
      '</div><div class="seg">' + seg + '</div></div>'
  }

  function scoreChip(progress) {
    if (progress.percent == null) return '<span class="badge">' + WC.L('尚未评分', 'Unscored') + '</span>'
    return '<span class="badge okr-band-' + okr.progressBand(progress.percent) + '">' + pctLabel(progress.percent) + '</span>'
  }

  function renderObjective(o, i) {
    var progress = okr.objectiveProgress(o) || { percent: null, scored: 0, total: 0 }
    var krs = (o.keyResults || []).map(function (k, j) {
      var unscored = k.percent == null
      return '<div class="okr-kr"><span class="okr-kr-idx">KR' + (j + 1) + '</span>' +
        '<span class="okr-kr-title">' + WC.esc(k.title) + '</span>' +
        (k.target == null || k.target === '' ? '' : '<span class="okr-kr-target">' + WC.L('目标 ', 'Target ') + WC.esc(k.target) + '</span>') +
        '<span class="okr-kr-pct' + (unscored ? ' is-unscored' : '') + '">' +
          (unscored ? WC.L('尚未评分', 'Unscored') : pctLabel(k.percent)) + '</span></div>'
    }).join('')
    return '<div class="okr-obj"><div class="okr-obj-head"><span class="okr-idx">O' + (i + 1) + '</span>' +
      '<span class="okr-obj-title">' + WC.esc(o.title) + '</span>' + scoreChip(progress) + '</div>' +
      '<div class="okr-krs">' + krs + '</div></div>'
  }

  function actions() {
    return '<button class="btn btn-primary btn-sm" data-act="generate">' + WC.icon('sparkles', 13) + WC.L('重新生成', 'Regenerate') + '</button>' +
      '<button class="btn btn-sm" data-act="edit">' + WC.icon('edit', 13) + WC.L('编辑', 'Edit') + '</button>' +
      '<button class="btn btn-sm" data-act="copy">' + WC.icon('copy', 13) + WC.L('复制 Markdown', 'Copy Markdown') + '</button>' +
      '<button class="btn btn-sm" data-act="export">' + WC.icon('download', 13) + WC.L('导出 .md', 'Export .md') + '</button>' +
      '<button class="btn btn-sm" data-act="chat">' + WC.icon('chat', 13) + WC.L('发送到对话', 'Send to chat') + '</button>' +
      '<button class="btn btn-danger btn-sm" data-act="delete">' + WC.icon('trash', 13) + WC.L('删除', 'Delete') + '</button>'
  }

  function renderSet(set, period) {
    var progress = okr.setProgress(set) || { percent: null, scored: 0, total: 0 }
    var band = okr.progressBand(progress.percent)
    var scored = progress.scored + '/' + progress.total
    var scoreText = (progress.percent == null ? WC.L('尚未评分', 'Unscored') : pctLabel(progress.percent)) +
      ' · ' + scored + WC.L(' 条已评分', ' scored')
    // An unscored set has no bar to fill — never paint an empty one as 0%.
    var fill = progress.percent == null ? '' :
      '<span class="okr-fill okr-fill-' + band + '" style="width:' + Math.max(0, Math.min(100, progress.percent)) + '%"></span>'
    var range = period ? period.from + WC.L(' 至 ', ' to ') + period.to : WC.esc(set.periodKey)
    var source = set.source === 'ai' ? WC.L('AI 生成', 'AI generated') : WC.L('手写', 'Manual')
    return '<div class="card okr-card">' +
        '<div class="okr-head"><div>' +
          '<div class="okr-title">' + WC.esc(set.title || (period ? period.label : set.periodKey)) + '</div>' +
          '<div class="okr-meta"><span>' + WC.esc(range) + '</span>' +
            '<span class="badge ' + (set.source === 'ai' ? 'badge-accent' : '') + '">' + source + '</span>' +
            WC.L('<span>更新于 ', '<span>Updated ') + D.fmtDateTime(set.updatedAt || set.createdAt) + '</span>' +
          '</div>' +
        '</div></div>' +
        '<div class="okr-progress"><div class="okr-track">' + fill + '</div>' +
          '<span class="okr-score">' + WC.esc(scoreText) + '</span></div>' +
        '<div class="okr-objectives">' + (set.objectives || []).map(renderObjective).join('') + '</div>' +
        '<div class="okr-actions">' + actions() + '</div>' +
      '</div>'
  }

  /**
   * Cheap check that must agree with what generation will actually read:
   * dated tasks whose span intersects the quarter, undated tasks created in it
   * (store.getMaterial's second branch), or person-days starting inside it.
   */
  function hasMaterial(period) {
    if (!period) return false
    var from = period.from
    var to = period.to
    if (store.tasksInRange(from, to).length) return true
    var tasks = (store.state && store.state.tasks) || []
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i]
      if (!t || t.startDate || t.dueDate || !t.createdAt) continue
      var created = D.toKey(new Date(t.createdAt))
      if (created >= from && created <= to) return true
    }
    var rows = (store.state && store.state.personDays) || []
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].weekStart >= from && rows[j].weekStart <= to) return true
    }
    return false
  }

  function renderEmpty(period) {
    if (!period) return WC.L('<div class="card empty">无法确定季度</div>', '<div class="card empty">Could not determine the quarter</div>')
    if (!hasMaterial(period)) {
      return WC.L('<div class="card empty">本季度还没有可用的工作素材。先在「任务」里登记这段时间做过的事，或在「人天」里补上投入记录，再回来生成 OKR。</div>',
        '<div class="card empty">No work material recorded for this quarter yet. Add what you did in Tasks, or fill in Person-days, then come back to generate the OKR.</div>')
    }
    return '<div class="card empty">' +
      WC.L('<div>本季度还没有 OKR。</div>', '<div>No OKR for this quarter yet.</div>') +
      WC.L('<div style="margin-top:6px">生成会基于这个季度的任务、工作源记录与人天投入起草 3–5 个目标及其关键结果。</div>',
        '<div style="margin-top:6px">Generation drafts 3-5 objectives and their key results from this quarter\'s tasks, work-source records and person-days.</div>') +
      '<button class="btn btn-primary" data-act="generate" style="margin-top:14px">' + WC.icon('sparkles', 13) + WC.L('AI 生成 OKR', 'Generate OKR') + '</button></div>'
  }

  function render() {
    if (!view.root) return
    if (!okr) {
      // The core module is missing (half-installed plugin): say so instead of
      // throwing a blank tab.
      view.root.innerHTML = WC.L('<div class="card empty">OKR 模块没有加载，请重新打开插件</div>',
        '<div class="card empty">The OKR module is not loaded — please reopen the plugin</div>')
      return
    }
    var options = periodOptions()
    if (!view.periodKey || !findOption(options, view.periodKey)) {
      var cur = currentPeriod()
      view.periodKey = cur ? cur.key : (options.length ? options[0].key : '')
    }
    if (!options.length) {
      view.root.innerHTML = pageHead(options) + WC.L('<div class="card empty">暂无可选季度</div>', '<div class="card empty">No quarter available</div>')
      return
    }
    var period = findOption(options, view.periodKey)
    var set = store.findOkrByPeriod(view.periodKey)
    view.root.innerHTML = pageHead(options) + (set ? renderSet(set, period) : renderEmpty(period))
  }

  // ── Edit modal ───────────────────────────────────
  function emptyKr() { return { id: WC.uid(), title: '', target: '', percent: null } }

  function draftFrom(set) {
    return {
      title: set.title || '',
      objectives: (set.objectives || []).map(function (o) {
        return {
          id: o.id,
          title: o.title || '',
          keyResults: (o.keyResults || []).map(function (k) {
            return { id: k.id, title: k.title || '', target: k.target == null ? '' : k.target, percent: k.percent == null ? null : k.percent }
          }),
        }
      }),
    }
  }

  function editBody(draft) {
    var objs = draft.objectives.map(function (o, i) {
      var krs = o.keyResults.map(function (k, j) {
        return '<div class="okr-edit-kr" data-kr="' + j + '">' +
          '<input class="input" data-f="kr-title" value="' + WC.esc(k.title) + '" placeholder="' + WC.L('关键结果', 'Key result') + '">' +
          '<input class="input" data-f="kr-target" value="' + WC.esc(k.target) + '" placeholder="' + WC.L('目标值', 'Target') + '">' +
          '<input class="input" data-f="kr-percent" type="number" min="0" max="100" step="1" value="' +
            (k.percent == null ? '' : WC.esc(k.percent)) + '" placeholder="' + WC.L('未评分', 'Unscored') + '">' +
          '<button class="btn btn-danger btn-icon btn-sm" data-act="del-kr" data-o="' + i + '" data-k="' + j + '" title="' +
            WC.L('删除关键结果', 'Remove key result') + '">' + WC.icon('x', 13) + '</button>' +
        '</div>'
      }).join('')
      return '<div class="okr-edit-obj" data-obj="' + i + '">' +
        '<div class="okr-edit-obj-head">' +
          '<input class="input" data-f="obj-title" value="' + WC.esc(o.title) + '" placeholder="' + WC.L('目标', 'Objective') + '">' +
          '<button class="btn btn-danger btn-icon btn-sm" data-act="del-obj" data-o="' + i + '" title="' +
            WC.L('删除目标', 'Remove objective') + '">' + WC.icon('trash', 13) + '</button>' +
        '</div>' + krs +
        '<div class="okr-edit-foot"><button class="btn btn-sm" data-act="add-kr" data-o="' + i + '">' +
          WC.icon('plus', 13) + WC.L('关键结果', 'Key result') + '</button></div>' +
      '</div>'
    }).join('')
    return '<div class="field"><label>' + WC.L('标题', 'Title') + '</label>' +
        '<input class="input" data-f="title" value="' + WC.esc(draft.title) + '" placeholder="' +
        WC.L('留空使用季度名称', 'Leave empty to use the quarter') + '"></div>' +
      objs +
      '<button class="btn" data-act="add-obj">' + WC.icon('plus', 13) + WC.L('添加目标', 'Add objective') + '</button>'
  }

  function coerceTarget(value, original) {
    var text = String(value == null ? '' : value).trim()
    if (!text) return ''
    if (typeof original === 'number' || /^-?\d+(\.\d+)?$/.test(text)) return Number(text)
    return text
  }

  function parsePercent(value) {
    var text = String(value == null ? '' : value).trim()
    if (!text) return null
    var n = Number(text)
    return isFinite(n) ? n : null
  }

  function openEdit(set) {
    var draft = draftFrom(set)
    var m = WC.modal({
      title: WC.icon('edit', 15) + WC.L('编辑 OKR', 'Edit OKR'),
      sub: WC.L('评分填 0–100，留空表示尚未评分；目标与关键结果都可以改名或删除', 'Score 0-100; leave empty for unscored. Objectives and key results can be renamed or removed.'),
      wide: true,
      body: '<div data-edit></div>',
      foot: WC.L('<button class="btn" data-close>取消</button>', '<button class="btn" data-close>Cancel</button>') +
        '<button class="btn btn-primary" data-act="save">' + WC.icon('save', 13) + WC.L('保存', 'Save') + '</button>',
    })
    var bodyEl = m.el.querySelector('[data-edit]')

    function paint() { bodyEl.innerHTML = editBody(draft) }

    function read() {
      var titleEl = bodyEl.querySelector('[data-f="title"]')
      if (titleEl) draft.title = titleEl.value
      var objEls = bodyEl.querySelectorAll('[data-obj]')
      for (var i = 0; i < objEls.length; i++) {
        var target = draft.objectives[i]
        if (!target) continue
        var objTitle = objEls[i].querySelector('[data-f="obj-title"]')
        if (objTitle) target.title = objTitle.value
        var krEls = objEls[i].querySelectorAll('[data-kr]')
        var krs = []
        for (var j = 0; j < krEls.length; j++) {
          var old = target.keyResults[j] || {}
          var title = krEls[j].querySelector('[data-f="kr-title"]')
          var goal = krEls[j].querySelector('[data-f="kr-target"]')
          var percent = krEls[j].querySelector('[data-f="kr-percent"]')
          krs.push({
            id: old.id || WC.uid(),
            title: title ? title.value : (old.title || ''),
            target: coerceTarget(goal ? goal.value : '', old.target),
            percent: parsePercent(percent ? percent.value : ''),
          })
        }
        target.keyResults = krs
      }
    }

    function save() {
      read()
      var objectives = draft.objectives.map(function (o) {
        return {
          id: o.id || WC.uid(),
          title: String(o.title || '').trim(),
          keyResults: o.keyResults.map(function (k) {
            return { id: k.id || WC.uid(), title: String(k.title || '').trim(), target: k.target, percent: k.percent }
          }),
        }
      })
      if (!objectives.length) {
        AIPA.toast('error', WC.L('OKR 至少需要一个目标', 'An OKR set needs at least one objective'))
        return
      }
      var period = okr.parsePeriodKey(set.periodKey)
      var title = String(draft.title || '').trim() || (period ? period.label : '')
      WC.attempt(function () { return store.updateOkr(set.id, { title: title, objectives: objectives }) })
        .then(function () { AIPA.toast('success', WC.L('OKR 已保存', 'OKR saved')); m.close(); render() })
        .catch(function (err) { AIPA.toast('error', WC.L('保存失败：', 'Failed to save: ') + WC.errMsg(err)) })
    }

    m.el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]')
      if (!btn) return
      var act = btn.getAttribute('data-act')
      var oi = Number(btn.getAttribute('data-o'))
      var ki = Number(btn.getAttribute('data-k'))
      if (act === 'add-obj') { read(); draft.objectives.push({ id: WC.uid(), title: '', keyResults: [emptyKr()] }); paint() }
      else if (act === 'add-kr') { read(); draft.objectives[oi].keyResults.push(emptyKr()); paint() }
      else if (act === 'del-kr') { read(); draft.objectives[oi].keyResults.splice(ki, 1); paint() }
      else if (act === 'del-obj') {
        read()
        if (draft.objectives.length <= 1) {
          AIPA.toast('error', WC.L('OKR 至少要保留一个目标，不能删除最后一个', 'An OKR set needs at least one objective; the last one cannot be removed'))
          return
        }
        draft.objectives.splice(oi, 1)
        paint()
      } else if (act === 'save') save()
    })
    paint()
    setTimeout(function () {
      var titleEl = bodyEl.querySelector('[data-f="title"]')
      if (titleEl) titleEl.focus()
    }, 30)
  }

  // ── Actions ──────────────────────────────────────
  function exportMd(set) {
    var period = okr.parsePeriodKey(set.periodKey)
    var name = (set.title || (period ? period.label : set.periodKey) || 'okr').replace(/[\\/:*?"<>|\s]+/g, '_') + '.md'
    var blob = new Blob([okr.toMarkdown(set)], { type: 'text/markdown;charset=utf-8' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
  }

  function removeSet(set) {
    WC.confirm(WC.L('删除 OKR', 'Delete OKR'),
      WC.L('确定要删除该季度的 OKR 吗？删除后不可恢复。', 'Delete this quarter\'s OKR? This cannot be undone.'),
      { danger: true, okText: WC.L('删除', 'Delete') }).then(function (ok) {
      if (!ok) return
      WC.attempt(function () { return store.removeOkr(set.id) })
        .then(function () { AIPA.toast('success', WC.L('删除成功', 'Deleted')); render() })
        .catch(function (err) { AIPA.toast('error', WC.L('删除失败：', 'Failed to delete: ') + WC.errMsg(err)) })
    })
  }

  function runGenerate(set) {
    var replace = !!set
    var go = function () { gen.generateOkr(view.periodKey, { replace: replace }).then(render) }
    if (!replace) { go(); return }
    WC.confirm(WC.L('重新生成 OKR', 'Regenerate OKR'),
      WC.L('重新生成会用新的结果覆盖该季度已有的 OKR，原来的目标与评分会丢失。确定继续吗？',
        'Regenerating replaces this quarter\'s OKR; the current objectives and scores are lost. Continue?'),
      { danger: true, okText: WC.L('重新生成', 'Regenerate') }).then(function (ok) { if (ok) go() })
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn || btn.disabled || !okr) return
    var act = btn.getAttribute('data-act')
    if (act === 'quarter') { view.periodKey = btn.getAttribute('data-key'); render(); return }
    if (act === 'generate') { runGenerate(store.findOkrByPeriod(view.periodKey)); return }
    var set = store.findOkrByPeriod(view.periodKey)
    if (!set) return
    if (act === 'edit') openEdit(set)
    else if (act === 'copy') WC.copyText(okr.toMarkdown(set))
    else if (act === 'export') exportMd(set)
    else if (act === 'chat') AIPA.sendPrompt(WC.L('请帮我完善这份 OKR：\n\n', 'Please help me refine this OKR:\n\n') + okr.toMarkdown(set))
    else if (act === 'delete') removeSet(set)
  }

  if (gen && gen.onBusy) gen.onBusy(function () { if (view.root) render() })

  WC.views = WC.views || {}
  WC.views.okr = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      render()
    },
    unmount: function () {
      if (view.root) view.root.removeEventListener('click', onClick)
      view.root = null
    },
    refresh: render,
  }
})()
