/**
 * notice-center.js — renderer for the Clawd notice log.
 *
 * The main process owns the store, the window, positioning and focus. This
 * page asks for a payload, paints it, reports its measured height so the
 * window can size itself, and sends one action per user gesture. It never
 * imports the app's locale JSON: the pet speaks en/zh/ko, and the payload
 * carries which one.
 */
(function () {
  "use strict";

  var api = window.noticeCenterAPI || null;

  var panel = document.getElementById("panel");
  var countEl = document.getElementById("count");
  var clearBtn = document.getElementById("clearBtn");
  var closeBtn = document.getElementById("closeBtn");
  var filtersEl = document.getElementById("filters");
  var searchBar = document.getElementById("searchBar");
  var searchInput = document.getElementById("searchInput");
  var searchClearBtn = document.getElementById("searchClear");
  var listEl = document.getElementById("list");
  var emptyEl = document.getElementById("empty");

  var KIND_ORDER = ["system", "info", "success", "warning", "error", "quest", "approval", "clarification"];

  // Stroke-only glyphs copied from the bubble vocabulary: the accent colour is
  // the only fill, so one icon set reads at 18px on every kind.
  var KIND_ICONS = {
    system:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z"/><path d="M12 8v5"/><circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v6"/><circle cx="12" cy="7.2" r="0.9" fill="currentColor" stroke="none"/></svg>',
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m7.8 12.3 2.8 2.8 5.6-5.8"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4 21.2 20H2.8z"/><path d="M12 9v5"/><circle cx="12" cy="17.1" r="0.9" fill="currentColor" stroke="none"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2z"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
    quest:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 5h11l-1.8 3.5L16 12H5"/></svg>',
    approval:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 20 6v6.2c0 4.3-3.2 7.6-8 9-4.8-1.4-8-4.7-8-9V6z"/><path d="m8.6 12.1 2.4 2.4 4.4-4.6"/></svg>',
    clarification:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 3.7"/><circle cx="12" cy="17.1" r="0.9" fill="currentColor" stroke="none"/></svg>',
    due:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none"/></svg>',
  };

  var STRINGS = {
    en: {
      clear: "CLEAR ALL",
      all: "ALL",
      unread: "UNREAD",
      empty: "NO NOTICES YET",
      emptyFilter: "NOTHING MATCHES",
      noMatches: "NO MATCHES",
      search: "Search notices",
      searchPlaceholder: "SEARCH TITLE OR MESSAGE",
      clearSearch: "Clear search",
      dismiss: "Dismiss",
      close: "Close",
      justNow: "just now",
      today: "TODAY",
      yesterday: "YESTERDAY",
    },
    zh: {
      clear: "清空全部",
      all: "全部",
      unread: "未读",
      empty: "暂无通知",
      emptyFilter: "没有符合条件的通知",
      noMatches: "没有匹配结果",
      search: "搜索通知",
      searchPlaceholder: "搜索标题或内容",
      clearSearch: "清除搜索",
      dismiss: "忽略",
      close: "关闭",
      justNow: "刚刚",
      today: "今天",
      yesterday: "昨天",
    },
    ko: {
      clear: "모두 지우기",
      all: "전체",
      unread: "안 읽음",
      empty: "아직 알림이 없습니다",
      emptyFilter: "조건에 맞는 알림이 없습니다",
      noMatches: "일치하는 알림 없음",
      search: "알림 검색",
      searchPlaceholder: "제목 또는 내용 검색",
      clearSearch: "검색 지우기",
      dismiss: "무시",
      close: "닫기",
      justNow: "방금",
      today: "오늘",
      yesterday: "어제",
    },
  };

  var KIND_LABEL = {
    en: {
      system: "SYSTEM", info: "INFO", success: "SUCCESS", warning: "WARNING",
      error: "ERROR", quest: "QUEST", approval: "APPROVAL", clarification: "INPUT",
      due: "DUE",
    },
    zh: {
      system: "系统", info: "信息", success: "成功", warning: "警告",
      error: "错误", quest: "任务", approval: "审批", clarification: "询问",
      due: "到期",
    },
    ko: {
      system: "시스템", info: "정보", success: "성공", warning: "경고",
      error: "오류", quest: "퀘스트", approval: "승인", clarification: "질문",
      due: "마감",
    },
  };

  var state = {
    payload: { notices: [], lang: "en", unread: 0 },
    filter: "all",
    query: "",
    selectedId: null,
    expandedId: null,
    /** Per-notice transient copy/save feedback, keyed by notice id. */
    rowStatus: {},
    booted: false,
    closing: false,
  };

  var heightFrame = null;
  var statusTimers = {};

  function strings() {
    return STRINGS[state.payload.lang] || STRINGS.en;
  }

  // Newer notice-log copy lives in the pet's shared string table, which the
  // page loads as a plain script (see i18n.js). Keeping it there means the log
  // and the bubbles speak from one dictionary instead of a second one here.
  function petString(key) {
    var bundle = window.clawdI18n;
    var dict = bundle ? (bundle.i18n[state.payload.lang] || bundle.i18n.en) : null;
    return (dict && dict[key]) || key;
  }

  function kindLabel(kind) {
    var dict = KIND_LABEL[state.payload.lang] || KIND_LABEL.en;
    return dict[kind] || String(kind || "").toUpperCase();
  }

  function isNotice(value) {
    return !!value && typeof value === "object" &&
      typeof value.id === "string" && typeof value.title === "string";
  }

  function normalizePayload(payload) {
    var data = payload && typeof payload === "object" ? payload : {};
    var notices = Array.isArray(data.notices) ? data.notices.filter(isNotice) : [];
    return {
      notices: notices,
      lang: data.lang === "zh" || data.lang === "ko" ? data.lang : "en",
      unread: typeof data.unread === "number" && isFinite(data.unread)
        ? Math.max(0, Math.round(data.unread))
        : notices.filter(function (n) { return !n.read; }).length,
    };
  }

  function relativeTime(at) {
    if (typeof at !== "number" || !isFinite(at) || at <= 0) return "";
    var seconds = Math.max(0, (Date.now() - at) / 1000);
    if (seconds < 45) return strings().justNow;
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h";
    var days = Math.floor(hours / 24);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  }

  // The expanded row names the exact moment. The shape is HUD chrome (month
  // token + 24-hour clock), so it needs no per-language sentence.
  function absoluteTime(at) {
    if (typeof at !== "number" || !isFinite(at) || at <= 0) return "";
    var d = new Date(at);
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return MONTHS[d.getMonth()] + " " + d.getDate() + " " + d.getFullYear() +
      " · " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function noticeById(id) {
    var notices = state.payload.notices;
    for (var i = 0; i < notices.length; i++) {
      if (notices[i].id === id) return notices[i];
    }
    return null;
  }

  function findRow(id) {
    var rows = visibleRows();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.id === id) return rows[i];
    }
    return null;
  }

  // ── Day grouping ───────────────────────────────────────────────────────────
  // The header carries the calendar day, so rows keep their short relative
  // times (just now / 4m / 2h). Month names stay in the HUD's uppercase
  // monospace idiom for every language; only today/yesterday are translated.

  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function dayStart(ts) {
    var d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // YYYYMMDD as a number: a stable key that needs no timestamp arithmetic.
  function dayKey(date) {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  }

  // A notice with no usable timestamp gets no header rather than a bogus one.
  function noticeDay(notice) {
    var at = notice && notice.at;
    if (typeof at !== "number" || !isFinite(at) || at <= 0) return null;
    return dayStart(at);
  }

  function dayLabel(date) {
    var now = new Date();
    var today = dayStart(now.getTime());
    // Step through the Date constructor instead of subtracting 86400000 so a
    // DST change, a month boundary or a year boundary lands on the real
    // previous calendar day.
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    var key = dayKey(date);
    if (key === dayKey(today)) return strings().today;
    if (key === dayKey(yesterday)) return strings().yesterday;
    var label = MONTHS[date.getMonth()] + " " + date.getDate();
    if (date.getFullYear() !== today.getFullYear()) label += " " + date.getFullYear();
    return label;
  }

  function presentKinds() {
    var notices = state.payload.notices;
    var seen = {};
    var kinds = [];
    for (var i = 0; i < KIND_ORDER.length; i++) {
      var kind = KIND_ORDER[i];
      if (notices.some(function (n) { return n.kind === kind; })) {
        seen[kind] = true;
        kinds.push(kind);
      }
    }
    // Unknown kinds from a newer pet build still get a chip instead of
    // disappearing from the filter bar.
    for (var j = 0; j < notices.length; j++) {
      var extra = notices[j].kind || "system";
      if (!seen[extra]) {
        seen[extra] = true;
        kinds.push(extra);
      }
    }
    return kinds;
  }

  // Folded once per paint. The raw value stays in the field so the caret and
  // the clear affordance agree with what the user typed; a whitespace-only
  // query is "no query" for filtering and for the empty state.
  function activeQuery() {
    return state.query.trim().toLowerCase();
  }

  function filteredNotices() {
    var notices = state.payload.notices;
    var query = activeQuery();
    return notices.filter(function (n) {
      // Search stacks on top of the chip filter: UNREAD and a kind both keep
      // their own semantics, and only the rows that survive both paint.
      if (state.filter === "unread") {
        if (n.read) return false;
      } else if (state.filter !== "all" && n.kind !== state.filter) {
        return false;
      }
      if (!query) return true;
      var haystack = (String(n.title || "") + " " + String(n.message || "")).toLowerCase();
      return haystack.indexOf(query) !== -1;
    });
  }

  function visibleRows() {
    return Array.prototype.slice.call(listEl.querySelectorAll(".row"));
  }

  function chip(filter, label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.filter = filter;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", state.filter === filter ? "true" : "false");
    btn.textContent = label;
    return btn;
  }

  function syncSearchChrome() {
    var s = strings();
    searchBar.classList.toggle("has-query", state.query.length > 0);
    searchInput.setAttribute("aria-label", s.search);
    searchInput.title = s.search;
    searchInput.placeholder = s.searchPlaceholder;
    searchClearBtn.setAttribute("aria-label", s.clearSearch);
    searchClearBtn.title = s.clearSearch;
  }

  function applyChrome() {
    var s = strings();
    clearBtn.textContent = s.clear;
    clearBtn.disabled = state.payload.notices.length === 0;
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", s.close);
    closeBtn.title = s.close;
    countEl.textContent = String(state.payload.unread);
    countEl.dataset.zero = state.payload.unread > 0 ? "false" : "true";
    countEl.title = state.payload.unread + " " + s.unread;
    syncSearchChrome();
  }

  function applyFilters() {
    var kinds = presentKinds();
    if (state.filter !== "all" && state.filter !== "unread" && kinds.indexOf(state.filter) === -1) {
      state.filter = "all";
    }

    filtersEl.textContent = "";
    filtersEl.appendChild(chip("all", strings().all));
    filtersEl.appendChild(chip("unread", strings().unread));
    for (var i = 0; i < kinds.length; i++) {
      filtersEl.appendChild(chip(kinds[i], kindLabel(kinds[i])));
    }
    // The strip scrolls sideways rather than wrapping: the kinds that are
    // present depend on what the pet happened to say, so a second row would
    // appear and disappear between days, shifting the whole list down. The
    // right-edge mask tells the user there is more than what fits.
    filtersEl.classList.toggle("is-overflow", filtersEl.scrollWidth > filtersEl.clientWidth + 2);
  }

  /**
   * The quiet chip that names the task a notice became. It is inert by design:
   * a span with no tab stop, no click handler and no hover state of its own,
   * sitting inside the row's existing title line. The stored title is
   * ellipsized; the short label is flex:none, so even when the title has no
   * room left the chip shows "Task" rather than an empty box. The full title is
   * always in `title`.
   *
   * Search deliberately ignores it: this row's haystack is title + message,
   * and the chip is meta (like the expanded KIND/TIME facts), so adding it
   * would make the filter mean something the rest of the meta does not.
   */
  function buildTaskChip(taskTitle) {
    var labelText = petString("noticeCenterTaskChip");
    var text = typeof taskTitle === "string" ? taskTitle.trim() : "";
    var chip = document.createElement("span");
    chip.className = "task-chip";
    chip.title = text || labelText;
    var label = document.createElement("span");
    label.className = "task-chip-label";
    label.textContent = labelText;
    chip.appendChild(label);
    if (text) {
      var value = document.createElement("span");
      value.className = "task-chip-title";
      value.textContent = text;
      chip.appendChild(value);
    }
    return chip;
  }

  /**
   * Keep a saved row's chip honest without repainting the list: after "Save as
   * task" the durable payload has not been re-rendered (that would close the
   * open row), but the outcome carries the new task's title. `fallbackTitle` is
   * only used when the notice object itself has not caught up yet.
   */
  function renderTaskChip(row, id, fallbackTitle) {
    if (!row) return;
    var titleLine = row.querySelector(".title-line");
    if (!titleLine) return;
    var notice = noticeById(id);
    var taskId = notice && notice.taskId ? notice.taskId : (state.rowStatus[id] && state.rowStatus[id].taskId);
    if (!taskId) return;
    var stored = notice && typeof notice.taskTitle === "string" ? notice.taskTitle : "";
    var title = stored.trim() ? stored : (typeof fallbackTitle === "string" ? fallbackTitle : "");
    var existing = titleLine.querySelector(".task-chip");
    var replacement = buildTaskChip(title);
    if (existing) titleLine.replaceChild(replacement, existing);
    else titleLine.insertBefore(replacement, titleLine.querySelector(".expand"));
  }

  function buildRow(notice) {
    var s = strings();
    var expanded = state.expandedId === notice.id;
    var row = document.createElement("div");
    row.className = "row" + (expanded ? " expanded" : "");
    row.dataset.id = notice.id;
    row.dataset.kind = notice.kind || "system";
    row.dataset.read = notice.read ? "true" : "false";
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", notice.title);
    row.setAttribute("aria-expanded", expanded ? "true" : "false");
    row.tabIndex = -1;
    if (state.selectedId === notice.id) row.classList.add("selected");

    var icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = KIND_ICONS[notice.kind] || KIND_ICONS.system;

    var body = document.createElement("span");
    body.className = "body";

    var titleLine = document.createElement("span");
    titleLine.className = "title-line";
    var dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    var title = document.createElement("span");
    title.className = "title";
    title.textContent = notice.title;
    // The title is ellipsized; the full line stays reachable on hover.
    title.title = notice.title;
    var expand = document.createElement("button");
    expand.type = "button";
    expand.className = "expand";
    expand.setAttribute("aria-expanded", expanded ? "true" : "false");
    expand.setAttribute("aria-label", expanded ? petString("noticeCenterCollapse") : petString("noticeCenterExpand"));
    expand.title = expanded ? petString("noticeCenterCollapse") : petString("noticeCenterExpand");
    expand.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    expand.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleExpanded(notice.id);
    });
    titleLine.appendChild(dot);
    titleLine.appendChild(title);
    // A notice that already became a task says so before the row is opened.
    // The chip stays inside the title line so the collapsed row's height is
    // unchanged; it is a span, not a control, and clicks fall through to the
    // row exactly as they do on the title itself.
    if (notice.taskId) titleLine.appendChild(buildTaskChip(notice.taskTitle));
    titleLine.appendChild(expand);

    var message = document.createElement("span");
    message.className = "msg";
    message.textContent = notice.message || "";
    message.title = notice.message || "";
    message.hidden = !notice.message;

    var statusEl = document.createElement("span");
    statusEl.className = "row-status";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    statusEl.hidden = true;

    body.appendChild(titleLine);
    body.appendChild(message);
    body.appendChild(statusEl);
    body.appendChild(buildDetail(notice));

    var side = document.createElement("span");
    side.className = "side";
    var time = document.createElement("span");
    time.className = "time";
    time.textContent = relativeTime(notice.at);
    var dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "dismiss";
    dismiss.tabIndex = -1;
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", s.dismiss);
    dismiss.title = s.dismiss;
    dismiss.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      dismissNotice(notice.id);
    });
    side.appendChild(time);
    side.appendChild(dismiss);

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(side);

    row.addEventListener("click", function () { openNotice(notice.id); });
    row.addEventListener("focus", function () { selectRow(row, false); });

    renderStatus(statusEl, notice.id);
    return row;
  }

  /**
   * The expanded half of a row: meta rows, kind, exact timestamp and the
   * action strip. Everything here is inert except the buttons, so clicking the
   * detail still means "open the conversation" like the rest of the row.
   */
  function buildDetail(notice) {
    var detail = document.createElement("span");
    detail.className = "detail";

    var meta = Array.isArray(notice.meta) ? notice.meta : [];
    if (meta.length) {
      var metaWrap = document.createElement("span");
      metaWrap.className = "meta";
      for (var i = 0; i < meta.length; i++) {
        var metaRow = document.createElement("span");
        metaRow.className = "meta-row";
        var label = document.createElement("span");
        label.className = "meta-label";
        label.textContent = String(meta[i].label || "");
        var value = document.createElement("span");
        value.className = "meta-value";
        value.textContent = String(meta[i].value || "");
        metaRow.appendChild(label);
        metaRow.appendChild(value);
        metaWrap.appendChild(metaRow);
      }
      detail.appendChild(metaWrap);
    }

    var facts = document.createElement("span");
    facts.className = "facts";
    facts.appendChild(fact(petString("noticeCenterKind"), kindLabel(notice.kind)));
    facts.appendChild(fact(petString("noticeCenterTime"), absoluteTime(notice.at)));
    detail.appendChild(facts);

    var actions = document.createElement("span");
    actions.className = "actions";
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", petString("noticeCenterActions"));
    if (notice.sessionId) {
      actions.appendChild(actionButton(petString("noticeCenterOpen"), "act--primary", function () {
        openNotice(notice.id);
      }));
    }
    actions.appendChild(actionButton(petString("noticeCenterCopy"), "", function () {
      copyNotice(notice.id);
    }));
    // Only text worth keeping earns a task: an empty notice has nothing to put
    // in materials/, and main re-checks the same rule.
    if (notice.canSaveTask) {
      var save = actionButton(petString("noticeCenterSaveTask"), "", function () {
        saveNotice(notice.id);
      });
      save.classList.add("act--save");
      actions.appendChild(save);
    }
    actions.appendChild(actionButton(petString("noticeCenterDismiss"), "act--danger", function () {
      dismissNotice(notice.id);
    }));
    detail.appendChild(actions);

    return detail;
  }

  function fact(labelText, valueText) {
    var factEl = document.createElement("span");
    factEl.className = "fact";
    var label = document.createElement("span");
    label.className = "fact-label";
    label.textContent = labelText;
    var value = document.createElement("span");
    value.className = "fact-value";
    value.textContent = valueText;
    factEl.appendChild(label);
    factEl.appendChild(value);
    return factEl;
  }

  function actionButton(labelText, extraClass, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "act" + (extraClass ? " " + extraClass : "");
    btn.textContent = labelText;
    btn.setAttribute("aria-label", labelText);
    btn.title = labelText;
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return btn;
  }

  // ── Row feedback / expansion ───────────────────────────────────────────────

  function saveErrorText(code) {
    if (code === "empty_text") return petString("noticeCenterSaveErrorEmpty");
    if (code === "folder_missing") return petString("noticeCenterSaveErrorFolder");
    if (code === "write_failed" || code === "directory_failed") return petString("noticeCenterSaveErrorWrite");
    if (code === "not_found") return petString("noticeCenterSaveErrorNotFound");
    return petString("noticeCenterSaveErrorInvalid");
  }

  function statusText(status) {
    if (status.kind === "copied") return petString("noticeCenterCopied");
    if (status.kind === "copy-failed") return petString("noticeCenterCopyFailed");
    if (status.kind === "task-created") return petString("noticeCenterTaskCreated");
    if (status.kind === "task-failed") {
      return petString("noticeCenterTaskFailed") + " — " + saveErrorText(status.code);
    }
    return "";
  }

  function renderStatus(el, id) {
    var status = state.rowStatus[id];
    // The link outlives this panel session: main derives it from the task's own
    // history (`from_notice`), so a notice saved yesterday still offers its task
    // after the log is closed and reopened.
    var notice = noticeById(id);
    var taskId = status && status.taskId
      ? status.taskId
      : (notice && notice.taskId ? notice.taskId : "");
    el.textContent = "";
    if (!status && !taskId) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.dataset.tone = status && (status.kind === "copy-failed" || status.kind === "task-failed")
      ? "error"
      : "ok";
    if (status) {
      var text = document.createElement("span");
      text.className = "status-text";
      text.textContent = statusText(status);
      el.appendChild(text);
    }
    // A saved notice keeps its offer: opening the task later is one click, and
    // the notice itself stays in the log untouched.
    if (taskId) {
      var open = document.createElement("button");
      open.type = "button";
      open.className = "status-action";
      var label = petString("noticeCenterOpenTasks");
      open.textContent = label;
      open.setAttribute("aria-label", label);
      open.title = label;
      open.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        runAction({ type: "open-task", id: id, taskId: taskId });
      });
      el.appendChild(open);
    }
    // Saving from this row is the one moment the payload is stale; the outcome
    // carries the new task's title, so patch the chip in place instead of
    // repainting the list and collapsing the open row.
    if (status && status.taskId) {
      renderTaskChip(el.closest ? el.closest(".row") : null, id, status.taskTitle);
    }
  }

  // Copy is a glance, not a state: the confirmation clears itself, but a
  // failure is reported the same way rather than swallowed.
  function setRowStatus(id, status) {
    if (statusTimers[id]) {
      clearTimeout(statusTimers[id]);
      statusTimers[id] = null;
    }
    if (status) state.rowStatus[id] = status;
    else delete state.rowStatus[id];
    var row = findRow(id);
    var el = row ? row.querySelector(".row-status") : null;
    if (el) renderStatus(el, id);
    if (status && (status.kind === "copied" || status.kind === "copy-failed")) {
      statusTimers[id] = setTimeout(function () {
        statusTimers[id] = null;
        delete state.rowStatus[id];
        var current = findRow(id);
        var target = current ? current.querySelector(".row-status") : null;
        if (target) renderStatus(target, id);
      }, 2600);
    }
  }

  function applyExpanded(row, expanded) {
    if (!row) return;
    row.classList.toggle("expanded", expanded);
    row.setAttribute("aria-expanded", expanded ? "true" : "false");
    var chevron = row.querySelector(".expand");
    if (!chevron) return;
    chevron.setAttribute("aria-expanded", expanded ? "true" : "false");
    var label = petString(expanded ? "noticeCenterCollapse" : "noticeCenterExpand");
    chevron.setAttribute("aria-label", label);
    chevron.title = label;
  }

  // Expansion is pure presentation: the payload, the read flag and the order
  // are all untouched, and the row is patched in place so scroll and focus
  // survive.
  function toggleExpanded(id) {
    if (!id) return;
    var next = state.expandedId === id ? null : id;
    if (state.expandedId && state.expandedId !== id) {
      applyExpanded(findRow(state.expandedId), false);
    }
    state.expandedId = next;
    applyExpanded(findRow(id), next === id);
    reportHeight();
  }

  function copyNotice(id) {
    if (!id) return;
    if (!api || !api.copy) {
      setRowStatus(id, { kind: "copy-failed" });
      return;
    }
    Promise.resolve(api.copy(id))
      .then(function (result) {
        setRowStatus(id, result && result.ok ? { kind: "copied" } : { kind: "copy-failed" });
      })
      .catch(function () {
        setRowStatus(id, { kind: "copy-failed" });
      });
  }

  function saveNotice(id) {
    if (!id) return Promise.resolve();
    var row = findRow(id);
    var btn = row ? row.querySelector(".act--save") : null;
    if (btn && btn.disabled) return Promise.resolve();
    if (btn) btn.disabled = true;
    return runAction({ type: "save-task", id }).then(function () {
      if (btn) btn.disabled = false;
    });
  }

  function buildDayHeader(date) {
    var header = document.createElement("div");
    header.className = "day";
    // Not a row: no data-id, no tabindex, no role — invisible to the keyboard
    // model and to visibleRows(), but still announced as plain text.
    header.textContent = dayLabel(date);
    return header;
  }

  function renderList(notices) {
    listEl.textContent = "";
    var stillSelected = notices.some(function (n) { return n.id === state.selectedId; });
    if (!stillSelected) state.selectedId = null;
    // Notices arrive newest first, so one pass in order is enough: a header is
    // emitted for the first painted row of a day, and a day whose rows were
    // all filtered out never reaches this loop, so it emits no header.
    var lastDay = null;
    for (var i = 0; i < notices.length; i++) {
      var notice = notices[i];
      var day = noticeDay(notice);
      if (day) {
        var key = dayKey(day);
        if (key !== lastDay) {
          listEl.appendChild(buildDayHeader(day));
          lastDay = key;
        }
      }
      listEl.appendChild(buildRow(notice));
    }
  }

  function updateEmpty(notices) {
    if (notices.length > 0) {
      emptyEl.hidden = true;
      return;
    }
    emptyEl.hidden = false;
    // A typed query gets its own wording: "no notices yet" would read as if the
    // log were empty rather than the search having missed.
    if (activeQuery()) {
      emptyEl.textContent = strings().noMatches;
      return;
    }
    emptyEl.textContent = state.payload.notices.length > 0
      ? strings().emptyFilter
      : strings().empty;
  }

  // One paint path for every filter change (chip, query, payload): rows and the
  // empty state are always rebuilt from the same list, and the height report
  // rides along with them.
  function paintList() {
    var notices = filteredNotices();
    renderList(notices);
    updateEmpty(notices);
    reportHeight();
  }

  function selectRow(row, moveFocus) {
    var rows = visibleRows();
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("selected", rows[i] === row);
    }
    state.selectedId = row ? row.dataset.id : null;
    if (moveFocus && row) {
      try { row.focus({ preventScroll: true }); } catch (err) { row.focus(); }
      try { row.scrollIntoView({ block: "nearest" }); } catch (err) { /* older Chromium */ }
    }
  }

  function moveSelection(delta, keepFocus) {
    var rows = visibleRows();
    if (!rows.length) return;
    var index = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains("selected")) { index = i; break; }
    }
    if (index < 0) index = delta > 0 ? -1 : rows.length;
    index = (index + delta + rows.length) % rows.length;
    if (keepFocus) {
      // Arrowing out of the search field highlights a row without moving the
      // caret: the user can keep typing, and Enter/Delete still act on what
      // the highlight is on.
      selectRow(rows[index], false);
      try { rows[index].scrollIntoView({ block: "nearest" }); } catch (err) { /* older Chromium */ }
      return;
    }
    selectRow(rows[index], true);
  }

  function selectedRow() {
    var rows = visibleRows();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains("selected")) return rows[i];
    }
    return null;
  }

  function focusPanel() {
    if (!panel) return;
    try { panel.focus({ preventScroll: true }); } catch (err) { panel.focus(); }
  }

  function isSearchTarget(target) {
    return !!searchInput && target === searchInput;
  }

  function isEditable(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
  }

  function focusSearch(selectAll) {
    if (!searchInput) return;
    try { searchInput.focus({ preventScroll: true }); } catch (err) { searchInput.focus(); }
    if (selectAll) {
      // Ctrl+F means "find again": keep an existing query selected so typing
      // replaces it, the way a browser find bar behaves.
      try { searchInput.select(); } catch (err) { /* caret only */ }
      return;
    }
    try {
      var end = searchInput.value.length;
      searchInput.setSelectionRange(end, end);
    } catch (err) { /* not fatal */ }
  }

  function setQuery(value, keepFocus) {
    var next = typeof value === "string" ? value : "";
    if (searchInput.value !== next) searchInput.value = next;
    state.query = next;
    syncSearchChrome();
    paintList();
    if (keepFocus) focusSearch(false);
  }

  /**
   * Only a list that actually overflows earns the bottom fade: on a short log
   * the same gradient would dim the last row for no reason.
   */
  function syncScrollFade() {
    if (!panel || !listEl) return;
    panel.classList.toggle("is-scrollable", listEl.scrollHeight - listEl.clientHeight > 2);
  }

  function reportHeight() {
    // A close (Escape/×/click-away) tears the window down; a measurement queued
    // in the same frame would only reach an IPC sender that is already gone.
    if (state.closing) return;
    if (heightFrame) return;
    heightFrame = requestAnimationFrame(function () {
      heightFrame = null;
      syncScrollFade();
      if (!api || !api.reportHeight) return;
      // The window adds its own 8px transparent margin on each side; report the
      // painted panel plus that padding so the cap in the main process maps to
      // the visible content height.
      var height = Math.ceil(panel.getBoundingClientRect().height + 16);
      api.reportHeight(height);
    });
  }

  function pruneTransientState() {
    var notices = state.payload.notices;
    var alive = {};
    for (var i = 0; i < notices.length; i++) alive[notices[i].id] = true;
    if (state.expandedId && !alive[state.expandedId]) state.expandedId = null;
    for (var id in state.rowStatus) {
      if (!alive[id]) {
        delete state.rowStatus[id];
        if (statusTimers[id]) {
          clearTimeout(statusTimers[id]);
          statusTimers[id] = null;
        }
      }
    }
  }

  function render(payload, first) {
    state.payload = normalizePayload(payload);
    document.documentElement.lang = state.payload.lang;
    pruneTransientState();

    applyChrome();
    applyFilters();
    paintList();

    if (first) {
      panel.classList.add("visible");
      requestAnimationFrame(focusPanel);
    }
    reportHeight();
  }

  function applyPayload(payload) {
    var first = !state.booted;
    state.booted = true;
    render(payload, first);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  // `markRead` is true for the two closes the user means as "done" (the × and
  // Escape). The transparent margin is a click-away like any other: the main
  // process leaves the unread state alone on blur, so the 8 px ring inside the
  // window must not mean something different from a click just outside it.
  function closePanel(markRead) {
    state.closing = true;
    if (heightFrame) {
      cancelAnimationFrame(heightFrame);
      heightFrame = null;
    }
    if (api && api.close) { api.close(markRead === false ? { markRead: false } : undefined); return; }
    window.close();
  }

  function applyOutcome(outcome) {
    if (!outcome || typeof outcome.id !== "string" || outcome.action !== "save-task") return;
    if (outcome.ok) {
      setRowStatus(outcome.id, {
        kind: "task-created",
        taskId: outcome.taskId,
        taskTitle: outcome.taskTitle,
      });
    } else {
      setRowStatus(outcome.id, { kind: "task-failed", code: outcome.code });
    }
  }

  function runAction(action) {
    if (!api || !api.action) return Promise.resolve();
    return Promise.resolve(api.action(action))
      .then(function (payload) {
        if (!payload) return;
        if (payload.outcome) applyOutcome(payload.outcome);
        // A save changes no row's content or order; repainting would throw away
        // the open row and its scroll position for a payload that is identical.
        if (action && action.type === "save-task") return;
        render(payload, false);
      })
      .catch(function () {
        // "open" destroys the window before replying; a rejected promise here
        // is the expected end of this renderer, not an error to surface. A
        // failed save is different: it must still say why on the row.
        if (action && action.type === "save-task" && typeof action.id === "string") {
          setRowStatus(action.id, { kind: "task-failed", code: "invalid" });
        }
      });
  }

  function openNotice(id) {
    if (!id) return;
    runAction({ type: "open", id: id });
  }

  function dismissNotice(id) {
    if (!id) return;
    runAction({ type: "dismiss", id: id });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  filtersEl.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest(".chip") : null;
    if (!target) return;
    var filter = target.dataset.filter;
    if (!filter || filter === state.filter) return;
    state.filter = filter;
    state.selectedId = null;
    applyFilters();
    paintList();
    focusPanel();
  });

  // Typing only narrows the paint: the payload, the unread flag and the chip
  // filter are untouched, so the search never marks anything read.
  searchInput.addEventListener("input", function () {
    state.query = searchInput.value;
    syncSearchChrome();
    paintList();
  });

  // The whole bar is the target, not just the 10px text line: clicking the
  // glyph or the padding should still put the caret in the field.
  searchBar.addEventListener("mousedown", function (event) {
    if (event.target === searchInput) return;
    if (event.target && event.target.closest && event.target.closest("button")) return;
    event.preventDefault();
    focusSearch(false);
  });

  // Keep the caret in the field when the × is clicked; the button itself never
  // needs focus, and yanking focus to a control that then disappears is worse.
  searchClearBtn.addEventListener("mousedown", function (event) { event.preventDefault(); });
  searchClearBtn.addEventListener("click", function () { setQuery("", true); });

  clearBtn.addEventListener("click", function () {
    if (state.payload.notices.length === 0) return;
    runAction({ type: "clear-all" });
  });

  closeBtn.addEventListener("click", function () { closePanel(); });

  document.addEventListener("keydown", function (event) {
    // IME composition owns Escape/Enter/arrows until the candidate window
    // closes; reacting mid-word would clear the query or open a row.
    if (event.isComposing || event.keyCode === 229) return;

    var mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      focusSearch(true);
      return;
    }
    // "/" is the search key whenever the caret is not already in a text field;
    // typing a slash into the query must stay a slash.
    if (event.key === "/" && !mod && !event.altKey && !isEditable(event.target)) {
      event.preventDefault();
      focusSearch(false);
      return;
    }
    if (event.key === "Escape") {
      // Esc in the field is an undo of the query, not a close; only an empty
      // query falls through. An open row collapses before the panel does.
      if (isSearchTarget(event.target) && state.query) {
        event.preventDefault();
        setQuery("", true);
        return;
      }
      if (state.expandedId) {
        event.preventDefault();
        toggleExpanded(state.expandedId);
        return;
      }
      event.preventDefault();
      closePanel();
      return;
    }

    var inSearch = isSearchTarget(event.target);
    // Enter on a focused chrome button is that button's activation, not the
    // highlighted row's. Without this, tabbing to a chip and pressing Enter
    // would open the previously selected notice instead.
    var onButton = event.target && event.target.closest
      ? event.target.closest("button")
      : null;
    if (onButton && (event.key === "Enter" || event.key === " ")) return;

    // Space opens the openable row. The search field owns its own typing, so a
    // space typed into it is a space, not a toggle.
    if (event.key === " " && !mod && !event.altKey && !inSearch && !isEditable(event.target)) {
      var spaceRow = selectedRow();
      if (spaceRow) {
        event.preventDefault();
        toggleExpanded(spaceRow.dataset.id);
        return;
      }
    }
    // c / s are single-letter actions on the highlighted row. They must never
    // fire while the caret is in the search field.
    if (!mod && !event.altKey && !event.repeat && !isEditable(event.target)) {
      var key = event.key.toLowerCase();
      var keyRow = selectedRow();
      if (keyRow) {
        var keyNotice = noticeById(keyRow.dataset.id);
        if (key === "c") {
          event.preventDefault();
          copyNotice(keyRow.dataset.id);
          return;
        }
        if (key === "s" && keyNotice && keyNotice.canSaveTask) {
          event.preventDefault();
          saveNotice(keyRow.dataset.id);
          return;
        }
      }
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1, inSearch);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1, inSearch);
      return;
    }
    if (event.key === "Enter") {
      var row = selectedRow();
      if (row) {
        event.preventDefault();
        openNotice(row.dataset.id);
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      // Backspace is always text editing in the field. Delete doubles as the
      // list's dismiss key whenever a row is highlighted, as it is on the list.
      if (inSearch && (event.key === "Backspace" || !selectedRow())) return;
      var target = selectedRow();
      if (target) {
        event.preventDefault();
        dismissNotice(target.dataset.id);
      }
    }
  });

  // Clicking the transparent margin around the panel is a click-away, mirroring
  // the pet menu; the main process also closes on window blur.
  document.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    if (event.target === document.body || event.target === document.documentElement) {
      closePanel(false);
    }
  });

  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  // The list changes height as rows and chips are added or filtered. One
  // observer keeps the window measurement honest without every path calling
  // reportHeight by hand.
  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(function () { reportHeight(); });
    observer.observe(panel);
  }

  function samplePayload() {
    var now = Date.now();
    return {
      lang: "en",
      unread: 2,
      notices: [
        { id: "sample-1", kind: "warning", title: "Context running low", message: "This conversation is close to the model's context window. Start a new chat to keep responses fast.", at: now - 4 * 60000, read: false, sessionId: "sample-session", canSaveTask: true, meta: [{ label: "TIME", value: "3s" }, { label: "TOOLS", value: "2" }] },
        { id: "sample-2", kind: "success", title: "Background task finished", message: "The scheduled dependency audit completed with no critical findings.", at: now - 2 * 3600000, read: false, canSaveTask: true },
        { id: "sample-3", kind: "system", title: "Link start", message: "AIPA is online and standing by.", at: now - 3 * 86400000, read: true, canSaveTask: true },
      ],
    };
  }

  function boot() {
    if (!api) {
      // Loaded outside Electron (screenshot harness): show representative rows
      // so the skin can be inspected without the factory.
      applyPayload(samplePayload());
      return;
    }
    if (api.onUpdate) api.onUpdate(applyPayload);
    Promise.resolve(api.load())
      .then(applyPayload)
      .catch(function () { applyPayload({ notices: [], lang: "en", unread: 0 }); });
  }

  boot();
})();
