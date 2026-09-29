/**
 * Data layer — ports the original NestJS services (tasks / reports /
 * person-days / work-sources) onto file-backed plugin storage
 * (~/.aipa/plugin-data/aipa-work-calendar/<collection>.json).
 *
 * All mutations validate like the original backend and throw Error with the
 * same user-facing messages.
 */
(function () {
  'use strict'

  var WC = window.WC
  var D = WC.date

  var COLLECTIONS = ['tasks', 'reports', 'sources', 'personDays']
  var SCHEMA_VERSION = 1

  var DEFAULT_WEEKLY_PROMPT = [
    '你是一位专业的周报撰写助手，擅长将工作素材整理成规范清晰的结构化周报。',
    '',
    '请基于以下提供的工作素材和时间周期生成一份中文周报：',
    '',
    '时间周期：{{period}}',
    '工作素材：',
    '{{material}}',
    '',
    '生成要求：',
    '1. 输出格式为标准Markdown，包含以下四个固定章节：',
    '   # 本周工作总结',
    '   # 任务完成情况',
    '   # 进行中事项与风险',
    '   # 下周计划',
    '',
    '2. 内容要求：',
    '   - 语言简洁专业，符合企业内部汇报风格',
    '   - 所有内容严格基于提供的素材撰写，不得虚构或添加素材中不存在的信息',
    '   - 若工作素材为空，则在周报开头明确说明「本周暂无任务记录」',
    '   - 每个章节内容根据素材信息合理分类呈现，条理清晰',
    '',
    '3. 输出要求：',
    '   - 直接输出周报内容，不需要额外的解释说明',
  ].join('\n')

  var DEFAULT_MONTHLY_PROMPT = [
    '你是专业的月报撰写助手，需要基于用户提供的工作素材生成结构化的中文月报。',
    '',
    '当前报告周期：{{period}}',
    '工作素材：',
    '{{material}}',
    '',
    '生成要求：',
    '1. 整体使用markdown格式排版，结构清晰',
    '2. 必须包含以下四个核心章节：',
    '   - 「本月工作总结」：对本月工作的整体概述',
    '   - 「重点任务完成情况」：分点说明各项任务的进度、成果',
    '   - 「问题与改进」：梳理工作中遇到的问题及对应的改进措施',
    '   - 「下月工作计划」：明确下月的工作目标和重点任务安排',
    '3. 语言简洁专业，符合职场正式报告风格',
    '4. 所有内容必须严格基于提供的素材撰写，不得编造素材中没有的信息',
    '5. 如果工作素材为空，请直接输出「本月暂无任务记录」',
    '6. 直接输出月报内容，无需额外前缀或后缀说明',
  ].join('\n')

  var DEFAULT_SETTINGS = {
    model: '',
    weeklyPrompt: DEFAULT_WEEKLY_PROMPT,
    monthlyPrompt: DEFAULT_MONTHLY_PROMPT,
  }

  var state = { tasks: [], reports: [], sources: [], personDays: [], settings: Object.assign({}, DEFAULT_SETTINGS) }
  var listeners = []

  function nowIso() { return new Date().toISOString() }
  function emit() { listeners.forEach(function (fn) { try { fn() } catch (e) { console.error(e) } }) }
  function fail(msg) { throw new Error(msg) }

  function persist(name) {
    return AIPA.data.set(name, state[name]).then(emit)
  }

  function spanOf(task) {
    var start = task.startDate || task.dueDate
    var end = task.dueDate || task.startDate
    return start && end ? { start: start, end: end } : null
  }
  function spanIntersects(task, from, to) {
    var s = spanOf(task)
    return !!s && s.start <= to && s.end >= from
  }

  function assertMonday(weekStart) {
    if (!D.isDateKey(weekStart)) fail('weekStart 参数非法，格式应为 YYYY-MM-DD')
    if (D.weekStart(weekStart) !== weekStart) fail('weekStart 必须是周一')
  }

  function normalizeRepo(raw) {
    var value = String(raw || '').trim()
    var patterns = [
      /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/.*)?$/,
      /^git:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
      /^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
      /^github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
    ]
    for (var i = 0; i < patterns.length; i++) {
      var m = value.match(patterns[i])
      if (m) return m[1]
    }
    return value
  }

  var store = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    state: state,
    subscribe: function (fn) {
      listeners.push(fn)
      return function () { listeners = listeners.filter(function (l) { return l !== fn }) }
    },
    spanOf: spanOf,
    spanIntersects: spanIntersects,
    normalizeRepo: normalizeRepo,

    load: function () {
      var keys = COLLECTIONS.concat(['settings'])
      return Promise.all(keys.map(function (k) { return AIPA.data.get(k) })).then(function (values) {
        COLLECTIONS.forEach(function (k, i) { state[k] = Array.isArray(values[i]) ? values[i] : [] })
        state.settings = Object.assign({}, DEFAULT_SETTINGS, values[keys.length - 1] || {})
      })
    },

    // ── Tasks ─────────────────────────────────────────
    getTask: function (id) { return state.tasks.find(function (t) { return t.id === id }) || null },

    tasksInRange: function (from, to) {
      return state.tasks.filter(function (t) { return spanIntersects(t, from, to) })
    },

    listTasks: function (params) {
      params = params || {}
      var kw = (params.keyword || '').trim().toLowerCase()
      var items = state.tasks.filter(function (t) {
        if (params.status && t.status !== params.status) return false
        if (params.priority && t.priority !== params.priority) return false
        if (kw && t.title.toLowerCase().indexOf(kw) === -1) return false
        return true
      })
      items.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt) })
      return items
    },

    taskStats: function () {
      var today = D.todayKey()
      var s = { total: 0, todo: 0, inProgress: 0, done: 0, dueToday: 0, overdue: 0 }
      state.tasks.forEach(function (t) {
        s.total++
        if (t.status === 'todo') s.todo++
        else if (t.status === 'in_progress') s.inProgress++
        else if (t.status === 'done') s.done++
        if (t.dueDate === today) s.dueToday++
        if (t.dueDate && t.dueDate < today && t.status !== 'done') s.overdue++
      })
      return s
    },

    _validateTask: function (t) {
      if (!t.title || !t.title.trim()) fail('标题不能为空')
      if (t.title.length > 200) fail('标题不能超过 200 个字符')
      if ((t.description || '').length > 2000) fail('描述不能超过 2000 个字符')
      if (!WC.STATUS[t.status]) fail('状态非法')
      if (!WC.PRIORITY[t.priority]) fail('优先级非法')
      if (t.startDate && !D.isDateKey(t.startDate)) fail('开始日期格式非法')
      if (t.dueDate && !D.isDateKey(t.dueDate)) fail('截止日期格式非法')
      if (t.startDate && t.dueDate && t.startDate > t.dueDate) fail('开始日期不能晚于截止日期')
      if (t.workSourceId && !store.getSource(t.workSourceId)) fail('绑定的工作源不存在')
    },

    createTask: function (dto) {
      var now = nowIso()
      var task = {
        id: WC.uid(),
        title: String(dto.title || '').trim(),
        description: dto.description || '',
        status: dto.status || 'todo',
        priority: dto.priority || 'medium',
        startDate: dto.startDate || null,
        dueDate: dto.dueDate || null,
        workSourceId: dto.workSourceId || null,
        createdAt: now,
        updatedAt: now,
      }
      store._validateTask(task)
      state.tasks.push(task)
      return persist('tasks').then(function () { return task })
    },

    updateTask: function (id, patch) {
      var current = store.getTask(id)
      if (!current) return Promise.reject(new Error('任务不存在'))
      var next = Object.assign({}, current, patch, { updatedAt: nowIso() })
      if (patch.title !== undefined) next.title = String(patch.title).trim()
      if (patch.workSourceId !== undefined) next.workSourceId = patch.workSourceId || null
      store._validateTask(next)
      Object.assign(current, next)
      return persist('tasks').then(function () { return current })
    },

    removeTask: function (id) {
      var before = state.tasks.length
      state.tasks = state.tasks.filter(function (t) { return t.id !== id })
      if (state.tasks.length === before) return Promise.reject(new Error('任务不存在'))
      return persist('tasks')
    },

    // ── Reports ───────────────────────────────────────
    listReports: function (type) {
      var items = state.reports.filter(function (r) { return !type || r.reportType === type })
      items.sort(function (a, b) {
        if (a.periodStart !== b.periodStart) return b.periodStart.localeCompare(a.periodStart)
        return b.createdAt.localeCompare(a.createdAt)
      })
      return items
    },
    getReport: function (id) { return state.reports.find(function (r) { return r.id === id }) || null },

    /** Weekly report whose period intersects the given week (calendar badge rule). */
    findWeeklyReport: function (from, to) {
      return store.listReports('weekly').find(function (r) { return r.periodStart <= to && r.periodEnd >= from }) || null
    },
    findMonthlyReport: function (monthKey) {
      return store.listReports('monthly').find(function (r) { return r.periodStart.indexOf(monthKey) === 0 }) || null
    },

    createReport: function (dto) {
      if (!dto.title || !dto.content || !WC.REPORT_TYPE[dto.reportType]) fail('缺少必填字段或 reportType 非法')
      if (!D.isDateKey(dto.periodStart) || !D.isDateKey(dto.periodEnd)) fail('报告周期格式非法')
      var report = {
        id: WC.uid(),
        reportType: dto.reportType,
        title: dto.title,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        content: dto.content,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      state.reports.push(report)
      return persist('reports').then(function () { return report })
    },

    updateReport: function (id, patch) {
      var report = store.getReport(id)
      if (!report) return Promise.reject(new Error('报告不存在'))
      if (patch.title !== undefined && !String(patch.title).trim()) fail('title 不能为空')
      if (patch.content !== undefined && !String(patch.content).trim()) fail('content 不能为空')
      if (patch.title !== undefined) report.title = patch.title
      if (patch.content !== undefined) report.content = patch.content
      report.updatedAt = nowIso()
      return persist('reports').then(function () { return report })
    },

    removeReport: function (id) {
      var before = state.reports.length
      state.reports = state.reports.filter(function (r) { return r.id !== id })
      if (state.reports.length === before) return Promise.reject(new Error('报告不存在'))
      return persist('reports')
    },

    // ── Work sources ──────────────────────────────────
    listSources: function () {
      return state.sources.slice().sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt) })
    },
    getSource: function (id) { return state.sources.find(function (s) { return s.id === id }) || null },

    createSource: function (dto) {
      var name = String(dto.name || '').trim()
      if (!name || name.length > 100) fail('工作源名称不能为空且不超过 100 字')
      if (dto.sourceType !== 'github' && dto.sourceType !== 'folder') fail('sourceType 仅支持 github 或 folder')
      var config = Object.assign({}, dto.config || {})
      if (dto.sourceType === 'github') {
        config.repo = normalizeRepo(config.repo)
        if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) fail('GitHub 仓库格式应为 owner/repo，如 CipherSlinger/AIPA')
        config.branch = String(config.branch || '').trim() || 'main'
        config.author = String(config.author || '').trim()
        config.token = String(config.token || '').trim()
      } else {
        config.folderPath = String(config.folderPath || '').trim()
        if (!config.folderPath) fail('请选择本地文件夹')
        config.filter = String(config.filter || '').trim() || '*'
      }
      var source = { id: WC.uid(), name: name, sourceType: dto.sourceType, config: config, lastPull: null, createdAt: nowIso() }
      state.sources.push(source)
      return persist('sources').then(function () { return source })
    },

    /** Deleting a source also unbinds it from tasks (the original left dangling ids). */
    removeSource: function (id) {
      var before = state.sources.length
      state.sources = state.sources.filter(function (s) { return s.id !== id })
      if (state.sources.length === before) return Promise.reject(new Error('工作源不存在'))
      var touched = false
      state.tasks.forEach(function (t) {
        if (t.workSourceId === id) { t.workSourceId = null; touched = true }
      })
      return Promise.all([persist('sources'), touched ? persist('tasks') : null])
    },

    /** Fetch items for a source over [from, to] without saving. */
    fetchSourceItems: function (source, from, to) {
      if (source.sourceType === 'github') {
        return AIPA.invoke('github.commits', {
          repo: source.config.repo, branch: source.config.branch, author: source.config.author,
          token: source.config.token, since: from, until: to,
        })
      }
      return AIPA.invoke('fs.scanFolder', {
        folderPath: source.config.folderPath, filter: source.config.filter, since: from, until: to,
      })
    },

    /** Pull one week of a source and store it as lastPull. */
    pullSource: function (id, weekStart) {
      assertMonday(weekStart)
      var source = store.getSource(id)
      if (!source) return Promise.reject(new Error('工作源不存在'))
      var weekEnd = D.addDays(weekStart, 6)
      return store.fetchSourceItems(source, weekStart, weekEnd).then(function (items) {
        source.lastPull = { pulledAt: nowIso(), weekStart: weekStart, weekEnd: weekEnd, itemCount: items.length, items: items }
        return persist('sources').then(function () { return source })
      })
    },

    // ── Report material ───────────────────────────────
    /**
     * Tasks active in the period (span intersects, or undated and created in
     * it) plus items from their bound work sources. Sources are fetched live;
     * if that fails, a matching lastPull is used and the error is recorded.
     */
    getMaterial: function (from, to) {
      if (!D.isDateKey(from) || !D.isDateKey(to)) return Promise.reject(new Error('周期格式非法'))
      if (from > to) return Promise.reject(new Error('start 不能晚于 end'))
      var today = D.todayKey()
      var rows = state.tasks.filter(function (t) {
        if (spanOf(t)) return spanIntersects(t, from, to)
        var created = D.toKey(new Date(t.createdAt))
        return created >= from && created <= to
      })
      var material = {
        periodStart: from, periodEnd: to, totalCount: rows.length,
        completedTasks: [], inProgressTasks: [], overdueTasks: [], sourceMaterials: [],
      }
      rows.forEach(function (t) {
        var label = t.title + '（优先级：' + WC.PRIORITY[t.priority] + '）' +
          (t.description && t.description.trim() ? '：' + t.description.trim().slice(0, 200) : '')
        if (t.status === 'done') material.completedTasks.push(label)
        else if (t.dueDate && t.dueDate < today) material.overdueTasks.push(label)
        else material.inProgressTasks.push(label + '（' + WC.STATUS[t.status] + '）')
      })
      material.completedCount = material.completedTasks.length

      var sourceIds = []
      rows.forEach(function (t) { if (t.workSourceId && sourceIds.indexOf(t.workSourceId) === -1) sourceIds.push(t.workSourceId) })
      var sources = sourceIds.map(store.getSource).filter(Boolean)
      return Promise.all(sources.map(function (source) {
        var m = { sourceId: source.id, sourceName: source.name, sourceType: source.sourceType, items: [] }
        return store.fetchSourceItems(source, from, to).then(function (items) {
          m.items = items
          return m
        }).catch(function (err) {
          m.error = WC.errMsg(err)
          var lp = source.lastPull
          if (lp && lp.weekStart >= from && lp.weekStart <= to) m.items = lp.items || []
          return m
        })
      })).then(function (list) {
        material.sourceMaterials = list
        return material
      })
    },

    // ── Person days ───────────────────────────────────
    listPersonDays: function (weekStart) {
      assertMonday(weekStart)
      return state.personDays
        .filter(function (p) { return p.weekStart === weekStart })
        .sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt) })
    },

    monthlyPersonDays: function (year, month) {
      var from = D.monthStart(year, month)
      var to = D.monthEnd(year, month)
      var rows = state.personDays
        .filter(function (p) { return p.weekStart >= from && p.weekStart <= to })
        .sort(function (a, b) { return a.weekStart.localeCompare(b.weekStart) || a.createdAt.localeCompare(b.createdAt) })
      var groups = []
      var total = 0
      rows.forEach(function (p) {
        var g = groups[groups.length - 1]
        if (!g || g.weekStart !== p.weekStart) {
          g = {
            weekStart: p.weekStart,
            label: p.weekStart.slice(5, 7) + '月' + p.weekStart.slice(8) + '-' + D.addDays(p.weekStart, 6).slice(8),
            total: 0,
            items: [],
          }
          groups.push(g)
        }
        g.items.push(p)
        g.total += p.days
        total += p.days
      })
      return { total: total, weeks: groups }
    },

    _validateDays: function (days) {
      if (!(days > 0) || days > 31) fail('投入天数必须大于 0 且不超过 31')
    },

    createPersonDay: function (dto) {
      assertMonday(dto.weekStart)
      var desc = String(dto.workDesc || '').trim()
      if (!desc) fail('工作内容不能为空')
      var days = Number(dto.days)
      store._validateDays(days)
      var item = { id: WC.uid(), weekStart: dto.weekStart, workDesc: desc, days: days, category: dto.category || null, createdAt: nowIso() }
      state.personDays.push(item)
      return persist('personDays').then(function () { return item })
    },

    updatePersonDay: function (id, patch) {
      var item = state.personDays.find(function (p) { return p.id === id })
      if (!item) return Promise.reject(new Error('人天记录不存在'))
      if (patch.workDesc !== undefined) {
        if (!String(patch.workDesc).trim()) fail('工作内容不能为空')
        item.workDesc = String(patch.workDesc).trim()
      }
      if (patch.days !== undefined) {
        store._validateDays(Number(patch.days))
        item.days = Number(patch.days)
      }
      return persist('personDays').then(function () { return item })
    },

    removePersonDay: function (id) {
      var before = state.personDays.length
      state.personDays = state.personDays.filter(function (p) { return p.id !== id })
      if (state.personDays.length === before) return Promise.reject(new Error('人天记录不存在'))
      return persist('personDays')
    },

    /** Spread 5 workdays evenly over the week's tasks (0.5 steps, min 0.5). */
    autoGeneratePersonDays: function (weekStart) {
      assertMonday(weekStart)
      if (store.listPersonDays(weekStart).length > 0) fail('该周已有人天记录，请先删除后重新生成')
      var weekEnd = D.addDays(weekStart, 6)
      var tasks = state.tasks
        .filter(function (t) { return spanIntersects(t, weekStart, weekEnd) })
        .sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt) })
      if (!tasks.length) fail('本周暂无任务，无法自动生成人天')
      var perTask = Math.max(0.5, Math.round((5 / tasks.length) * 2) / 2)
      var created = tasks.map(function (t) {
        return {
          id: WC.uid(),
          weekStart: weekStart,
          workDesc: t.description && t.description.trim() ? t.title + '：' + t.description.slice(0, 60) : t.title,
          days: perTask,
          category: null,
          createdAt: nowIso(),
        }
      })
      state.personDays = state.personDays.concat(created)
      return persist('personDays').then(function () { return created })
    },

    // ── Settings / backup ─────────────────────────────
    saveSettings: function (patch) {
      state.settings = Object.assign({}, state.settings, patch)
      return persist('settings')
    },

    exportData: function () {
      return {
        app: 'aipa-work-calendar',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: nowIso(),
        tasks: state.tasks,
        reports: state.reports,
        sources: state.sources.map(function (s) {
          // Never export access tokens
          var cfg = Object.assign({}, s.config)
          delete cfg.token
          return Object.assign({}, s, { config: cfg })
        }),
        personDays: state.personDays,
        settings: state.settings,
      }
    },

    importData: function (data) {
      if (!data || data.app !== 'aipa-work-calendar') fail('不是工作日历导出的数据文件')
      COLLECTIONS.forEach(function (k) {
        if (!Array.isArray(data[k])) fail('数据文件缺少 ' + k + ' 字段')
      })
      COLLECTIONS.forEach(function (k) { state[k] = data[k] })
      if (data.settings) state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings)
      return Promise.all(COLLECTIONS.concat(['settings']).map(function (k) { return AIPA.data.set(k, state[k]) })).then(emit)
    },
  }

  WC.store = store
})()
