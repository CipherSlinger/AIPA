# UI Spec: Persona Per-Session

_Author: aipa-ui (agent-leader acting) | Date: 2026-04-02_
_Source PRD: prd-persona-workflow-rework-v1.md (Item 2)_

## Overview

Replace global persona activation with per-session persona selection. The PersonaPicker in ChatHeader becomes the primary interface for selecting a persona for the current conversation.

## Component Changes

### 1. PersonaPicker (ChatHeader) -- Modified

**Current**: Sets global `activePersonaId` in `usePrefsStore`, persisted to electron-store. Affects ALL sessions.

**New behavior**:
- PersonaPicker now sets `personaId` on the current chat session in `useChatStore`
- When user selects a persona, store it on the current session: `useChatStore.setState({ sessionPersonaId: persona.id })`
- The system prompt is still injected the same way (via `setPrefs({ systemPrompt })`) for the *current* session
- When switching sessions, restore the persona associated with that session
- Visual: No changes to picker appearance -- it already looks correct

**Data flow**:
```
User selects persona in ChatHeader
  -> useChatStore.sessionPersonaId = persona.id
  -> usePrefsStore.systemPrompt = persona.systemPrompt (for CLI)
  -> Toast: "Persona set to [name]"

User switches session
  -> Load sessionPersonaId from the new session
  -> If sessionPersonaId exists, apply that persona's systemPrompt
  -> If no sessionPersonaId, clear systemPrompt (no persona)
```

### 2. Store Changes

**useChatStore** (add):
- `sessionPersonaId: string | undefined` -- the persona ID for the current session
- Store this in localStorage keyed by session ID: `aipa:session-persona:{sessionId}`
- On session load, read the persona ID from localStorage

**usePrefsStore** (modify):
- Keep `activePersonaId` as "default persona for new sessions" (rename semantically)
- When creating a new session, if `activePersonaId` is set, auto-apply it as the session's persona
- The `activePersonaId` field name can stay the same in code, just change the UI label

### 3. PersonaPanel / SettingsPersonas -- Modified

**Current**: "Activate" / "Deactivate" buttons on persona cards
**New**: Change button label to "Set as Default" / "Remove Default"
- "Set as Default" sets this persona as the default for new sessions (`activePersonaId`)
- "Remove Default" clears `activePersonaId`
- Visual indicator: small badge "Default" on the persona card that is the default
- The active persona indicator (colored dot/border) moves from "currently active globally" to "default for new sessions"

### 4. StatusBarPersonaPicker -- Modified

**Current**: Same global activation behavior
**New**: Same per-session behavior as ChatHeader PersonaPicker
- When user changes persona from StatusBar, it updates the current session's persona
- Visual: show current session's persona name, not the global default

### 5. WelcomeScreen -- No Changes

The WelcomeScreen already shows persona-based starters. It reads from `activePersonaId` (which becomes the default). This is fine -- when starting a new session, if a default persona is set, it auto-applies.

## Visual Design

No visual changes required. The PersonaPicker already has the correct dropdown UI. The only visible change is:
- PersonaPanel: button label "Activate" -> "Set as Default" (and "Deactivate" -> "Remove Default")
- PersonaPanel: small "Default" badge on the default persona card

## I18n Keys to Add

```
persona.setAsDefault: "Set as Default" / "设为默认"
persona.removeDefault: "Remove Default" / "取消默认"
persona.defaultBadge: "Default" / "默认"
persona.defaultSet: "Set {name} as default for new sessions" / "已将 {name} 设为��会话默认角色"
persona.defaultRemoved: "Default persona removed" / "已取消默认角色"
```

## Edge Cases

1. **Persona deleted while active in session**: If user deletes a persona that's set on the current session, clear `sessionPersonaId` and `systemPrompt`
2. **Persona edited while active**: If user edits a persona's system prompt, update `systemPrompt` if it's the current session's persona
3. **No personas exist**: PersonaPicker returns null (unchanged behavior)
4. **Session has persona from a model that's not configured**: The persona's model preference applies as before -- if the model is unavailable, fall back to current model

## Implementation Priority

This is a behavior change, not a visual redesign. Main work:
1. Add `sessionPersonaId` to useChatStore
2. Add localStorage persistence keyed by session ID
3. Modify PersonaPicker's `handlePersonaSwitch` to set session persona
4. Add session-switch hook to restore persona
5. Update PersonaPanel labels
6. Add i18n keys
