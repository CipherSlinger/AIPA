/**
 * 提醒：一次性（N 分钟后 / 指定时间）与周期（cron）提醒。
 *
 * Reminders are stored in plugin data `reminders` but fired by the AIPA host
 * (main process), which also removes/reschedules them — so this view always
 * re-reads before writing and polls while mounted instead of caching in store.
 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var POLL_MS = 15000
  var QUICK = [5, 15, 30, 60, 120]

  var view = { root: null, items: [], mode: 'quick', timer: null }

  function load() {
    return AIPA.data.get('reminders').then(function (v) { return Array.isArray(v) ? v : [] })
  }

  /** Read-modify-write so a concurrent host reschedule is not clobbered. */
  function mutate(fn) {
    return load().then(function (items) {
      var next = fn(items)
      return AIPA.data.set('reminders', next).then(function () { view.items = next; render() })
    })
  }

  function refresh() {
    load().then(function (items) { view.items = items; render() }).catch(function () {})
  }

  function timeLeft(ms) {
    var mins = Math.ceil((ms - Date.now()) / 60000)
    if (mins <= 0) return WC.L('即将提醒', 'due now')
    if (mins < 60) return mins + WC.L(' 分钟后', ' min')
    var h = Math.floor(mins / 60)
    if (h < 24) return h + WC.L(' 小时 ', ' h ') + (mins % 60) + WC.L(' 分钟后', ' min')
    return Math.floor(h / 24) + WC.L(' 天后', ' d')
  }

  function fmt(ms) {
    var d = new Date(ms)
    return D.toKey(d) + ' ' + D.pad(d.getHours()) + ':' + D.pad(d.getMinutes())
  }

  function presetLabel(cron) {
    var p = WC.cron.PRESETS.find(function (x) { return x.cron === cron })
    return p ? p.label : cron
  }

  function render() {
    if (!view.root) return
    var items = view.items.slice().sort(function (a, b) { return a.fireAt - b.fireAt })
    var modeBtn = function (m, label) {
      return '<button class="btn btn-sm' + (view.mode === m ? ' btn-primary' : '') + '" data-act="mode" data-mode="' + m + '">' + label + '</button>'
    }
    var modeBody = view.mode === 'quick'
      ? '<div class="row" style="flex-wrap:wrap">' + QUICK.map(function (m) {
          return '<button class="btn btn-sm" data-act="quick" data-min="' + m + '">' + (m < 60 ? m + WC.L(' 分钟后', ' min') : (m / 60) + WC.L(' 小时后', ' h')) + '</button>'
        }).join('') + '</div>'
      : view.mode === 'at'
      ? '<div class="row"><input type="datetime-local" class="input" data-f="at"><button class="btn btn-primary" data-act="add-at">' + WC.icon('plus', 13) + WC.L('添加</button></div>', 'Add</button></div>')
      : '<div class="row" style="flex-wrap:wrap">' + WC.cron.PRESETS.map(function (p) {
          return '<button class="btn btn-sm" data-act="preset" data-cron="' + p.cron + '">' + p.label + '</button>'
        }).join('') + '</div>' +
        WC.L('<div class="row" style="margin-top:8px"><input class="input grow" data-f="cron" placeholder="自定义 cron：分 时 日 月 周，如 30 8 * * 1-5">', '<div class="row" style="margin-top:8px"><input class="input grow" data-f="cron" placeholder="Custom cron: min hour day month weekday, e.g. 30 8 * * 1-5">') +
        '<button class="btn btn-primary" data-act="add-cron">' + WC.icon('plus', 13) + WC.L('添加</button></div>', 'Add</button></div>') +
        WC.L('<span class="hint">周期提醒每次触发后会自动计算下一次时间</span>', '<span class="hint">Recurring reminders reschedule themselves after each fire</span>')

    var rows = items.map(function (r) {
      return '<tr>' +
        '<td><div class="cell-title">' + WC.esc(r.text) + '</div></td>' +
        '<td>' + (r.cron ? WC.L('<span class="badge">周期 · ', '<span class="badge">Recurring · ') + WC.esc(presetLabel(r.cron)) + '</span>' : WC.L('<span class="badge badge-outline">一次性</span>', '<span class="badge badge-outline">One-time</span>')) + '</td>' +
        '<td>' + fmt(r.fireAt) + WC.L(' <span class="muted">（', ' <span class="muted">(') + timeLeft(r.fireAt) + WC.L('）</span></td>', ')</span></td>') +
        '<td><button class="btn btn-danger btn-sm" data-act="delete" data-id="' + WC.esc(r.id) + '">' + WC.icon('trash', 13) + WC.L('删除</button></td>', 'Delete</button></td>') +
      '</tr>'
    }).join('')

    var text = view.root.querySelector('[data-f="text"]')
    var keep = text ? text.value : ''
    view.root.innerHTML =
      WC.L('<div class="page-head"><div><div class="page-title">提醒</div><div class="page-sub">到点后通过系统通知提醒你，AIPA 在后台运行时也会生效</div></div></div>', '<div class="page-head"><div><div class="page-title">Reminders</div><div class="page-sub">Get a system notification when it is time — works while AIPA runs in the background</div></div></div>') +
      '<div class="card">' +
        WC.L('<div class="field"><label>提醒内容<span class="req">*</span></label><input class="input" data-f="text" maxlength="200" placeholder="例如：提交周报"></div>', '<div class="field"><label>Reminder<span class="req">*</span></label><input class="input" data-f="text" maxlength="200" placeholder="e.g. Submit weekly report"></div>') +
        '<div class="row" style="margin-bottom:10px">' + modeBtn('quick', WC.L('稍后提醒', 'Later')) + modeBtn('at', WC.L('指定时间', 'At a time')) + modeBtn('cron', WC.L('周期提醒', 'Recurring')) + '</div>' +
        modeBody +
      '</div>' +
      (items.length
        ? WC.L('<div class="table-wrap" style="margin-top:14px"><table class="grid"><thead><tr><th>内容</th><th>类型</th><th>下次提醒</th><th>操作</th></tr></thead><tbody>', '<div class="table-wrap" style="margin-top:14px"><table class="grid"><thead><tr><th>Reminder</th><th>Type</th><th>Next</th><th>Actions</th></tr></thead><tbody>') + rows + '</tbody></table></div>'
        : WC.L('<div class="card empty" style="margin-top:14px">暂无提醒</div>', '<div class="card empty" style="margin-top:14px">No reminders</div>'))
    view.root.querySelector('[data-f="text"]').value = keep
  }

  function add(fireAt, cron) {
    var input = view.root.querySelector('[data-f="text"]')
    var text = input.value.trim()
    if (!text) { AIPA.toast('error', WC.L('请填写提醒内容', 'Please enter the reminder text')); input.focus(); return }
    var r = { id: WC.uid(), text: text, fireAt: fireAt, createdAt: Date.now() }
    if (cron) r.cron = cron
    mutate(function (items) { return items.concat([r]) })
      .then(function () {
        view.root.querySelector('[data-f="text"]').value = ''
        AIPA.toast('success', WC.L('已设置提醒：', 'Reminder set: ') + fmt(fireAt))
      })
      .catch(function (err) { AIPA.toast('error', WC.L('保存提醒失败：', 'Failed to save reminder: ') + WC.errMsg(err)) })
  }

  function addCron(expr) {
    var next = WC.cron.next(expr)
    if (!next) { AIPA.toast('error', WC.L('cron 表达式无效，格式为「分 时 日 月 周」', 'Invalid cron expression, expected "min hour day month weekday"')); return }
    add(next.getTime(), expr.trim())
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn) return
    var act = btn.getAttribute('data-act')
    if (act === 'mode') { view.mode = btn.getAttribute('data-mode'); render() }
    else if (act === 'quick') add(Date.now() + Number(btn.getAttribute('data-min')) * 60000)
    else if (act === 'add-at') {
      var v = view.root.querySelector('[data-f="at"]').value
      var ms = v ? new Date(v).getTime() : NaN
      if (!(ms > Date.now())) { AIPA.toast('error', WC.L('请选择一个未来的时间', 'Please choose a time in the future')); return }
      add(ms)
    }
    else if (act === 'preset') addCron(btn.getAttribute('data-cron'))
    else if (act === 'add-cron') addCron(view.root.querySelector('[data-f="cron"]').value)
    else if (act === 'delete') {
      var id = btn.getAttribute('data-id')
      mutate(function (items) { return items.filter(function (r) { return r.id !== id }) })
        .then(function () { AIPA.toast('success', WC.L('提醒已删除', 'Reminder deleted')) })
        .catch(function (err) { AIPA.toast('error', WC.L('删除提醒失败：', 'Failed to delete reminder: ') + WC.errMsg(err)) })
    }
  }

  WC.views = WC.views || {}
  WC.views.reminders = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      render()
      refresh()
      view.timer = setInterval(refresh, POLL_MS)
    },
    unmount: function () {
      if (!view.root) return
      view.root.removeEventListener('click', onClick)
      clearInterval(view.timer)
      view.timer = null
      view.root = null
    },
    // Store changes don't touch reminders; only re-render to refresh "N 分钟后"
    refresh: render,
  }
})()
