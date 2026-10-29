---
name: aipa-backend agent memory index
description: Memory index for aipa-backend agent
type: project
---

# aipa-backend Agent Memory

- [Clawd IPC channels](project_clawd_ipc.md) — clawd:launch, clawd:isRunning IPC channels + clawdEnabled pref (Iteration 615)
- [Auxiliary engine routing](project_auxiliary_engine_routing.md) — how hidden prompts pick Codex / active provider / legacy CLI, and what must stay Claude-only
- [Automation engine + attention](project_automation_engine_attention.md) — automations reuse the auxiliary engine resolver; pet replaces the scheduler notification (raiseAttention returns a boolean)
- [Backup format v2](project_backup_format_v2.md) — one honest JSON: jobs/skills/memory/trash in, transcripts/keys/plugins out; existing-wins merge; 512 KiB ceiling
- [Job handbook snapshot](project_job_handbook_snapshot.md) — renderer-written, main-read-only; stale still used; four absence states; one ceiling duplicated with harness parity
