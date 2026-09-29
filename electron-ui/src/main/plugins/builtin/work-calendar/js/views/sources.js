/**
 * 工作源管理：GitHub 仓库（主进程调 GitHub API）与本地文件夹（主进程扫描修改时间）。
 * 桌面版文件夹源直接保存绝对路径，拉取和生成报告时无需再手动选目录。
 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date
  var store = WC.store

  var view = { root: null, pulling: {} }

  function describe(s) {
    if (s.sourceType === 'github') {
      return s.config.repo + ' @ ' + (s.config.branch || 'main') + (s.config.author ? ' · 作者过滤：' + s.config.author : '') + (s.config.token ? ' · 已配置 Token' : '')
    }
    return s.config.folderPath + ' · 过滤：' + (s.config.filter || '*')
  }

  function lastPullText(s) {
    var lp = s.lastPull
    if (!lp) return '尚未拉取'
    return '上次拉取 ' + D.fmtDateTime(lp.pulledAt) + ' · ' + lp.weekStart.slice(5) + ' 至 ' + lp.weekEnd.slice(5) + ' 周 · ' + lp.itemCount + ' 条'
  }

  function render() {
    if (!view.root) return
    var sources = store.listSources()
    var list = sources.map(function (s) {
      var pulling = !!view.pulling[s.id]
      var bound = store.state.tasks.filter(function (t) { return t.workSourceId === s.id }).length
      return '<div class="item-card"><div class="main-col">' +
          '<div class="name">' + (s.sourceType === 'github' ? WC.icon('github', 15) : WC.icon('folder', 15)) + WC.esc(s.name) +
            '<span class="badge">' + (s.sourceType === 'github' ? 'GitHub 仓库' : '本地文件夹') + '</span>' +
            (bound ? '<span class="badge badge-accent">已绑定 ' + bound + ' 个任务</span>' : '') + '</div>' +
          '<div class="meta" title="' + WC.esc(describe(s)) + '">' + WC.esc(describe(s)) + '</div>' +
          '<div class="meta">' + WC.esc(lastPullText(s)) + '</div>' +
        '</div><div class="actions">' +
          '<button class="btn btn-sm" data-act="pull" data-id="' + s.id + '"' + (pulling ? ' disabled' : '') + '>' +
            (pulling ? '<span class="spinner"></span>拉取中' : WC.icon('download', 13) + '拉取本周') + '</button>' +
          '<button class="btn btn-sm" data-act="result" data-id="' + s.id + '"' + (s.lastPull ? '' : ' disabled') + '>' + WC.icon('eye', 13) + '查看结果</button>' +
          '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + s.id + '">' + WC.icon('trash', 13) + '</button>' +
        '</div></div>'
    }).join('')

    view.root.innerHTML =
      '<div class="page-head"><div><div class="page-title">工作源管理</div><div class="page-sub">接入 GitHub 仓库或本地文件夹，任务绑定后可在周报中自动汇总提交与文件变更</div></div>' +
        '<button class="btn btn-primary" data-act="add">' + WC.icon('plus') + '添加工作源</button></div>' +
      (sources.length ? '<div class="list">' + list + '</div>' : '<div class="card empty">暂无工作源，点击右上角「添加工作源」接入 GitHub 仓库或本地文件夹</div>')
  }

  function openAdd() {
    var type = 'github'
    var m = WC.modal({
      title: '添加工作源',
      sub: '工作源用于为周报自动收集素材',
      body:
        '<div class="type-switch">' +
          '<button class="type-opt active" data-type="github"><b>GitHub 仓库</b><span>拉取周期内的提交记录</span></button>' +
          '<button class="type-opt" data-type="folder"><b>本地文件夹</b><span>统计周期内修改过的文件</span></button>' +
        '</div>' +
        '<div class="field"><label>工作源名称<span class="req">*</span></label><input class="input" data-f="name" maxlength="100" placeholder="如：AIPA 主仓库"></div>' +
        '<div data-pane="github">' +
          '<div class="field"><label>仓库<span class="req">*</span></label><input class="input" data-f="repo" placeholder="owner/repo 或 https://github.com/owner/repo">' +
            '<span class="hint">可直接粘贴仓库地址，自动提取 owner/repo</span></div>' +
          '<div class="row"><div class="field"><label>分支</label><input class="input" data-f="branch" placeholder="main"></div>' +
            '<div class="field"><label>作者过滤</label><input class="input" data-f="author" placeholder="姓名或邮箱，留空拉取全部"></div></div>' +
          '<div class="field"><label>访问 Token</label><input class="input" type="password" data-f="token" placeholder="私有仓库必填（GitHub PAT）" autocomplete="off">' +
            '<span class="hint">Token 仅保存在本机插件数据目录，导出数据时不会包含</span></div>' +
        '</div>' +
        '<div data-pane="folder" class="hidden">' +
          '<div class="field"><label>文件夹<span class="req">*</span></label><div class="row">' +
            '<input class="input" data-f="folderPath" placeholder="点击右侧按钮选择文件夹" readonly>' +
            '<button class="btn" data-do="pick">' + WC.icon('folder', 13) + '选择</button></div></div>' +
          '<div class="field"><label>文件过滤</label><input class="input" data-f="filter" placeholder="*">' +
            '<span class="hint">支持 * 与 *.ext，多个用逗号分隔，如 *.md, *.ts；自动跳过 node_modules、.git、dist 等目录</span></div>' +
        '</div>',
      foot: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-do="save">添加</button>',
    })
    var el = m.el
    var f = function (n) { return el.querySelector('[data-f="' + n + '"]') }

    el.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-type]')
      if (opt) {
        type = opt.getAttribute('data-type')
        el.querySelectorAll('[data-type]').forEach(function (b) { b.classList.toggle('active', b === opt) })
        el.querySelector('[data-pane="github"]').classList.toggle('hidden', type !== 'github')
        el.querySelector('[data-pane="folder"]').classList.toggle('hidden', type !== 'folder')
        return
      }
      var btn = e.target.closest('[data-do]')
      if (!btn) return
      if (btn.getAttribute('data-do') === 'pick') {
        AIPA.invoke('fs.pickFolder', { title: '选择工作源文件夹' }).then(function (p) {
          if (!p) return
          f('folderPath').value = p
          if (!f('name').value.trim()) f('name').value = p.split(/[\\/]/).filter(Boolean).pop() || ''
        }).catch(function (err) { AIPA.toast('error', WC.errMsg(err)) })
        return
      }
      var config = type === 'github'
        ? { repo: f('repo').value, branch: f('branch').value, author: f('author').value, token: f('token').value }
        : { folderPath: f('folderPath').value, filter: f('filter').value }
      btn.disabled = true
      WC.attempt(function () { return store.createSource({ name: f('name').value, sourceType: type, config: config }) })
        .then(function () { AIPA.toast('success', '工作源已添加'); m.close() })
        .catch(function (err) { btn.disabled = false; AIPA.toast('error', '添加工作源失败：' + WC.errMsg(err)) })
    })
  }

  function showResult(source) {
    var lp = source.lastPull
    if (!lp) return
    WC.modal({
      title: WC.esc(source.name) + ' · 拉取结果',
      sub: lp.weekStart + ' 至 ' + lp.weekEnd + ' · 共 ' + lp.itemCount + ' 条 · 拉取于 ' + D.fmtDateTime(lp.pulledAt),
      wide: true,
      body: lp.items.length
        ? '<ul class="pull-list">' + lp.items.map(function (it) {
          return '<li><div class="t">' + WC.esc(it.title) + '</div><div class="d">' + WC.esc(it.desc) + '</div></li>'
        }).join('') + '</ul>'
        : '<div class="empty">该周期没有符合条件的记录</div>',
    })
  }

  function pull(id) {
    var s = store.getSource(id)
    if (!s) return
    view.pulling[id] = true
    render()
    store.pullSource(id, D.weekStart(D.todayKey()))
      .then(function (src) {
        AIPA.toast(src.lastPull.itemCount ? 'success' : 'info',
          src.lastPull.itemCount ? '已拉取 ' + src.lastPull.itemCount + ' 条记录' : '「' + src.name + '」本周没有符合条件的记录')
      })
      .catch(function (err) { AIPA.toast('error', '拉取失败：' + WC.errMsg(err)) })
      .then(function () { delete view.pulling[id]; render() })
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]')
    if (!btn || btn.disabled) return
    var act = btn.getAttribute('data-act')
    var id = btn.getAttribute('data-id')
    if (act === 'add') openAdd()
    else if (act === 'pull') pull(id)
    else if (act === 'result') showResult(store.getSource(id))
    else if (act === 'delete') {
      var s = store.getSource(id)
      if (!s) return
      WC.confirm('删除工作源', '确定要删除工作源「' + s.name + '」吗？已绑定的任务会自动解绑，删除后不可恢复。', { danger: true, okText: '删除' }).then(function (ok) {
        if (!ok) return
        store.removeSource(id)
          .then(function () { AIPA.toast('success', '删除成功') })
          .catch(function (err) { AIPA.toast('error', '删除失败：' + WC.errMsg(err)) })
      })
    }
  }

  WC.views = WC.views || {}
  WC.views.sources = {
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
