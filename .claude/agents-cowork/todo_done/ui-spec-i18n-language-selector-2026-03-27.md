# UI Spec: i18n Language Selector

**Date**: 2026-03-27
**PRD**: `prd-i18n-v1.md`
**Author**: aipa-ui

---

## Settings Panel Addition

### Language Section

Position: First item in the General tab, above "Model".

```
┌─────────────────────────────────────────┐
│ Language / 语言                          │
│ [▼ System Default                     ] │
│     ├── System Default                  │
│     ├── English                         │
│     └── 简体中文                         │
└─────────────────────────────────────────┘
```

### Styling

- Label: Same style as other settings labels (13px, `--text-secondary`)
- Dropdown: Same `<select>` styling as Model dropdown (reuse existing)
- Section divider: Same as between other settings sections
- Label displays bilingually: "Language / 语言" so users can always find it regardless of current language

### Behavior

- "System Default" option follows OS locale
- Selecting a language applies immediately (no save button needed for language change)
- All visible text updates reactively without page reload

## No Other UI Changes

All other changes are code-level string extraction (replacing hardcoded strings with `t()` calls). The visual layout, spacing, colors, and interactions remain identical. Only the text content changes when switching languages.
