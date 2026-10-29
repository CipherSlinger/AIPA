---
name: trash-holding-area
description: Undoable deletes — skill, workflow and conversation holding areas, shared 30-day window, IPC surface, refusal codes, harness namespace rule
metadata:
  type: project
---

Deletes of skills, workflows and conversations are undoable for 30 days
(waves 68B and 69A). Three owners because the artefacts live in three places:

- **Skills** are folders. `src/main/trash/skill-trash.ts` moves the folder to
  `<userData>/trash/skills/<epoch>-<basename>/` and records it in
  `<userData>/trash/skills.json` (`{ version, entries: [...] }`). Skills never
  live in renderer prefs.
- **Workflows** are prefs. `src/renderer/lib/workflowTrash.ts` keeps them in
  `AppPrefs.trashedWorkflows` (`Array<{ workflow, deletedAt }>`), capped at 20;
  the oldest is dropped with a toast. Purged at app launch in `App.tsx`, not
  only when the Employees page opens.
- **Conversations** are transcripts. `src/main/trash/session-trash.ts` groups
  every file of one session (`{ id, sessionId, title?, engine, items, deletedAt }`)
  into `<userData>/trash/sessions/<epoch>-<basename>/`, manifest
  `<userData>/trash/sessions.json`. Claude files come from
  `findSessionFiles(id, projectsDir)` (one per project slug), Codex from
  `findSessionPaths(id, roots)` (legacy thread folder + date-sharded rollout);
  nested paths are collapsed so the folder carries its own JSONL. Both moves
  are all-or-nothing with rollback. Restore forgets the readers' summary caches
  (`forgetSessionCache`) so `session:list` sees the file without a restart.

**Why:** all three deletes used to be instant and permanent (pref filter /
`rm -rf` / `unlink`), so one misclick destroyed hand-written work.

**Shared move helper:** `src/main/trash/path-move.ts` (`movePath`) owns the
rename→EXDEV copy+delete fallback; skill-trash and session-trash both import it.

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
  `moveSessionToTrash`/`restoreTrashedSession` take an options object
  (`{ title?, now?, roots?, move? }`) for the same reason; `move` is the seam
  that proves the rollback.
- Conversation IPC: `session:trash:list|restore|purge|remove` (`{ok:true,...}` /
  `{ok:false,code,error}`). `session:delete` now sends `{ sessionId, title? }`
  and resolves `{ success:true, entry }` / `{ success:false, error, code }`;
  `not_found` replaces the old `false`. Preload: `sessionsTrash*`,
  `SessionTrashErrorCode`, `SessionDeleteResultData`.
- UI: `TrashSection.tsx` (Employees page, below workflows) renders all three
  kinds together, shows "Removes on <formatDateMedium date>", per-row refusal
  text, and returns `null` when empty. After a conversation restore it refreshes
  the sidebar through `listSessionsShared()` + `useSessionStore.setSessions`.
- **Harness namespace trap:** `.scratch/wave68b-undo-delete-harness/run.js`
  asserts every `'trash.*'` literal in `TrashSection.tsx` exists in the *wave
  68B fragment*, and must keep passing unchanged. Conversation copy therefore
  lives under `sessionTrash.*` in the wave 69A fragment; adding another
  `trash.*` key to that component breaks the older harness.
- Harnesses: `.scratch/wave68b-undo-delete-harness/` (17 checks),
  `.scratch/wave69a-session-trash-harness/` (18 checks).

Related: [[electron-main-ipc-conventions]].
