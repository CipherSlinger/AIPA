# PRD: i18n Multi-Language Support

**Version**: v1
**Priority**: P1
**Iteration**: 80
**Author**: aipa-pm
**Date**: 2026-03-27

---

## Background

User feedback item #4: "语言系统支持多语言，默认跟随系统" — users want the app to display in their system language, with the ability to switch languages in settings.

AIPA currently has all UI strings hardcoded in English across ~28 component files. There is no i18n framework in place. This iteration introduces a lightweight internationalization system.

## Goals

1. Add an i18n framework that extracts all user-visible strings into translation files
2. Support English (en) and Simplified Chinese (zh-CN) on launch
3. Default to system locale (via Electron `app.getLocale()`)
4. Allow manual language switching in Settings panel
5. Persist language preference via electron-store

## Non-Goals

- Right-to-left (RTL) language support (no Arabic/Hebrew planned)
- Date/number format localization (keep using date-fns as-is)
- Translating CLI output (the Claude CLI output is always English)
- Dynamic language addition by users (developer-managed translations only)

## Technical Approach

### No New Dependencies

Instead of adding react-i18next (which would add ~3 dependencies), use a minimal custom i18n solution:

1. **Translation files**: JSON files at `src/renderer/i18n/locales/en.json` and `src/renderer/i18n/locales/zh-CN.json`
2. **i18n context**: A React context provider (`I18nProvider`) that:
   - Loads the correct translation file based on locale
   - Provides a `t(key)` function for string lookup (dot-notation keys like `settings.general.title`)
   - Provides a `locale` value and `setLocale(code)` function
3. **Locale detection**: IPC channel `config:getLocale` returns `app.getLocale()` from main process
4. **Persistence**: `language` field added to `ClaudePrefs` in electron-store

### Architecture

```
Renderer (React)
  └── I18nProvider (context)
        ├── loads en.json or zh-CN.json
        ├── exposes t(key), locale, setLocale()
        └── wraps <App />

Main Process
  └── IPC: config:getLocale → app.getLocale()
```

### String Organization (Translation Key Namespaces)

| Namespace | Components | Approximate String Count |
|-----------|-----------|------------------------|
| `nav` | NavRail | ~8 (labels, tooltips) |
| `settings` | SettingsPanel | ~40 (section titles, labels, descriptions) |
| `chat` | ChatPanel, WelcomeScreen | ~30 (placeholders, buttons, labels) |
| `message` | Message, MessageContextMenu | ~15 (actions, statuses) |
| `session` | SessionList | ~10 (headers, actions, search) |
| `onboarding` | OnboardingWizard | ~20 (step titles, descriptions, buttons) |
| `toolbar` | StatusBar, SearchBar | ~10 (labels, tooltips) |
| `common` | Shared across all | ~15 (OK, Cancel, Save, Error, etc.) |
| `command` | CommandPalette | ~10 (action names) |
| `terminal` | TerminalPanel | ~5 (labels) |
| `file` | FileBrowser | ~5 (labels) |
| `task` | TaskQueuePanel | ~8 (statuses, buttons) |
| `permission` | PermissionCard | ~6 (allow, deny, labels) |

**Total estimated: ~180 strings**

## Acceptance Criteria

1. [ ] `I18nProvider` context wraps the app, provides `t()` function
2. [ ] `en.json` contains all extracted UI strings (~180 keys)
3. [ ] `zh-CN.json` contains complete Chinese translations
4. [ ] App defaults to system locale on first launch (via `app.getLocale()`)
5. [ ] Settings panel has a "Language" dropdown with English and Chinese options
6. [ ] Language preference persists across app restarts (electron-store)
7. [ ] Switching language updates all visible UI text without app restart
8. [ ] Missing translation keys fall back to English
9. [ ] No new npm dependencies added
10. [ ] Build passes with zero TypeScript errors

## Scope of String Extraction

### Must Extract (this iteration)
- All button labels, titles, headings
- All placeholder text
- All tooltip text
- All status/state text (e.g., "Streaming...", "Thinking...", "Sent", "Error")
- All settings labels and descriptions
- Welcome screen text
- Onboarding wizard text
- Command palette action names
- Context menu items
- Date group headers (Today, Yesterday, This Week, Earlier)

### Do NOT Extract
- Model names (Claude Opus, Claude Sonnet, etc.) -- keep as-is
- Font family names -- keep as-is
- Theme names (VS Code, Modern Dark, Minimal Dark) -- keep as-is
- Technical labels that are brand/product names (AIPA, Claude, etc.)
- Error messages from the CLI (these come from the backend)

## Settings UI Addition

Add a "Language" section at the top of the General settings tab:

```
Language / 语言
[Dropdown: System Default / English / 简体中文]
```

When "System Default" is selected, the app follows `app.getLocale()`. When a specific language is chosen, it overrides the system default.

## File Deliverables

- `src/renderer/i18n/index.ts` -- I18nProvider, useI18n hook, t() function
- `src/renderer/i18n/locales/en.json` -- English translations
- `src/renderer/i18n/locales/zh-CN.json` -- Chinese translations
- Modified: `src/renderer/index.tsx` -- wrap App with I18nProvider
- Modified: `src/renderer/types/app.types.ts` -- add `language` field to ClaudePrefs
- Modified: `src/renderer/store/index.ts` -- add `language` to DEFAULT_PREFS
- Modified: `src/main/ipc/index.ts` -- add `config:getLocale` handler
- Modified: `src/preload/index.ts` -- add `configGetLocale` API
- Modified: All ~20 component files -- replace hardcoded strings with `t()` calls
- Modified: `src/renderer/components/settings/SettingsPanel.tsx` -- add Language selector
