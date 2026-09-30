/** 任务管理：统计卡 + 筛选 + 表格（行内改状态）+ 新建/编辑弹窗 + 分页。 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store
  var PAGE_SIZE = 10

  var view = { root: null, keyword: '', status: '', priority: '', page: 1 }

  function statCard(label, value, cls) {
    return '<div class="stat ' + (cls || '') + '"><div class="k">' + label + '</div><div class="v">' + value + '</div></div>'
  }

  function dateRange(t) {
    var s = store.spanOf(t)
    if (!s) return '<span class="muted">—</span>'
    var overdue = t.dueDate && t.dueDate < D.todayKey() && t.status !== 'done'
    var text = s.start === s.end ? s.end : s.start + ' ~ ' + s.end
    return '<span class="' + (overdue ? 'overdue' : '') + '" title="' + (overdue ? WC.L('已逾期', 'Overdue') : '') + '">' + text + '</span>'
  }

  function sourceName(id) {
    if (!id) return '<span class="muted">—</span>'
    var s = store.getSource(id)
    return s ? WC.esc(s.name) : WC.L('<span class="muted">未知工作源</span>', '<span class="muted">Unknown source</span>')
  }

  function render() {
    if (!view.root) return
    var stats = store.taskStats()
    var all = store.listTasks({ keyword: view.keyword, status: view.status, priority: view.priority })
    var pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
    if (view.page > pages) view.page = pages
    var items = all.slice((view.page - 1) * PAGE_SIZE, view.page * PAGE_SIZE)

    var rows = items.map(function (t) {
      return '<tr>' +
        '<td><div class="cell-title">' + WC.esc(t.title) + '</div>' + (t.description ? '<div class="cell-desc">' + WC.esc(t.description) + '</div>' : '') + '</td>' +
        '<td><select class="select status-select" data-status-of="' + t.id + '">' + WC.options(WC.STATUS, t.status) + '</select></td>' +
        '<td><span class="badge ' + WC.PRIORITY_BADGE[t.priority] + '">' + WC.PRIORITY[t.priority] + '</span></td>' +
        '<td>' + dateRange(t) + '</td>' +
        '<td>' + sourceName(t.workSourceId) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + t.id + '">' + WC.icon('edit', 13) + WC.L('编辑</button>', 'Edit</button>') +
        '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + t.id + '">' + WC.icon('trash', 13) + WC.L('删除</button></td>', 'Delete</button></td>') +
      '</tr>'
    }).join('')

    var focused = document.activeElement && document.activeElement.getAttribute('data-f') === 'keyword'
    view.root.innerHTML =
      WC.L('<div class="page-head"><div><div class="page-title">任务管理</div><div class="page-sub">创建、跟踪和管理你的工作任务，可绑定工作源作为报告素材</div></div>', '<div class="page-head"><div><div class="page-title">Tasks</div><div class="page-sub">Create, track and manage your work; bind a work source to feed reports</div></div>') +
        '<button class="btn btn-primary" data-act="create">' + WC.icon('plus') + WC.L('新建任务</button></div>', 'New task</button></div>') +
      '<div class="stats">' +
        statCard(WC.L('全部任务', 'All tasks'), stats.total) + statCard(WC.L('待处理', 'To do'), stats.todo) + statCard(WC.L('进行中', 'In progress'), stats.inProgress) +
        statCard(WC.L('已完成', 'Done'), stats.done, 'accent') + statCard(WC.L('今日截止', 'Due today'), stats.dueToday) + statCard(WC.L('已逾期', 'Overdue'), stats.overdue, stats.overdue ? 'danger' : '') +
      '</div>' +
      '<div class="toolbar">' +
        WC.L('<input class="input grow" data-f="keyword" placeholder="搜索任务标题" value="', '<input class="input grow" data-f="keyword" placeholder="Search task titles" value="') + WC.esc(view.keyword) + '">' +
        WC.L('<select class="select" data-f="status"><option value="">全部状态</option>', '<select class="select" data-f="status"><option value="">All statuses</option>') + WC.options(WC.STATUS, view.status) + '</select>' +
        WC.L('<select class="select" data-f="priority"><option value="">全部优先级</option>', '<select class="select" data-f="priority"><option value="">All priorities</option>') + WC.options(WC.PRIORITY, view.priority) + '</select>' +
      '</div>' +
      (all.length
        ? WC.L('<div class="table-wrap"><table class="grid"><thead><tr><th>标题</th><th>状态</th><th>优先级</th><th>日期</th><th>工作源</th><th>操作</th></tr></thead><tbody>', '<div class="table-wrap"><table class="grid"><thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Dates</th><th>Work source</th><th>Actions</th></tr></thead><tbody>') + rows + '</tbody></table></div>' +
          WC.L('<div class="pager"><span>共 ', '<div class="pager"><span>') + all.length + WC.L(' 条</span><span class="row">', ' total</span><span class="row">') +
            '<button class="btn btn-sm btn-icon" data-act="page" data-page="' + (view.page - 1) + '"' + (view.page <= 1 ? ' disabled' : '') + '>' + WC.icon('left', 13) + '</button>' +
            '<span>' + view.page + ' / ' + pages + '</span>' +
            '<button class="btn btn-sm btn-icon" data-act="page" data-page="' + (view.page + 1) + '"' + (view.page >= pages ? ' disabled' : '') + '>' + WC.icon('right', 13) + '</button>' +
          '</span></div>'
        : '<div class="card empty">' + (store.state.tasks.length ? WC.L('没有符合筛选条件的任务', 'No tasks match the filters') : WC.L('暂无任务，点击右上角「新建任务」或在日历上拖动创建', 'No tasks yet. Click "New task" or drag on the calendar to create one.')) + '</div>')

    if (focused) {
      var input = view.root.querySelector('[data-f="keyword"]')
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }

  function openForm(task) {
    var isEdit = !!task
    var sources = store.listSources()
    var t = task || { title: '', description: '', status: 'todo', priority: 'medium', startDate: '', dueDate: '', workSourceId: '' }
    var m = WC.modal({
      title: isEdit ? WC.L('编辑任务', 'Edit task') : WC.L('新建任务', 'New task'),
      sub: isEdit ? WC.L('修改任务信息后保存', 'Update the task and save') : WC.L('填写任务信息，创建一条新任务', 'Fill in the details to create a task'),
      body:
        WC.L('<div class="field"><label>标题<span class="req">*</span></label><input class="input" data-f="title" maxlength="200" placeholder="请输入任务标题" value="', '<div class="field"><label>Title<span class="req">*</span></label><input class="input" data-f="title" maxlength="200" placeholder="Task title" value="') + WC.esc(t.title) + '"></div>' +
        WC.L('<div class="field"><label>描述</label><textarea class="textarea" data-f="description" rows="3" maxlength="2000" placeholder="请输入任务描述（可选），会作为报告素材">', '<div class="field"><label>Description</label><textarea class="textarea" data-f="description" rows="3" maxlength="2000" placeholder="Optional; used as report material">') + WC.esc(t.description) + '</textarea></div>' +
        WC.L('<div class="row"><div class="field"><label>状态</label><select class="select" data-f="status">', '<div class="row"><div class="field"><label>Status</label><select class="select" data-f="status">') + WC.options(WC.STATUS, t.status) + '</select></div>' +
          WC.L('<div class="field"><label>优先级</label><select class="select" data-f="priority">', '<div class="field"><label>Priority</label><select class="select" data-f="priority">') + WC.options(WC.PRIORITY, t.priority) + '</select></div></div>' +
        WC.L('<div class="row"><div class="field"><label>开始日期</label><input type="date" class="input" data-f="startDate" value="', '<div class="row"><div class="field"><label>Start date</label><input type="date" class="input" data-f="startDate" value="') + (t.startDate || '') + '"></div>' +
          WC.L('<div class="field"><label>截止日期</label><input type="date" class="input" data-f="dueDate" value="', '<div class="field"><label>Due date</label><input type="date" class="input" data-f="dueDate" value="') + (t.dueDate || '') + '"></div></div>' +
        WC.L('<div class="field"><label>绑定工作源</label><select class="select" data-f="workSourceId"><option value="">不绑定</option>', '<div class="field"><label>Work source</label><select class="select" data-f="workSourceId"><option value="">None</option>') +
          sources.map(function (s) {
            return '<option value="' + s.id + '"' + (s.id === t.workSourceId ? ' selected' : '') + '>' + WC.esc(s.name) + (s.sourceType === 'github' ? WC.L('（GitHub）', ' (GitHub)') : WC.L('（文件夹）', ' (folder)')) + '</option>'
          }).join('') + WC.L('</select><span class="hint">绑定后，生成周报时会自动汇总该工作源在周期内的提交或文件变更</span></div>', '</select><span class="hint">When bound, weekly reports include this source\'s commits or file changes for the period</span></div>'),
      foot: WC.L('<button class="btn" data-close>取消</button><button class="btn btn-primary" data-do="save">保存</button>', '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-do="save">Save</button>'),
    })
    var f = function (n) { return m.el.querySelector('[data-f="' + n + '"]') }
    m.el.querySelector('[data-do="save"]').addEventListener('click', function (e) {
      var btn = e.currentTarget
      var payload = {
        title: f('title').value, description: f('description').value, status: f('status').value, priority: f('priority').value,
        startDate: f('startDate').value || null, dueDate: f('dueDate').value || null, workSourceId: f('workSourceId').value || null,
      }
      btn.disabled = true
      WC.attempt(function () { return isEdit ? store.updateTask(task.id, payload) : store.createTask(payload) })
        .then(function () { AIPA.toast('success', isEdit ? WC.L('任务已更新', 'Task updated') : WC.L('任务已创建', 'Task created')); m.close() })
        .catch(function (err) { btn.disabled = false; AIPA.toast('error', WC.L('保存任务失败：', 'Failed to save task: ') + WC.errMsg(err)) })
    })
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn || btn.disabled) return
    var act = btn.getAttribute('data-act')
    var id = btn.getAttribute('data-id')
    if (act === 'create') openForm(null)
    else if (act === 'edit') openForm(store.getTask(id))
    else if (act === 'page') { view.page = Number(btn.getAttribute('data-page')); render() }
    else if (act === 'delete') {
      var t = store.getTask(id)
      if (!t) return
      WC.confirm(WC.L('删除任务', 'Delete task'), WC.L('确定要删除任务「', 'Delete task "') + t.title + WC.L('」吗？删除后不可恢复。', '"? This cannot be undone.'), { danger: true, okText: WC.L('删除', 'Delete') }).then(function (ok) {
        if (!ok) return
        store.removeTask(id)
          .then(function () { AIPA.toast('success', WC.L('任务已删除', 'Task deleted')) })
          .catch(function (err) { AIPA.toast('error', WC.L('删除任务失败：', 'Failed to delete task: ') + WC.errMsg(err)) })
      })
    }
  }

  function onInput(e) {
    // Re-rendering mid-IME-composition would break Chinese input
    if (e.isComposing) return
    var f = e.target.getAttribute('data-f')
    if (f === 'keyword') { view.keyword = e.target.value; view.page = 1; render() }
  }

  function onChange(e) {
    var f = e.target.getAttribute('data-f')
    if (f === 'status' || f === 'priority') { view[f] = e.target.value; view.page = 1; render(); return }
    var taskId = e.target.getAttribute('data-status-of')
    if (taskId) {
      var value = e.target.value
      store.updateTask(taskId, { status: value })
        .then(function () { AIPA.toast('success', WC.L('任务状态已更新为「', 'Status changed to "') + WC.STATUS[value] + WC.L('」', '"')) })
        .catch(function (err) { AIPA.toast('error', WC.L('更新任务状态失败：', 'Failed to update status: ') + WC.errMsg(err)) })
    }
  }

  WC.views = WC.views || {}
  WC.views.tasks = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      root.addEventListener('input', onInput)
      root.addEventListener('compositionend', onInput)
      root.addEventListener('change', onChange)
      render()
    },
    unmount: function () {
      if (!view.root) return
      view.root.removeEventListener('click', onClick)
      view.root.removeEventListener('input', onInput)
      view.root.removeEventListener('compositionend', onInput)
      view.root.removeEventListener('change', onChange)
      view.root = null
    },
    refresh: render,
  }
})()
