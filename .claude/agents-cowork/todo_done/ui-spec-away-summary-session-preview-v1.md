# UI Spec: Away Summary + Session Preview

_Version: 1.0 | Date: 2026-04-01 | Paired with: prd-away-summary-session-preview-v1.md_

## Feature 1: Away Summary in IdleReturnDialog

### Layout

The IdleReturnDialog (existing component) currently shows:
```
[X close]
  "Welcome back!" title
  idle duration text
  context usage bar
  [Continue] [New Conversation] buttons
  "Don't ask again" link
```

Updated layout:
```
[X close]
  "Welcome back!" title
  idle duration text

  --- away-summary section ---
  [Sparkles icon] "Here's where you left off:"  (label in --text-muted)
  "You were working on X. The next step is Y."  (summary text, --text-primary, 13px, max 3 lines)
  or
  [Loader icon] "Generating summary..."          (loading state, --text-muted, italic)
  --- end summary section ---

  context usage bar
  [Continue] [New Conversation] buttons
  "Don't ask again" link
```

### Styling

- Summary section: `margin: 12px 0`, `padding: 10px 14px`, `background: var(--card-bg)`, `borderRadius: 8px`, `border: 1px solid var(--card-border)`
- Label: `fontSize: 11px`, `color: var(--text-muted)`, `display: flex`, `alignItems: center`, `gap: 6px`
- Sparkles icon: `size: 14`, `color: var(--accent)`
- Summary text: `fontSize: 13px`, `lineHeight: 1.5`, `color: var(--text-primary)`, `marginTop: 6px`
- Loading state: `fontSize: 12px`, `color: var(--text-muted)`, `fontStyle: italic`
- Loader icon: `size: 12`, spinning via CSS `animation: spin 1s linear infinite`

## Feature 2: Session Preview Panel

### Layout

The preview panel replaces the existing simple hover tooltip (It.90) with a richer panel:

```
┌──────────────────────────────────────────┐
│ Session Title                    [×]     │
│ ~/project/path         2m ago           │
├──────────────────────────────────────────┤
│ 👤 User                          14:30  │
│ Can you help me refactor the auth...     │
│                                          │
│ 🤖 AI                           14:31   │
│ Sure! I'll start by analyzing the...     │
│                                          │
│ 👤 User                          14:35  │
│ Great, also check the database conn...   │
│                                          │
│ 🤖 AI                           14:36   │
│ Looking at the database connection...    │
│                                          │
│ 👤 User                          14:40  │
│ Can you add error handling to...         │
└──────────────────────────────────────────┘
```

### Positioning

- Position: `fixed`, right of session list panel (or below on narrow viewports)
- Width: `320px`
- Max height: `400px` with overflow-y auto
- Z-index: above session list but below modals

### Styling

- Container: `background: var(--popup-bg)`, `border: 1px solid var(--popup-border)`, `borderRadius: 10px`, `boxShadow: var(--popup-shadow)`, `animation: popup-in 0.15s ease`
- Header: `padding: 12px 14px`, `borderBottom: 1px solid var(--popup-border)`
- Title: `fontSize: 13px`, `fontWeight: 600`, `color: var(--text-primary)`
- Path: `fontSize: 11px`, `color: var(--text-muted)`, `marginTop: 2px`
- Message list: `padding: 8px 14px`
- Each message:
  - Role label: `fontSize: 10px`, `fontWeight: 600`, user = `var(--accent)`, AI = `var(--text-muted)`
  - Timestamp: `fontSize: 10px`, `color: var(--text-muted)`, right-aligned
  - Content: `fontSize: 12px`, `color: var(--text-primary)`, `lineHeight: 1.4`, max 3 lines with `-webkit-line-clamp: 3`
  - Separator: `margin: 6px 0`, `borderBottom: 1px solid rgba(128,128,128,0.1)`
- Loading skeleton: 5 shimmer rows alternating widths (80%, 60%, 90%, 50%, 70%)

### Interaction

- Hover session item for 1000ms -> show preview
- Mouse enters preview panel -> keep visible
- Mouse leaves both session item AND preview panel -> hide after 200ms delay
- Click session item -> open session (existing behavior, hide preview)
- Close button in preview header (optional, for touch)

## i18n Keys

```
idle.summary: "Here's where you left off:"
idle.generatingSummary: "Generating summary..."
session.previewTitle: "Preview"
session.previewUser: "User"
session.previewAI: "AI"
session.previewLoading: "Loading messages..."
session.previewEmpty: "No messages in this session"
```
