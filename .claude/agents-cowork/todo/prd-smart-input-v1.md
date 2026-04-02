# PRD: Smart Input Enhancements

_Author: aipa-pm | Date: 2026-04-02_

## Context

The chat input area has grown to support slash commands, @mentions, text snippets, inline calculator, and paste detection. Several additional input productivity features would make AIPA feel more like a smart assistant.

## In Scope

### 1. Input History Navigation

**Problem**: Users can see recent prompts on the WelcomeScreen, but while typing there's no quick way to recall and re-use previous prompts without leaving the input.

**Solution**:
- Press Up arrow when the input is empty to cycle through recent prompt history (like a terminal shell)
- Down arrow goes forward in history
- History is sourced from the existing localStorage 'aipa:input-history'
- Pressing any character key exits history mode and keeps the current text
- Maximum 50 items in navigation history
- Visual indicator: subtle "History (3/50)" label appears above the input when navigating

**Impact**: ChatInput.tsx (keydown handler), en.json + zh-CN.json

### 2. Multi-line Input Toggle

**Problem**: Users sometimes want to compose multi-line messages but pressing Enter sends the message. Shift+Enter works for new lines but is not discoverable.

**Solution**:
- Add a small toggle button at the right edge of the input toolbar (next to Send button)
- Icon: AlignLeft (multi-line) / MessageSquare (single-line)
- When multi-line mode is on: Enter adds a new line, Ctrl+Enter sends
- When single-line mode is on: Enter sends (current behavior), Shift+Enter adds new line
- Mode persisted in localStorage
- Tooltip explains the current mode

**Impact**: ChatInput.tsx (enter key handling), InputToolbar.tsx (toggle button), en.json + zh-CN.json

### 3. Voice Input Indicator

**Problem**: AIPA has speech-to-text capability via Web Speech API but the microphone button could provide better visual feedback during recording.

**Solution**:
- When recording, the mic button gets a pulsing red ring animation
- Show recording duration counter next to the mic button (e.g., "0:12")
- Add a subtle waveform animation below the input area during recording
- Auto-stop after 2 minutes of recording with a toast notification

**Impact**: ChatInput.tsx (mic button styling, recording timer), en.json + zh-CN.json

## Out of Scope

- Voice output / text-to-speech response
- Dictation with punctuation commands
- Input auto-complete from external sources
- Grammar correction in input

## Success Criteria

- Up/Down arrow navigates prompt history when input is empty
- Multi-line toggle works and persists
- Mic button shows pulsing animation and timer during recording
- Build succeeds
- All i18n keys added (en + zh-CN)
