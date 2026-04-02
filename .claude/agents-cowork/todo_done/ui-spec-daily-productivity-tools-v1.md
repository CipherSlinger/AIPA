# UI Spec: Daily Productivity Tools

_Author: aipa-ui | Date: 2026-04-02_
_Source PRD: prd-daily-productivity-tools-v1.md_

## 1. Focus Timer (Pomodoro) in StatusBar

### Visual Design

**StatusBar placement**: Left side, after existing status items, before version number.

**Idle state**: Clock icon (14px) + "Focus" text (10px, muted). Click to start.

**Active (Focus) state**:
- Layout: `[Timer icon 12px pulsing] [Focus 23:45] [X stop button]`
- Timer text: 11px monospace, color var(--accent), font-weight 600
- Background: subtle accent tint `rgba(0,122,204,0.08)`
- Border: `1px solid rgba(0,122,204,0.2)`
- Border-radius: 12px, padding: 2px 8px
- Stop button (X, 10px) on hover only

**Active (Break) state**:
- Same layout but with green tint
- Timer text: color var(--success)
- Label changes to "Break 4:45"

**Right-click context menu** (simple popup):
- Reset Timer
- Skip to Break / Skip Break
- Duration: 15 min | 25 min | 45 min (active item highlighted)

### Timer State Machine
```
idle -> focus (click)
focus -> short-break (timer ends, notification)
short-break -> focus (timer ends or click)
after 4 focus cycles -> long-break (15 min)
long-break -> idle (timer ends)
any state -> idle (reset)
```

## 2. Daily Activity Summary Card

### Visual Design

**Placement**: Top of WelcomeScreen, above the hero icon, only shown when applicable.

**Card style**:
- Width: 100%, max-width 420px
- Background: linear-gradient(135deg, var(--card-bg), rgba(0,122,204,0.05))
- Border: 1px solid var(--card-border), border-radius: 12px
- Padding: 14px 16px
- Dismiss button (X) top-right corner

**Content layout**:
- Title row: calendar icon + "Daily Summary" / "今日概览" (12px, semibold)
- Stats row (flex, gap 16): sessions today | messages today | tokens today
- Each stat: number (16px bold accent color) + label (10px muted) stacked

### Visibility Logic
- Show only on first open of the day (check localStorage 'aipa:daily-summary-date')
- Or after 2+ hours away (check last interaction timestamp)
- Dismiss saves today's date to localStorage, won't show again today

## 3. StatusBar Date & Session Count

### Visual Design

- Date: compact format matching locale (e.g., "Apr 2" / "4月2日")
- Session count: "3 today" badge, same style as other StatusBar items
- Position: right side of StatusBar, before the version number
- Font: 10px, color var(--text-muted)
- Separated by thin vertical dividers (1px, var(--border))

## I18n Keys

```
focus.title / focus.start / focus.stop / focus.reset
focus.break / focus.longBreak / focus.skipBreak / focus.skipToBreak
focus.duration / focus.min15 / focus.min25 / focus.min45
focus.focusComplete / focus.breakComplete / focus.timeForBreak / focus.backToWork
dailySummary.title / dailySummary.sessionsToday / dailySummary.messagesToday / dailySummary.tokensToday
dailySummary.topics / dailySummary.dismiss
statusBar.today / statusBar.date
```
