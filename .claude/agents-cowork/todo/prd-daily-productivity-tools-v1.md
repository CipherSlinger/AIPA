# PRD: Daily Productivity Tools

_Author: aipa-pm | Date: 2026-04-02_

## Context

As a personal AI assistant, AIPA should help users manage their daily productivity beyond just AI conversations. Currently the app lacks lightweight built-in productivity tools that an assistant should offer -- things like a focus timer, quick calculator widget, and daily activity summary.

## In Scope

### 1. Focus Timer (Pomodoro)

**Problem**: Users who work with AIPA for extended periods need focus/break reminders. A built-in Pomodoro timer reinforces AIPA's role as a productivity companion, not just a chat interface.

**Solution**:
- Add a small timer widget in the StatusBar (bottom of the app), next to the existing token/cost display
- Click the timer icon (Clock) to start a 25-minute focus session
- Timer displays countdown: "Focus 23:45" in StatusBar
- When focus period ends, show a desktop notification + gentle in-app toast: "Time for a break!"
- Short break: 5 minutes (auto-starts after focus ends, user can dismiss)
- After 4 focus cycles, suggest a long break (15 min)
- Timer state: idle -> focus -> short-break -> focus -> ... -> long-break
- Right-click timer icon for: Reset, Skip to Break, Change Duration (15/25/45 min presets)
- Timer state persists across view changes (not across app restarts)

**Impact**: StatusBar.tsx (new FocusTimer component embedded), FocusTimer.tsx (new), en.json + zh-CN.json

### 2. Daily Activity Summary Card

**Problem**: Users don't have visibility into their daily AIPA usage patterns. A summary helps them reflect on how they used their AI assistant today.

**Solution**:
- When the user opens AIPA after being away for 2+ hours (or first open of the day), show a dismissible "Daily Summary" card at the top of the WelcomeScreen
- Summary shows: sessions today, messages sent today, most-used persona, total estimated tokens today
- "Yesterday you had N conversations about [top topics]" -- topics derived from session titles
- Card has a "Dismiss" (X) button and doesn't show again until next day
- Data sourced from existing session store (no new data collection needed)

**Impact**: WelcomeScreen.tsx (DailySummaryCard sub-component), en.json + zh-CN.json

### 3. StatusBar Enhancements

**Problem**: The StatusBar has room for more useful at-a-glance information that reinforces the "always-on assistant" feel.

**Solution**:
- Add current date display (compact format: "Apr 2") next to the timer
- Add a "session count today" micro-badge (e.g., "3 sessions" small text)
- These are informational only, no interaction needed
- Compact display: icon + text, same style as existing StatusBar items

**Impact**: StatusBar.tsx (additional info items), en.json + zh-CN.json

## Out of Scope

- Calendar integration (requires system-level permissions)
- Todo list (overlaps with external tools)
- Habit tracking
- Cross-day analytics / charts

## Success Criteria

- Focus timer starts/stops from StatusBar with visual countdown
- Desktop notification fires when focus period ends
- Daily summary card appears on first daily open with correct stats
- Date display visible in StatusBar
- All text i18n-ized (en + zh-CN)
- Build succeeds
