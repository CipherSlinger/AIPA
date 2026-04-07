# PRD: Daily Planner & Reminders

_Version: 1.0 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Background

AIPA positions itself as a personal AI assistant, but currently lacks basic personal productivity features that users expect from a desktop companion: quick task tracking, reminders, and daily planning. These features don't need to be enterprise-grade — they should be lightweight, fast, and AI-integrated, making AIPA the user's go-to hub for "what do I need to do today?"

## In Scope (3 features)

### Feature 1: Quick Todo List

A simple, persistent todo list accessible from the sidebar (new tab or integrated into an existing panel). Users can quickly add, check off, and delete tasks. Tasks persist in electron-store across app restarts.

**Acceptance Criteria:**
- [x] New "Tasks" section accessible from the sidebar (NavRail icon: CheckSquare, shortcut `Ctrl+8`)
- [x] Add task via text input at top (press Enter to add)
- [x] Tasks show: checkbox, text, optional due date, delete button on hover
- [x] Check/uncheck toggles completion (completed tasks move to bottom with strikethrough)
- [x] Tasks persist in electron-store (key: `aipa:tasks`)
- [x] Drag to reorder tasks
- [x] "Clear completed" button to remove all done tasks
- [x] Maximum 100 tasks (soft limit with warning)

### Feature 2: Quick Reminders

Allow users to set time-based reminders from anywhere in the app. Reminders trigger a desktop notification + in-app toast when the time arrives.

**Acceptance Criteria:**
- [x] "Remind me" option in message context menu → opens a time picker (in 5min, 15min, 30min, 1hr, 2hr, custom time)
- [x] Reminders also creatable from the Tasks panel (button: "Set reminder")
- [x] Active reminders shown as a small list below tasks in the Tasks panel
- [x] When reminder fires: desktop notification with reminder text + in-app toast
- [x] Reminders persist in electron-store; on app start, re-arm any future reminders
- [x] Cancel/delete reminder before it fires

### Feature 3: AI Daily Briefing

Enhance the Welcome screen's Daily Summary card to show an AI-generated daily briefing that includes: weather-like greeting (time-aware), pending tasks count, upcoming reminders, and a motivational or productivity tip. This is NOT an API call — it's a locally-computed summary using existing data.

**Acceptance Criteria:**
- [x] DailySummaryCard shows: greeting, pending task count ("You have N tasks for today"), next upcoming reminder, and a rotating productivity tip
- [x] Tips rotate from a pre-defined list of 20+ tips (stored in a constants file)
- [x] Card updates when tasks/reminders change (reactive via store subscription)
- [x] If no tasks or reminders exist, shows "All clear! Ready to start your day?" message
- [x] Clicking "View tasks" navigates to Tasks panel

## Out of Scope

- Calendar integration (Google Calendar, Outlook)
- Recurring reminders (daily/weekly)
- Task categories or projects
- Syncing tasks across devices
- AI auto-creating tasks from conversations (future PRD)

## Technical Notes

- Tasks and reminders should be stored via IPC to electron-store (main process), NOT localStorage (renderer). This ensures persistence across window reloads and is consistent with the prefs pattern.
- New IPC channels: `tasks:list`, `tasks:add`, `tasks:update`, `tasks:delete`, `reminders:list`, `reminders:add`, `reminders:delete`
- Reminder scheduling in main process uses `setTimeout` with re-arm on app launch
- NavRail needs a new entry: 'tasks' added to NavItem union type (touches `uiStore.ts`)

## File Impact Estimate

- **New files**: `TasksPanel.tsx`, `TaskItem.tsx`, `ReminderPicker.tsx`, `dailyBriefingConstants.ts` (tips list)
- **Modified**: `NavRail.tsx` (new Tasks icon), `uiStore.ts` (new 'tasks' NavItem/SidebarTab), `Sidebar.tsx` (render TasksPanel), `DailySummaryCard.tsx` (briefing content), `MessageContextMenu.tsx` (remind me option), `src/main/ipc/index.ts` (tasks/reminders IPC)
- **i18n**: `en.json`, `zh-CN.json` (tasks.*, reminders.*, dailyBriefing.* namespaces)
- **electron-store**: New keys `aipa:tasks`, `aipa:reminders`

## Priority

P1 — Core personal assistant feature, directly supports the "daily companion" north star
