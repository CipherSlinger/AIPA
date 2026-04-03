# PRD: Session Auto-Organization & Insights

_Version: 1.0 | Date: 2026-04-02 | Author: agent-leader (acting as PM)_

## Background

AIPA users accumulate many sessions over time. While manual tags, folders, search, and pins exist, the assistant doesn't proactively help organize conversations. A personal AI assistant should automatically categorize sessions and surface useful insights about usage patterns.

## In Scope

### 1. Session Auto-Tagging

**Problem**: Users must manually tag sessions. Most sessions end up untagged, making tags less useful as an organizational tool.

**Solution**:
- After a conversation reaches 3+ messages, automatically assign 1-2 topic tags based on content analysis
- Use a keyword-based heuristic (no LLM call):
  - Extract nouns and action verbs from user messages and session title
  - Match against a predefined topic taxonomy: `coding`, `writing`, `research`, `debug`, `design`, `data`, `devops`, `learning`, `planning`, `general`
  - Keyword mapping examples: "function", "component", "error", "bug" -> `coding`; "write", "draft", "email" -> `writing`; "deploy", "docker", "CI" -> `devops`
- Auto-tags appear as dimmed/italic tags on SessionItem, visually distinct from user-assigned tags
- Users can remove auto-tags or convert them to regular tags via click
- Auto-tags don't overwrite user-assigned tags
- Store auto-tags in a separate field (`autoTags`) in session metadata

**Impact**: SessionItem.tsx (display auto-tags), sessionUtils.ts (auto-tag generation logic), SessionList.tsx (filter by auto-tags), app.types.ts (autoTags field)

### 2. Session Statistics Dashboard

**Problem**: The Daily Summary Card shows today's stats, but users have no way to see weekly/monthly usage patterns or trends.

**Solution**:
- Add a "Session Stats" view accessible from the session list header (chart icon button)
- The stats view replaces the session list content (same pattern as folder filter)
- Shows:
  - **This week**: sessions per day bar chart (simple CSS bars, no charting library)
  - **Total stats**: total sessions, total messages, most active day of week, average session length
  - **Top tags**: most-used tags (manual + auto) with counts
  - **Activity streak**: consecutive days with at least 1 session
- "Back to List" button returns to normal session list
- All data derived from existing session store (no new data collection)

**Impact**: New SessionStats.tsx component, SessionList.tsx (toggle between list/stats view), en.json + zh-CN.json

### 3. Session Color Labels

**Problem**: Folders provide grouping, but users sometimes want a quick visual indicator on individual sessions without full folder organization.

**Solution**:
- Add 6 color label options (red, orange, yellow, green, blue, purple) to session context menu
- Color label shows as a 3px left border stripe on SessionItem
- Color labels can be combined with tags and folders
- "Remove Color" option in context menu
- Colors stored in preferences (not in JSONL files)

**Impact**: SessionItem.tsx (left border), useSessionListActions.ts (color assignment), app.types.ts (sessionColors in prefs), en.json + zh-CN.json

## Out of Scope

- AI-powered session summarization (already exists as summarize button)
- Cross-session knowledge graph
- Usage analytics export
- Session grouping by auto-tags (manual folder grouping already exists)

## Acceptance Criteria

- [ ] Sessions with 3+ messages get 1-2 auto-tags within 2 seconds of reaching threshold
- [ ] Auto-tags are visually distinct from user tags (italic or dimmed style)
- [ ] Session stats view shows weekly chart and aggregate statistics
- [ ] Color labels appear as left border stripe on session items
- [ ] All new UI text has i18n entries (en + zh-CN)
- [ ] Build succeeds with zero TypeScript errors
