/** 设置：工作模型（只读，由宿主工具栏选择）、周报/月报提示词模板、数据导入导出。 */
(function () {
  'use strict'

  var WC = window.WC
  var store = WC.store

  // `model` is the host's answer ({ model, name, providerName, available }) and
  // stays null until it arrives. `modelError` only means the lookup itself
  // failed; a blank `model` is a valid answer ("nothing chosen yet").
  // `modelEpoch` lets a host push win over an initial lookup that resolves late.
  var view = { root: null, model: null, modelError: null, unsubscribeModel: null, modelEpoch: 0 }

  /**
   * The work model lives in the host's plugin toolbar; this row only reports
   * the current choice. While the lookup is in flight it shows "…" rather than
   * "未选择", so a loading view never claims a choice the user did make.
   */
  function modelRowHtml() {
    var html = WC.L('<div class="field"><label>工作模型</label>', '<div class="field"><label>Work model</label>')
    var value
    if (view.modelError) {
      value = '<span class="muted">' + WC.L('读取失败：', 'Could not read it: ') + WC.esc(view.modelError) + '</span>'
    } else if (view.model === null) {
      value = '<span class="muted">…</span>'
    } else if (!view.model.model) {
      value = '<span class="muted">' + WC.L('未选择模型', 'No model selected') + '</span>'
    } else {
      value = '<span>' + WC.esc(view.model.name || view.model.model) + '</span>'
    }
    html += '<div data-model-value>' + value + '</div>' +
      '<span class="hint">' + WC.L('在插件顶部工具栏切换', 'Switch it from the plugin toolbar above') + '</span>'
    if (!view.modelError && view.model && view.model.available === false) {
      html += '<span class="hint" style="color:var(--danger)">' +
        WC.L('该模型当前不可用，生成前请重新选择。', 'This model is currently unavailable; choose another before generating.') +
      '</span>'
    }
    return html + '</div>'
  }

  /** Replace only the model row, so text typed into the prompt templates while
   *  the lookup settles — or while the host changes the model — is never lost. */
  function paintModelRow() {
    if (!view.root) return
    var host = view.root.querySelector('[data-model-row]')
    if (!host) { render(); return }
    host.innerHTML = modelRowHtml()
  }

  function loadModel() {
    var epoch = view.modelEpoch
    var request
    try {
      request = AIPA.ai.model()
    } catch (err) {
      request = Promise.reject(err)
    }
    request
      .then(function (info) {
        if (view.modelEpoch !== epoch) return
        view.model = info || {}
        view.modelError = null
        paintModelRow()
      })
      .catch(function (err) {
        if (view.modelEpoch !== epoch) return
        view.modelError = WC.errMsg(err)
        paintModelRow()
      })
  }

  function render() {
    if (!view.root) return
    var s = store.state.settings
    var counts = store.state
    view.root.innerHTML =
      WC.L('<div class="page-head"><div><div class="page-title">设置</div><div class="page-sub">AI 报告与 OKR 使用插件顶部工具栏选择的工作模型生成</div></div></div>', '<div class="page-head"><div><div class="page-title">Settings</div><div class="page-sub">Reports and OKRs use the work model chosen in the plugin toolbar above</div></div></div>') +
      '<div class="settings-grid">' +
        '<div class="card">' +
          '<div data-model-row>' + modelRowHtml() + '</div>' +
          WC.L('<div class="field"><label>周报提示词模板</label><textarea class="textarea" data-f="weeklyPrompt">', '<div class="field"><label>Weekly report prompt</label><textarea class="textarea" data-f="weeklyPrompt">') + WC.esc(s.weeklyPrompt) + '</textarea>' +
            WC.L('<span class="hint">可用变量：{{period}} 报告周期，{{material}} 任务与工作源素材</span></div>', '<span class="hint">Variables: {{period}} report period, {{material}} tasks and work-source material</span></div>') +
          WC.L('<div class="field"><label>月报提示词模板</label><textarea class="textarea" data-f="monthlyPrompt">', '<div class="field"><label>Monthly report prompt</label><textarea class="textarea" data-f="monthlyPrompt">') + WC.esc(s.monthlyPrompt) + '</textarea>' +
            WC.L('<span class="hint">月报素材为本月已生成周报的合并内容</span></div>', '<span class="hint">Monthly material is the month\'s weekly reports combined</span></div>') +
          WC.L('<div class="field"><label>OKR 提示词模板</label><textarea class="textarea" data-f="okrPrompt">', '<div class="field"><label>OKR prompt</label><textarea class="textarea" data-f="okrPrompt">') + WC.esc(s.okrPrompt) + '</textarea>' +
            WC.L('<span class="hint">可用变量：{{period}} 季度，{{range}} 起止日期，{{material}} 任务、工作源与人天素材，{{previous}} 上一季度的 OKR</span></div>', '<span class="hint">Variables: {{period}} quarter, {{range}} date range, {{material}} tasks, work sources and person-days, {{previous}} the previous quarter\'s OKR</span></div>') +
          WC.L('<div class="row" style="justify-content:flex-end"><button class="btn" data-act="reset">恢复默认提示词</button>', '<div class="row" style="justify-content:flex-end"><button class="btn" data-act="reset">Reset prompts</button>') +
            '<button class="btn btn-primary" data-act="save">' + WC.icon('save', 13) + WC.L('保存设置</button></div>', 'Save settings</button></div>') +
        '</div>' +
        '<div class="card">' +
          WC.L('<div class="section-title" style="margin-top:0">数据</div>', '<div class="section-title" style="margin-top:0">Data</div>') +
          '<div class="kv">' +
            WC.L('<span class="k">任务</span><span>', '<span class="k">Tasks</span><span>') + counts.tasks.length + WC.L(' 条</span>', '</span>') +
            WC.L('<span class="k">报告</span><span>', '<span class="k">Reports</span><span>') + counts.reports.length + WC.L(' 份</span>', '</span>') +
            WC.L('<span class="k">OKR</span><span>', '<span class="k">OKR sets</span><span>') + counts.okrs.length + WC.L(' 份</span>', '</span>') +
            WC.L('<span class="k">工作源</span><span>', '<span class="k">Work sources</span><span>') + counts.sources.length + WC.L(' 个</span>', '</span>') +
            WC.L('<span class="k">人天记录</span><span>', '<span class="k">Person-day entries</span><span>') + counts.personDays.length + WC.L(' 条</span>', '</span>') +
            WC.L('<span class="k">存储位置</span><span><code class="path">~/.aipa/plugin-data/aipa-work-calendar/</code></span>', '<span class="k">Location</span><span><code class="path">~/.aipa/plugin-data/aipa-work-calendar/</code></span>') +
          '</div>' +
          '<div class="row" style="margin-top:14px">' +
            '<button class="btn" data-act="export">' + WC.icon('download', 13) + WC.L('导出数据（JSON）</button>', 'Export (JSON)</button>') +
            '<button class="btn" data-act="import">' + WC.icon('upload', 13) + WC.L('导入数据</button>', 'Import</button>') +
            '<input type="file" accept=".json,application/json" data-f="file" class="hidden">' +
          '</div>' +
          WC.L('<div class="hint" style="margin-top:8px;font-size:11.5px;color:var(--muted)">导出文件不包含 GitHub Token；导入会覆盖当前全部数据。</div>', '<div class="hint" style="margin-top:8px;font-size:11.5px;color:var(--muted)">Exports exclude GitHub tokens; importing replaces all current data.</div>') +
        '</div>' +
      '</div>'
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn) return
    var act = btn.getAttribute('data-act')
    var f = function (n) { return view.root.querySelector('[data-f="' + n + '"]') }
    if (act === 'save') {
      store.saveSettings({ weeklyPrompt: f('weeklyPrompt').value, monthlyPrompt: f('monthlyPrompt').value, okrPrompt: f('okrPrompt').value })
        .then(function () { AIPA.toast('success', WC.L('设置已保存', 'Settings saved')) })
        .catch(function (err) { AIPA.toast('error', WC.L('保存失败：', 'Failed to save: ') + WC.errMsg(err)) })
    } else if (act === 'reset') {
      f('weeklyPrompt').value = store.DEFAULT_SETTINGS.weeklyPrompt
      f('monthlyPrompt').value = store.DEFAULT_SETTINGS.monthlyPrompt
      f('okrPrompt').value = store.DEFAULT_SETTINGS.okrPrompt
      AIPA.toast('info', WC.L('已恢复默认提示词，点击「保存设置」生效', 'Default prompts restored — click "Save settings" to apply'))
    } else if (act === 'export') {
      WC.downloadFile(new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' }),
        'work-calendar-' + WC.date.todayKey() + '.json')
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
      return WC.confirm(WC.L('导入数据', 'Import data'), WC.L('导入会覆盖当前全部任务、报告、OKR、工作源与人天记录，确定继续吗？', 'Importing replaces all tasks, reports, OKRs, work sources and person-day entries. Continue?'), { danger: true, okText: WC.L('覆盖导入', 'Replace') })
        .then(function (ok) {
          if (!ok) return
          return WC.attempt(function () { return store.importData(data) }).then(function () { AIPA.toast('success', WC.L('数据已导入', 'Data imported')) })
        })
    }).catch(function (err) { AIPA.toast('error', WC.L('导入失败：', 'Import failed: ') + WC.errMsg(err)) })
  }

  WC.views = WC.views || {}
  WC.views.settings = {
    mount: function (root) {
      view.root = root
      root.addEventListener('click', onClick)
      root.addEventListener('change', onChange)
      view.model = null
      view.modelError = null
      render()
      // A change made in the host toolbar repaints just this row, no reload.
      // Subscribe before the initial lookup so no push is missed, and bump the
      // epoch so a late initial answer cannot overwrite a newer push.
      view.unsubscribeModel = AIPA.ai.onModelChange(function (info) {
        view.modelEpoch += 1
        view.model = info || {}
        view.modelError = null
        paintModelRow()
      })
      loadModel()
    },
    unmount: function () {
      if (view.root) {
        view.root.removeEventListener('click', onClick)
        view.root.removeEventListener('change', onChange)
      }
      if (view.unsubscribeModel) {
        view.unsubscribeModel()
        view.unsubscribeModel = null
      }
      view.root = null
    },
    // Don't clobber unsaved edits in the prompt textareas on unrelated data changes
    refresh: function () {},
  }
})()
