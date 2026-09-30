/**
 * 日历视图：自绘月视图（周一对齐 6 行），跨天任务条（lane 布局），
 * 点击/拖动创建任务，左侧周列显示周报状态，左上角格显示月报状态，
 * 底部为所选日期的任务面板。
 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store
  var gen = WC.gen

  var LANE_TOP = 30
  var LANE_HEIGHT = 18
  var WEEK_NAMES = WC.WEEKDAY_SHORT

  var view = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    selected: D.todayKey(),
    drag: null,           // { startKey, endKey } while mouse is down
    range: null,          // confirmed selection while the create popover is open
    popover: null,        // { el, close }
    root: null,
  }

  function gridStartKey() {
    return D.weekStart(D.monthStart(view.year, view.month))
  }

  /** Lane layout for the spans intersecting one week (port of calendarBars.ts). */
  function weekSegments(weekStartKey, weekEndKey) {
    var spans = store.tasksInRange(weekStartKey, weekEndKey).map(function (t) {
      var s = store.spanOf(t)
      return { task: t, startKey: s.start, endKey: s.end }
    })
    spans.sort(function (a, b) {
      if (a.startKey !== b.startKey) return a.startKey < b.startKey ? -1 : 1
      return a.endKey > b.endKey ? -1 : 1
    })
    var laneEnds = []
    var segments = spans.map(function (span) {
      var cs = span.startKey < weekStartKey ? weekStartKey : span.startKey
      var ce = span.endKey > weekEndKey ? weekEndKey : span.endKey
      var lane = laneEnds.findIndex(function (end) { return end < cs })
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(ce) } else laneEnds[lane] = ce
      return {
        span: span,
        startIdx: D.dayDiff(weekStartKey, cs),
        endIdx: D.dayDiff(weekStartKey, ce),
        lane: lane,
        before: span.startKey < weekStartKey,
        after: span.endKey > weekEndKey,
      }
    })
    return { segments: segments, laneCount: laneEnds.length }
  }

  function activeRange() {
    var r = view.drag || view.range
    if (!r) return null
    return r.startKey <= r.endKey ? { lo: r.startKey, hi: r.endKey } : { lo: r.endKey, hi: r.startKey }
  }

  function reportBtn(report, kind, key) {
    var busy = gen.isBusy()
    if (report) {
      return '<button class="rep-btn done" data-act="preview-report" data-id="' + report.id + '" title="' +
        (kind === 'month' ? WC.L('本月月报已生成，点击预览', 'Monthly report ready — click to preview') : WC.L('本周周报已生成，点击预览', 'Weekly report ready — click to preview')) + '">' + WC.icon('check', 15) + '</button>'
    }
    return '<button class="rep-btn' + (busy ? ' busy' : '') + '" data-act="' + (kind === 'month' ? 'gen-monthly' : 'gen-weekly') + '"' +
      (key ? ' data-key="' + key + '"' : '') + ' title="' +
      (kind === 'month' ? WC.L('本月月报未生成，点击由本月周报合并生成', 'No monthly report yet — click to build it from this month\'s weekly reports') : WC.L('本周周报未生成，点击 AI 生成', 'No weekly report yet — click to generate with AI')) + '">' + WC.icon('clock', 15) + '</button>'
  }

  function renderGrid() {
    var start = gridStartKey()
    var today = D.todayKey()
    var range = activeRange()
    var monthKey = view.year + '-' + D.pad(view.month + 1)
    var html = []

    html.push(
      '<div class="cal-weekhdr"><div class="cal-corner">' + reportBtn(store.findMonthlyReport(monthKey), 'month') + '</div>' +
      '<div class="cal-days7">' + WEEK_NAMES.map(function (n) { return '<div class="cal-dayname">' + (WC.isEn ? n : '周' + n) + '</div>' }).join('') + '</div></div>'
    )

    for (var row = 0; row < 6; row++) {
      var wkStart = D.addDays(start, row * 7)
      var wkEnd = D.addDays(wkStart, 6)
      var seg = weekSegments(wkStart, wkEnd)
      var cells = []
      var selStart = -1
      var selEnd = -1
      for (var c = 0; c < 7; c++) {
        var key = D.addDays(wkStart, c)
        var inRange = range && key >= range.lo && key <= range.hi
        if (inRange) { if (selStart === -1) selStart = c; selEnd = c }
        var cls = ['cal-cell']
        if (D.parseKey(key).getMonth() !== view.month) cls.push('other')
        if (key === today) cls.push('today')
        if (inRange) cls.push('in-range')
        else if (key === view.selected) cls.push('selected')
        cells.push('<div class="' + cls.join(' ') + '" data-date-key="' + key + '"><span class="cal-daynum">' + Number(key.slice(8)) + '</span></div>')
      }

      var bars = seg.segments.map(function (s) {
        var t = s.span.task
        var cls = ['cal-bar']
        if (!s.before) cls.push('round-l')
        if (!s.after) cls.push('round-r')
        if (t.status === 'done') cls.push('done')
        return '<button class="' + cls.join(' ') + '" data-act="edit-task" data-id="' + t.id + '" title="' +
          WC.esc(t.title + WC.L('（', ' (') + s.span.startKey + WC.L(' 至 ', ' to ') + s.span.endKey + WC.L('）', ')')) + '" style="background:' + WC.barColor(t.id) +
          ';left:calc(' + (s.startIdx / 7 * 100) + '% + 2px);width:calc(' + ((s.endIdx - s.startIdx + 1) / 7 * 100) + '% - 4px);top:' + (s.lane * LANE_HEIGHT) + 'px">' +
          (s.before ? '' : WC.esc(t.title)) + '</button>'
      }).join('')

      var strip = ''
      if (selStart >= 0) {
        strip = '<div class="cal-select-strip" style="left:calc(' + (selStart / 7 * 100) + '% + 2px);width:calc(' +
          ((selEnd - selStart + 1) / 7 * 100) + '% - 4px);top:' + (LANE_TOP + seg.laneCount * LANE_HEIGHT) + 'px;' +
          (range.lo < wkStart ? '' : 'border-top-left-radius:6px;border-bottom-left-radius:6px;') +
          (range.hi > wkEnd ? '' : 'border-top-right-radius:6px;border-bottom-right-radius:6px;') + '"></div>'
      }

      html.push(
        '<div class="cal-row">' +
          '<div class="cal-weekcol"><span class="wk-date">' + D.fmtDot(wkStart) + '</span>' + reportBtn(store.findWeeklyReport(wkStart, wkEnd), 'week', wkStart) + '</div>' +
          '<div class="cal-body" style="min-height:' + (LANE_TOP + seg.laneCount * LANE_HEIGHT + 26) + 'px">' +
            '<div class="cal-cells">' + cells.join('') + '</div>' +
            (seg.laneCount ? '<div class="cal-lanes" style="top:' + LANE_TOP + 'px;height:' + (seg.laneCount * LANE_HEIGHT) + 'px">' + bars + '</div>' : '') +
            strip +
          '</div>' +
        '</div>'
      )
    }
    return html.join('')
  }

  function renderDayPanel() {
    var key = view.selected
    var tasks = store.tasksInRange(key, key)
    var list = tasks.map(function (t) {
      var s = store.spanOf(t)
      var range = s.start === s.end ? '' : s.start.slice(5) + WC.L(' 至 ', ' to ') + s.end.slice(5)
      var badge = t.status === 'done' ? 'badge-accent' : t.status === 'in_progress' ? '' : 'badge-outline'
      return '<li><button class="day-item" data-act="edit-task" data-id="' + t.id + '">' +
        '<span class="l"><span class="dot" style="background:' + WC.barColor(t.id) + '"></span>' +
        '<span class="t">' + WC.esc(t.title) + '</span>' + (range ? '<span class="r">' + range + '</span>' : '') + '</span>' +
        '<span class="badge ' + badge + '">' + WC.STATUS[t.status] + '</span></button></li>'
    }).join('')
    return '<div class="day-panel"><h3>' + D.fmtCN(key) + '<small>' + D.weekdayLabel(key) + '</small></h3>' +
      '<div class="hint-line">' + WC.icon('info', 13) + WC.L('当日任务（', 'Tasks (') + tasks.length + WC.L('）· 在日历格上点击或按住拖动即可创建任务</div>', ') · Click a day or drag across days to create a task</div>') +
      (tasks.length ? '<ul class="day-list">' + list + '</ul>' : '') + '</div>'
  }

  function render() {
    if (!view.root) return
    view.root.innerHTML =
      '<div class="cal' + (view.drag ? ' cal-dragging' : '') + '">' +
        '<div class="cal-head">' +
          '<div class="cal-title">' + WC.fmtMonth(view.year, view.month) + '</div>' +
          '<div class="cal-nav">' +
            WC.L('<button class="btn btn-icon" data-act="prev" title="上一月">', '<button class="btn btn-icon" data-act="prev" title="Previous month">') + WC.icon('left') + '</button>' +
            '<button class="btn" data-act="today">' + WC.icon('undo') + WC.L('回到今天</button>', 'Today</button>') +
            WC.L('<button class="btn btn-icon" data-act="next" title="下一月">', '<button class="btn btn-icon" data-act="next" title="Next month">') + WC.icon('right') + '</button>' +
          '</div>' +
          '<div class="cal-legend"><span style="color:var(--ok)">' + WC.icon('check', 13) + WC.L('已生成</span><span>', 'Generated</span><span>') + WC.icon('clock', 13) + WC.L('未生成（点击 AI 生成）</span></div>', 'Not generated (click to generate)</span></div>') +
        '</div>' +
        '<div data-grid>' + renderGrid() + '</div>' +
        renderDayPanel() +
      '</div>'
  }

  function rerenderGrid() {
    var grid = view.root && view.root.querySelector('[data-grid]')
    if (!grid) return
    grid.innerHTML = renderGrid()
    view.root.querySelector('.cal').classList.toggle('cal-dragging', !!view.drag)
  }

  // ── Task quick popover ─────────────────────────────────
  function closePopover() {
    if (view.popover) view.popover.close()
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }

  function openPopover(mode, task, startKey, endKey, anchor) {
    closePopover()
    var el = document.createElement('div')
    el.className = 'popover'
    var sources = store.listSources()
    var status = task ? task.status : 'todo'
    var priority = task ? task.priority : 'medium'
    var srcId = task ? task.workSourceId || '' : ''
    el.innerHTML =
      WC.L('<input class="input title" data-f="title" placeholder="添加任务标题" maxlength="200" value="', '<input class="input title" data-f="title" placeholder="Task title" maxlength="200" value="') + WC.esc(task ? task.title : '') + '">' +
      '<div class="row"><input type="date" class="input" data-f="start" value="' + startKey + WC.L('"><span class="muted">至</span><input type="date" class="input" data-f="end" value="', '"><span class="muted">to</span><input type="date" class="input" data-f="end" value="') + endKey + '"></div>' +
      '<div class="row"><select class="select" data-f="status">' + WC.options(WC.STATUS, status) + '</select>' +
        '<select class="select" data-f="priority">' + WC.options(WC.PRIORITY, priority) + '</select></div>' +
      WC.L('<div class="row"><select class="select" data-f="source"><option value="">不绑定工作源</option>', '<div class="row"><select class="select" data-f="source"><option value="">No work source</option>') +
        sources.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === srcId ? ' selected' : '') + '>' + WC.esc(s.name) + (s.sourceType === 'github' ? WC.L('（GitHub）', ' (GitHub)') : WC.L('（文件夹）', ' (folder)')) + '</option>'
        }).join('') + '</select></div>' +
      '<div class="actions">' +
        (mode === 'edit' ? '<button class="btn btn-danger btn-sm" data-do="delete">' + WC.icon('trash', 13) + WC.L('删除</button>', 'Delete</button>') : '<span></span>') +
        WC.L('<span class="row" style="margin:0;gap:6px"><button class="btn btn-sm" data-do="cancel">取消</button>', '<span class="row" style="margin:0;gap:6px"><button class="btn btn-sm" data-do="cancel">Cancel</button>') +
        '<button class="btn btn-primary btn-sm" data-do="save">' + (mode === 'edit' ? WC.L('保存', 'Save') : WC.L('创建', 'Create')) + '</button></span>' +
      '</div>'
    document.getElementById('overlay-root').appendChild(el)

    var W = 320
    var H = el.offsetHeight || 260
    var left = Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - W - 8))
    var top = anchor.bottom + 6
    if (top + H > window.innerHeight - 8) top = Math.max(8, anchor.top - H - 6)
    el.style.left = left + 'px'
    el.style.top = top + 'px'

    var f = function (name) { return el.querySelector('[data-f="' + name + '"]') }
    f('start').addEventListener('change', function () { if (f('start').value > f('end').value) f('end').value = f('start').value })
    f('end').addEventListener('change', function () { if (f('end').value < f('start').value) f('start').value = f('end').value })

    var busy = false
    function save() {
      if (busy) return
      var title = f('title').value.trim()
      if (!title) { AIPA.toast('error', WC.L('请输入任务标题', 'Please enter a task title')); f('title').focus(); return }
      if (!f('start').value || !f('end').value) { AIPA.toast('error', WC.L('请选择日期', 'Please choose a date')); return }
      busy = true
      var payload = {
        title: title, status: f('status').value, priority: f('priority').value,
        startDate: f('start').value, dueDate: f('end').value, workSourceId: f('source').value || null,
      }
      WC.attempt(function () { return mode === 'edit' ? store.updateTask(task.id, payload) : store.createTask(payload) })
        .then(function () {
          AIPA.toast('success', mode === 'edit' ? WC.L('任务已更新', 'Task updated') : WC.L('任务已创建', 'Task created'))
          close()
        })
        .catch(function (err) { busy = false; AIPA.toast('error', WC.L('保存任务失败：', 'Failed to save task: ') + WC.errMsg(err)) })
    }

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-do]')
      if (!btn) return
      var act = btn.getAttribute('data-do')
      if (act === 'cancel') close()
      else if (act === 'save') save()
      else if (act === 'delete') {
        store.removeTask(task.id)
          .then(function () { AIPA.toast('success', WC.L('任务已删除', 'Task deleted')); close() })
          .catch(function (err) { AIPA.toast('error', WC.L('删除任务失败：', 'Failed to delete task: ') + WC.errMsg(err)) })
      }
    })
    f('title').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); save() }
    })

    function onDocDown(e) {
      if (!el.contains(e.target) && !e.target.closest('.modal-mask')) close()
    }
    function onKey(e) { if (e.key === 'Escape') close() }
    setTimeout(function () {
      document.addEventListener('mousedown', onDocDown)
      document.addEventListener('keydown', onKey)
    }, 0)

    var closed = false
    function close() {
      if (closed) return
      closed = true
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
      el.remove()
      view.popover = null
      view.range = null
      render()
    }
    view.popover = { el: el, close: close }
    setTimeout(function () { f('title').focus() }, 20)
  }

  function editTask(id, anchorEl) {
    var t = store.getTask(id)
    if (!t) return
    var s = store.spanOf(t)
    openPopover('edit', t, s.start, s.end, rectOf(anchorEl))
  }

  // ── Report preview ─────────────────────────────────────
  function previewReport(report) {
    var isWeekly = report.reportType === 'weekly'
    var m = WC.modal({
      title: '<span style="color:var(--ok);display:flex">' + WC.icon('check', 16) + '</span>' + WC.esc(report.title),
      sub: report.periodStart + WC.L(' 至 ', ' to ') + report.periodEnd + (report.updatedAt ? WC.L(' · 更新于 ', ' · updated ') + D.fmtDateTime(report.updatedAt) : ''),
      wide: true,
      tools:
        (isWeekly ? WC.L('<button class="btn btn-sm" data-do="pull" title="拉取该周期任务所绑定的工作源">', '<button class="btn btn-sm" data-do="pull" title="Pull the work sources bound to tasks in this period">') + WC.icon('download', 13) + WC.L('一键拉取</button>', 'Pull sources</button>') : '') +
        '<button class="btn btn-sm" data-do="regen">' + WC.icon('refresh', 13) + WC.L('重新生成</button>', 'Regenerate</button>') +
        WC.L('<button class="btn btn-sm btn-icon" data-do="copy" title="复制 Markdown">', '<button class="btn btn-sm btn-icon" data-do="copy" title="Copy Markdown">') + WC.icon('copy', 13) + '</button>' +
        WC.L('<button class="btn btn-sm btn-icon" data-do="chat" title="发送到 AI 对话继续润色">', '<button class="btn btn-sm btn-icon" data-do="chat" title="Send to AI chat to polish">') + WC.icon('chat', 13) + '</button>',
      body: '<div class="report-box md">' + WC.markdown(report.content) + '</div>',
    })
    m.el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-do]')
      if (!btn) return
      var act = btn.getAttribute('data-do')
      if (act === 'copy') WC.copyText(report.content)
      else if (act === 'chat') AIPA.sendPrompt(WC.L('请帮我润色并完善下面这份', 'Please polish and improve this ') + WC.REPORT_TYPE[report.reportType] + WC.L('：\n\n', ':\n\n') + report.content)
      else if (act === 'regen') { m.close(); gen.regenerate(report) }
      else if (act === 'pull') {
        btn.disabled = true
        btn.innerHTML = WC.L('<span class="spinner"></span>正在拉取...', '<span class="spinner"></span>Pulling...')
        gen.pullSourcesForPeriod(report.periodStart, report.periodEnd).then(function () {
          btn.disabled = false
          btn.innerHTML = WC.icon('download', 13) + WC.L('一键拉取', 'Pull sources')
        })
      }
    })
  }

  // ── Events ─────────────────────────────────────────────
  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn) return
    var act = btn.getAttribute('data-act')
    if (act === 'prev' || act === 'next') {
      var d = new Date(view.year, view.month + (act === 'prev' ? -1 : 1), 1)
      view.year = d.getFullYear()
      view.month = d.getMonth()
      render()
    } else if (act === 'today') {
      var now = new Date()
      view.year = now.getFullYear()
      view.month = now.getMonth()
      view.selected = D.todayKey()
      render()
    } else if (act === 'edit-task') {
      editTask(btn.getAttribute('data-id'), btn)
    } else if (act === 'gen-weekly') {
      gen.generateWeekly(btn.getAttribute('data-key'))
    } else if (act === 'gen-monthly') {
      gen.generateMonthly(view.year, view.month)
    } else if (act === 'preview-report') {
      var r = store.getReport(btn.getAttribute('data-id'))
      if (r) previewReport(r)
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0 || e.target.closest('[data-act]')) return
    var cell = e.target.closest('[data-date-key]')
    if (!cell) return
    e.preventDefault()
    closePopover()
    var key = cell.getAttribute('data-date-key')
    view.anchor = rectOf(cell)
    view.range = null
    view.drag = { startKey: key, endKey: key }
    rerenderGrid()
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e) {
    if (!view.drag) return
    var el = document.elementFromPoint(e.clientX, e.clientY)
    var cell = el && el.closest('[data-date-key]')
    var key = cell && cell.getAttribute('data-date-key')
    if (key && key !== view.drag.endKey) {
      view.drag.endKey = key
      rerenderGrid()
    }
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    if (!view.drag) return
    var r = activeRange()
    view.drag = null
    view.range = { startKey: r.lo, endKey: r.hi }
    view.selected = r.lo
    render()
    openPopover('create', null, r.lo, r.hi, view.anchor)
  }

  WC.views = WC.views || {}
  WC.views.calendar = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      root.addEventListener('mousedown', onMouseDown)
      render()
    },
    unmount: function () {
      closePopover()
      if (view.root) {
        view.root.removeEventListener('click', onClick)
        view.root.removeEventListener('mousedown', onMouseDown)
      }
      view.root = null
    },
    refresh: function () {
      // Keep an open popover alive; it rerenders the grid on close
      if (view.popover) rerenderGrid()
      else render()
    },
  }
})()
