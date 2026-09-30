/** 人天管理：周视图（增删改 + 从任务自动均摊）/ 月视图（按周分组聚合）。 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store

  var now = new Date()
  var view = {
    root: null,
    mode: 'week',
    weekStart: D.weekStart(D.todayKey()),
    year: now.getFullYear(),
    month: now.getMonth(),
    editingId: null,
  }

  function fmtDays(n) { return (Math.round(n * 10) / 10).toString() }

  function renderWeek() {
    var items = store.listPersonDays(view.weekStart)
    var total = items.reduce(function (s, p) { return s + p.days }, 0)
    var isThisWeek = view.weekStart === D.weekStart(D.todayKey())
    var rows = items.map(function (p) {
      if (p.id === view.editingId) {
        return '<tr><td><input class="input inline-input" data-e="desc" value="' + WC.esc(p.workDesc) + '"></td>' +
          '<td><input class="input inline-input" type="number" min="0.5" max="31" step="0.5" data-e="days" value="' + p.days + '" style="width:90px"></td>' +
          '<td style="white-space:nowrap"><button class="btn btn-primary btn-sm" data-act="save-edit" data-id="' + p.id + WC.L('">保存</button>', '">Save</button>') +
          WC.L('<button class="btn btn-ghost btn-sm" data-act="cancel-edit">取消</button></td></tr>', '<button class="btn btn-ghost btn-sm" data-act="cancel-edit">Cancel</button></td></tr>')
      }
      return '<tr><td>' + WC.esc(p.workDesc) + '</td><td class="days-cell">' + fmtDays(p.days) + WC.L(' 天</td>', ' d</td>') +
        '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + p.id + '">' + WC.icon('edit', 13) + WC.L('编辑</button>', 'Edit</button>') +
        '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + p.id + '">' + WC.icon('trash', 13) + WC.L('删除</button></td></tr>', 'Delete</button></td></tr>')
    }).join('')

    return '<div class="pd-head">' +
        '<div class="row"><button class="btn btn-icon" data-act="prev-week">' + WC.icon('left') + '</button>' +
          '<button class="btn" data-act="this-week"' + (isThisWeek ? ' disabled' : '') + WC.L('>本周</button>', '>This week</button>') +
          '<button class="btn btn-icon" data-act="next-week">' + WC.icon('right') + '</button>' +
          '<b style="margin-left:6px">' + view.weekStart + WC.L(' 至 ', ' to ') + D.addDays(view.weekStart, 6) + '</b></div>' +
        WC.L('<div class="row"><span class="pd-total">本周合计<b>', '<div class="row"><span class="pd-total">Week total<b>') + fmtDays(total) + WC.L('</b>人天</span>', '</b> person-days</span>') +
          '<button class="btn" data-act="auto">' + WC.icon('sparkles', 13) + WC.L('从任务自动生成</button></div>', 'Generate from tasks</button></div>') +
      '</div>' +
      WC.L('<div class="section-title">本周投入明细</div>', '<div class="section-title">This week\'s breakdown</div>') +
      (items.length
        ? WC.L('<div class="table-wrap"><table class="grid"><thead><tr><th>工作内容</th><th style="width:120px">人天</th><th style="width:150px">操作</th></tr></thead><tbody>', '<div class="table-wrap"><table class="grid"><thead><tr><th>Work</th><th style="width:120px">Person-days</th><th style="width:150px">Actions</th></tr></thead><tbody>') + rows + '</tbody></table></div>'
        : WC.L('<div class="card empty">本周暂无人天记录，可手动添加或点击「从任务自动生成」</div>', '<div class="card empty">No person-day entries this week. Add one or click "Generate from tasks".</div>')) +
      WC.L('<div class="pd-add"><input class="input" data-f="desc" placeholder="工作内容，如：需求评审与方案设计">', '<div class="pd-add"><input class="input" data-f="desc" placeholder="Work, e.g. requirements review and design">') +
        WC.L('<input class="input" type="number" data-f="days" min="0.5" max="31" step="0.5" placeholder="人天" value="1">', '<input class="input" type="number" data-f="days" min="0.5" max="31" step="0.5" placeholder="Days" value="1">') +
        '<button class="btn btn-primary" data-act="add">' + WC.icon('plus') + WC.L('添加</button></div>', 'Add</button></div>')
  }

  function renderMonth() {
    var data = store.monthlyPersonDays(view.year, view.month)
    return '<div class="pd-head">' +
        '<div class="row"><button class="btn btn-icon" data-act="prev-month">' + WC.icon('left') + '</button>' +
          '<b>' + WC.fmtMonth(view.year, view.month) + '</b>' +
          '<button class="btn btn-icon" data-act="next-month">' + WC.icon('right') + '</button></div>' +
        WC.L('<span class="pd-total">本月合计<b>', '<span class="pd-total">Month total<b>') + fmtDays(data.total) + WC.L('</b>人天</span>', '</b> person-days</span>') +
      '</div>' +
      (data.weeks.length
        ? data.weeks.map(function (w) {
          return '<div class="pd-week"><div class="pd-week-head"><span>' + w.label + '</span><span><b>' + fmtDays(w.total) + WC.L('</b> 人天</span></div>', '</b> person-days</span></div>') +
            w.items.map(function (p) {
              return '<div class="pd-line"><span>' + WC.esc(p.workDesc) + '</span><span class="days-cell">' + fmtDays(p.days) + WC.L(' 天</span></div>', ' d</span></div>')
            }).join('') + '</div>'
        }).join('')
        : WC.L('<div class="card empty">本月暂无人天记录</div>', '<div class="card empty">No person-day entries this month</div>'))
  }

  function render() {
    if (!view.root) return
    view.root.innerHTML =
      WC.L('<div class="page-head"><div><div class="page-title">人天管理</div><div class="page-sub">按周维护工作投入明细，按月聚合查看每周合计</div></div>', '<div class="page-head"><div><div class="page-title">Person-days</div><div class="page-sub">Track effort by week and see weekly totals rolled up by month</div></div>') +
        '<div class="seg"><button data-act="mode" data-mode="week" class="' + (view.mode === 'week' ? 'active' : '') + WC.L('">周视图</button>', '">Week</button>') +
          '<button data-act="mode" data-mode="month" class="' + (view.mode === 'month' ? 'active' : '') + WC.L('">月视图</button></div></div>', '">Month</button></div></div>') +
      (view.mode === 'week' ? renderWeek() : renderMonth())
  }

  function add() {
    var desc = view.root.querySelector('[data-f="desc"]').value
    var days = parseFloat(view.root.querySelector('[data-f="days"]').value)
    WC.attempt(function () { return store.createPersonDay({ weekStart: view.weekStart, workDesc: desc, days: days }) })
      .then(function () { AIPA.toast('success', WC.L('添加成功', 'Added')) })
      .catch(function (err) { AIPA.toast('error', WC.L('添加失败：', 'Failed to add: ') + WC.errMsg(err)) })
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn || btn.disabled) return
    var act = btn.getAttribute('data-act')
    var id = btn.getAttribute('data-id')
    var d
    switch (act) {
      case 'mode': view.mode = btn.getAttribute('data-mode'); view.editingId = null; break
      case 'prev-week': view.weekStart = D.addDays(view.weekStart, -7); view.editingId = null; break
      case 'next-week': view.weekStart = D.addDays(view.weekStart, 7); view.editingId = null; break
      case 'this-week': view.weekStart = D.weekStart(D.todayKey()); break
      case 'prev-month':
      case 'next-month':
        d = new Date(view.year, view.month + (act === 'prev-month' ? -1 : 1), 1)
        view.year = d.getFullYear()
        view.month = d.getMonth()
        break
      case 'edit': view.editingId = id; break
      case 'cancel-edit': view.editingId = null; break
      case 'add': add(); return
      case 'save-edit': {
        var desc = view.root.querySelector('[data-e="desc"]').value
        var days = parseFloat(view.root.querySelector('[data-e="days"]').value)
        WC.attempt(function () { return store.updatePersonDay(id, { workDesc: desc, days: days }) })
          .then(function () { view.editingId = null; AIPA.toast('success', WC.L('保存成功', 'Saved')); render() })
          .catch(function (err) { AIPA.toast('error', WC.L('保存失败：', 'Failed to save: ') + WC.errMsg(err)) })
        return
      }
      case 'delete': {
        var item = store.state.personDays.find(function (p) { return p.id === id })
        if (!item) return
        WC.confirm(WC.L('删除人天记录', 'Delete person-day entry'), WC.L('确定要删除「', 'Delete "') + item.workDesc + WC.L('」这条人天记录吗？删除后不可恢复。', '"? This cannot be undone.'), { danger: true, okText: WC.L('删除', 'Delete') }).then(function (ok) {
          if (!ok) return
          store.removePersonDay(id)
            .then(function () { AIPA.toast('success', WC.L('删除成功', 'Deleted')) })
            .catch(function (err) { AIPA.toast('error', WC.L('删除失败：', 'Failed to delete: ') + WC.errMsg(err)) })
        })
        return
      }
      case 'auto':
        WC.attempt(function () { return store.autoGeneratePersonDays(view.weekStart) })
          .then(function (created) { AIPA.toast('success', WC.L('生成了 ', 'Generated ') + created.length + WC.L(' 条人天记录', ' person-day entries')) })
          .catch(function (err) { AIPA.toast('error', WC.L('自动生成失败：', 'Auto-generate failed: ') + WC.errMsg(err)) })
        return
      default: return
    }
    render()
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.isComposing) return
    if (e.target.getAttribute('data-f')) { e.preventDefault(); add() }
    else if (e.target.getAttribute('data-e') && view.editingId) {
      e.preventDefault()
      var save = view.root.querySelector('[data-act="save-edit"]')
      if (save) save.click()
    }
  }

  WC.views = WC.views || {}
  WC.views.persondays = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      root.addEventListener('keydown', onKeyDown)
      render()
    },
    unmount: function () {
      if (view.root) {
        view.root.removeEventListener('click', onClick)
        view.root.removeEventListener('keydown', onKeyDown)
      }
      view.root = null
    },
    refresh: render,
  }
})()
