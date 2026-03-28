# PRD: Settings Panel Grouped Sections

**Author**: aipa-pm  
**Date**: 2026-03-28  
**Priority**: P1 (user feedback)

## Problem

The Settings General tab displays ~15 settings in one flat scrollable list. Users report it looks "too complex" and hard to find what they need.

## Solution

Reorganize settings into 5 collapsible section groups with clear headers and icons. Each group can be expanded/collapsed independently. All groups default to expanded on first visit.

### Section Groups

1. **AI Engine** (Brain icon) -- Model, API Key, Thinking Mode, Max Turns, Budget Limit
2. **Prompts** (MessageSquare icon) -- Prompt Template selector, System Prompt textarea
3. **Appearance** (Palette icon) -- Language, Theme, Font Size, Font Family, Compact Mode
4. **Workspace** (Folder icon) -- Working Folder, Tags
5. **Behavior** (Settings2 icon) -- Skip Permissions, Verbose, Completion Sound, Desktop Notifications

### UI Details

- Each group has a clickable header with: icon + title + chevron (right when collapsed, down when expanded)
- Smooth height transition on expand/collapse (CSS transition)
- Group headers have subtle background on hover
- Collapsed groups show zero content, saving vertical space
- Save button stays at the bottom, always visible
- Expansion state persisted in localStorage

### i18n

New keys needed:
- `settings.groups.aiEngine`: "AI Engine" / "AI 引擎"
- `settings.groups.prompts`: "Prompts" / "提示词"
- `settings.groups.appearance`: "Appearance" / "外观"
- `settings.groups.workspace`: "Workspace" / "工作区"
- `settings.groups.behavior`: "Behavior" / "行为"

## Success Criteria

- All existing settings remain accessible
- Visual clutter reduced -- users can collapse irrelevant groups
- Expansion state persists across visits
