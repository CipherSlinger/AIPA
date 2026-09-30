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
    main.scrollTop = 0
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

  WC.store.load().then(function () {
    var initial = 'calendar'
    try { initial = sessionStorage.getItem('wc_view') || 'calendar' } catch (e) { /* ignore */ }
    show(initial)
  }).catch(function (err) {
    main.innerHTML = WC.L('<div class="card empty" style="margin-top:40px">数据加载失败：', '<div class="card empty" style="margin-top:40px">Failed to load data: ') + WC.esc(WC.errMsg(err)) +
      WC.L('<br><br><button class="btn" onclick="location.reload()">重试</button></div>', '<br><br><button class="btn" onclick="location.reload()">Retry</button></div>')
  })
})()
