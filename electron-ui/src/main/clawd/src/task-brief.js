/**
 * task-brief.js — renderer for the pet's "Today" task card.
 *
 * The main process owns the task store, the window, positioning and focus.
 * This page asks for a payload, paints every row of the desk, reports the
 * height the whole list wants so the window can grow to fit it (main clamps to
 * the card's cap and work area, and the list then scrolls), and sends one
 * action per gesture. It never imports the app's locale JSON: the pet speaks
 * en/zh/ko, and the payload carries which one plus every string.
 */
(function () {
  "use strict";

  var api = window.taskBriefAPI || null;

  var panel = document.getElementById("panel");
  var eyebrowEl = document.getElementById("eyebrow");
  var countEl = document.getElementById("count");
  var rangeEl = document.getElementById("range");
  var dateEl = document.getElementById("date");
  var closeBtn = document.getElementById("closeBtn");
  var listEl = document.getElementById("list");
  var emptyEl = document.getElementById("empty");
  var openTasksBtn = document.getElementById("openTasksBtn");
  var openTasksLabel = document.getElementById("openTasksLabel");
  var hintEl = document.getElementById("hint");
  var shortcutEl = document.getElementById("shortcut");
  var hintLabel = document.getElementById("hintLabel");
  var errorEl = document.getElementById("error");
  var undoEl = document.getElementById("undo");
  var undoTextEl = document.getElementById("undoText");
  var undoBtn = document.getElementById("undoBtn");

  var STATUSES = ["needs_you", "in_progress", "assigned", "ready", "inbox"];
  // How many rows the number chords name. `1`–`4` have always meant the first
  // four tasks on the desk, and they still do: the list scrolls the rest into
  // view, but the chords keep naming the same four rows, which is exactly what
  // the range indicator says. A row past the fourth gets no key badge.
  var KEYED_ROWS = 4;
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
    range: "{start}–{end} of {total}",
    scroll: "scroll",
    dueToday: "TODAY",
    dueTomorrow: "TOMORROW",
    dueLate: "{n}D LATE",
    start: "Start",
    startHint: "Start work on this task",
    done: "Done",
    doneHint: "Mark this task done",
    doneFailed: "Could not finish the task. Try again.",
    doneUndelivered: "Task finished, but AIPA was closed and its task list was not refreshed.",
    deferLabel: "Move the due day to tomorrow",
    deferHint: "Push this task to tomorrow",
    deferFailed: "Could not move the due day. Try again.",
    deferLine: "Due tomorrow · {name}",
    deferUndoFailed: "Could not put the due day back. Try again.",
    repeatLine: "Done · next {when} · {name}",
    repeatUndoFailed: "Could not put the task back on its old day. Try again.",
    undoLine: "Task done · {name}",
    undo: "Undo",
    undoFailed: "Could not restore the task. It may have been archived or changed since.",
    undoUndelivered: "Task restored, but AIPA was closed and its task list was not refreshed.",
  };

  var LOCALES = { en: "en-US", zh: "zh-CN", ko: "ko-KR" };

  var state = {
    payload: { tasks: [], total: 0, lang: "en", theme: "sao", labels: FALLBACK_LABELS, shortcut: "" },
    booted: false,
    closing: false,
  };

  var heightFrame = null;
  // The Undo line's own clock. Main owns the deadline; this timer only hides
  // the control when the window it describes has closed.
  var undoTimer = null;
  // True from the click until the answer paints. It is the page's half of the
  // "never write twice" rule; main holds the other half.
  var undoBusy = false;
  // Set when a defer click is waiting for its answer. That action rebuilds the
  // rows, so the button the user pressed is replaced; remembering which task
  // it named lets the fresh row keep the focus instead of dropping it to the
  // document and breaking keyboard flow.
  var pendingDeferFocus = "";
  // Set when a Done click is waiting for its answer. A one-off finish removes
  // the row, so that focus has nowhere to stay; a repeating finish keeps the
  // row and the repaint rebuilds the pressed control, so this remembers which
  // row should get its Done button back.
  var pendingDoneFocus = "";

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
      // A due day is a stored calendar day, never an instant. A malformed value
      // is dropped rather than formatted into a date that was never stored.
      dueOn: typeof value.dueOn === "string" && parseDueDay(value.dueOn) ? value.dueOn : "",
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
    // The count must never describe fewer rows than the page is holding; a
    // truncated payload from an older main would otherwise lie in the other
    // direction. The current main sends the whole desk, so this is a no-op.
    total = Math.max(total, tasks.length);
    var incoming = data.labels && typeof data.labels === "object" ? data.labels : {};
    var merged = {};
    for (var key in FALLBACK_LABELS) {
      if (Object.prototype.hasOwnProperty.call(FALLBACK_LABELS, key)) {
        merged[key] = typeof incoming[key] === "string" && incoming[key]
          ? incoming[key]
          : FALLBACK_LABELS[key];
      }
    }
    // The Undo offer is only what main says it is: an id, the name to show and
    // the instant main will stop accepting it. Anything malformed is simply no
    // offer — a line that cannot restore the right task must not appear.
    var undo = null;
    if (data.undo && typeof data.undo === "object") {
      var raw = data.undo;
      if (typeof raw.id === "string" && raw.id &&
          typeof raw.expiresAt === "number" && isFinite(raw.expiresAt)) {
        // Which change the line offers to put back. An older main sends no
        // kind; its only offer was a finish, so that is the safe default.
        var kind = raw.kind === "defer" ? "defer" : raw.kind === "repeat" ? "repeat" : "done";
        // The repeat line names the day the row moved to, so an offer without
        // a real day could only paint a half sentence. Such an offer is no
        // offer, the same rule every other malformed field follows.
        var nextDueOn = typeof raw.nextDueOn === "string" && parseDueDay(raw.nextDueOn)
          ? raw.nextDueOn
          : "";
        if (kind !== "repeat" || nextDueOn) {
          undo = {
            id: raw.id,
            title: typeof raw.title === "string" ? raw.title : "",
            kind: kind,
            nextDueOn: nextDueOn,
            expiresAt: raw.expiresAt,
          };
        }
      }
    }
    return {
      tasks: tasks,
      total: total,
      lang: data.lang === "zh" || data.lang === "ko" ? data.lang : "en",
      theme: data.theme === "clawd" ? "clawd" : "sao",
      labels: merged,
      shortcut: typeof data.shortcut === "string" ? data.shortcut : "",
      // An action may answer with one honest line about why it did not land.
      // It lives on this payload only, so the next refresh clears it.
      error: typeof data.error === "string" ? data.error : "",
      undo: undo,
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

  // ── Due days ───────────────────────────────────────────────────────────────
  // These mirror `todayLocalDay` / `parseDueDay` / `dueInfo` in
  // src/renderer/components/tasks/taskUi.ts. Main and the renderer have no
  // shared source root, so the brief keeps its own copy, exactly as
  // `statusNote()` mirrors `taskWaitingReason()`. Keep the arithmetic in step: a
  // due date is a local calendar day, and the gap is counted in UTC so DST can
  // never turn it into the wrong day.

  /** Today as a local `YYYY-MM-DD` day. Read fresh on every paint. */
  function todayLocalDay(now) {
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  /** Parse a stored day into calendar components; null when it is not one. */
  function parseDueDay(value) {
    if (!value) return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
      return null;
    }
    return { year: year, month: month, day: day };
  }

  /** Where a due day sits relative to today; `days` is negative when overdue. */
  function dueInfo(dueOn, today) {
    var target = parseDueDay(dueOn);
    var base = parseDueDay(today);
    if (!target || !base) return null;
    var targetMs = Date.UTC(target.year, target.month - 1, target.day);
    var baseMs = Date.UTC(base.year, base.month - 1, base.day);
    var days = Math.round((targetMs - baseMs) / 86400000);
    var state = days < 0 ? "overdue" : days === 0 ? "today" : days === 1 ? "tomorrow" : "future";
    return { state: state, days: days };
  }

  /** A short future day (`NOV 5` / `11月5日`), never a time. */
  function shortDueDay(dueOn) {
    var parsed = parseDueDay(dueOn);
    if (!parsed) return dueOn;
    try {
      return new Intl.DateTimeFormat(LOCALES[state.payload.lang] || LOCALES.en, {
        month: "short",
        day: "numeric",
      }).format(new Date(parsed.year, parsed.month - 1, parsed.day)).toUpperCase();
    } catch (err) {
      return dueOn;
    }
  }

  /**
   * The compact marker for one row, or null when the row carries no due day.
   * Overdue and today are the warning states; tomorrow and later stay muted so
   * a card with ordinary future work does not cry wolf.
   *
   * `deferrable` says whether pressing the marker could change anything. The
   * marker's action writes tomorrow, so only a row due today or already late is
   * a deferral: tomorrow would be a no-op, and a later day would be pulled
   * *earlier* — which is not what "move the due day to tomorrow" promises. Those
   * rows keep a plain word: a fact about the row, not a control. "Tomorrow" here
   * is the same local calendar comparison that chooses the word below — there is
   * no second notion of the day anywhere on this page.
   */
  function dueMarker(task) {
    if (!task.dueOn) return null;
    var info = dueInfo(task.dueOn, todayLocalDay(new Date()));
    if (!info) return null;
    var deferrable = info.state === "overdue" || info.state === "today";
    if (info.state === "overdue") {
      var late = labels().dueLate || FALLBACK_LABELS.dueLate;
      return { text: late.replace("{n}", String(-info.days)), warn: true, deferrable: deferrable };
    }
    if (info.state === "today") {
      return { text: labels().dueToday || FALLBACK_LABELS.dueToday, warn: true, deferrable: deferrable };
    }
    if (info.state === "tomorrow") {
      return { text: labels().dueTomorrow || FALLBACK_LABELS.dueTomorrow, warn: false, deferrable: deferrable };
    }
    return { text: shortDueDay(task.dueOn), warn: false, deferrable: deferrable };
  }

  /**
   * The marker's word for one stored day, for a line that quotes a day. Going
   * through dueMarker keeps the rule in one place: the quiet line and the row
   * under it must never name the same day two different ways.
   */
  function dayWord(dueOn) {
    var marker = dueMarker({ dueOn: dueOn });
    return marker ? marker.text : dueOn;
  }

  function visibleRows() {
    return Array.prototype.slice.call(listEl.querySelectorAll(".row"));
  }

  // ── Range indicator ────────────────────────────────────────────────────────
  // The count badge says how many tasks are on the desk; this line says which
  // of them the 1–4 chords name, and whether there are more rows below the
  // fold. It is hidden at four or fewer tasks because nothing there needs
  // qualifying.

  function rangeFact() {
    var total = state.payload.total;
    if (total <= KEYED_ROWS) return "";
    var raw = labels().range || FALLBACK_LABELS.range;
    return raw
      .replace("{start}", "1")
      .replace("{end}", String(KEYED_ROWS))
      .replace("{total}", String(total));
  }

  /**
   * True when an actual row sits outside the box showing it. The raw
   * scrollHeight can exceed the client box by the list's own trailing padding;
   * that is not a hidden row, so the indicator must not claim there is one.
   */
  function listScrolls() {
    if (listEl.hidden || listEl.scrollHeight - listEl.clientHeight <= 1) return false;
    var wraps = listEl.querySelectorAll(".row-wrap");
    if (!wraps.length) return false;
    var last = wraps[wraps.length - 1];
    return last.offsetTop + last.offsetHeight > listEl.clientHeight + 1;
  }

  function rangeLine() {
    var fact = rangeFact();
    if (!fact) return "";
    return listScrolls()
      ? fact + " · " + (labels().scroll || FALLBACK_LABELS.scroll)
      : fact;
  }

  /**
   * Write the fact into the head and into the dialog's accessible name. The
   * aria-label repeats it because a screen reader landing on the card should
   * hear the same qualification the visible count carries, not just "Task
   * brief". Called after every render and after every relayout: whether the
   * list scrolls depends on the window height main just applied.
   */
  function updateRangeFact() {
    var fact = rangeFact();
    var line = fact ? rangeLine() : "";
    rangeEl.textContent = line;
    rangeEl.hidden = !fact;
    var eyebrow = labels().eyebrow;
    panel.setAttribute("aria-label", fact ? eyebrow + ", " + line : eyebrow);
  }

  /** Keep the scrollbar's thumb visible for a moment after real scrolling. */
  var scrollTimer = null;
  function markScrolling() {
    listEl.classList.add("scrolling");
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      listEl.classList.remove("scrolling");
    }, 650);
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

  function buildDoneButton(task) {
    var done = document.createElement("button");
    done.type = "button";
    done.className = "done";
    done.setAttribute("aria-label", labels().done);
    done.title = labels().doneHint || labels().done;
    done.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    done.addEventListener("click", function (event) {
      // Same sibling rule as Start: never let this click fall through to open.
      event.stopPropagation();
      doneTask(task.id);
    });
    return done;
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

    // Only the first four rows have a number chord. The rest keep the same
    // leading slot (so titles stay aligned) but draw no badge, because a badge
    // there would name a key that does nothing.
    var keyed = index < KEYED_ROWS;
    var key = document.createElement("span");
    key.className = keyed ? "key" : "key blank";
    key.setAttribute("aria-hidden", "true");
    key.textContent = keyed ? String(index + 1) : "";

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

    // The due marker rides the existing meta line, so it adds no row line and
    // no height. It leads the line on purpose: a long department or material
    // count may ellipsize, but the day the work is owed must stay legible. An
    // undated row adds nothing at all, not even a separator.
    var marker = dueMarker(task);
    if (marker) {
      // On a row due today or already late the marker is the row's third action:
      // pressing it pushes the day to tomorrow. It stays a bare word — same
      // text, colour and size as any other marker — so the card still reads as a
      // brief at a glance;
      // only the pointer cursor and a hover/focus underline say it is pressable.
      // It sits inside the row, so its click must stop before the row opens the
      // task, exactly like Start and Done do from their sibling slot.
      var due;
      if (marker.deferrable) {
        due = document.createElement("button");
        due.type = "button";
        due.className = marker.warn ? "due defer due-warn" : "due defer";
        // The visible mark is a word, so the accessible name and tooltip carry
        // the action's words, like Start and Done do.
        due.setAttribute("aria-label", labels().deferLabel || FALLBACK_LABELS.deferLabel);
        due.title = labels().deferHint || labels().deferLabel || FALLBACK_LABELS.deferHint;
        due.addEventListener("click", function (event) {
          event.stopPropagation();
          deferTask(task.id);
        });
      } else {
        // Due tomorrow or later: the write would land on the day the row already
        // has, or pull a future deadline earlier. Either way this is the same
        // plain word an undated row's meta line uses — a box with no role, no
        // tab stop and no action attached. A control here would promise a
        // change it cannot make.
        due = document.createElement("span");
        due.className = marker.warn ? "due due-warn" : "due";
      }
      due.textContent = marker.text;
      meta.insertBefore(due, meta.firstChild);
      var dueSep = document.createElement("span");
      dueSep.className = "sep";
      dueSep.textContent = "·";
      meta.insertBefore(dueSep, due.nextSibling);
    }

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

    // Start and Done sit beside the row rather than inside it: nesting a real
    // <button> in the row's <button> is invalid markup. The due marker above is
    // the one exception — it has to ride the meta line to keep the row's height
    // — so it is a nested button whose click is stopped before the row sees it.
    // The wrapper is what anchors the trailing affordances at the row's edge.
    var wrap = document.createElement("div");
    wrap.className = "row-wrap";
    wrap.dataset.id = task.id;
    wrap.appendChild(row);
    // Done is left of Start, so it is appended first: tab order then runs
    // left-to-right across the pair.
    wrap.appendChild(buildDoneButton(task));
    wrap.appendChild(buildStartButton(task));
    return wrap;
  }

  /**
   * Paint every row. `resetScroll` is true only for the first paint of a card.
   *
   * A repaint while the card stays up — the answer to a row action, a refresh
   * arriving from main — must leave the user where they were reading: emptying
   * the list clamps its offset to zero, so the old offset is carried across the
   * rebuild instead of being deliberately reset. Only a (re)opened card starts
   * at the top, because the range line names rows 1–4 and those must be the
   * ones in sight when the desk first appears.
   */
  function renderRows(tasks, resetScroll) {
    var previousTop = listEl.scrollTop;
    listEl.textContent = "";
    for (var i = 0; i < tasks.length; i++) listEl.appendChild(buildRow(tasks[i], i));
    var hasRows = tasks.length > 0;
    listEl.hidden = !hasRows;
    emptyEl.hidden = hasRows;
    emptyEl.textContent = hasRows ? "" : labels().empty;
    // A shorter desk clamps the restored offset on its own, which is exactly
    // what should happen when rows have left the card.
    listEl.scrollTop = resetScroll ? 0 : previousTop;
    updateRangeFact();
  }

  function clearUndoTimer() {
    if (!undoTimer) return;
    clearTimeout(undoTimer);
    undoTimer = null;
  }

  function hideUndo() {
    clearUndoTimer();
    undoEl.hidden = true;
    undoTextEl.textContent = "";
    undoBtn.textContent = labels().undo;
    undoBtn.disabled = false;
  }

  /**
   * Draw the one post-action offer (a finish or a due-day move), or clear it.
   *
   * The line is a single in-flow row, so it grows the card by exactly its own
   * height and can never cover the footer. The title takes the remaining width
   * and ellipsizes; the Undo button keeps its intrinsic size, so the control
   * stays reachable on a narrow or long-named task. Reduced motion applies in
   * CSS: the only animation this element has is an opacity fade.
   */
  function applyUndo() {
    clearUndoTimer();
    var offer = state.payload.undo;
    if (!offer) {
      hideUndo();
      undoBusy = false;
      return;
    }
    var remaining = offer.expiresAt - Date.now();
    if (!(remaining > 0)) {
      hideUndo();
      undoBusy = false;
      return;
    }

    // One line, three verbs: a finish offers the old status back, a due-day
    // move and a repeating finish both offer the old day. A repeat line also
    // names the day the row moved to, in the marker's own words. All use the
    // same Undo control and the same clock.
    var line;
    if (offer.kind === "defer") {
      line = labels().deferLine || FALLBACK_LABELS.deferLine;
    } else if (offer.kind === "repeat") {
      line = (labels().repeatLine || FALLBACK_LABELS.repeatLine)
        .replace("{when}", dayWord(offer.nextDueOn));
    } else {
      line = labels().undoLine || FALLBACK_LABELS.undoLine;
    }
    var name = offer.title || labels().untitled;
    undoTextEl.textContent = line.indexOf("{name}") !== -1
      ? line.replace("{name}", name)
      : line + " · " + name;
    undoBtn.textContent = labels().undo;
    undoBtn.setAttribute("aria-label", labels().undo);
    undoBtn.title = labels().undo;
    undoBtn.disabled = !!undoBusy;
    undoEl.hidden = false;

    undoTimer = setTimeout(function () {
      undoTimer = null;
      // Quiet expiry: no message, no animation, the line is simply gone. A
      // newer payload has already replaced this one if it arrived in between.
      if (state.payload.undo && state.payload.undo.id === offer.id) {
        state.payload.undo = null;
      }
      hideUndo();
    }, remaining);
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
    // The card's aria-label is written by updateRangeFact(), which knows the
    // range as well as the eyebrow.

    // One honest line about a row action that did not land. The card has no
    // toast; this note sits where the footer begins and clears on the next
    // payload, so a refusal can never masquerade as success.
    if (state.payload.error) {
      errorEl.textContent = state.payload.error;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = "";
      errorEl.hidden = true;
    }

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
      // The list may be scrolled: its client box is then shorter than its
      // content, so the panel alone under-reports. Add back what the scroll
      // hides to report what the whole desk wants; main clamps that to its cap
      // and work area, and the list scrolls the difference.
      updateRangeFact();
      if (!api || !api.reportHeight) return;
      var rect = panel.getBoundingClientRect();
      var hiddenByScroll = listEl.hidden
        ? 0
        : Math.max(0, listEl.scrollHeight - listEl.clientHeight);
      // The window adds its own 8px transparent margin on each side.
      var height = Math.ceil(rect.height + hiddenByScroll + 16);
      api.reportHeight(height);
    });
  }

  function render(payload, first) {
    state.payload = normalizePayload(payload);
    document.documentElement.lang = state.payload.lang;

    applyChrome();
    renderRows(state.payload.tasks, first);
    applyUndo();

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

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err) {
      return false;
    }
  }

  /**
   * Collapse one finished row before the fresh payload is painted. The row is
   * already gone from that payload, so repainting first would snap the card
   * shorter; letting the wrapper reach zero height lets the window follow it
   * down and keeps the rows below from jumping. A short fallback timer covers
   * a transition that never fires because the window was hidden mid-animation.
   */
  function animateRowOut(wrap, done) {
    if (!wrap || prefersReducedMotion()) { done(); return; }
    var height = wrap.getBoundingClientRect().height;
    if (!height) { done(); return; }

    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      wrap.removeEventListener("transitionend", onEnd);
      done();
    }
    function onEnd(event) {
      if (event.target === wrap && event.propertyName === "height") finish();
    }

    wrap.style.height = height + "px";
    wrap.style.overflow = "hidden";
    // Force the starting height to settle before the transition class turns
    // on, or the browser batches both styles and paints no animation at all.
    void wrap.offsetHeight;
    wrap.classList.add("leaving");
    void wrap.offsetHeight;
    wrap.style.height = "0px";
    wrap.addEventListener("transitionend", onEnd);
    setTimeout(finish, 260);
  }

  /**
   * An action that finished a task names the row it removed. Keep that row on
   * screen for one short collapse, then paint the payload the main process
   * already rebuilt. Every other action repaints immediately.
   */
  function applyActionResult(payload) {
    var finished = payload && typeof payload.finished === "string" ? payload.finished : "";
    var wrap = null;
    if (finished) {
      var wraps = listEl.querySelectorAll(".row-wrap");
      for (var i = 0; i < wraps.length; i++) {
        if (wraps[i].dataset.id === finished) { wrap = wraps[i]; break; }
      }
    }
    if (wrap) {
      animateRowOut(wrap, function () {
        render(payload, false);
        restoreDeferFocus();
        restoreDoneFocus();
      });
    } else {
      render(payload, false);
      restoreDeferFocus();
      restoreDoneFocus();
    }
  }

  /**
   * Put focus back on the task that was just moved. The repaint rebuilds every
   * row, so the pressed control is gone even though its row (possibly at a new
   * position) is still here. The row now carries tomorrow, so its marker is
   * plain text rather than a button; focus therefore falls back to the row
   * itself, which keeps keyboard flow anchored on the same task.
   *
   * `preventScroll` keeps the document still while focusing, but the row has
   * re-sorted under its new day: `scrollIntoView({ block: "nearest" })` brings
   * it inside the list's own box without moving anything outside the card.
   */
  function restoreDeferFocus() {
    if (!pendingDeferFocus) return;
    var id = pendingDeferFocus;
    pendingDeferFocus = "";
    var wraps = listEl.querySelectorAll(".row-wrap");
    for (var i = 0; i < wraps.length; i++) {
      if (wraps[i].dataset.id !== id) continue;
      var target = wraps[i].querySelector(".defer") || wraps[i].querySelector(".row");
      if (!target) return;
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (err) { /* older engines: the offset is already preserved */ }
      return;
    }
  }

  /**
   * Put focus back on the Done button of a task that stayed on the card. Only
   * a repeating finish does: a one-off finish removed its row, so nothing is
   * found and focus stays wherever the disappearing control left it.
   */
  function restoreDoneFocus() {
    if (!pendingDoneFocus) return;
    var id = pendingDoneFocus;
    pendingDoneFocus = "";
    var wraps = listEl.querySelectorAll(".row-wrap");
    for (var i = 0; i < wraps.length; i++) {
      if (wraps[i].dataset.id !== id) continue;
      var btn = wraps[i].querySelector(".done");
      if (!btn) return;
      try { btn.focus({ preventScroll: true }); } catch (err) { btn.focus(); }
      return;
    }
  }

  function runAction(action) {
    if (!api || !api.action) { pendingDeferFocus = ""; pendingDoneFocus = ""; return; }
    Promise.resolve(api.action(action))
      .then(function (payload) {
        if (payload) applyActionResult(payload);
      })
      .catch(function () {
        // "open" destroys the window before replying; a rejected promise here
        // is the expected end of this renderer, not an error to surface.
        pendingDeferFocus = "";
        pendingDoneFocus = "";
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

  function doneTask(id) {
    if (!id) return;
    pendingDoneFocus = id;
    runAction({ type: "done", id: id });
  }

  function deferTask(id) {
    if (!id) return;
    pendingDeferFocus = id;
    runAction({ type: "defer", id: id });
  }

  function undoTask() {
    // The offer is the only thing Undo is allowed to restore, and it may be
    // consumed once. Disable before the invoke leaves so a double click — or
    // Enter followed by a click — cannot queue a second write; main enforces
    // the same rule on its side of the boundary.
    var offer = state.payload.undo;
    if (!offer || undoBusy) return;
    undoBusy = true;
    undoBtn.disabled = true;
    clearUndoTimer();
    runAction({ type: "undo", id: offer.id });
  }

  function openTasks() {
    runAction({ type: "open-tasks" });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  closeBtn.addEventListener("click", closePanel);
  openTasksBtn.addEventListener("click", openTasks);
  // A real button: Tab reaches it and Enter/Space activate it through the
  // browser's native click, so no new global chord is introduced.
  undoBtn.addEventListener("click", undoTask);

  // The wheel is native on the list; this only reveals the auto-hidden thumb
  // while the user is actually moving it.
  listEl.addEventListener("scroll", markScrolling);

  // Main sets the window height after each measurement. Whether the list
  // scrolls depends on that height, so the range line's "scroll" word is
  // refreshed here, not only at render time.
  window.addEventListener("resize", function () {
    updateRangeFact();
    reportHeight();
  });

  document.addEventListener("keydown", function (event) {
    // IME composition owns Escape and the number row until the candidate
    // window closes; reacting mid-word would close the card or open a row.
    if (event.isComposing || event.keyCode === 229) return;
    // Holding a chord must mean one action. Auto-repeat would fire it against
    // whatever row now sits at that index after the list repainted — holding
    // Alt+1 would finish task after task instead of one keypress.
    if (event.repeat) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    // Ctrl/Meta belong to the OS and the app; Alt and Shift are ours. Alt+digit
    // is not claimed by any menu in this window (it has no menu bar, and the
    // app template defines no Alt accelerator), so it reaches this handler.
    if (event.ctrlKey || event.metaKey) return;

    // Scrolling the desk's overflow. These keys are only claimed while the
    // list actually scrolls, never touch the number row, and are plain (no
    // Alt/Shift) so they cannot shadow the row chords.
    if (!event.altKey && !event.shiftKey && listScrolls()) {
      var page = Math.max(40, listEl.clientHeight - 40);
      var target = null;
      if (event.key === "ArrowDown") target = listEl.scrollTop + 40;
      else if (event.key === "ArrowUp") target = listEl.scrollTop - 40;
      else if (event.key === "PageDown") target = listEl.scrollTop + page;
      else if (event.key === "PageUp") target = listEl.scrollTop - page;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = listEl.scrollHeight;
      if (target !== null) {
        event.preventDefault();
        // The browser clamps both ends, so a held key never overshoots.
        listEl.scrollTop = target;
        return;
      }
    }

    // Shift+1..4 starts a row, Alt+1..4 finishes it, the bare digit still opens
    // it. With Shift held `event.key` is the shifted glyph (Shift+1 is "!"),
    // and Alt+digit can vary by layout, so the physical digit comes from
    // `event.code` first and `event.key` is the fallback.
    var digit = /^Digit([1-4])$/.exec(event.code || "");
    var index = digit
      ? Number(digit[1]) - 1
      : (event.key >= "1" && event.key <= "4" ? event.key.charCodeAt(0) - 49 : -1);
    if (index < 0) return;

    var row = visibleRows()[index];
    if (!row) return;
    event.preventDefault();
    if (event.altKey) doneTask(row.dataset.id);
    else if (event.shiftKey) startTask(row.dataset.id);
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
