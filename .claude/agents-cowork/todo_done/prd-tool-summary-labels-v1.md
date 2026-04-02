# PRD: Tool Use Summary Labels

_Version: 1.0 | Date: 2026-04-01 | Author: agent-leader (acting as PM)_
_Source: Claude Code official source `src/services/toolUseSummary/toolUseSummaryGenerator.ts`_

## Problem Statement

When AIPA's AI assistant executes tool calls (Bash commands, file edits, searches), the ToolUseBlock component displays the raw tool name and file path (e.g., "Edit: src/renderer/store/index.ts"). This is technically accurate but not user-friendly -- everyday users must mentally parse tool names and file paths to understand what happened.

The official Claude Code source generates human-readable one-line summary labels for completed tool batches (e.g., "Edited store configuration", "Searched for error patterns in auth/"). This dramatically improves scan-ability of long conversations.

## In Scope

### 1. Algorithmic Tool Summary Label Generation

Generate a human-readable summary label for each completed tool use, based on the tool name and its input/output data. This is a **client-side algorithmic approach** (no API call needed):

| Tool Name | Summary Pattern | Example |
|-----------|----------------|---------|
| Bash | First meaningful line of command (truncated to 50 chars) | `Ran: npm run build` |
| Edit / str_replace_editor | "Edited {basename}" | `Edited index.ts` |
| Write / create_file | "Created {basename}" or "Wrote {basename}" | `Created UserService.tsx` |
| Read / read_file | "Read {basename}" | `Read package.json` |
| Grep | "Searched for '{pattern}'" (truncated) | `Searched for 'useEffect'` |
| Glob / LS | "Listed files in {dir}" | `Listed files in src/` |
| WebFetch | "Fetched {hostname}" | `Fetched github.com` |
| WebSearch | "Searched web: '{query}'" | `Searched web: 'React 19'` |
| MultiEdit | "Edited {N} sections in {basename}" | `Edited 3 sections in App.tsx` |

### 2. Summary Label Display in ToolUseBlock Header

Replace the current collapsed ToolUseBlock header from showing just the tool name to showing the summary label:

- **Collapsed state**: Show `[Icon] Summary Label [status] [elapsed]` (e.g., `[FileEdit] Edited index.ts [checkmark] 2s`)
- **Expanded state**: Same header, plus the existing detail view below
- If summary generation fails or tool is unknown, fall back to current behavior (raw tool name)
- Summary label font: same size as current, but use `var(--text-secondary)` for the label text to differentiate from the tool icon

### 3. Multi-Tool Batch Summary (collapsed adjacent tools)

When 3+ consecutive tool uses of the same type occur (e.g., 5 Read calls in a row), show a collapsed batch summary:

- Display: `[Icon] Read 5 files [expand arrow]`
- On expand: show individual tool use blocks
- This reduces visual noise for common patterns like "read 8 files then edit 2"
- Threshold: 3+ consecutive same-type tools trigger batching
- User can always expand to see individual tool calls

## Out of Scope

- AI-powered summary generation (using a secondary model call) -- too expensive for every tool use
- Turn-level change tracking (separate PRD)
- Modifying the tool use data structure in the stream-json bridge

## Acceptance Criteria

- [ ] Every completed tool use shows a human-readable summary label instead of raw tool name
- [ ] Summary labels follow the pattern table above for all 10+ tool types
- [ ] Unknown tool types fall back to showing the raw tool name
- [ ] Bash tool summaries show the first line of the command (not the full output)
- [ ] File-related tools show basename only (not full path) in the summary
- [ ] 3+ consecutive same-type tool uses collapse into a batch summary with count
- [ ] Batch summaries expand on click to show individual tool calls
- [ ] All new visible strings have i18n entries in both en.json and zh-CN.json
- [ ] Build succeeds with zero TypeScript errors

## Technical Notes

- Implementation is **pure frontend** -- all data needed is already in the `ToolUseInfo` type
- The `tool.input` field contains the command/path/pattern; `tool.name` identifies the tool type
- Batch detection should be done in `MessageList.tsx` or a new `useToolBatching.ts` hook
- Summary generation function should be a pure utility in `src/renderer/utils/toolSummary.ts`
