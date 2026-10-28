// What the engine's `thread/status/changed` report means for the composer.
//
// The bridge forwards the raw `params.status` of Codex's `ThreadStatus`
// notification (verified against the 0.145 app-server binary, an internally
// tagged enum serialized in camelCase):
//
//   { type: 'notLoaded' }
//   { type: 'idle' }
//   { type: 'systemError' }
//   { type: 'active', activeFlags?: Array<'waitingOnApproval' | 'waitingOnUserInput'> }
//
// This module is deliberately pure and knows nothing about IPC or the store:
// the caller decides whether the event belongs to the conversation on screen.
// A hidden result is also the clear signal — `idle`, `notLoaded`, a plain
// `active` with no flags, and anything malformed all mean "no chip". The
// renderer never infers "thinking" from text: only `active` plus one of the two
// flags is allowed to say the engine is waiting on the user.

export type ThreadStatusChipKind =
  | 'hidden'
  | 'waitingApproval'
  | 'waitingInput'
  | 'error'

export interface ThreadStatusChip {
  kind: ThreadStatusChipKind
}

const HIDDEN: ThreadStatusChip = { kind: 'hidden' }

/**
 * When both flags are present, the approval chip wins. An approval is the
 * gating decision: the engine cannot proceed with the tool it asked about
 * until it is granted or denied, while the pending question (if any) can only
 * be answered meaningfully afterwards. Showing the risk-bearing gate also
 * avoids two competing "waiting" chips for one blocked turn.
 */
export function describeThreadStatus(payload: unknown): ThreadStatusChip {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return HIDDEN

  const status = (payload as { status?: unknown }).status
  if (!status || typeof status !== 'object' || Array.isArray(status)) return HIDDEN

  const type = (status as { type?: unknown }).type
  if (typeof type !== 'string') return HIDDEN

  switch (type) {
    case 'active': {
      const flags = (status as { activeFlags?: unknown }).activeFlags
      if (!Array.isArray(flags)) return HIDDEN
      if (flags.includes('waitingOnApproval')) return { kind: 'waitingApproval' }
      if (flags.includes('waitingOnUserInput')) return { kind: 'waitingInput' }
      // `active` with no recognised flag is the engine working, not a reason
      // to claim it is blocked on the user.
      return HIDDEN
    }
    case 'idle':
    case 'notLoaded':
      return HIDDEN
    case 'systemError':
      // The protocol variant carries no detail. Do not invent a cause.
      return { kind: 'error' }
    default:
      return HIDDEN
  }
}
