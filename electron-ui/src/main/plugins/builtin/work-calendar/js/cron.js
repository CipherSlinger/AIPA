/**
 * Minimal 5-field cron ("分 时 日 月 周") — mirrors src/main/utils/cron.ts,
 * which the host uses to reschedule recurring reminders after they fire.
 */
(function () {
  'use strict'

  var WC = window.WC

  function parseField(field, min, max) {
    var out = {}
    field.split(',').forEach(function (part) {
      part = part.trim()
      var i
      if (part === '*') {
        for (i = min; i <= max; i++) out[i] = true
      } else if (part.indexOf('/') !== -1) {
        var bits = part.split('/')
        var step = parseInt(bits[1], 10)
        if (!(step > 0)) return
        var start = bits[0] === '*' ? min : parseInt(bits[0], 10)
        for (i = start; i <= max; i += step) out[i] = true
      } else if (part.indexOf('-') !== -1) {
        var r = part.split('-')
        for (i = parseInt(r[0], 10); i <= parseInt(r[1], 10); i++) out[i] = true
      } else if (!isNaN(parseInt(part, 10))) {
        out[parseInt(part, 10)] = true
      }
    })
    return Object.keys(out).map(Number).filter(function (n) { return n >= min && n <= max })
  }

  function parse(expr) {
    var p = String(expr || '').trim().split(/\s+/)
    if (p.length !== 5) return null
    var f = {
      minutes: parseField(p[0], 0, 59), hours: parseField(p[1], 0, 23), doms: parseField(p[2], 1, 31),
      months: parseField(p[3], 1, 12), dows: parseField(p[4], 0, 6),
    }
    for (var k in f) if (!f[k].length) return null
    return f
  }

  /** Next fire time (Date) strictly after `after`, or null within 2 years. */
  function next(expr, after) {
    var f = parse(expr)
    if (!f) return null
    var has = function (arr, v) { return arr.indexOf(v) !== -1 }
    var domWild = f.doms.length === 31
    var dowWild = f.dows.length === 7
    var c = new Date((after || new Date()).getTime())
    c.setSeconds(0, 0)
    c.setMinutes(c.getMinutes() + 1)
    var deadline = c.getTime() + 732 * 86400000
    while (c.getTime() < deadline) {
      if (!has(f.months, c.getMonth() + 1)) { c.setMonth(c.getMonth() + 1, 1); c.setHours(0, 0, 0, 0); continue }
      var dayOk = domWild && dowWild ? true
        : domWild ? has(f.dows, c.getDay())
        : dowWild ? has(f.doms, c.getDate())
        : has(f.doms, c.getDate()) || has(f.dows, c.getDay())
      if (!dayOk) { c.setDate(c.getDate() + 1); c.setHours(0, 0, 0, 0); continue }
      if (!has(f.hours, c.getHours())) { c.setHours(c.getHours() + 1, 0, 0, 0); continue }
      if (has(f.minutes, c.getMinutes())) return new Date(c.getTime())
      c.setMinutes(c.getMinutes() + 1)
    }
    return null
  }

  WC.cron = {
    next: next,
    PRESETS: [
      { label: WC.L('每天 09:00', 'Daily 09:00'), cron: '0 9 * * *' },
      { label: WC.L('工作日 09:00', 'Weekdays 09:00'), cron: '0 9 * * 1-5' },
      { label: WC.L('每天 12:00', 'Daily 12:00'), cron: '0 12 * * *' },
      { label: WC.L('每天 18:00', 'Daily 18:00'), cron: '0 18 * * *' },
      { label: WC.L('每周五 17:00', 'Fridays 17:00'), cron: '0 17 * * 5' },
      { label: WC.L('每小时', 'Hourly'), cron: '0 * * * *' },
    ],
  }
})()
