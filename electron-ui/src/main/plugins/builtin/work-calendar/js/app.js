/** App shell: tab routing, data load, re-render on store changes. */
(function () {
  'use strict'

  var WC = window.WC
  var main = document.getElementById('main')
  var tabs = document.getElementById('tabs')
  var current = null

  function show(name) {
    if (!WC.views[name]) name = 'calendar'
    if (current && WC.views[current]) WC.views[current].unmount()
    // Fresh container so view listeners never stack up across tab switches
    var root = document.createElement('div')
    main.innerHTML = ''
    main.appendChild(root)
    window.scrollTo(0, 0)
    current = name
    tabs.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === name) })
    WC.views[name].mount(root)
    try { sessionStorage.setItem('wc_view', name) } catch (e) { /* ignore */ }
  }

  tabs.addEventListener('click', function (e) {
    var t = e.target.closest('.tab')
    if (t) show(t.getAttribute('data-view'))
  })

  WC.store.subscribe(function () {
    if (current && WC.views[current]) WC.views[current].refresh()
  })
  WC.gen.onBusy(function () {
    if (current === 'calendar') WC.views.calendar.refresh()
  })

  /**
   * The work model used to live in the plugin's own settings. Adopt a legacy
   * choice into the host once — only when the host has none — so an existing
   * user does not have to pick the same model again.
   *
   * The legacy field is cleared once the hand-off succeeds (or when the host
   * already had a choice): leaving it behind would make a later deliberate
   * "未选择模型" in the toolbar come back on the next boot. Best effort — a
   * failed lookup or write must never block boot, and a failed one keeps the
   * field so a later boot can retry.
   */
  function adoptLegacyModel() {
    var legacy = WC.store.state.settings && WC.store.state.settings.model
    if (!legacy || !String(legacy).trim()) return
    Promise.resolve()
      .then(function () { return AIPA.ai.model() })
      .then(function (info) {
        if (info && info.model) return null
        return AIPA.ai.setModel(legacy)
      })
      .then(function () { return WC.store.saveSettings({ model: '' }) })
      .catch(function () { /* best effort — boot continues regardless */ })
  }

  WC.store.load().then(function () {
    adoptLegacyModel()
    var initial = 'calendar'
    try { initial = sessionStorage.getItem('wc_view') || 'calendar' } catch (e) { /* ignore */ }
    show(initial)
  }).catch(function (err) {
    main.innerHTML = WC.L('<div class="card empty" style="margin-top:40px">数据加载失败：', '<div class="card empty" style="margin-top:40px">Failed to load data: ') + WC.esc(WC.errMsg(err)) +
      WC.L('<br><br><button class="btn" onclick="location.reload()">重试</button></div>', '<br><br><button class="btn" onclick="location.reload()">Retry</button></div>')
  })
})()
