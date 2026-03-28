# PRD: Settings Search Filter

**Author**: aipa-pm  
**Date**: 2026-03-28  
**Priority**: P1 (user feedback follow-up)

## Problem

Even with grouped sections (Iteration 169), users with many settings may want to quickly locate a specific one.

## Solution

Add a search input at the top of the Settings General tab. When the user types, only groups containing matching settings are shown, and non-matching settings within those groups are visually dimmed or hidden.

### Behavior

1. Search bar appears above the first group, with Search icon and clear button
2. Typing filters which groups are visible -- a group stays visible if any setting label/hint within it matches
3. Empty search shows all groups (default behavior)
4. Search is instant (no debounce needed for small data)
5. Each setting has searchable keywords: its label text and hint text

### i18n

New keys:
- `settings.searchPlaceholder`: "Search settings..." / "搜索设置..."

## Success Criteria

- Users can find any setting by typing a keyword
- Groups with no matches are hidden
- Clearing search restores all groups
