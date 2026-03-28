# PRD: Quick Clipboard Actions

**Author**: aipa-pm
**Date**: 2026-03-28
**Iteration**: 123
**Priority**: P1
**Type**: New Feature (Personal Assistant Enhancement)

---

## Background

AIPA positions itself as a personal desktop AI assistant. A core workflow for any assistant is working with text the user has copied to their clipboard -- summarizing articles, translating paragraphs, rewriting emails, explaining technical concepts. Currently, users must manually paste text into the chat input and type their request. This friction undermines the "assistant" experience.

Reference: Doubao (ByteDance's AI assistant) offers clipboard-triggered quick actions as a signature feature. This is table-stakes for personal AI assistants.

## Goal

Add a "Paste & Ask" button to the chat input toolbar that reads clipboard text and inserts it into the chat with a pre-selected action (Summarize, Translate, Rewrite, Explain, or custom), reducing a multi-step workflow to two clicks.

## Scope

**In scope:**
1. "Paste & Ask" button in the ChatInput toolbar (next to voice input button)
2. Dropdown menu with 5 preset actions: Summarize, Translate, Rewrite, Explain, Grammar Check
3. Clicking an action reads `navigator.clipboard.readText()`, wraps it in a prompt template, and sends it
4. Visual feedback when clipboard is empty (disabled state or toast)
5. i18n for all new strings (en + zh-CN)

**Out of scope:**
- Global hotkey to trigger clipboard actions from outside the app (future iteration)
- Image clipboard processing (already handled by image paste)
- Clipboard monitoring/history (privacy concern, out of scope)

## User Flow

1. User copies text from any application (browser, email, document)
2. User switches to AIPA
3. User clicks the "Paste & Ask" button (ClipboardPaste icon) in the input toolbar
4. A small dropdown appears with 5 actions:
   - Summarize: "Please summarize the following text concisely:\n\n{clipboard}"
   - Translate: "Please translate the following text to [target language]:\n\n{clipboard}" (target = opposite of current UI language)
   - Rewrite: "Please rewrite the following text to be more clear and professional:\n\n{clipboard}"
   - Explain: "Please explain the following text in simple terms:\n\n{clipboard}"
   - Grammar Check: "Please check the following text for grammar and spelling errors, and provide corrections:\n\n{clipboard}"
5. User clicks an action
6. The clipboard text is read, wrapped in the action template, and sent as a message
7. If clipboard is empty, show a toast notification

## Technical Design

### Component Changes

**ChatInput.tsx** (~60 lines added):
- Import `ClipboardPaste` from lucide-react
- Add state: `showClipboardMenu` (boolean)
- Add handler: `handleClipboardAction(action: string)` that:
  1. Calls `navigator.clipboard.readText()`
  2. If empty, shows toast and returns
  3. Constructs prompt from action template + clipboard text
  4. Calls the existing `handleSend` function with the constructed prompt
  5. Closes the dropdown
- Render: Button + dropdown menu (positioned above the button, consistent with existing popup styling)

### Prompt Templates

```typescript
const clipboardActions = [
  { id: 'summarize', icon: FileText, labelKey: 'clipboard.summarize', template: 'Please summarize the following text concisely:\n\n{text}' },
  { id: 'translate', icon: Languages, labelKey: 'clipboard.translate', template: 'Please translate the following text to {targetLang}:\n\n{text}' },
  { id: 'rewrite', icon: PenLine, labelKey: 'clipboard.rewrite', template: 'Please rewrite the following text to be more clear and professional:\n\n{text}' },
  { id: 'explain', icon: HelpCircle, labelKey: 'clipboard.explain', template: 'Please explain the following text in simple terms:\n\n{text}' },
  { id: 'grammar', icon: SpellCheck, labelKey: 'clipboard.grammar', template: 'Please check the following text for grammar and spelling errors, and provide corrections:\n\n{text}' },
]
```

### Translation Target Language

For the "Translate" action, automatically determine the target language:
- If UI language is `zh-CN`, translate to English
- If UI language is `en`, translate to Chinese
- This covers the primary bilingual use case

### Styling

- Dropdown uses existing CSS variables: `--popup-bg`, `--popup-border`, `--popup-shadow`
- Each action row: icon (16px) + label, hover highlight with `--action-btn-hover`
- Dropdown positioned above the button (same as slash command popup pattern)
- Click outside to close (same pattern as existing dropdowns)

## Acceptance Criteria

- [ ] "Paste & Ask" button visible in ChatInput toolbar (between @ button and voice input)
- [ ] Clicking the button shows a dropdown with 5 actions
- [ ] Each action has an icon and localized label
- [ ] Clicking an action reads clipboard text and sends it with the action template
- [ ] If clipboard is empty or clipboard API fails, a toast notification is shown
- [ ] Dropdown closes after action selection or click outside
- [ ] Translate action uses the opposite language of the current UI language
- [ ] All strings are in both en.json and zh-CN.json
- [ ] Build succeeds with no TypeScript errors
- [ ] No new npm dependencies required

## i18n Keys (10 new)

**en.json:**
```json
"clipboard": {
  "pasteAndAsk": "Paste & Ask",
  "summarize": "Summarize",
  "translate": "Translate",
  "rewrite": "Rewrite",
  "explain": "Explain",
  "grammar": "Grammar Check",
  "emptyClipboard": "Clipboard is empty",
  "clipboardError": "Could not read clipboard",
  "translateToEn": "Translate to English",
  "translateToZh": "Translate to Chinese"
}
```

## Risk Assessment

- **Clipboard API permissions**: `navigator.clipboard.readText()` requires the document to be focused. In Electron with sandbox mode, this should work as the renderer has implicit clipboard access. If the Clipboard API is unavailable, fall back to `electron.clipboard.readText()` via IPC.
- **No new dependencies**: Uses only existing Lucide icons and Clipboard API.
