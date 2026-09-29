/** Shared helpers: dates, escaping, icons, markdown, modal/confirm. */
(function () {
  'use strict'

  var WC = (window.WC = window.WC || {})

  // ── Dates (all keys are local YYYY-MM-DD) ─────────────
  function pad(n) { return String(n).padStart(2, '0') }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  function parseKey(key) {
    var p = key.split('-').map(Number)
    return new Date(p[0], p[1] - 1, p[2])
  }
  function todayKey() { return toKey(new Date()) }
  function addDays(key, n) {
    var d = parseKey(key)
    d.setDate(d.getDate() + n)
    return toKey(d)
  }
  /** Monday of the week containing `key`. */
  function weekStart(key) {
    var d = parseKey(key)
    var offset = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - offset)
    return toKey(d)
  }
  function monthStart(year, month) { return toKey(new Date(year, month, 1)) }
  function monthEnd(year, month) { return toKey(new Date(year, month + 1, 0)) }
  function dayDiff(fromKey, toKeyStr) {
    return Math.round((parseKey(toKeyStr) - parseKey(fromKey)) / 86400000)
  }
  function weekdayLabel(key) { return '周' + '一二三四五六日'[(parseKey(key).getDay() + 6) % 7] }
  function fmtCN(key) {
    var d = parseKey(key)
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
  }
  function fmtDot(key) { return key.slice(5).replace('-', '.') }
  function fmtDateTime(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    return toKey(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  function isDateKey(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) }

  WC.date = {
    pad: pad, toKey: toKey, parseKey: parseKey, todayKey: todayKey, addDays: addDays,
    weekStart: weekStart, monthStart: monthStart, monthEnd: monthEnd, dayDiff: dayDiff,
    weekdayLabel: weekdayLabel, fmtCN: fmtCN, fmtDot: fmtDot, fmtDateTime: fmtDateTime, isDateKey: isDateKey,
  }

  // ── Misc ──────────────────────────────────────────────
  WC.uid = function () {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  }

  WC.esc = function (str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  WC.errMsg = function (err) {
    return err instanceof Error ? err.message : String(err || '操作失败')
  }

  /** Run fn and always get a Promise back (store validation throws synchronously). */
  WC.attempt = function (fn) {
    return new Promise(function (resolve) { resolve(fn()) })
  }

  WC.STATUS = { todo: '待处理', in_progress: '进行中', done: '已完成' }
  WC.PRIORITY = { low: '低', medium: '中', high: '高', urgent: '紧急' }
  WC.PRIORITY_BADGE = { low: 'badge-outline', medium: '', high: 'badge-warn', urgent: 'badge-danger' }
  WC.REPORT_TYPE = { weekly: '周报', monthly: '月报' }

  var BAR_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6', '#0891b2']
  WC.barColor = function (id) {
    var hash = 0
    for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 997
    return BAR_COLORS[hash % BAR_COLORS.length]
  }

  WC.options = function (map, selected) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + WC.esc(map[k]) + '</option>'
    }).join('')
  }

  // ── Icons (lucide paths) ──────────────────────────────
  var ICONS = {
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    check: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
    clock: '<path d="M16 22h2a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v3"/><path d="M14 2v6h6"/><circle cx="8" cy="16" r="6"/><path d="M9.5 17.5 8 16.25V14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  }
  WC.icon = function (name, size) {
    var s = size || 14
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'
  }

  // ── Markdown (small, safe: escapes first, then formats) ──
  function inline(text) {
    var codes = []
    var out = WC.esc(text).replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c)
      return '\u0000' + (codes.length - 1) + '\u0000'
    })
    out = out
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    return out.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[Number(i)] + '</code>' })
  }

  WC.markdown = function (md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n')
    var html = []
    var i = 0
    var listStack = [] // [{ type: 'ul'|'ol', indent }]

    function closeLists(toIndent) {
      while (listStack.length && listStack[listStack.length - 1].indent >= toIndent) {
        html.push('</li></' + listStack.pop().type + '>')
      }
    }

    while (i < lines.length) {
      var line = lines[i]

      var fence = /^\s*```/.exec(line)
      if (fence) {
        closeLists(0)
        var code = []
        i++
        while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++ }
        i++
        html.push('<pre><code>' + WC.esc(code.join('\n')) + '</code></pre>')
        continue
      }

      if (/^\s*$/.test(line)) { closeLists(0); i++; continue }

      var heading = /^(#{1,6})\s+(.*)$/.exec(line)
      if (heading) {
        closeLists(0)
        var lvl = Math.min(heading[1].length, 4)
        html.push('<h' + lvl + '>' + inline(heading[2]) + '</h' + lvl + '>')
        i++
        continue
      }

      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { closeLists(0); html.push('<hr>'); i++; continue }

      if (/^\s*>/.test(line)) {
        closeLists(0)
        var quote = []
        while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
        html.push('<blockquote>' + WC.markdown(quote.join('\n')) + '</blockquote>')
        continue
      }

      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
        closeLists(0)
        var cells = function (l) { return l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim() }) }
        var head = cells(line)
        i += 2
        var rows = []
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++ }
        html.push('<table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>' }).join('') + '</tr></thead><tbody>' +
          rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>' }).join('') + '</tr>' }).join('') +
          '</tbody></table>')
        continue
      }

      var item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
      if (item) {
        var indent = item[1].replace(/\t/g, '  ').length
        var type = /\d/.test(item[2]) ? 'ol' : 'ul'
        var top = listStack[listStack.length - 1]
        if (!top || indent > top.indent) {
          html.push('<' + type + '><li>')
          listStack.push({ type: type, indent: indent })
        } else {
          closeLists(indent + 1)
          top = listStack[listStack.length - 1]
          if (top && top.indent === indent && top.type === type) {
            html.push('</li><li>')
          } else {
            if (top && top.indent === indent) html.push('</li></' + listStack.pop().type + '>')
            html.push('<' + type + '><li>')
            listStack.push({ type: type, indent: indent })
          }
        }
        var content = item[3].replace(/^\[( |x|X)\]\s+/, function (_, c) { return c === ' ' ? '☐ ' : '☑ ' })
        html.push(inline(content))
        i++
        continue
      }

      if (listStack.length && /^\s+\S/.test(line)) {
        html.push('<br>' + inline(line.trim()))
        i++
        continue
      }

      closeLists(0)
      var para = [line]
      i++
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) {
        para.push(lines[i])
        i++
      }
      html.push('<p>' + para.map(inline).join('<br>') + '</p>')
    }
    closeLists(0)
    return html.join('')
  }

  // ── Modal / confirm ───────────────────────────────────
  /**
   * @param {{ title: string, sub?: string, body: string, foot?: string, tools?: string,
   *           wide?: boolean, dismissible?: boolean, onClose?: () => void }} opts
   */
  WC.modal = function (opts) {
    var root = document.getElementById('overlay-root')
    var mask = document.createElement('div')
    mask.className = 'modal-mask'
    mask.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog">' +
        '<div class="modal-head"><div><div class="modal-title">' + opts.title + '</div>' +
          (opts.sub ? '<div class="modal-sub">' + opts.sub + '</div>' : '') + '</div>' +
          '<div class="modal-tools">' + (opts.tools || '') +
            (opts.dismissible === false ? '' : '<button class="btn btn-ghost btn-icon btn-sm" data-close title="关闭">' + WC.icon('x') + '</button>') +
          '</div></div>' +
        '<div class="modal-body">' + opts.body + '</div>' +
        (opts.foot ? '<div class="modal-foot">' + opts.foot + '</div>' : '') +
      '</div>'
    root.appendChild(mask)

    var closed = false
    function close() {
      if (closed) return
      closed = true
      document.removeEventListener('keydown', onKey)
      mask.remove()
      if (opts.onClose) opts.onClose()
    }
    function onKey(e) { if (e.key === 'Escape' && opts.dismissible !== false) close() }
    document.addEventListener('keydown', onKey)
    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask && opts.dismissible !== false) close()
    })
    mask.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close()
    })
    var first = mask.querySelector('input:not([type=hidden]), textarea')
    if (first) setTimeout(function () { first.focus() }, 30)
    return { el: mask.querySelector('.modal'), close: close }
  }

  WC.confirm = function (title, message, opts) {
    opts = opts || {}
    return new Promise(function (resolve) {
      var result = false
      var m = WC.modal({
        title: WC.esc(title),
        body: '<div style="font-size:13px;color:var(--text-2);line-height:1.7">' + WC.esc(message) + '</div>',
        foot: '<button class="btn" data-close>取消</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-primary" style="background:var(--danger);border-color:var(--danger);color:#fff' : 'btn-primary') + '" data-ok>' + WC.esc(opts.okText || '确定') + '</button>',
        onClose: function () { resolve(result) },
      })
      m.el.querySelector('[data-ok]').addEventListener('click', function () { result = true; m.close() })
    })
  }

  WC.copyText = function (text) {
    var done = function () { AIPA.toast('success', '已复制到剪贴板') }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text); done() })
    }
    legacyCopy(text)
    done()
    return Promise.resolve()
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) { /* ignore */ }
    ta.remove()
  }
})()
