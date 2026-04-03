# UI Spec: Session Auto-Organization & Insights

_Version: 1.0 | Date: 2026-04-02 | PRD: prd-session-auto-organization-v1.md_
_Author: agent-leader (acting as UI)_

## 1. Session Auto-Tags

### Visual Design

**Auto-tag display on SessionItem**:
- Same position as regular tags (below session title/preview)
- Font: 10px, italic, color `var(--text-muted)` with `opacity: 0.7`
- Background: `var(--tag-bg)` with `opacity: 0.5` (dimmer than regular tags)
- Border: `1px dashed var(--tag-border)` (dashed to distinguish from solid regular tags)
- Border-radius: 8px, padding: 1px 6px
- Click on auto-tag: tooltip shows "Click to keep as permanent tag" -- clicking converts to regular tag (removes italic, makes solid border)
- X button on hover to remove auto-tag

**Tag taxonomy icons** (optional, inline before tag text):
- coding: `</>`, writing: pencil, research: magnifier, debug: bug, design: palette, data: database, devops: cloud, learning: book, planning: calendar, general: none

### Auto-Tag Generation

```ts
// Keyword -> tag mapping (in sessionUtils.ts)
const TAG_KEYWORDS: Record<string, string[]> = {
  coding: ['function', 'component', 'import', 'class', 'interface', 'const', 'let', 'var', 'tsx', 'jsx', 'css', 'html', 'api', 'endpoint'],
  writing: ['write', 'draft', 'email', 'letter', 'essay', 'blog', 'article', 'document', 'report'],
  research: ['research', 'study', 'paper', 'journal', 'analyze', 'compare', 'survey'],
  debug: ['error', 'bug', 'fix', 'crash', 'fail', 'broken', 'issue', 'stack trace', 'exception'],
  design: ['design', 'layout', 'color', 'font', 'ui', 'ux', 'mockup', 'wireframe'],
  data: ['database', 'sql', 'query', 'table', 'schema', 'csv', 'json', 'data'],
  devops: ['deploy', 'docker', 'ci', 'cd', 'pipeline', 'kubernetes', 'nginx', 'server'],
  learning: ['learn', 'tutorial', 'explain', 'understand', 'how does', 'what is', 'teach'],
  planning: ['plan', 'roadmap', 'timeline', 'milestone', 'sprint', 'task', 'priority', 'schedule'],
}
```

## 2. Session Statistics Dashboard

### Visual Design

**Toggle button** in SessionList header:
- Icon: `BarChart3` (lucide), 14px
- Position: next to existing sort/filter buttons
- Active state: accent color background

**Stats view** (replaces session list when active):

```
┌─────────────────────────────────┐
│ ← Back to List     Session Stats│
│                                 │
│ ▌ This Week                     │
│ Mo ██████░░░░ 6                 │
│ Tu ████░░░░░░ 4                 │
│ We ████████░░ 8                 │
│ Th ██░░░░░░░░ 2                 │
│ Fr ██████████ 10                │
│ Sa ░░░░░░░░░░ 0                 │
│ Su ████░░░░░░ 4                 │
│                                 │
│ ▌ Overview                      │
│ Total sessions:     142         │
│ Total messages:   1,847         │
│ Most active day:  Friday        │
│ Avg messages/session: 13        │
│ Activity streak:  5 days 🔥     │
│                                 │
│ ▌ Top Tags                      │
│ #coding    ████████░░ 34        │
│ #debug     ██████░░░░ 24        │
│ #writing   ████░░░░░░ 16        │
│ #research  ██░░░░░░░░  8        │
└─────────────────────────────────┘
```

- Section headers: 11px, weight 600, `var(--text-muted)`, with `▌` indicator block in accent color
- Bar chart: CSS `div` bars, height 14px, filled portion `var(--accent)`, unfilled `var(--bg-secondary)`, border-radius 3px
- Stats numbers: 14px, weight 700, `var(--accent)`
- Stats labels: 11px, `var(--text-secondary)`
- Streak fire emoji only shows when streak >= 3 days
- "Back to List" button: top-left, icon `ArrowLeft` + text, 11px

### Data Source
All data from `useSessionStore.sessions` array. Weekly chart computed from `session.timestamp` grouping. No new data collection or IPC calls needed.

## 3. Session Color Labels

### Visual Design

**Context menu addition**:
- New submenu item: "Color Label" / "颜色标记" with `Palette` icon
- Submenu shows 6 color circles (12px diameter) in a row + "None" option
- Colors: red `#ef4444`, orange `#f97316`, yellow `#eab308`, green `#22c55e`, blue `#3b82f6`, purple `#a855f7`

**Session item left border**:
- Width: 3px left border on SessionItem container
- Color: the assigned color label
- No border when no color assigned (default)
- Border-radius on left side: 3px (match SessionItem border-radius)

### Data Model
```ts
// In usePrefsStore
sessionColorLabels: Record<string, string> // sessionId -> color hex
```

## I18n Keys

```
session.autoTag / session.keepTag / session.removeAutoTag
session.stats / session.statsTitle / session.backToList
session.thisWeek / session.overview / session.totalSessions / session.totalMessages
session.mostActiveDay / session.avgMessages / session.activityStreak
session.topTags / session.colorLabel / session.removeColor
```
