/**
 * AIPA plugin bridge — talks to PluginHostView via postMessage.
 *
 * - AIPA.invoke(method, payload): request/response host capabilities
 *   (data.get/set, github.commits, fs.scanFolder/pickFolder, ai.generate/abort)
 * - AIPA.ai.generate(): streaming Codex generation with abort
 * - AIPA.toast / AIPA.sendPrompt: fire-and-forget host UI actions
 *
 * When the page is opened outside AIPA (window.parent === window), storage
 * falls back to localStorage so the UI can still be developed in a browser.
 */
(function () {
  'use strict'

  var hosted = window.parent && window.parent !== window
  var pending = new Map()
  var aiHandlers = new Map()
  var themeListeners = []
  var seq = 0

  function nextId(prefix) {
    seq += 1
    return prefix + '-' + Date.now().toString(36) + '-' + seq
  }

  function post(message) {
    if (hosted) window.parent.postMessage(message, '*')
  }

  window.addEventListener('message', function (e) {
    var d = e.data
    if (!d || typeof d !== 'object') return
    if (d.type === 'aipa:response' && pending.has(d.requestId)) {
      var p = pending.get(d.requestId)
      pending.delete(d.requestId)
      if (d.ok) p.resolve(d.result)
      else p.reject(new Error(d.error || window.WC.L('宿主调用失败', 'Host call failed')))
    } else if (d.type === 'aipa:ai:event' && d.event) {
      var handler = aiHandlers.get(d.event.requestId)
      if (handler) handler(d.event)
    } else if (d.type === 'aipa:theme') {
      document.documentElement.setAttribute('data-theme', d.theme === 'dark' ? 'dark' : 'light')
      themeListeners.forEach(function (fn) { fn(d.theme) })
    }
  })

  function invoke(method, payload) {
    if (!hosted) return fallbackInvoke(method, payload)
    return new Promise(function (resolve, reject) {
      var requestId = nextId('inv')
      pending.set(requestId, { resolve: resolve, reject: reject })
      post({ type: 'aipa:invoke', requestId: requestId, method: method, payload: payload })
    })
  }

  function fallbackInvoke(method, payload) {
    var LS_PREFIX = 'aipa_work_calendar_'
    if (method === 'data.get') {
      var raw = localStorage.getItem(LS_PREFIX + payload.key)
      return Promise.resolve(raw ? JSON.parse(raw) : null)
    }
    if (method === 'data.set') {
      localStorage.setItem(LS_PREFIX + payload.key, JSON.stringify(payload.value))
      return Promise.resolve(true)
    }
    return Promise.reject(new Error(window.WC.L('该功能需要在 AIPA 中运行', 'This feature requires running inside AIPA')))
  }

  /**
   * Stream a Codex generation.
   * @returns {{ promise: Promise<string>, abort: () => void }}
   */
  function generate(opts) {
    var requestId = nextId('ai')
    var settled = false
    var resolveFn, rejectFn
    var promise = new Promise(function (resolve, reject) { resolveFn = resolve; rejectFn = reject })

    function settle(ok, value) {
      if (settled) return
      settled = true
      aiHandlers.delete(requestId)
      if (ok) resolveFn(value)
      else rejectFn(value)
    }

    aiHandlers.set(requestId, function (ev) {
      if (ev.type === 'delta') { if (opts.onDelta) opts.onDelta(ev.text || '') }
      else if (ev.type === 'status') { if (opts.onStatus) opts.onStatus(ev.message || '') }
      else if (ev.type === 'done') settle(true, ev.text || '')
      else if (ev.type === 'error') settle(false, new Error(ev.message || window.WC.L('AI 生成失败', 'AI generation failed')))
    })

    invoke('ai.generate', {
      requestId: requestId,
      prompt: opts.prompt,
      instructions: opts.instructions,
      model: opts.model,
    }).catch(function (err) { settle(false, err) })

    return {
      promise: promise,
      abort: function () {
        if (settled) return
        invoke('ai.abort', { requestId: requestId }).catch(function () {})
        settle(false, new Error(window.WC.L('已取消生成', 'Generation cancelled')))
      },
    }
  }

  function toast(type, message) {
    if (hosted) {
      post({ type: 'aipa:toast', payload: { type: type, message: message } })
      return
    }
    var root = document.getElementById('toast-root')
    if (!root) return
    var el = document.createElement('div')
    el.className = 'toast'
    el.textContent = message
    root.appendChild(el)
    setTimeout(function () { el.remove() }, 3000)
  }

  window.AIPA = {
    hosted: hosted,
    invoke: invoke,
    toast: toast,
    sendPrompt: function (prompt) { post({ type: 'aipa:sendPrompt', payload: { prompt: prompt } }) },
    onTheme: function (fn) { themeListeners.push(fn) },
    data: {
      get: function (key) { return invoke('data.get', { key: key }) },
      set: function (key, value) { return invoke('data.set', { key: key, value: value }) },
    },
    ai: { generate: generate },
  }

  post({ type: 'aipa:ready' })
})()
