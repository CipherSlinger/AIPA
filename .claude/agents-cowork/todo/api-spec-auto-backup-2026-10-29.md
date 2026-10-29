# API Spec: Rolling automatic backups
_Date: 2026-10-29_

The manual Export from wave 73 now also runs on its own: one versioned document per interval window, written under `<userData>/backups`, listed in Settings → About, restorable through the same merge import.

## New IPC channels

### `backup:list`
**Direction**: renderer → main (invoke)
**Params**: none
**Returns**:
```ts
{
  success: true
  dir: string                         // absolute <userData>/backups
  policy: { enabled: boolean; interval: 'daily' | 'weekly'; retention: number }
  lastAttemptAt: number | null
  lastSuccessAt: number | null
  lastResult: {
    ok: boolean
    at: number
    fileName?: string
    sizeBytes?: number
    pruned: number
    leftAlone: number
    pruneFailures: number
    error?: 'collect_failed' | 'write_failed'
  } | null
  backups: { name: string; sizeBytes: number; createdAt: number }[]   // newest first
  foreignCount: number                // files in the folder AIPA did not create
}
```
`createdAt` is parsed from the file name (local wall clock), not from mtime.

### `backup:runNow`
**Direction**: renderer → main (invoke)
**Params**: none
**Returns**:
```ts
{
  ok: boolean
  skipped?: boolean                   // never true for runNow; kept for symmetry
  reason?: 'disabled' | 'never' | 'new_window' | 'already_in_window'
  fileName?: string
  sizeBytes?: number
  createdAt?: number
  pruned: number
  leftAlone: number
  pruneFailures: number
  error?: 'collect_failed' | 'write_failed'
}
```
Forces a run even when automatic backups are off or this window already has one.

### `backup:setPolicy`
**Direction**: renderer → main (invoke)
**Params**: `{ enabled?: boolean; retention?: number; interval?: 'daily' | 'weekly' }`
**Returns**: `{ success: true; policy }` or `{ success: false; error: 'state_failed' }`
**Notes**: `retention` must be one of 3 / 7 / 14 / 30; anything else falls back to 7. Enabling triggers one gated attempt shortly after the reply.

### `backup:delete`
**Direction**: renderer → main (invoke)
**Params**: `{ name: string }` — a listed file name, never a path
**Returns**: `{ success: true } | { success: false; error: 'not_ours' | 'delete_failed' }`

### `backup:restore`
**Direction**: renderer → main (invoke)
**Params**: `{ name: string }`
**Returns**: the same shape as `backup:import` (`success`, `backupVersion`, `backupDate`, `olderVersion`, `written`, `skippedExisting`, `failed`, `refused`, `warnings`, `sectionsPresent`) or `{ error, errorCode }` where `errorCode` is `not_ours | read_failed | invalid_format | unsupported_version`.
**Notes**: Runs the existing `importBackup` merge — existing wins, every skip is counted, a traversing entry is refused whole. The renderer never supplies a path; names are validated by pattern + parse + containment before reading.

### `backup:changed`
**Direction**: main → renderer (push)
**Payload**: none
**Notes**: Fired after an attempt that wrote a file or failed, after a delete, after a restore and after a policy change. Not fired for a window skip.

## Policy (fixed in `src/main/backup/auto-backup.ts`)

- Interval: `daily` (default) or `weekly`; the window starts at local midnight / local Monday midnight.
- At most one automatic attempt per window; the attempt stamp lives in `<userData>/auto-backup-state.json`. A failed attempt also marks the window used.
- Retention: 7 by default, choices 3 / 7 / 14 / 30.
- File name: `aipa-backup-<local YYYY-MM-DD-HHmm>.json`; a second backup in the same minute appends `-2`, `-3`, …
- Retention only deletes names that match the pattern, parse to a real local date, are regular files, and resolve inside `<userData>/backups`. Everything else is reported in `foreignCount` and never removed. The manual export's default name (`aipa-backup-YYYY-MM-DD.json`) is therefore foreign.

## Preload surface

`backupList()`, `backupRunNow()`, `backupSetPolicy(patch)`, `backupDelete(name)`, `backupRestore(name)`, `onBackupChanged(cb): Unsubscribe`.
