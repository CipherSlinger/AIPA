import { useSyncExternalStore } from 'react'
import { getEngineSteps, subscribeEngineSteps } from './engineStepLog'
import type { EngineStep } from './engineStepText'

/**
 * Subscribe the transcript to the unhandled-item log for one conversation.
 *
 * `viewSessionId` — not the message list's `sessionId` prop — is the stable
 * identity: `currentSessionId` is overwritten with the bridge id while a turn
 * streams, and a brand-new conversation has `null` until its first result.
 * The log itself keys the pending (`null`) bucket and adopts it afterwards, so
 * both phases select the same rows.
 */
export function useEngineSteps(viewSessionId: string | null | undefined): readonly EngineStep[] {
  return useSyncExternalStore(
    subscribeEngineSteps,
    () => getEngineSteps(viewSessionId),
  )
}
