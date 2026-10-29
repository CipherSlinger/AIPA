# API Spec: Unattended run approval holds
_Date: 2026-10-29_

A scheduled automation run that hits a permission request now holds it for the user instead of denying it immediately. A held request is answered from the background-work panel in the status bar.

## New IPC channels

### `automation:approvalRespond`
**Direction**: renderer → main (invoke)
**Params**: `{ jobId: string; requestId: string; approved: boolean }`
**Returns**: `{ ok: true } | { ok: false; error: 'invalid_request' | 'not_waiting' | 'unexpected_error' }`
**Notes**:
- Answers exactly one request, named by `jobId` + `requestId`. There is no "always allow", no per-job rule, and nothing is persisted about the answer.
- `not_waiting` is a normal outcome: the deadline passed, the run ended, or another click already answered it. The caller should drop the row and say it is gone — not retry.
- A denial is the same refusal a timeout produces; the run continues.

Preload exposes `automationApprovalRespond(jobId, requestId, approved): Promise<AutomationApprovalAnswerData>`.

## Extended push payloads

`automation:list` / `automation:changed` job views gain:

```ts
waitingApproval?: { requestId: string; since: number; subject: string }
```

Present only while that job's live run holds a request. `subject` is the engine's ask verbatim (tool + command/path/input), clipped only for storage.

`AutomationJobData.history[*]` (run records) gain:

```ts
approvals?: Array<{
  askedAt: number
  subject: string
  outcome: 'approved' | 'denied' | 'timeout' | 'queue-full' | 'run-busy' | 'run-ended' | 'interrupted'
  answeredBy?: 'user'        // exactly for approved / denied by a person
  resolvedAt: number
  waitedMs: number
}>
```

## Limits and lifetime

- At most 3 requests held across all runs; a fourth is denied immediately with `queue-full`.
- At most one held request per run; a second concurrent ask is denied with `run-busy`.
- Unanswered after 15 minutes → denied with `timeout`.
- `releaseRun` settles every hold a run owns at turn end, disposal, or turn failure, recording `run-ended`.
- A run waiting when the app quit is repaired on next launch as `interrupted_while_waiting`, with one `interrupted` approval row.
