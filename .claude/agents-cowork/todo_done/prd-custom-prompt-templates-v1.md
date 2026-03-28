# PRD: Custom Prompt Templates (User-Defined Workflows)

**Version**: v1
**Priority**: P1
**Author**: aipa-pm (via agent-leader)
**Date**: 2026-03-28
**Iteration**: 119

---

## Background

AIPA currently ships 6 preset system prompt templates (Writing Assistant, Research Analyst, Language Tutor, Code Reviewer, Creative Writer, Productivity Coach). These are read-only and defined in code (`promptTemplates.ts`). Users cannot create, edit, or delete their own templates.

For a personal AI assistant, reusable workflows are essential. Users develop patterns: "summarize this meeting in bullet points", "draft a reply to this email", "review this document for grammar". Currently these must be retyped or copy-pasted every time. A custom template system lets users build a personal library of prompts they use frequently.

## User Stories

1. **As a user**, I want to create my own prompt templates so I can quickly activate workflows I use often
2. **As a user**, I want to edit or delete my custom templates so I can refine them over time
3. **As a user**, I want to see both built-in and custom templates in one unified list
4. **As a user**, I want custom templates to persist across app restarts

## Feature Scope

### In Scope (This Iteration)

1. **Custom Template CRUD** -- Create, Read, Update, Delete user-defined prompt templates
2. **Template Manager UI** -- A dedicated section in Settings where users can manage templates
3. **Unified Template Selector** -- The existing template dropdown shows both built-in (non-editable) and custom templates, with a clear visual distinction
4. **Persistence** -- Custom templates stored via electron-store (prefs), surviving app restarts
5. **i18n** -- All new UI strings in both en and zh-CN

### Out of Scope

- Template categories/folders (future iteration)
- Template sharing/export (future iteration)
- Template marketplace (future iteration)
- Template variables/placeholders with fill-in forms (future iteration)

## Functional Requirements

### FR-1: Data Model

```typescript
interface CustomTemplate {
  id: string           // uuid
  name: string         // Display name (e.g., "Meeting Notes")
  prompt: string       // System prompt text
  icon?: string        // Optional emoji or icon identifier
  createdAt: number    // timestamp
  updatedAt: number    // timestamp
}
```

Stored in electron-store under key `customPromptTemplates` as `CustomTemplate[]`.

### FR-2: Template Manager in Settings

Add a "Prompt Templates" section to SettingsPanel with:
- List of all custom templates with name and truncated prompt preview
- "Add Template" button that opens an inline form (name + prompt textarea)
- Edit button on each custom template (inline edit)
- Delete button with confirmation
- Built-in templates shown at the top as read-only (grayed out, no edit/delete)
- Max 20 custom templates (show count: "3/20")

### FR-3: Unified Template Selector

The existing system prompt template dropdown (in chat header or settings) should:
- Show built-in templates first, separated by a divider
- Show custom templates below
- Custom templates have a small user-icon badge to distinguish from built-in
- Selecting a custom template sets it as the active system prompt for the session

### FR-4: Persistence via IPC

- New IPC channels: `prefs:getCustomTemplates`, `prefs:setCustomTemplates`
- Or reuse existing `prefs:*` channels since electron-store already handles arbitrary keys
- Templates saved immediately on create/edit/delete (no explicit "save" button)

## UI/UX Requirements

- Template Manager uses the same card-based styling as other Settings sections
- Form validation: name required (1-50 chars), prompt required (1-5000 chars)
- Inline edit mode: clicking edit transforms the row into editable fields
- Delete confirmation: "Are you sure you want to delete [template name]?"
- Empty state: "No custom templates yet. Create one to build your personal workflow library."

## Acceptance Criteria

1. User can create a custom prompt template with name and prompt text
2. User can edit an existing custom template
3. User can delete a custom template (with confirmation)
4. Custom templates persist across app restarts
5. Template selector shows both built-in and custom templates
6. Selecting a custom template applies it as the session system prompt
7. i18n strings provided for en and zh-CN
8. Build succeeds with no TypeScript errors
9. Maximum 20 custom templates enforced

## Technical Notes

- Reuse `electron-store` (v8, CJS) for persistence -- same pattern as prefs
- The existing `promptTemplates.ts` utility exports built-in templates; extend this to merge custom ones
- No new npm dependencies required
- Keep the Settings panel section collapsible to avoid bloating the settings view
