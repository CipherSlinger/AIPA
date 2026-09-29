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
          '<td style="white-space:nowrap"><button class="btn btn-primary btn-sm" data-act="save-edit" data-id="' + p.id + '">保存</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="cancel-edit">取消</button></td></tr>'
      }
      return '<tr><td>' + WC.esc(p.workDesc) + '</td><td class="days-cell">' + fmtDays(p.days) + ' 天</td>' +
        '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + p.id + '">' + WC.icon('edit', 13) + '编辑</button>' +
        '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + p.id + '">' + WC.icon('trash', 13) + '删除</button></td></tr>'
    }).join('')

    return '<div class="pd-head">' +
        '<div class="row"><button class="btn btn-icon" data-act="prev-week">' + WC.icon('left') + '</button>' +
          '<button class="btn" data-act="this-week"' + (isThisWeek ? ' disabled' : '') + '>本周</button>' +
          '<button class="btn btn-icon" data-act="next-week">' + WC.icon('right') + '</button>' +
          '<b style="margin-left:6px">' + view.weekStart + ' 至 ' + D.addDays(view.weekStart, 6) + '</b></div>' +
        '<div class="row"><span class="pd-total">本周合计<b>' + fmtDays(total) + '</b>人天</span>' +
          '<button class="btn" data-act="auto">' + WC.icon('sparkles', 13) + '从任务自动生成</button></div>' +
      '</div>' +
      '<div class="section-title">本周投入明细</div>' +
      (items.length
        ? '<div class="table-wrap"><table class="grid"><thead><tr><th>工作内容</th><th style="width:120px">人天</th><th style="width:150px">操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="card empty">本周暂无人天记录，可手动添加或点击「从任务自动生成」</div>') +
      '<div class="pd-add"><input class="input" data-f="desc" placeholder="工作内容，如：需求评审与方案设计">' +
        '<input class="input" type="number" data-f="days" min="0.5" max="31" step="0.5" placeholder="人天" value="1">' +
        '<button class="btn btn-primary" data-act="add">' + WC.icon('plus') + '添加</button></div>'
  }

  function renderMonth() {
    var data = store.monthlyPersonDays(view.year, view.month)
    return '<div class="pd-head">' +
        '<div class="row"><button class="btn btn-icon" data-act="prev-month">' + WC.icon('left') + '</button>' +
          '<b>' + view.year + '年' + (view.month + 1) + '月</b>' +
          '<button class="btn btn-icon" data-act="next-month">' + WC.icon('right') + '</button></div>' +
        '<span class="pd-total">本月合计<b>' + fmtDays(data.total) + '</b>人天</span>' +
      '</div>' +
      (data.weeks.length
        ? data.weeks.map(function (w) {
          return '<div class="pd-week"><div class="pd-week-head"><span>' + w.label + '</span><span><b>' + fmtDays(w.total) + '</b> 人天</span></div>' +
            w.items.map(function (p) {
              return '<div class="pd-line"><span>' + WC.esc(p.workDesc) + '</span><span class="days-cell">' + fmtDays(p.days) + ' 天</span></div>'
            }).join('') + '</div>'
        }).join('')
        : '<div class="card empty">本月暂无人天记录</div>')
  }

  function render() {
    if (!view.root) return
    view.root.innerHTML =
      '<div class="page-head"><div><div class="page-title">人天管理</div><div class="page-sub">按周维护工作投入明细，按月聚合查看每周合计</div></div>' +
        '<div class="seg"><button data-act="mode" data-mode="week" class="' + (view.mode === 'week' ? 'active' : '') + '">周视图</button>' +
          '<button data-act="mode" data-mode="month" class="' + (view.mode === 'month' ? 'active' : '') + '">月视图</button></div></div>' +
      (view.mode === 'week' ? renderWeek() : renderMonth())
  }

  function add() {
    var desc = view.root.querySelector('[data-f="desc"]').value
    var days = parseFloat(view.root.querySelector('[data-f="days"]').value)
    WC.attempt(function () { return store.createPersonDay({ weekStart: view.weekStart, workDesc: desc, days: days }) })
      .then(function () { AIPA.toast('success', '添加成功') })
      .catch(function (err) { AIPA.toast('error', '添加失败：' + WC.errMsg(err)) })
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
          .then(function () { view.editingId = null; AIPA.toast('success', '保存成功'); render() })
          .catch(function (err) { AIPA.toast('error', '保存失败：' + WC.errMsg(err)) })
        return
      }
      case 'delete': {
        var item = store.state.personDays.find(function (p) { return p.id === id })
        if (!item) return
        WC.confirm('删除人天记录', '确定要删除「' + item.workDesc + '」这条人天记录吗？删除后不可恢复。', { danger: true, okText: '删除' }).then(function (ok) {
          if (!ok) return
          store.removePersonDay(id)
            .then(function () { AIPA.toast('success', '删除成功') })
            .catch(function (err) { AIPA.toast('error', '删除失败：' + WC.errMsg(err)) })
        })
        return
      }
      case 'auto':
        WC.attempt(function () { return store.autoGeneratePersonDays(view.weekStart) })
          .then(function (created) { AIPA.toast('success', '生成了 ' + created.length + ' 条人天记录') })
          .catch(function (err) { AIPA.toast('error', '自动生成失败：' + WC.errMsg(err)) })
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
