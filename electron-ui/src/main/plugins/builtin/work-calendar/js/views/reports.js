/** 历史报告：按类型筛选，查看 / 编辑 / 重新生成 / 复制 / 导出 / 删除。 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store
  var gen = WC.gen

  var view = { root: null, type: '' }

  function render() {
    if (!view.root) return
    var reports = store.listReports(view.type)
    var list = reports.map(function (r) {
      var preview = r.content.replace(/[#>*`_|-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
      return '<div class="item-card clickable" data-act="view" data-id="' + r.id + '"><div class="main-col">' +
          '<div class="name"><span class="badge ' + (r.reportType === 'monthly' ? 'badge-accent' : '') + '">' + WC.REPORT_TYPE[r.reportType] + '</span>' + WC.esc(r.title) + '</div>' +
          WC.L('<div class="meta">周期：', '<div class="meta">Period: ') + r.periodStart + WC.L(' 至 ', ' to ') + r.periodEnd + WC.L(' · 创建于 ', ' · created ') + D.fmtDateTime(r.createdAt) + '</div>' +
          '<div class="meta">' + WC.esc(preview) + '</div>' +
        '</div><div class="actions">' +
          '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + r.id + WC.L('" title="删除">', '" title="Delete">') + WC.icon('trash', 13) + '</button>' +
        '</div></div>'
    }).join('')

    view.root.innerHTML =
      WC.L('<div class="page-head"><div><div class="page-title">工作报告</div><div class="page-sub">在日历左侧周列点击时钟图标即可 AI 生成周报，左上角图标由本月周报合并生成月报</div></div>', '<div class="page-head"><div><div class="page-title">Reports</div><div class="page-sub">Click the clock icon in a calendar week column to generate a weekly report; the corner icon builds a monthly report from the month\'s weekly reports</div></div>') +
        '<div class="seg">' +
          ['', 'weekly', 'monthly'].map(function (t) {
            return '<button data-act="filter" data-type="' + t + '" class="' + (view.type === t ? 'active' : '') + '">' + (t ? WC.REPORT_TYPE[t] : WC.L('全部', 'All')) + '</button>'
          }).join('') +
        '</div></div>' +
      (reports.length ? '<div class="list">' + list + '</div>' : WC.L('<div class="card empty">暂无报告</div>', '<div class="card empty">No reports yet</div>'))
  }

  function openReport(report, editing) {
    var m = WC.modal({
      title: WC.esc(report.title),
      sub: WC.L('周期：', 'Period: ') + report.periodStart + WC.L(' 至 ', ' to ') + report.periodEnd + WC.L(' · 创建于 ', ' · created ') + D.fmtDateTime(report.createdAt),
      wide: true,
      tools: editing
        ? ''
        : '<button class="btn btn-sm" data-do="edit">' + WC.icon('edit', 13) + WC.L('编辑</button>', 'Edit</button>') +
          '<button class="btn btn-sm" data-do="regen">' + WC.icon('refresh', 13) + WC.L('重新生成</button>', 'Regenerate</button>') +
          WC.L('<button class="btn btn-sm btn-icon" data-do="copy" title="复制 Markdown">', '<button class="btn btn-sm btn-icon" data-do="copy" title="Copy Markdown">') + WC.icon('copy', 13) + '</button>' +
          WC.L('<button class="btn btn-sm btn-icon" data-do="export" title="导出为 .md 文件">', '<button class="btn btn-sm btn-icon" data-do="export" title="Export as .md">') + WC.icon('download', 13) + '</button>' +
          WC.L('<button class="btn btn-sm btn-icon" data-do="chat" title="发送到 AI 对话继续润色">', '<button class="btn btn-sm btn-icon" data-do="chat" title="Send to AI chat to polish">') + WC.icon('chat', 13) + '</button>',
      body: editing
        ? WC.L('<div class="field"><label>标题</label><input class="input" data-f="title" value="', '<div class="field"><label>Title</label><input class="input" data-f="title" value="') + WC.esc(report.title) + '"></div>' +
          WC.L('<div class="field"><label>内容（Markdown）</label><textarea class="textarea" data-f="content" rows="18">', '<div class="field"><label>Content (Markdown)</label><textarea class="textarea" data-f="content" rows="18">') + WC.esc(report.content) + '</textarea></div>'
        : '<div class="report-box md">' + WC.markdown(report.content) + '</div>',
      foot: editing ? WC.L('<button class="btn" data-close>取消</button><button class="btn btn-primary" data-do="save">', '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-do="save">') + WC.icon('save', 13) + WC.L('保存</button>', 'Save</button>') : '',
    })
    m.el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-do]')
      if (!btn) return
      var act = btn.getAttribute('data-do')
      if (act === 'edit') { m.close(); openReport(report, true) }
      else if (act === 'regen') { m.close(); gen.regenerate(report) }
      else if (act === 'copy') WC.copyText(report.content)
      else if (act === 'chat') AIPA.sendPrompt(WC.L('请帮我润色并完善下面这份', 'Please polish and improve this ') + WC.REPORT_TYPE[report.reportType] + WC.L('：\n\n', ':\n\n') + report.content)
      else if (act === 'export') {
        var blob = new Blob([report.content], { type: 'text/markdown;charset=utf-8' })
        var a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = report.title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.md'
        a.click()
        setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
      } else if (act === 'save') {
        var title = m.el.querySelector('[data-f="title"]').value
        var content = m.el.querySelector('[data-f="content"]').value
        WC.attempt(function () { return store.updateReport(report.id, { title: title, content: content }) })
          .then(function (r) { AIPA.toast('success', WC.L('报告已保存', 'Report saved')); m.close(); openReport(r, false) })
          .catch(function (err) { AIPA.toast('error', WC.L('保存失败：', 'Failed to save: ') + WC.errMsg(err)) })
      }
    })
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn) return
    var act = btn.getAttribute('data-act')
    var id = btn.getAttribute('data-id')
    if (act === 'filter') { view.type = btn.getAttribute('data-type'); render() }
    else if (act === 'view') { var r = store.getReport(id); if (r) openReport(r, false) }
    else if (act === 'delete') {
      e.stopPropagation()
      var rep = store.getReport(id)
      if (!rep) return
      WC.confirm(WC.L('删除报告', 'Delete report'), WC.L('确定要删除报告「', 'Delete report "') + rep.title + WC.L('」吗？删除后不可恢复。', '"? This cannot be undone.'), { danger: true, okText: WC.L('删除', 'Delete') }).then(function (ok) {
        if (!ok) return
        store.removeReport(id)
          .then(function () { AIPA.toast('success', WC.L('删除成功', 'Deleted')) })
          .catch(function (err) { AIPA.toast('error', WC.L('删除失败：', 'Failed to delete: ') + WC.errMsg(err)) })
      })
    }
  }

  WC.views = WC.views || {}
  WC.views.reports = {
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
