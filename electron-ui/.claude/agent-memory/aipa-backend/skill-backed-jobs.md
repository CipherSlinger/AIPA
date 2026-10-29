---
name: skill-backed-jobs
description: How an automation job names a saved skill (source + one directory segment), why it is not a path, and the failure codes the row and history rely on
metadata:
  type: project
---

An automation job's third action kind stores `{ kind: 'skill', skillSource: 'personal' | 'project', skillDir }`.
`skillDir` is exactly one directory segment under a skills root, `''` meaning the root's own `SKILL.md`.

**Why:** the roots are recomputed at run time from the current working directory, so renaming the folder that
parents `.claude/skills` must not strand a schedule — storing a path would. Making the identity one segment also
makes traversal structurally impossible (separators, `.`, `..`, drive colon and NUL are rejected before
`path.join`), which is stronger than validating a path later and is the reason nothing re-checks the resolved
prefix except `resolveSkillInRoots` itself.

**How to apply:**
- Save time rejects `skill_invalid` (bad identity) and `skill_missing` (not installed); run time re-resolves and
  disables the job on `skill_missing` in the same shape as a deleted workflow, with `skill_unreadable` kept
  separate so a permissions error is not reported as deletion.
- The prompt ceiling is `DEPT_HANDBOOK_MAX_CHARS` (8,000) on purpose — see [[automation-scheduler]]; two ceilings
  would make the same file arrive whole in chat and half-read in a night run.
- Every whitelist that must keep the field already funnels through `normalizeJob` in `job-store.ts` (live store,
  [[trash-holding-area]], backup import), so extending that one function is the whole job. A whitelist added
  later that does not call it is the usual way this field disappears.
- `automation:list` views call `isActionMissing`, which stats the skill per job. Bounded by the 50-job cap; do not
  cache it without invalidation or deleted skills will show as healthy.
