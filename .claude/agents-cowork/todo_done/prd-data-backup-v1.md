# PRD: Data Backup & Restore

## Context
AIPA stores important user data: conversation history, memories, notes, custom workflows, personas, and settings. Users need a way to backup and restore all their data, especially before reinstallation or when migrating between machines.

## In Scope (3 features)

### 1. Full Data Export (Backup)
- Add "Backup All Data" button to Settings > About section
- Exports a single .zip file containing:
  - All session JSONL files (from ~/.claude/projects/)
  - All memories (from memory store)
  - All notes (from notes store)
  - Custom workflows (from prefs)
  - Custom personas (from prefs)
  - Settings/preferences (from electron-store, excluding API keys)
  - Custom conversation templates
- Native save dialog for choosing export location
- Show progress indicator during export
- Toast notification on success with file size

### 2. Data Import (Restore)
- Add "Restore from Backup" button next to Export in Settings > About
- Opens native file dialog to select a .zip backup file
- Validates zip structure before importing
- Shows confirmation dialog listing what will be imported (X sessions, Y memories, etc.)
- Imports all data, merging with existing data (not replacing)
- Duplicate sessions (same ID) are skipped
- Toast notification on success listing what was imported

### 3. Auto-Backup Reminder
- Add "Backup Reminder" toggle in Settings > Behavior
- When enabled, shows a non-intrusive reminder toast every 30 days
- Reminder text: "It's been X days since your last backup. Would you like to backup now?"
- Clicking the toast opens Settings > About where the backup button is
- Last backup timestamp stored in prefs

## Out of Scope
- Cloud sync / automatic backup
- Partial backup (selecting which data to include)
- Backup encryption

## Success Criteria
- Export produces a valid zip file with all user data
- Import correctly restores data from the zip, with no data loss
- Reminder appears on schedule and links to backup action

## Files Likely Touched
- SettingsAbout.tsx (backup/restore buttons)
- SettingsGeneral.tsx (backup reminder toggle)
- main/ipc/index.ts (backup/restore IPC handlers)
- preload/index.ts (backup/restore API)
- i18n (en.json, zh-CN.json)
- config-manager.ts (backup reminder timestamp)
