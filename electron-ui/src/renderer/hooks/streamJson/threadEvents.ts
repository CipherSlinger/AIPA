import { useChatStore, useSessionStore } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { listSessionsShared } from '../../utils/sessionListShared'
import { readThreadLifecycleEvent } from '../../utils/threadLifecycle'
import { readThreadGoalNotice, shouldClearThreadGoal } from '../../utils/threadGoal'
import { describeThreadStatus } from '../../components/chat/threadStatusText'
import { engineNoticeStore } from '../../components/chat/engineNoticeStore'
import {
  compactSandboxPolicy,
  compactString,
  isNoticeForActiveConversation,
  isThreadReportForActiveConversation,
} from './guards'
import type { StreamJsonEventContext } from './eventContext'

/**
 * Thread-level reports (rename/archive/status/settings/goal) and the engine
 * notices that ride the same trust rule. Moved verbatim (wave 75C) from the
 * switch in `useStreamJson`.
 */
export function handleThreadEvent(event: string, data: any, ctx: StreamJsonEventContext): boolean {
  const { activeBridgeIdRef } = ctx

  if (event === 'cli:threadNameUpdated') {
    // `thread/name/updated` fires for a rename made by any client — the
    // Codex CLI included — so the sidebar can follow it without waiting
    // for the next list reload. The bridge's `sessionId` is a bridge id;
    // the payload's `threadId` is the list row id (see threadLifecycle).
    const lifecycle = readThreadLifecycleEvent('rename', data)
    if (!lifecycle || lifecycle.kind !== 'rename') return true
    useSessionStore.getState().applyThreadLifecycle(lifecycle)
    // The open header follows its own conversation even if the list has
    // not seen this thread yet (a brand-new thread is not listed until
    // its first result). `setSessionTitleFor` only paints the matching
    // view/tab, so a rename elsewhere leaves this transcript alone.
    useChatStore.getState().setSessionTitleFor(lifecycle.threadId, lifecycle.name)
    return true
  }

  if (event === 'cli:threadArchived' || event === 'cli:threadDeleted') {
    // A thread archived/deleted anywhere leaves the sidebar: both remove
    // the row. Deliberately do NOT clear the transcript the user is
    // reading — the honest minimum is to drop the stale row and leave
    // what is on screen intact. Continuing that conversation later fails
    // through the bridge's existing error path, not a fabricated one.
    const kind = event === 'cli:threadArchived' ? 'archive' as const : 'delete' as const
    const lifecycle = readThreadLifecycleEvent(kind, data)
    if (lifecycle) useSessionStore.getState().applyThreadLifecycle(lifecycle)
    return true
  }

  if (event === 'cli:threadUnarchived') {
    // The inverse of archive. `ThreadUnarchivedNotification` carries only
    // `threadId` — no title, cwd or timestamp — so the row cannot be
    // rebuilt from the event alone. Re-read the index and restore just
    // that one row; `restoreThreadRow` refuses an id that is already
    // listed (no duplicates) or that this window saw deleted (a late
    // unarchive cannot resurrect the user's delete).
    const lifecycle = readThreadLifecycleEvent('unarchive', data)
    if (!lifecycle || lifecycle.kind !== 'unarchive') return true
    void listSessionsShared().then((list) => {
      if (!list) return
      const row = (list as SessionListItem[]).find(item => item.sessionId === lifecycle.threadId)
      if (row) useSessionStore.getState().restoreThreadRow(row)
    })
    return true
  }

  if (event === 'cli:threadStatusChanged') {
    // `thread/status/changed`, reduced to a composer chip. This is a
    // thread-level report, so it uses the same ownership rule as the
    // settings report: only the bridge this composer started (or the
    // pending conversation) may paint it. Malformed payloads and unknown
    // variants map to `hidden`, which clears the chip instead of guessing.
    if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) return true
    const chip = describeThreadStatus(data)
    useChatStore.getState().setThreadStatus(chip.kind === 'hidden' ? null : chip)
    return true
  }

  if (event === 'cli:threadStarted') {
    // `thread/started`: the conversation moved to a different thread, so
    // the previous thread's "waiting on you" claim is no longer about
    // what is on screen. A goal belongs to a thread too: retire the line
    // when the report names another thread, and leave a same-thread
    // start (a resume) alone.
    if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) return true
    useChatStore.getState().setThreadStatus(null)
    const startedThreadId = (data as { threadId?: unknown } | null)?.threadId
    const goal = useChatStore.getState().threadGoal
    if (goal && typeof startedThreadId === 'string' && startedThreadId && startedThreadId !== goal.threadId) {
      useChatStore.getState().setThreadGoal(null)
    }
    return true
  }

  if (event === 'cli:threadSettingsUpdated') {
    // The settings the thread is actually running with. Reported, never
    // applied: writing `prefs.model` from here would silently change what
    // the next turn sends.
    if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) return true
    const settings = (data.settings ?? {}) as Record<string, unknown>
    useChatStore.getState().setThreadSettings({
      model: compactString(settings.model),
      modelProvider: compactString(settings.modelProvider),
      approvalPolicy: compactString(settings.approvalPolicy),
      effort: compactString(settings.effort),
      sandboxPolicy: compactSandboxPolicy(settings.sandboxPolicy),
    })
    return true
  }

  if (event === 'cli:threadGoalUpdated') {
    // A standing objective, not a turn delta. Same ownership rule as the
    // settings report: only the thread on screen may paint the strip.
    // `readThreadGoalNotice` is the validator — a malformed payload or an
    // unknown status leaves the current line untouched.
    if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) return true
    const goal = readThreadGoalNotice(data)
    if (goal) useChatStore.getState().setThreadGoal(goal)
    return true
  }

  if (event === 'cli:threadGoalCleared') {
    // `ThreadGoalClearedNotification` names only its thread. Clear only
    // when it is the goal currently on screen; a cleared event for a
    // different thread (or a malformed one) must not retire this line.
    if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) return true
    const clearedThreadId = (data as { threadId?: unknown } | null)?.threadId
    if (shouldClearThreadGoal(useChatStore.getState().threadGoal, clearedThreadId)) {
      useChatStore.getState().setThreadGoal(null)
    }
    return true
  }

  if (event === 'cli:engineWarning') {
    // The engine's own sentence. Warnings are thread-level, not turn
    // deltas: `configWarning` can arrive during initialize, before
    // `turn/started`. The store dedupes identical text, caps the stack
    // and keeps a dismissal until the turn ends; the text itself is
    // rendered verbatim, with no severity or cause invented here.
    // `kind: 'worldWritable'` rides this same channel and keeps the
    // engine's path list verbatim.
    if (!isNoticeForActiveConversation(data, activeBridgeIdRef.current)) return true
    engineNoticeStore.pushWarning(data)
    return true
  }

  if (event === 'cli:sandboxSetupCompleted') {
    // App-level lifecycle. Success is deliberately silent (the channel
    // itself is the low-key record); a failure is specific: the setup
    // mode the engine named and its own error text. Never a generic
    // "sandbox unavailable" claim.
    if (!isNoticeForActiveConversation(data, activeBridgeIdRef.current)) return true
    engineNoticeStore.pushSandboxSetupFailure(data)
    return true
  }

  if (event === 'cli:modelRerouted') {
    // The picker named one model and the engine ran another. Keep both
    // ids in the strip until the next turn starts, so the mismatch is
    // visible rather than quietly hidden.
    if (!isNoticeForActiveConversation(data, activeBridgeIdRef.current)) return true
    engineNoticeStore.setReroute(data)
    return true
  }

  return false
}
