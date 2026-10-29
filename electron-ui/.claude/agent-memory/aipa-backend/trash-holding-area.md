---
name: trash-holding-area
description: Undoable deletes — skill trash manifest + workflow pref holding area, shared 30-day window, IPC surface and refusal codes
metadata:
  type: project
---

Deletes of skills and workflows are undoable for 30 days (wave 68B). There are
two owners because the artefacts live in different places:

- **Skills** are folders. `src/main/trash/skill-trash.ts` moves the folder to
  `<userData>/trash/skills/<epoch>-<basename>/` and records it in
  `<userData>/trash/skills.json` (`{ version, entries: [...] }`). Skills never
  live in renderer prefs.
- **Workflows** are prefs. `src/renderer/lib/workflowTrash.ts` keeps them in
  `AppPrefs.trashedWorkflows` (`Array<{ workflow, deletedAt }>`), capped at 20;
  the oldest is dropped with a toast. Purged at app launch in `App.tsx`, not
  only when the Employees page opens.

**Why:** both deletes used to be instant and permanent (pref filter / `rm -rf`),
so one misclick destroyed hand-written work.

**How to apply:**
- `SKILL_TRASH_RETENTION_DAYS` (main) and `TRASH_RETENTION_DAYS` (renderer) are
  both 30 and must stay equal; never hard-code `2592000000`. The panel takes
  the skill window from `skills:trash:list`'s `retentionDays`, not a literal.
- Purge boundary is "older than": keep when `deletedAt + retention >= now`.
- Restore never overwrites: skills refuse with `original_exists` when a folder
  is back at the original path, `folder_missing` when the trash copy is gone.
  Workflows refuse with `workflow_limit` when the list is full; a reused id gets
  a fresh one instead of replacing the newer workflow.
- IPC (all resolve result objects, never throw, so the renderer can show the
  reason): `skills:trash:list`, `skills:trash:restore`, `skills:trash:purge`,
  `skills:trash:remove`; `skills:delete` now moves to the trash and returns
  `{ success, entry }` or `{ success:false, error, code }`. Preload names:
  `skillsTrashList/Restore/Purge/Remove` next to `skillsDelete`.
- `moveSkillToTrash` / `restoreTrashedSkill` take an optional `skillsRoot` as a
  harness-only seam so tests use a temp dir, never `~/.claude/skills`.
- UI: `TrashSection.tsx` (Employees page, below workflows) renders both kinds
  together, shows "Removes on <formatDateMedium date>", per-row refusal text,
  and returns `null` when empty.
- Harness: `.scratch/wave68b-undo-delete-harness/` (17 checks).

Related: [[electron-main-ipc-conventions]].
