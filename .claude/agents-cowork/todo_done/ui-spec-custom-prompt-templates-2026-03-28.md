# UI Spec: Custom Prompt Templates

**Date**: 2026-03-28
**PRD**: `prd-custom-prompt-templates-v1.md`
**Author**: aipa-ui (via agent-leader)

---

## Layout

The feature adds a **"Templates" tab** to the Settings panel (alongside General, MCP, About). This keeps the General tab from getting too long.

### Templates Tab Structure

```
[General] [Templates] [MCP] [About]
───────────────────────────────────

Built-in Templates (read-only)
  ┌──────────────────────────────────┐
  │ Writing Assistant          built-in │
  │ Research Analyst           built-in │
  │ Tutor                      built-in │
  │ Code Reviewer              built-in │
  │ Creative Writer            built-in │
  │ Productivity Coach         built-in │
  └──────────────────────────────────┘

──── divider ────

My Templates (3/20)
  ┌──────────────────────────────────┐
  │ Meeting Notes          [Edit][X] │
  │ "Summarize meeting in..."        │
  ├──────────────────────────────────┤
  │ Email Reply            [Edit][X] │
  │ "Draft a professional..."        │
  ├──────────────────────────────────┤
  │ Weekly Report          [Edit][X] │
  │ "Create a structured..."         │
  └──────────────────────────────────┘

  [+ Add Template]

```

### Template Card Design

Each custom template card:
- Name in 12px semibold, color `--text-primary`
- Prompt preview in 11px, color `--text-muted`, max 2 lines, truncated with ellipsis
- Edit button (Pencil icon, 13px) and Delete button (Trash icon, 13px) on the right
- Card background: `var(--bg-input)`, border: `1px solid var(--border)`, border-radius: 6px
- Padding: 10px 12px

### Inline Edit Mode

When editing a template:
- Name input (same `inputStyle` as Settings)
- Prompt textarea (4 rows, same style)
- [Save] [Cancel] buttons below
- Validation: name 1-50 chars, prompt 1-5000 chars

### Add Template Form

Same as edit mode, appears below the list when "Add Template" is clicked.

### Template Selector (existing dropdown in General tab)

Extend the existing `<select>` to include custom templates:
- Built-in templates listed first (unchanged)
- Divider `<option disabled>---</option>`
- Custom templates listed with a "(Custom)" suffix
- If current systemPrompt matches neither built-in nor custom, show "Custom (edited)" option

### Delete Confirmation

Inline confirmation: clicking Delete changes the button to "Confirm?" in red for 2 seconds, clicking again deletes. Matches the existing session delete pattern.

## CSS Variables Used

All existing variables -- no new CSS variables needed:
- `--bg-input`, `--border`, `--text-primary`, `--text-muted`, `--accent`, `--error`
- `--bg-hover` for card hover state

## i18n Keys Required

### English
```json
{
  "settings.tabs.templates": "Templates",
  "settings.templates.builtIn": "Built-in Templates",
  "settings.templates.builtInBadge": "built-in",
  "settings.templates.myTemplates": "My Templates",
  "settings.templates.addTemplate": "Add Template",
  "settings.templates.editTemplate": "Edit",
  "settings.templates.deleteTemplate": "Delete",
  "settings.templates.confirmDelete": "Confirm?",
  "settings.templates.templateName": "Template Name",
  "settings.templates.templatePrompt": "System Prompt",
  "settings.templates.templateNamePlaceholder": "e.g., Meeting Notes",
  "settings.templates.templatePromptPlaceholder": "Enter the system prompt for this template...",
  "settings.templates.save": "Save",
  "settings.templates.cancel": "Cancel",
  "settings.templates.emptyState": "No custom templates yet. Create one to build your personal workflow library.",
  "settings.templates.limitReached": "Maximum 20 custom templates reached.",
  "settings.templates.customSuffix": "(Custom)"
}
```

### Chinese
```json
{
  "settings.tabs.templates": "模板",
  "settings.templates.builtIn": "内置模板",
  "settings.templates.builtInBadge": "内置",
  "settings.templates.myTemplates": "我的模板",
  "settings.templates.addTemplate": "添加模板",
  "settings.templates.editTemplate": "编辑",
  "settings.templates.deleteTemplate": "删除",
  "settings.templates.confirmDelete": "确认删除?",
  "settings.templates.templateName": "模板名称",
  "settings.templates.templatePrompt": "系统提示词",
  "settings.templates.templateNamePlaceholder": "例如：会议记录",
  "settings.templates.templatePromptPlaceholder": "输入此模板的系统提示词...",
  "settings.templates.save": "保存",
  "settings.templates.cancel": "取消",
  "settings.templates.emptyState": "暂无自定义模板。创建一个来构建您的个人工作流库。",
  "settings.templates.limitReached": "已达到 20 个自定义模板上限。",
  "settings.templates.customSuffix": "（自定义）"
}
```

## Interaction Flow

1. User opens Settings > Templates tab
2. Sees built-in templates (read-only, for reference)
3. Clicks "Add Template" > inline form appears
4. Fills in name + prompt > clicks Save
5. Template appears in the list with Edit/Delete buttons
6. Goes to General tab > template selector now shows custom template
7. Selects custom template > system prompt field updates

## Accessibility

- All buttons have `aria-label` attributes
- Form inputs have proper labels
- Keyboard navigable (Tab between fields, Enter to save)
