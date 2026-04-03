# PRD: Notification Center & Connection Status

_Version: v1 | Date: 2026-04-03 | Author: aipa-pm_

## Background

AIPA currently shows toast notifications for various events (errors, success messages, etc.) but toasts are ephemeral -- they disappear after a few seconds. Users have no way to review past notifications. Additionally, the app lacks a persistent connection status indicator showing whether the CLI backend and model providers are reachable.

## In Scope

### 1. Notification History Panel
- Add a Bell icon to the NavRail (between existing nav items)
- Clicking opens a notification history panel in the sidebar
- Stores the last 50 notifications in memory (not persisted to disk)
- Each notification entry shows: icon (success/error/info/warning), message text, relative timestamp
- "Clear All" button at the top
- Unread count badge on the Bell icon (count of notifications since last panel open)
- Notifications are the same events currently shown as toasts -- simply also stored in a history array

### 2. Connection Status Indicator in StatusBar
- Add a small connectivity dot to the StatusBar (left zone, next to model name)
- Green dot: CLI process is running and responsive
- Yellow dot: CLI process exists but last health check had warnings
- Red dot: CLI process is not running or last command failed
- Clicking the dot opens the System Diagnostics panel
- Status is derived from existing streaming/PTY state -- no new health check polling needed

### 3. Auto-Dismiss Improvement for Toasts
- Error toasts should persist longer (8 seconds instead of current default)
- Success toasts remain at current duration (3 seconds)
- Add a small "X" close button on each toast for manual dismiss
- Toast messages should be single-line with ellipsis overflow (not wrap to multi-line)

## Out of Scope
- Push notifications to external services
- Notification sound effects
- Notification filtering or categories
- Persisting notifications across app restarts

## Acceptance Criteria
- [ ] Bell icon in NavRail opens notification history panel
- [ ] Unread badge shows count of unseen notifications
- [ ] Last 50 notifications stored and visible in history
- [ ] StatusBar shows connection dot (green/yellow/red)
- [ ] Error toasts persist for 8 seconds; all toasts have close button
- [ ] All new UI text has i18n (en + zh-CN)

## Priority
P2 -- Improves user awareness and reduces information loss
