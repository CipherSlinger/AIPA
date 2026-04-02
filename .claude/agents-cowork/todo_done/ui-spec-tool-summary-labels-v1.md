# UI Spec: Tool Use Summary Labels

_Version: 1.0 | Date: 2026-04-01 | PRD: prd-tool-summary-labels-v1.md_

## Design Philosophy

Replace cryptic tool names with human-readable action summaries. The design should feel like git commit messages -- concise, past-tense, action-oriented.

## Component Changes

### 1. ToolUseBlock Header (Modified)

**Current**: `[Icon] Tool Name [status icon] [elapsed time]`
**New**: `[Icon] Summary Label [status icon] [elapsed time]`

Layout (collapsed state):
```
┌─────────────────────────────────────────────────────┐
│ [16px Icon]  Edited index.ts                ✓  2s  │
└─────────────────────────────────────────────────────┘
```

- Icon: Keep existing 16px tool-type icons (Terminal, FileEdit, Search, Globe)
- Summary label: `font-size: 12px`, `color: var(--text-secondary)`, `font-weight: 500`
- Status icon + elapsed: right-aligned, same as current
- The entire row remains clickable to expand/collapse

**Expanded state**: Same header, detail area below unchanged.

### 2. Tool Batch Summary (New)

When 3+ consecutive same-type tool uses occur, render a batch container:

```
┌─────────────────────────────────────────────────────┐
│ [16px Icon]  Read 5 files                   ▶  1s  │
└─────────────────────────────────────────────────────┘
```

On expand (click the row or ▶):
```
┌─────────────────────────────────────────────────────┐
│ [16px Icon]  Read 5 files                   ▼  1s  │
│  ├── Read package.json               ✓             │
│  ├── Read tsconfig.json              ✓             │
│  ├── Read index.ts                   ✓             │
│  ├── Read App.tsx                    ✓             │
│  └── Read styles.css                 ✓             │
└─────────────────────────────────────────────────────┘
```

Batch container styling:
- Same background as individual ToolUseBlock: `var(--tool-card-bg)`
- Same border: `var(--tool-card-border)`
- Same border-radius: `6px`
- Inner items: no border, `padding-left: 20px` for indent, tree-line (`├──`, `└──`) in `var(--text-muted)` at `11px`
- Inner items have no elapsed time display (only the batch header shows aggregate time)

### 3. Summary Label Patterns

| Tool | Pattern | Max Length |
|------|---------|-----------|
| Bash | `Ran: {first line of command}` | 50 chars, then `...` |
| Edit | `Edited {basename}` | N/A |
| Write | `Created {basename}` (new) or `Wrote {basename}` (overwrite) | N/A |
| Read | `Read {basename}` | N/A |
| Grep | `Searched for '{pattern}'` | Pattern truncated at 30 chars |
| Glob | `Found files matching {pattern}` | Pattern truncated at 30 chars |
| LS | `Listed {directory}` | Dir truncated at 40 chars |
| WebFetch | `Fetched {hostname}` | N/A |
| WebSearch | `Web search: {query}` | Query truncated at 40 chars |
| MultiEdit | `Edited {N} sections in {basename}` | N/A |
| Unknown | `{raw tool name}` (fallback) | N/A |

Batch summary labels:
- `Read {N} files`
- `Searched {N} times`
- `Edited {N} files`
- `Ran {N} commands`

## Colors & Tokens

No new CSS variables needed. Reuse existing:
- `var(--tool-card-bg)`, `var(--tool-card-border)` -- container
- `var(--text-secondary)` -- summary label text
- `var(--text-muted)` -- tree lines, secondary info

## i18n Keys (new)

```json
{
  "tool.summaryRan": "Ran: {{cmd}}",
  "tool.summaryEdited": "Edited {{file}}",
  "tool.summaryCreated": "Created {{file}}",
  "tool.summaryWrote": "Wrote {{file}}",
  "tool.summaryRead": "Read {{file}}",
  "tool.summarySearched": "Searched for '{{pattern}}'",
  "tool.summaryFoundFiles": "Found files matching {{pattern}}",
  "tool.summaryListed": "Listed {{dir}}",
  "tool.summaryFetched": "Fetched {{host}}",
  "tool.summaryWebSearch": "Web search: {{query}}",
  "tool.summaryMultiEdit": "Edited {{count}} sections in {{file}}",
  "tool.batchRead": "Read {{count}} files",
  "tool.batchSearched": "Searched {{count}} times",
  "tool.batchEdited": "Edited {{count}} files",
  "tool.batchRan": "Ran {{count}} commands",
  "tool.batchFetched": "Fetched {{count}} URLs",
  "tool.batchWrote": "Wrote {{count}} files"
}
```

## Animations

- Batch expand/collapse: Use existing `.tool-output-wrapper` grid height animation (0.2s ease)
- No new animations needed

## Accessibility

- Batch expand button: `aria-expanded={isExpanded}`, `aria-label="Expand tool batch: Read 5 files"`
- Individual tool status: `aria-label` on status icon (e.g., "Completed", "Running", "Failed")
