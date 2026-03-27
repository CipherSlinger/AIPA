# UI Spec: Sidebar Search Enhancement

_Iteration 64 | Author: aipa-ui | Date: 2026-03-26_

## Overview

Enhance the session list search experience with richer visual feedback. When a search filter is active, show an additional context line below each matching session item that displays the matched snippet with keyword highlighting and a match-source indicator (title/content/project).

## Changes

### 1. Match Context Line

When `filter` is active and a session matches, add a second preview line below the existing preview that shows:
- A small label indicating where the match was found: "in title", "in content", or "in project"
- The matching portion of text with surrounding context (up to 60 chars), with the matched keyword highlighted

### Visual Design

**Match context line**:
- Font size: 10px
- Color: `var(--text-muted)` at 0.8 opacity
- Match source label: `var(--accent)` color, font-weight 500, followed by a colon
- Highlight on matched text: `var(--warning)` background with dark text (reuses `HighlightText` component)
- Line height: 1.3
- Top margin: 2px (below existing preview line)
- Text overflow: ellipsis

### 2. Search Result Count

When search filter is active, show a small result count badge next to the search icon:
- Position: right side of search input
- Content: "N results" or "No results"
- Font size: 10px
- Color: `var(--text-muted)`
- "No results" uses `var(--error)` color

### 3. Session Item Expansion on Search

When searching, expand the session item slightly to accommodate the extra match context line:
- Padding increases from `10px 12px` to `10px 12px 12px 12px`
- The extra line adds natural height

## Behavior

- Match source priority: title > lastPrompt > project
- If match is in title, context line shows: "in title: ...matched text..."
- If match is in lastPrompt (content), context line shows: "in content: ...matched text..."
- If match is in project, context line shows: "in project: ...matched text..."
- Context window: show up to 30 chars before match and 30 chars after match
- No context line when filter is empty

## Component Changes

### SessionList.tsx
1. Add match source computation in the `filtered.map()` render
2. Add match context line below existing preview line (conditional on `filter` being non-empty)
3. Add result count display next to search input
