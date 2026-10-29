---
name: backup-format-v2
description: What AIPA's backup file carries and deliberately excludes, its existing-wins merge policy, and the per-file ceiling
metadata:
  type: project
---

Backup format 2 (wave 73A) is the app's whole durable state in one JSON document, not just electron-store prefs. It deliberately does **not** carry conversation transcripts, API keys, model-provider configs, or plugin data/credentials.

- `_meta.contains` is the in-file truth surface: `included`, `excluded`, `limits`. Keep it in sync with `_meta.counts` and the Settings → About copy whenever a section is added.
- Conversation trash is a manifest-only backup. Restored rows intentionally point at payload files that do not exist; the restore result warns with `session_payloads_missing` rather than hiding it. Never "fix" this by exporting transcripts.
- Merge policy is **existing wins**: jobs by id, pref collections by id (tag names by value), skill folders by name, memory files by path, trash rows by id. Settings values are overwritten on import. Global `pausedAll`/spend caps are taken from the backup only when no `automations.json` exists; an existing store keeps its own rails.
- A backup with no jobs section must leave the user's jobs untouched. A v1 file imports into its fields and reports `older_version` + `no_jobs_section`.
- Per-file ceiling is 512 KiB; oversized, binary (NUL or non-UTF-8), symlinked, unreadable and over-limit skill files are listed under `skills.skipped` / `memoryFiles.skipped`, never truncated.
- Restore validates path segments and relative paths per entry before writing; one unsafe path refuses that whole entry (staged folder write + rename), while other entries still apply. Refusals are `path_traversal`, `invalid_entry`, `outside_roots`.
- The format version is refused when newer than the build; older files still import.

Why: a restore that looks like a restore but leaves the user's real content behind is worse than no restore. How to apply: when adding a new durable section, bump the format version, add it to `_meta.contains`, the per-section counts, the merge path, and the harness.
