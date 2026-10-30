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
  };

  var STRINGS = {
    en: {
      clear: "CLEAR ALL",
      all: "ALL",
      unread: "UNREAD",
      empty: "NO NOTICES YET",
      emptyFilter: "NOTHING MATCHES",
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
    },
    zh: {
      system: "系统", info: "信息", success: "成功", warning: "警告",
      error: "错误", quest: "任务", approval: "审批", clarification: "询问",
    },
    ko: {
      system: "시스템", info: "정보", success: "성공", warning: "경고",
      error: "오류", quest: "퀘스트", approval: "승인", clarification: "질문",
    },
  };

  var state = {
    payload: { notices: [], lang: "en", unread: 0 },
    filter: "all",
    selectedId: null,
    booted: false,
  };

  var heightFrame = null;

  function strings() {
    return STRINGS[state.payload.lang] || STRINGS.en;
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

  function filteredNotices() {
    var notices = state.payload.notices;
    if (state.filter === "all") return notices;
    if (state.filter === "unread") {
      return notices.filter(function (n) { return !n.read; });
    }
    return notices.filter(function (n) { return n.kind === state.filter; });
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
  }

  function buildRow(notice) {
    var s = strings();
    var row = document.createElement("div");
    row.className = "row";
    row.dataset.id = notice.id;
    row.dataset.kind = notice.kind || "system";
    row.dataset.read = notice.read ? "true" : "false";
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", notice.title);
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
    titleLine.appendChild(dot);
    titleLine.appendChild(title);

    var message = document.createElement("span");
    message.className = "msg";
    message.textContent = notice.message || "";
    message.hidden = !notice.message;

    body.appendChild(titleLine);
    body.appendChild(message);

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

    return row;
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
    emptyEl.textContent = state.payload.notices.length > 0
      ? strings().emptyFilter
      : strings().empty;
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

  function moveSelection(delta) {
    var rows = visibleRows();
    if (!rows.length) return;
    var index = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains("selected")) { index = i; break; }
    }
    if (index < 0) index = delta > 0 ? -1 : rows.length;
    index = (index + delta + rows.length) % rows.length;
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

  /**
   * Only a list that actually overflows earns the bottom fade: on a short log
   * the same gradient would dim the last row for no reason.
   */
  function syncScrollFade() {
    if (!panel || !listEl) return;
    panel.classList.toggle("is-scrollable", listEl.scrollHeight - listEl.clientHeight > 2);
  }

  function reportHeight() {
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

  function render(payload, first) {
    state.payload = normalizePayload(payload);
    document.documentElement.lang = state.payload.lang;

    applyChrome();
    applyFilters();
    var notices = filteredNotices();
    renderList(notices);
    updateEmpty(notices);

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

  function closePanel() {
    if (api && api.close) { api.close(); return; }
    window.close();
  }

  function runAction(action) {
    if (!api || !api.action) return;
    Promise.resolve(api.action(action))
      .then(function (payload) {
        if (payload) render(payload, false);
      })
      .catch(function () {
        // "open" destroys the window before replying; a rejected promise here
        // is the expected end of this renderer, not an error to surface.
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
    var notices = filteredNotices();
    renderList(notices);
    updateEmpty(notices);
    reportHeight();
    focusPanel();
  });

  clearBtn.addEventListener("click", function () {
    if (state.payload.notices.length === 0) return;
    runAction({ type: "clear-all" });
  });

  closeBtn.addEventListener("click", function () { closePanel(); });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    // Enter on a focused chrome button is that button's activation, not the
    // highlighted row's. Without this, tabbing to a chip and pressing Enter
    // would open the previously selected notice instead.
    var onButton = event.target && event.target.closest
      ? event.target.closest("button")
      : null;
    if (onButton && (event.key === "Enter" || event.key === " ")) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
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
      closePanel();
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
        { id: "sample-1", kind: "warning", title: "Context running low", message: "This conversation is close to the model's context window. Start a new chat to keep responses fast.", at: now - 4 * 60000, read: false },
        { id: "sample-2", kind: "success", title: "Background task finished", message: "The scheduled dependency audit completed with no critical findings.", at: now - 2 * 3600000, read: false },
        { id: "sample-3", kind: "system", title: "Link start", message: "AIPA is online and standing by.", at: now - 3 * 86400000, read: true },
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
