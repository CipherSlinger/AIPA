/** 设置：生成模型、周报/月报提示词模板、数据导入导出。 */
(function () {
  'use strict'

  var WC = window.WC
  var store = WC.store

  var view = { root: null }

  function render() {
    if (!view.root) return
    var s = store.state.settings
    var counts = store.state
    view.root.innerHTML =
      '<div class="page-head"><div><div class="page-title">设置</div><div class="page-sub">AI 报告由 AIPA 内置的 Codex 引擎生成，使用与对话相同的账号与 API Key</div></div></div>' +
      '<div class="settings-grid">' +
        '<div class="card">' +
          '<div class="field"><label>生成模型</label><input class="input" data-f="model" placeholder="留空使用 Codex 默认模型" value="' + WC.esc(s.model) + '">' +
            '<span class="hint">填写 Codex 支持的模型 ID（如 gpt-5.4），留空则跟随 Codex 配置（~/.codex/config.toml）</span></div>' +
          '<div class="field"><label>周报提示词模板</label><textarea class="textarea" data-f="weeklyPrompt">' + WC.esc(s.weeklyPrompt) + '</textarea>' +
            '<span class="hint">可用变量：{{period}} 报告周期，{{material}} 任务与工作源素材</span></div>' +
          '<div class="field"><label>月报提示词模板</label><textarea class="textarea" data-f="monthlyPrompt">' + WC.esc(s.monthlyPrompt) + '</textarea>' +
            '<span class="hint">月报素材为本月已生成周报的合并内容</span></div>' +
          '<div class="row" style="justify-content:flex-end"><button class="btn" data-act="reset">恢复默认提示词</button>' +
            '<button class="btn btn-primary" data-act="save">' + WC.icon('save', 13) + '保存设置</button></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="section-title" style="margin-top:0">数据</div>' +
          '<div class="kv">' +
            '<span class="k">任务</span><span>' + counts.tasks.length + ' 条</span>' +
            '<span class="k">报告</span><span>' + counts.reports.length + ' 份</span>' +
            '<span class="k">工作源</span><span>' + counts.sources.length + ' 个</span>' +
            '<span class="k">人天记录</span><span>' + counts.personDays.length + ' 条</span>' +
            '<span class="k">存储位置</span><span><code class="path">~/.aipa/plugin-data/aipa-work-calendar/</code></span>' +
          '</div>' +
          '<div class="row" style="margin-top:14px">' +
            '<button class="btn" data-act="export">' + WC.icon('download', 13) + '导出数据（JSON）</button>' +
            '<button class="btn" data-act="import">' + WC.icon('upload', 13) + '导入数据</button>' +
            '<input type="file" accept=".json,application/json" data-f="file" class="hidden">' +
          '</div>' +
          '<div class="hint" style="margin-top:8px;font-size:11.5px;color:var(--muted)">导出文件不包含 GitHub Token；导入会覆盖当前全部数据。</div>' +
        '</div>' +
      '</div>'
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn) return
    var act = btn.getAttribute('data-act')
    var f = function (n) { return view.root.querySelector('[data-f="' + n + '"]') }
    if (act === 'save') {
      store.saveSettings({ model: f('model').value.trim(), weeklyPrompt: f('weeklyPrompt').value, monthlyPrompt: f('monthlyPrompt').value })
        .then(function () { AIPA.toast('success', '设置已保存') })
        .catch(function (err) { AIPA.toast('error', '保存失败：' + WC.errMsg(err)) })
    } else if (act === 'reset') {
      f('weeklyPrompt').value = store.DEFAULT_SETTINGS.weeklyPrompt
      f('monthlyPrompt').value = store.DEFAULT_SETTINGS.monthlyPrompt
      AIPA.toast('info', '已恢复默认提示词，点击「保存设置」生效')
    } else if (act === 'export') {
      var blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' })
      var a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'work-calendar-' + WC.date.todayKey() + '.json'
      a.click()
      setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
    } else if (act === 'import') {
      f('file').click()
    }
  }

  function onChange(e) {
    if (e.target.getAttribute('data-f') !== 'file' || !e.target.files.length) return
    var file = e.target.files[0]
    e.target.value = ''
    file.text().then(function (text) {
      var data = JSON.parse(text)
      return WC.confirm('导入数据', '导入会覆盖当前全部任务、报告、工作源与人天记录，确定继续吗？', { danger: true, okText: '覆盖导入' })
        .then(function (ok) {
          if (!ok) return
          return WC.attempt(function () { return store.importData(data) }).then(function () { AIPA.toast('success', '数据已导入') })
        })
    }).catch(function (err) { AIPA.toast('error', '导入失败：' + WC.errMsg(err)) })
  }

  WC.views = WC.views || {}
  WC.views.settings = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      root.addEventListener('change', onChange)
      render()
    },
    unmount: function () {
      if (view.root) {
        view.root.removeEventListener('click', onClick)
        view.root.removeEventListener('change', onChange)
      }
      view.root = null
    },
    // Don't clobber unsaved edits in the prompt textareas on unrelated data changes
    refresh: function () {},
  }
})()
