/**
 * task-brief.js — renderer for the pet's "Today" task card.
 *
 * The main process owns the task store, the window, positioning and focus.
 * This page asks for a payload, paints up to four rows, reports its measured
 * height so the window can size itself, and sends one action per gesture. It
 * never imports the app's locale JSON: the pet speaks en/zh/ko, and the payload
 * carries which one plus every string.
 */
(function () {
  "use strict";

  var api = window.taskBriefAPI || null;

  var panel = document.getElementById("panel");
  var eyebrowEl = document.getElementById("eyebrow");
  var countEl = document.getElementById("count");
  var dateEl = document.getElementById("date");
  var closeBtn = document.getElementById("closeBtn");
  var listEl = document.getElementById("list");
  var emptyEl = document.getElementById("empty");
  var openTasksBtn = document.getElementById("openTasksBtn");
  var openTasksLabel = document.getElementById("openTasksLabel");
  var hintEl = document.getElementById("hint");
  var shortcutEl = document.getElementById("shortcut");
  var hintLabel = document.getElementById("hintLabel");

  var STATUSES = ["needs_you", "in_progress", "assigned", "ready", "inbox"];
  var STATUS_LABEL_KEY = {
    needs_you: "needsYou",
    in_progress: "inProgress",
    assigned: "assigned",
    ready: "ready",
    inbox: "inbox",
  };

  // Fallbacks exist for the standalone screenshot harness and for a main
  // process from an older build; a real payload always carries all of these.
  var FALLBACK_LABELS = {
    eyebrow: "TASK BRIEF",
    openTasks: "Open Tasks",
    empty: "Nothing on your desk",
    unassigned: "Unassigned",
    materials: "{n} materials",
    materialOne: "{n} material",
    close: "Close",
    needsYou: "Needs you",
    inProgress: "In progress",
    assigned: "Assigned",
    ready: "Ready",
    inbox: "Inbox",
    shortcutHint: "open brief",
    untitled: "Untitled task",
    justNow: "now",
    start: "Start",
    startHint: "Start work on this task",
  };

  var LOCALES = { en: "en-US", zh: "zh-CN", ko: "ko-KR" };

  var state = {
    payload: { tasks: [], total: 0, lang: "en", theme: "sao", labels: FALLBACK_LABELS, shortcut: "" },
    booted: false,
    closing: false,
  };

  var heightFrame = null;

  function labels() {
    return state.payload.labels;
  }

  function normalizeTask(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id) return null;
    var status = STATUSES.indexOf(value.status) !== -1 ? value.status : "inbox";
    var materials = typeof value.materials === "number" && isFinite(value.materials)
      ? Math.max(0, Math.round(value.materials))
      : 0;
    var updatedAt = typeof value.updatedAt === "number" && isFinite(value.updatedAt)
      ? value.updatedAt
      : 0;
    return {
      id: value.id,
      title: typeof value.title === "string" && value.title ? value.title : "",
      status: status,
      department: typeof value.department === "string" ? value.department : "",
      materials: materials,
      updatedAt: updatedAt,
      // Only the main process decides whether a reason exists; the page only
      // renders a non-empty string.
      reason: typeof value.reason === "string" ? value.reason.trim() : "",
      sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
    };
  }

  function normalizePayload(payload) {
    var data = payload && typeof payload === "object" ? payload : {};
    var tasks = Array.isArray(data.tasks)
      ? data.tasks.map(normalizeTask).filter(function (task) { return !!task; })
      : [];
    var total = typeof data.total === "number" && isFinite(data.total)
      ? Math.max(0, Math.round(data.total))
      : tasks.length;
    var incoming = data.labels && typeof data.labels === "object" ? data.labels : {};
    var merged = {};
    for (var key in FALLBACK_LABELS) {
      if (Object.prototype.hasOwnProperty.call(FALLBACK_LABELS, key)) {
        merged[key] = typeof incoming[key] === "string" && incoming[key]
          ? incoming[key]
          : FALLBACK_LABELS[key];
      }
    }
    return {
      tasks: tasks,
      total: total,
      lang: data.lang === "zh" || data.lang === "ko" ? data.lang : "en",
      theme: data.theme === "clawd" ? "clawd" : "sao",
      labels: merged,
      shortcut: typeof data.shortcut === "string" ? data.shortcut : "",
    };
  }

  function statusLabel(status) {
    return labels()[STATUS_LABEL_KEY[status]] || status;
  }

  function materialLabel(count) {
    var raw = (count === 1 && labels().materialOne) || labels().materials || "{n} materials";
    if (raw.indexOf("{n}") !== -1) return raw.replace("{n}", String(count));
    return count + " " + raw;
  }

  function relativeTime(at) {
    if (!at) return "";
    var seconds = Math.max(0, (Date.now() - at) / 1000);
    if (seconds < 45) return labels().justNow;
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h";
    var days = Math.floor(hours / 24);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  }

  function todayLabel() {
    try {
      return new Intl.DateTimeFormat(LOCALES[state.payload.lang] || LOCALES.en, {
        month: "short",
        day: "numeric",
      }).format(new Date());
    } catch (err) {
      return "";
    }
  }

  function visibleRows() {
    return Array.prototype.slice.call(listEl.querySelectorAll(".row"));
  }

  function buildStartButton(task) {
    var start = document.createElement("button");
    start.type = "button";
    start.className = "start";
    // The visible mark is an icon, so the accessible name and tooltip carry the
    // action's words. They come from the pet's table like every other string.
    start.setAttribute("aria-label", labels().start);
    start.title = labels().startHint || labels().start;
    start.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    start.addEventListener("click", function (event) {
      // The button is a sibling of the row, but the guard stays anyway: a click
      // here must never also be read as "open this task".
      event.stopPropagation();
      startTask(task.id);
    });
    return start;
  }

  function buildRow(task, index) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "row";
    row.dataset.id = task.id;
    row.dataset.status = task.status;
    // One line only: the full title stays reachable as a tooltip and in the
    // accessible name even when the row ellipsizes it. A waiting task's reason
    // is part of both, because it is why the row is at the top of the card.
    var rowTitle = task.title || labels().untitled;
    row.title = task.reason ? rowTitle + " — " + task.reason : rowTitle;

    var key = document.createElement("span");
    key.className = "key";
    key.setAttribute("aria-hidden", "true");
    key.textContent = String(index + 1);

    var body = document.createElement("span");
    body.className = "body";

    var statusline = document.createElement("span");
    statusline.className = "statusline";
    var dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    var status = document.createElement("span");
    status.textContent = statusLabel(task.status);
    statusline.appendChild(dot);
    statusline.appendChild(status);

    var title = document.createElement("span");
    title.className = "title";
    title.textContent = task.title || labels().untitled;

    var meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = task.department || labels().unassigned;
    var sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "·";
    meta.appendChild(sep);
    meta.appendChild(document.createTextNode(materialLabel(task.materials)));

    body.appendChild(statusline);
    body.appendChild(title);
    body.appendChild(meta);

    // One dim line under the meta: the row's status already says NEEDS YOU, so
    // the reason needs no label of its own. No reason means no element at all,
    // so an ordinary row keeps exactly today's height.
    if (task.reason) {
      var reason = document.createElement("span");
      reason.className = "reason";
      reason.textContent = task.reason;
      body.appendChild(reason);
    }

    var age = document.createElement("span");
    age.className = "age";
    age.textContent = relativeTime(task.updatedAt);

    row.appendChild(key);
    row.appendChild(body);
    row.appendChild(age);

    row.setAttribute(
      "aria-label",
      [statusLabel(task.status), task.title || labels().untitled, meta.textContent]
        .concat(task.reason ? [task.reason] : [])
        .join(", ")
    );
    row.addEventListener("click", function () { openTask(task.id); });

    // The Start button sits beside the row rather than inside it: nesting a
    // real <button> in the row's <button> is invalid markup. The wrapper is
    // what anchors it at the trailing edge.
    var wrap = document.createElement("div");
    wrap.className = "row-wrap";
    wrap.appendChild(row);
    wrap.appendChild(buildStartButton(task));
    return wrap;
  }

  function renderRows(tasks) {
    listEl.textContent = "";
    for (var i = 0; i < tasks.length; i++) listEl.appendChild(buildRow(tasks[i], i));
    var hasRows = tasks.length > 0;
    listEl.hidden = !hasRows;
    emptyEl.hidden = hasRows;
    emptyEl.textContent = hasRows ? "" : labels().empty;
  }

  function applyChrome() {
    var s = labels();
    panel.dataset.theme = state.payload.theme;
    eyebrowEl.textContent = s.eyebrow;
    countEl.textContent = String(state.payload.total);
    countEl.dataset.zero = state.payload.total > 0 ? "false" : "true";
    countEl.title = String(state.payload.total);
    dateEl.textContent = todayLabel();
    closeBtn.setAttribute("aria-label", s.close);
    closeBtn.title = s.close;
    openTasksLabel.textContent = s.openTasks;
    panel.setAttribute("aria-label", s.eyebrow);

    if (state.payload.shortcut) {
      shortcutEl.textContent = state.payload.shortcut;
      hintLabel.textContent = s.shortcutHint;
      hintEl.hidden = false;
    } else {
      // Naming a chord that was not actually claimed would be a lie.
      hintEl.hidden = true;
    }
  }

  function reportHeight() {
    // A close tears the window down; a measurement queued in the same frame
    // would only reach an IPC sender that is already gone.
    if (state.closing) return;
    if (heightFrame) return;
    heightFrame = requestAnimationFrame(function () {
      heightFrame = null;
      if (!api || !api.reportHeight) return;
      // The window adds its own 8px transparent margin on each side.
      var height = Math.ceil(panel.getBoundingClientRect().height + 16);
      api.reportHeight(height);
    });
  }

  function render(payload, first) {
    state.payload = normalizePayload(payload);
    document.documentElement.lang = state.payload.lang;

    applyChrome();
    renderRows(state.payload.tasks);

    if (first) {
      panel.classList.add("visible");
      requestAnimationFrame(function () {
        try { panel.focus({ preventScroll: true }); } catch (err) { panel.focus(); }
      });
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
    state.closing = true;
    if (heightFrame) {
      cancelAnimationFrame(heightFrame);
      heightFrame = null;
    }
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

  function openTask(id) {
    if (!id) return;
    runAction({ type: "open", id: id });
  }

  function startTask(id) {
    if (!id) return;
    runAction({ type: "start", id: id });
  }

  function openTasks() {
    runAction({ type: "open-tasks" });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  closeBtn.addEventListener("click", closePanel);
  openTasksBtn.addEventListener("click", openTasks);

  document.addEventListener("keydown", function (event) {
    // IME composition owns Escape and the number row until the candidate
    // window closes; reacting mid-word would close the card or open a row.
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Shift+1..4 starts a row; the bare digit still opens it. With Shift held
    // `event.key` is the shifted glyph (Shift+1 is "!"), so the physical digit
    // comes from `event.code` first and `event.key` is the fallback.
    var digit = /^Digit([1-4])$/.exec(event.code || "");
    var index = digit
      ? Number(digit[1]) - 1
      : (event.key >= "1" && event.key <= "4" ? event.key.charCodeAt(0) - 49 : -1);
    if (index < 0) return;

    var row = visibleRows()[index];
    if (!row) return;
    event.preventDefault();
    if (event.shiftKey) startTask(row.dataset.id);
    else openTask(row.dataset.id);
  });

  // Clicking the 8px transparent margin is a click-away, mirroring the notice
  // centre; the main process also closes on window blur.
  document.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    if (event.target === document.body || event.target === document.documentElement) {
      closePanel();
    }
  });

  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(function () { reportHeight(); });
    observer.observe(panel);
  }

  function samplePayload() {
    var now = Date.now();
    return {
      lang: "en",
      theme: "sao",
      total: 3,
      shortcut: "Ctrl+Shift+Alt+B",
      tasks: [
        {
          id: "sample-1",
          title: "Review the Q4 launch checklist before Friday",
          status: "needs_you",
          department: "Engineering",
          materials: 3,
          updatedAt: now - 9 * 60000,
          sessionId: "sample-session",
        },
        {
          id: "sample-2",
          title: "Draft onboarding copy for the new hire page",
          status: "in_progress",
          department: "Marketing",
          materials: 5,
          updatedAt: now - 2 * 3600000,
        },
        {
          id: "sample-3",
          title: "Sort the vendor invoices",
          status: "inbox",
          department: "",
          materials: 0,
          updatedAt: now - 26 * 3600000,
        },
      ],
    };
  }

  function boot() {
    if (!api) {
      // Loaded outside Electron (screenshot harness): show representative rows
      // so both skins can be inspected without the factory.
      applyPayload(samplePayload());
      return;
    }
    if (api.onUpdate) api.onUpdate(applyPayload);
    Promise.resolve(api.load())
      .then(applyPayload)
      .catch(function () { applyPayload({ tasks: [], total: 0, lang: "en" }); });
  }

  boot();
})();
