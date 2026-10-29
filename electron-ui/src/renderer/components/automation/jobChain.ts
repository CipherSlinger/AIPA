// Which jobs a chain may name, and which choices would make it loop.
//
// The main process refuses a loop when the job is saved (`findChainCycle` in
// src/main/automation/job-chain.ts) and its refusal is final. This walker exists
// so the user sees the loop in the picker instead of after a round-trip: the
// dialog disables the choice and says why. The two walks must agree about what a
// loop is — they follow the same two edges, from the job being edited through
// every other job's stored chain.

import type { AutomationJobChainData } from '../../../preload'

/** The fields of a job this walker needs; a full `AutomationJobData` fits. */
export interface ChainJobLike {
  id: string
  name: string
  /** A switched-off job can be named, but the scheduler will not start it. */
  enabled: boolean
  chain?: AutomationJobChainData
}

export interface ChainOption {
  id: string
  name: string
  /** Choosing it would make the chain run back into the job being edited. */
  loops: boolean
}

function storedTargets(job: ChainJobLike | undefined): string[] {
  if (!job?.chain) return []
  return [job.chain.onSuccess, job.chain.onFailure]
    .filter((target): target is string => typeof target === 'string' && target.length > 0)
}

/**
 * The candidates for one select, in list order, each flagged if it would close a
 * loop.
 *
 * `slot` and `otherValue` describe the chain as it would be saved with that
 * candidate chosen: the edit being judged is one side of a two-sided draft, so a
 * candidate that loops only through the *other* slot must be flagged too. The
 * job being edited is never a candidate — naming itself is a loop of length one,
 * which main refuses as `chain_cycle`.
 */
export function buildChainOptions(
  jobs: readonly ChainJobLike[],
  currentJobId: string | undefined,
  slot: 'onSuccess' | 'onFailure',
  otherValue: string,
): ChainOption[] {
  const byId = new Map<string, ChainJobLike>()
  for (const job of jobs) byId.set(job.id, job)

  // Edges of a job as the draft would have them: the edited job's are the two
  // selects (with this candidate in the slot being judged), everyone else's are
  // what the store holds.
  const draftTargets = (id: string, candidate?: string): string[] => {
    if (currentJobId !== undefined && id === currentJobId) {
      const onSuccess = slot === 'onSuccess' ? candidate : otherValue
      const onFailure = slot === 'onFailure' ? candidate : otherValue
      return [onSuccess, onFailure].filter((target): target is string => !!target)
    }
    return storedTargets(byId.get(id))
  }

  const closesLoop = (candidate: string): boolean => {
    if (currentJobId === undefined) return false
    const queue = [...draftTargets(currentJobId, candidate)]
    const seen = new Set<string>()
    while (queue.length > 0) {
      const id = queue.shift() as string
      if (id === currentJobId) return true
      if (seen.has(id)) continue
      seen.add(id)
      queue.push(...draftTargets(id))
    }
    return false
  }

  return jobs
    .filter(job => currentJobId === undefined || job.id !== currentJobId)
    .map(job => ({ id: job.id, name: job.name, loops: closesLoop(job.id) }))
}
