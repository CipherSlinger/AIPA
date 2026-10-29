---
name: job-handbook-snapshot
description: Design decisions for the renderer-written department handbook snapshot that scheduled runs read (wave 75A)
metadata:
  type: project
---

A scheduled run now carries its job's department handbook. Design decisions that are not obvious from the code:

- The snapshot is renderer-written, main-read-only (`automation:handbookSnapshotSync`). Main must never edit it: the tree lives in the renderer and a second writer would drift.
- Stale snapshots (> 7 days) are used, not dropped; the run record says how old. Silence is never an accepted answer — every real run records one of four absence states (no-department / no-snapshot / unknown-department / empty).
- The 8,000-char ceiling is duplicated in main (tsconfig rootDir forbids importing renderer code); the wave75a harness asserts byte-identical block output and the shared constant against `src/renderer/lib/deptHandbook.ts`. Any change to either must be made in both.
- Snapshot storage bounds: 50,000 chars per node, 500 nodes, 500,000 chars total. A node clipped by those bounds is still "the rules", but the digest's sourceChars reflects what was stored.
- Chained runs resolve the successor's `departmentId` automatically because the scheduler passes the target job into the runner request.

**Why:** wave 73B gave chat a per-turn handbook but left scheduled runs ruleless; users could not see the asymmetry.
**How to apply:** when touching the run prompt envelope or handbook handling, keep chat and unattended paths in lockstep and re-run `.scratch/wave75a-job-handbook-harness`.
