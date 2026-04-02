# PRD: Session Changes Summary Panel

_Version: 1.0 | Date: 2026-04-01 | Author: agent-leader (acting as PM)_
_Source: Claude Code official source `src/hooks/useTurnDiffs.ts` + `src/components/diff/DiffDialog.tsx`_

## Problem Statement

During a conversation, the AI assistant may edit dozens of files across multiple turns. Currently, AIPA shows individual diffs inside each ToolUseBlock, but there is no aggregate view answering: "What files changed in this session and by how much?" Users who step away and return, or who want to review before committing, must scroll through the entire conversation to piece together the full picture.

The official Claude Code source provides a DiffDialog with per-turn file change tracking. AIPA should have a similar capability, adapted for its desktop GUI.

## In Scope

### 1. Session Change Tracking Hook (`useSessionChanges`)

Create a new hook that scans the message array and extracts file change data from tool use results:

- Track which files were created, edited, or written during the session
- For each file: count lines added, lines removed, and number of edits
- Group changes by conversation turn (a "turn" = one user message + the assistant's response)
- Data source: `tool.input` contains file paths; `tool.output` may contain diff info
- The hook should be memoized and only recompute when messages change

### 2. Changes Summary Panel (accessible from ChatHeader)

Add a "Changes" button to the ChatHeader toolbar (next to the existing Stats button):

- **Button**: Use `GitBranch` or `FileDiff` icon from lucide-react, with a badge showing total changed file count
- **Panel**: Floating popup (same pattern as StatsPanel) showing:
  - **Header**: "Session Changes" with total stats: `N files changed, +X lines, -Y lines`
  - **File List**: Sorted by total changes (most changed first), each row showing:
    - File basename (full path on hover/tooltip)
    - `+added / -removed` line counts with green/red coloring
    - File status indicator: Created (green dot), Modified (yellow dot)
  - **Per-Turn Breakdown**: Collapsible sections, each showing:
    - Turn label: User prompt preview (first 40 chars)
    - Files changed in that turn with line counts
- Panel should be scrollable if content exceeds viewport
- Empty state: "No file changes in this session"

### 3. Copy Changes Summary

Add a "Copy" button in the Changes panel header that copies a text summary to clipboard:

```
Session Changes Summary
=======================
5 files changed, +142 lines, -38 lines

Modified: src/renderer/store/index.ts (+42, -12)
Created:  src/renderer/utils/toolSummary.ts (+85)
Modified: src/renderer/components/chat/ToolUseBlock.tsx (+15, -26)
...
```

This enables users to paste the summary into commit messages, PR descriptions, or notes.

## Out of Scope

- Git-level diff integration (reading actual git diff -- we only track what the AI did in the session)
- File content preview in the Changes panel (just stats, not actual diff content)
- Inter-session change tracking (only current session)
- Backend/IPC changes

## Acceptance Criteria

- [ ] `useSessionChanges` hook correctly extracts file change data from message array
- [ ] Files that were created vs edited are distinguished (Created/Modified status)
- [ ] ChatHeader shows "Changes" button with badge count of changed files
- [ ] Changes panel shows aggregate stats (files, lines added, lines removed)
- [ ] Per-file breakdown shows basename, line counts with green/red styling
- [ ] Per-turn breakdown shows which user prompt led to which changes
- [ ] Copy button produces well-formatted text summary
- [ ] Empty state displays when no file changes occurred
- [ ] Panel closes on click-outside and Escape key
- [ ] All visible strings have i18n entries in both en.json and zh-CN.json
- [ ] Build succeeds with zero TypeScript errors

## Technical Notes

- Implementation is **pure frontend** -- file change data is extracted from `ToolUseInfo` objects in the message array
- Tool types that produce file changes: Write, Edit, MultiEdit, str_replace_editor, create_file
- The `tool.input` field typically has a `file_path` or `path` property; parse it to get the file path
- The `tool.output` may contain structured patch data (for Edit tools) or just a success message
- For line count estimation when exact diff data isn't available: count newlines in `tool.input.new_str` vs `tool.input.old_str`
- Reuse the `StatsPanel` popup pattern (click-outside close, same positioning, same styling)
