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
          '<div class="meta">周期：' + r.periodStart + ' 至 ' + r.periodEnd + ' · 创建于 ' + D.fmtDateTime(r.createdAt) + '</div>' +
          '<div class="meta">' + WC.esc(preview) + '</div>' +
        '</div><div class="actions">' +
          '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + r.id + '" title="删除">' + WC.icon('trash', 13) + '</button>' +
        '</div></div>'
    }).join('')

    view.root.innerHTML =
      '<div class="page-head"><div><div class="page-title">工作报告</div><div class="page-sub">在日历左侧周列点击时钟图标即可 AI 生成周报，左上角图标由本月周报合并生成月报</div></div>' +
        '<div class="seg">' +
          ['', 'weekly', 'monthly'].map(function (t) {
            return '<button data-act="filter" data-type="' + t + '" class="' + (view.type === t ? 'active' : '') + '">' + (t ? WC.REPORT_TYPE[t] : '全部') + '</button>'
          }).join('') +
        '</div></div>' +
      (reports.length ? '<div class="list">' + list + '</div>' : '<div class="card empty">暂无报告</div>')
  }

  function openReport(report, editing) {
    var m = WC.modal({
      title: WC.esc(report.title),
      sub: '周期：' + report.periodStart + ' 至 ' + report.periodEnd + ' · 创建于 ' + D.fmtDateTime(report.createdAt),
      wide: true,
      tools: editing
        ? ''
        : '<button class="btn btn-sm" data-do="edit">' + WC.icon('edit', 13) + '编辑</button>' +
          '<button class="btn btn-sm" data-do="regen">' + WC.icon('refresh', 13) + '重新生成</button>' +
          '<button class="btn btn-sm btn-icon" data-do="copy" title="复制 Markdown">' + WC.icon('copy', 13) + '</button>' +
          '<button class="btn btn-sm btn-icon" data-do="export" title="导出为 .md 文件">' + WC.icon('download', 13) + '</button>' +
          '<button class="btn btn-sm btn-icon" data-do="chat" title="发送到 AI 对话继续润色">' + WC.icon('chat', 13) + '</button>',
      body: editing
        ? '<div class="field"><label>标题</label><input class="input" data-f="title" value="' + WC.esc(report.title) + '"></div>' +
          '<div class="field"><label>内容（Markdown）</label><textarea class="textarea" data-f="content" rows="18">' + WC.esc(report.content) + '</textarea></div>'
        : '<div class="report-box md">' + WC.markdown(report.content) + '</div>',
      foot: editing ? '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-do="save">' + WC.icon('save', 13) + '保存</button>' : '',
    })
    m.el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-do]')
      if (!btn) return
      var act = btn.getAttribute('data-do')
      if (act === 'edit') { m.close(); openReport(report, true) }
      else if (act === 'regen') { m.close(); gen.regenerate(report) }
      else if (act === 'copy') WC.copyText(report.content)
      else if (act === 'chat') AIPA.sendPrompt('请帮我润色并完善下面这份' + WC.REPORT_TYPE[report.reportType] + '：\n\n' + report.content)
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
          .then(function (r) { AIPA.toast('success', '报告已保存'); m.close(); openReport(r, false) })
          .catch(function (err) { AIPA.toast('error', '保存失败：' + WC.errMsg(err)) })
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
      WC.confirm('删除报告', '确定要删除报告「' + rep.title + '」吗？删除后不可恢复。', { danger: true, okText: '删除' }).then(function (ok) {
        if (!ok) return
        store.removeReport(id)
          .then(function () { AIPA.toast('success', '删除成功') })
          .catch(function (err) { AIPA.toast('error', '删除失败：' + WC.errMsg(err)) })
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
