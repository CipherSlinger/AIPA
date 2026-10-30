// Dispatching a task into chat, and keeping the task aware of its conversation.
//
// Two rules shape this module:
//  1. Dispatch is visible, never silent. It opens (or reuses) a chat tab whose
//     cwd is the task directory and fills the composer with a brief. The user
//     presses send; nothing is sent from here.
//  2. The task directory is the work directory. A department is attribution.
//     Nothing here reads or writes `prefs.workingDir`, and nothing here names a
//     department folder as a cwd.
//
// The task learns its conversation through `linkTaskSessionFromResult`, called
// by the result handler only after a completed turn. That is the one place a
// successful task turn turns into a `sessions[]` row.
import type { TaskRecordData, TaskSessionRefData } from '../../preload'
import type { SessionListItem } from '../types/app.types'
import { useChatStore, useTaskStore, useUiStore } from '../store'
import { getT } from '../i18n'
import { openSessionCore, type TaskSessionContext } from '../components/departments/openSessionCore'

export type TaskTurnPurpose = 'dispatch' | 'followup'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** The task's first conversation is a dispatch; every later one is a follow-up. */
export function taskDispatchPurpose(task: TaskRecordData): TaskTurnPurpose {
  return task.sessions.length > 0 ? 'followup' : 'dispatch'
}

/**
 * A session-list title is not always a title.
 *
 * A brand-new rollout's first user message carries the app's `<system_context>`
 * prefix, and the list derives its name from that line until the engine names
 * the conversation. Showing `<system_context>` in the task's conversation row
 * says nothing about the work, so the task name is the honest fallback.
 */
export function taskConversationTitle(listedTitle: string | undefined, taskTitle: string): string {
  const trimmed = (listedTitle || '').trim()
  if (!trimmed || trimmed.startsWith('<')) return taskTitle
  return trimmed
}

/**
 * The brief the user sees in the composer before pressing send.
 *
 * It names only material files the task actually holds (`material.relPath` is
 * the copy inside `materials/`), and says so when there are none. A brief that
 * listed a plausible file the folder does not contain would be the exact lie
 * this feature exists to avoid.
 */
export function buildTaskBrief(
  task: TaskRecordData,
  purpose: TaskTurnPurpose,
  t: Translate,
): string {
  const lines: string[] = [
    t('tasks.briefHeading', { title: task.title }),
    '',
    t('tasks.briefFolder', { directory: task.directory }),
    '',
  ]
  if (task.materials.length === 0) {
    lines.push(t('tasks.briefMaterialsNone'))
  } else {
    lines.push(t('tasks.briefMaterialsHeading'))
    for (const material of task.materials) {
      const storedName = material.relPath.split('/').pop() || material.name
      lines.push(storedName === material.name
        ? `- ${material.relPath}`
        : t('tasks.briefMaterialRow', { path: material.relPath, name: material.name }))
    }
  }
  lines.push('', t('tasks.briefInstruction'))
  if (purpose === 'followup') {
    lines.push('', t('tasks.briefFollowup'))
  }
  return lines.join('\n')
}

export type TaskDispatchOutcome =
  | { ok: true; tabId: string; purpose: TaskTurnPurpose }
  | { ok: false; code: 'folder_missing' | 'tab_limit'; error: string }

/**
 * Open the task's chat tab and fill the composer. Deliberately does not send.
 *
 * A follow-up starts a *new* conversation in the same task folder rather than
 * resuming the earlier thread: the task record keeps an ordered list of
 * conversations, and resuming would silently overwrite the transcript the user
 * already has while leaving no second row to open. The earlier conversation
 * stays reachable from the task detail.
 */
export function dispatchTask(task: TaskRecordData, t: Translate): TaskDispatchOutcome {
  if (task.missing) {
    return { ok: false, code: 'folder_missing', error: t('tasks.error.dispatchMissing') }
  }
  const purpose = taskDispatchPurpose(task)
  const tabId = useChatStore.getState().openTaskDraftTab({
    taskId: task.id,
    title: task.title,
    directory: task.directory,
    purpose,
  })
  if (!tabId) {
    return { ok: false, code: 'tab_limit', error: t('tasks.error.tabLimit') }
  }
  // Re-assert the task folder on the tab the send path reads. A reused draft
  // could have been moved by a folder pick; the task directory never changes.
  useChatStore.getState().setTabCwd(tabId, task.directory)
  useUiStore.getState().setFromDepartment(false)
  useUiStore.getState().setActiveNavItem('chat')
  useUiStore.getState().prefillComposer(buildTaskBrief(task, purpose, t))
  useUiStore.getState().requestInputFocus()
  return { ok: true, tabId, purpose }
}

/** A session row can disappear from the list; opening it still needs a shape. */
export function sessionListItemFor(sessionId: string, title?: string): SessionListItem {
  return {
    sessionId,
    lastPrompt: '',
    timestamp: Date.now(),
    project: '',
    projectSlug: '',
    ...(title ? { title } : {}),
  }
}

/**
 * Open a recorded task conversation in the task's chat tab.
 *
 * `openSessionCore` owns the folder decision (`sessionOpenDir`: task directory
 * wins). This wrapper only guarantees the tab exists first, so the fallback in
 * `openSessionCore` can never write the global working directory for a task.
 */
export async function openTaskConversation(
  task: TaskRecordData,
  ref: Pick<TaskSessionRefData, 'sessionId' | 'purpose'>,
  session?: SessionListItem,
): Promise<{ ok: boolean; error?: string }> {
  const context: TaskSessionContext = {
    taskId: task.id,
    title: task.title,
    directory: task.directory,
    purpose: ref.purpose,
  }
  const tabId = useChatStore.getState().ensureTaskTab({ ...context, linked: true })
  if (!tabId) return { ok: false, error: getT()('tasks.error.tabLimit') }
  const item = session ?? sessionListItemFor(ref.sessionId, task.title)
  await openSessionCore(item, '', 'task', context)
  // `openSessionCore` already set the tab session; this keeps the row's title
  // when the engine has a better one than the placeholder we passed.
  const chat = useChatStore.getState()
  if (chat.activeTabId) {
    chat.setTabSession(chat.activeTabId, ref.sessionId, taskConversationTitle(item.title, task.title))
  }
  return { ok: true }
}

/**
 * Record the conversation a completed task turn produced.
 *
 * Called by `handleResultEvent` *after* the success gate, so a failed or
 * interrupted turn never becomes the task's conversation. Returns true when a
 * link was started; the tab is marked before the IPC call so a result echo in
 * the same turn cannot request a second row.
 */
export function linkTaskSessionFromResult(sessionId: string): boolean {
  if (!sessionId) return false
  const chat = useChatStore.getState()
  const tab = chat.tabs.find(item => item.id === chat.activeTabId)
  const binding = tab?.task
  if (!tab || !binding || binding.linked) return false
  chat.setTabTaskLinked(tab.id, true)
  chat.setTabSession(tab.id, sessionId, taskConversationTitle(chat.currentSessionTitle ?? undefined, tab.title))
  void useTaskStore.getState().linkSession(binding.taskId, {
    sessionId,
    purpose: binding.purpose,
    ...(chat.sessionPersonaId ? { personaId: chat.sessionPersonaId } : {}),
  }).then(result => {
    if (result.ok) return
    // The turn succeeded but the record did not. Say so and leave the tab
    // unlinked, so a later completed turn retries instead of pretending.
    useChatStore.getState().setTabTaskLinked(tab.id, false)
    useUiStore.getState().addToast('warning', getT()('tasks.error.linkSession'))
  })
  return true
}
