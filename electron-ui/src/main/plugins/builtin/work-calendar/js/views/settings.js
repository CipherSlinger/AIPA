/** 设置：生成模型、周报/月报提示词模板、数据导入导出。 */
(function () {
  'use strict'

  var WC = window.WC
  var store = WC.store

  // `models` stays null until the list arrives (or fails, in which case
  // `modelsError` is set). Mount starts both back at "not loaded" so a reload
  // reflects provider changes; `refresh` leaves them alone so coming back to
  // the tab neither re-fetches nor loses the loaded list.
  var view = { root: null, models: null, modelsError: null }

  function modelHintHtml() {
    return WC.L('<span class="hint">模型为必填项；标注了提供商的模型由该提供商执行，其余由默认引擎执行。</span>',
      '<span class="hint">A model is required; models marked with a provider run on it, the rest run on the default engine.</span>')
  }

  /** The engine a model will actually run on. `default` is main's marker for
   *  models no enabled provider owns (including the built-in Claude CLI,
   *  which plugin turns deliberately never route to). */
  function modelProviderLabel(m) {
    if (m.providerId === 'default') return WC.L('默认引擎', 'Default engine')
    return m.providerName || m.providerId || ''
  }

  /** The model control: a select once the list is known, a text input if the
   *  host could not provide one. A stored model the list no longer offers is
   *  kept as its own selected option instead of being silently dropped. */
  function modelFieldHtml(s) {
    var label = WC.L('<div class="field"><label>生成模型</label>', '<div class="field"><label>Model</label>')

    if (view.modelsError) {
      return label +
        '<div class="hint" style="color:var(--danger)">' +
          WC.L('读取可用模型失败：', 'Could not load available models: ') + WC.esc(view.modelsError) +
          WC.L('；请手动填写模型 ID。', '; enter a model ID manually.') +
        '</div>' +
        '<input class="input" data-f="model" value="' + WC.esc(s.model) + '" placeholder="' + WC.L('模型 ID', 'Model ID') + '">' +
        modelHintHtml() + '</div>'
    }

    if (view.models === null) {
      return label +
        '<select class="input" data-f="model" disabled>' +
          '<option value="">' + WC.L('正在读取可用模型...', 'Loading available models...') + '</option>' +
        '</select>' +
        modelHintHtml() + '</div>'
    }

    var html = label + '<select class="input" data-f="model">' +
      '<option value="">' + WC.L('请选择模型', 'Select a model') + '</option>'
    var selected = false
    // Main already dedupes; keep the first occurrence per id here too so a
    // stale host (or a future list source) cannot render the same id twice.
    var seenIds = Object.create(null)
    view.models.forEach(function (m) {
      if (!m || !m.id || seenIds[m.id]) return
      seenIds[m.id] = true
      var isSelected = !selected && m.id === s.model
      if (isSelected) selected = true
      html += '<option value="' + WC.esc(m.id) + '"' + (isSelected ? ' selected' : '') + '>' +
        WC.esc(m.name || m.id) + ' — ' + WC.esc(modelProviderLabel(m)) + '</option>'
    })
    if (s.model && !selected) {
      html += '<option value="' + WC.esc(s.model) + '" selected>' + WC.esc(s.model) +
        WC.L('（不在已启用的提供商中）', ' (not in an enabled provider)') + '</option>'
    }
    return html + '</select>' + modelHintHtml() + '</div>'
  }

  /** Replace only the model field once the list settles, so text typed into
   *  the prompt templates while it was loading is never clobbered. */
  function paintModelField() {
    if (!view.root) return
    var host = view.root.querySelector('[data-model-field]')
    if (!host) { render(); return }
    host.innerHTML = modelFieldHtml(store.state.settings)
  }

  function loadModels() {
    var request
    try {
      request = AIPA.ai.models()
    } catch (err) {
      request = Promise.reject(err)
    }
    request
      .then(function (list) {
        view.models = Array.isArray(list) ? list : []
        view.modelsError = null
        paintModelField()
      })
      .catch(function (err) {
        view.models = null
        view.modelsError = WC.errMsg(err)
        paintModelField()
      })
  }

  function render() {
    if (!view.root) return
    var s = store.state.settings
    var counts = store.state
    view.root.innerHTML =
      WC.L('<div class="page-head"><div><div class="page-title">设置</div><div class="page-sub">AI 报告使用下方选择的模型生成</div></div></div>', '<div class="page-head"><div><div class="page-title">Settings</div><div class="page-sub">Reports are generated with the model chosen below</div></div></div>') +
      '<div class="settings-grid">' +
        '<div class="card">' +
          '<div data-model-field>' + modelFieldHtml(s) + '</div>' +
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
      store.saveSettings({ model: f('model').value.trim(), weeklyPrompt: f('weeklyPrompt').value, monthlyPrompt: f('monthlyPrompt').value, okrPrompt: f('okrPrompt').value })
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
      view.models = null
      view.modelsError = null
      render()
      loadModels()
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
