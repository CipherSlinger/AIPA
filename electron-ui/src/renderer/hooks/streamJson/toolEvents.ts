import { useChatStore } from '../../store'
import type { PlanMessage, StandardChatMessage } from '../../types/app.types'
import { describeEngineItem, TOOL_CARD_KINDS } from '../../components/chat/engineStepText'
import { itemIdFromToolId } from '../../components/chat/fileChangePatch'
import { recordEngineStep } from '../../components/chat/engineStepLog'
import { liveFilePatchStore } from '../../components/chat/liveFilePatchStore'
import { autoApprovalReviewStore } from '../../components/chat/autoApprovalReviewStore'
import { compactString, hasToolCardForItem, hasToolCardForItemFamily } from './guards'

/**
 * `cli:*` channels that paint tool cards, quiet engine-step rows and the
 * live file patch. Moved verbatim (wave 75C) from the switch in
 * `useStreamJson`. None of these branches touched the hook's refs, which is
 * why this handler takes no context.
 */
export function handleToolEvent(event: string, data: any): boolean {
  if (event === 'cli:toolUse') {
    const e = data.event as Record<string, unknown>
    // Detect ExitPlanMode — render as plan card instead of tool block
    if (e.name === 'ExitPlanMode') {
      const input = (e.input as Record<string, unknown>) ?? {}
      const planContent = (input.plan as string) || JSON.stringify(input, null, 2)
      useChatStore.getState().addPlanMessage({
        id: `plan-${Date.now()}`,
        role: 'plan',
        planContent,
        decision: 'pending',
        timestamp: Date.now(),
      } as PlanMessage)
      return true
    }
    {
      const chatState = useChatStore.getState()
      let lastMsg = chatState.messages.at(-1)
      // Codex often runs a command before writing any text. Without a
      // streaming assistant message to attach to, the tool call would be
      // dropped; create the placeholder here (text deltas then append to
      // it because it is the last streaming assistant).
      if (!lastMsg || lastMsg.role !== 'assistant' || !(lastMsg as StandardChatMessage).isStreaming) {
        const placeholder: StandardChatMessage = {
          id: `asst-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        }
        chatState.addMessage(placeholder)
        lastMsg = placeholder
      }
      const toolId = String(e.id ?? '')
      const toolName = String(e.name ?? '')
      const toolInput = (e.input as Record<string, unknown>) ?? {}
      // Codex re-sends a file-change item's input when it completes so
      // the final Edit card carries the authoritative diff (the started
      // event usually had no paths yet). Update the existing card in
      // place; appending would show the same edit twice.
      const alreadyShown = chatState.messages.some(message => {
        if (message.role === 'permission') return false
        const toolUses = (message as StandardChatMessage).toolUses
        return Array.isArray(toolUses) && toolUses.some(tool => tool.id === toolId)
      })
      if (alreadyShown) {
        const pending = new Map(chatState.pendingToolUses)
        if (pending.has(toolId)) pending.set(toolId, { name: toolName, input: toolInput })
        useChatStore.setState({
          messages: chatState.messages.map(message => {
            if (message.role === 'permission') return message
            const std = message as StandardChatMessage
            if (!std.toolUses?.some(tool => tool.id === toolId)) return message
            return {
              ...std,
              toolUses: std.toolUses.map(tool =>
                tool.id === toolId ? { ...tool, name: toolName, input: toolInput } : tool,
              ),
            }
          }),
          pendingToolUses: pending,
        })
      } else {
        chatState.addToolUse(lastMsg.id, toolId, toolName, toolInput)
        // A new card reused this id; a previous review's verdict is not
        // about it. (A re-sent completed item keeps its annotation.)
        autoApprovalReviewStore.beginItem(toolId)
      }
      // Track file changes for the Changes panel (Iteration 521: code
      // changes view). Only on first sight: Codex re-sends a file-change
      // toolUse when the item completes, and `addChangedFile` appends
      // without deduping, so tracking again would list the same file
      // twice in the Changes panel.
      if (!alreadyShown) {
        const filePath = (toolInput.file_path || toolInput.path) as string | undefined
        const isFileModifyingTool =
          /Edit|Write|Create/i.test(toolName) ||
          toolName === 'str_replace_editor' ||
          toolName === 'str_replace_based_edit_tool'
        if (filePath && isFileModifyingTool) {
          useChatStore.getState().addChangedFile(filePath, toolName)
        }
      }
      // A new item may reuse an id from a replayed transcript; forget a
      // previous completion marker so its live snapshots can land.
      liveFilePatchStore.beginItem(itemIdFromToolId(toolId))
    }
    return true
  }

  if (event === 'cli:toolResult') {
    const e = data.event as Record<string, unknown>
    // The completed fileChange item is authoritative. Drop the live
    // snapshot and any queued trailing update before resolving the card,
    // so a partial patch can never outlive or overwrite the final diff.
    liveFilePatchStore.completeItem(itemIdFromToolId(String(e.tool_use_id ?? '')))
    useChatStore.getState().resolveToolUse(
      e.tool_use_id as string,
      e.content,
      Boolean(e.is_error)
    )
    return true
  }

  if (event === 'cli:itemStarted' || event === 'cli:itemCompleted') {
    // `codex-bridge` translates the item kinds the rich cards understand
    // and forwards the rest verbatim on these channels. Before this case
    // existed, those items vanished and a stretch of the turn looked like
    // it did nothing. The ownership rule is the same as for deltas: a
    // background or other-tab turn must not paint this transcript.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) return true
    const phase = event === 'cli:itemStarted' ? 'started' as const : 'completed' as const
    // An item that finished before its review did has no card left for
    // an in-progress line; a completed verdict stays.
    if (phase === 'completed') {
      const item = (data as { item?: { id?: unknown } }).item
      const completedId = typeof item?.id === 'string' ? item.id : ''
      if (completedId) autoApprovalReviewStore.completeItem(completedId)
    }
    const step = describeEngineItem(phase, data)
    if (!step) return true
    // A quiet row is only for steps without a visible card; if the same
    // item already has one, adding a row would show the step twice.
    if (TOOL_CARD_KINDS.has(step.kind) && hasToolCardForItem(step.id)) return true
    recordEngineStep(useChatStore.getState().viewSessionId, step)
    return true
  }

  if (event === 'cli:patchUpdated') {
    // A live snapshot of the file change Codex is still writing. Same
    // ownership rule as every other turn-scoped event: a background or
    // other-tab turn must not paint this transcript. Patches whose item
    // has no visible card are dropped by the store's caller; the card's
    // own completion event remains authoritative.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) return true
    const itemId = typeof data.itemId === 'string' ? data.itemId : ''
    if (!itemId || !hasToolCardForItemFamily(itemId)) return true
    liveFilePatchStore.ingest(data)
    return true
  }

  if (event === 'cli:turnDiffUpdated') {
    // Codex's own aggregate patch for the turn — it includes changes made
    // by shell commands, which the per-tool cards cannot show. It belongs
    // to a turn, so the deltas' ownership rule applies: only the bridge
    // this composer started may paint this view.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (!useChatStore.getState().isOwnedStreamEvent(sid)) return true
    const diff = typeof data.diff === 'string' ? data.diff : ''
    if (!diff) return true
    useChatStore.getState().setTurnDiff({
      sessionId: sid,
      threadId: compactString(data.threadId),
      turnId: compactString(data.turnId),
      diff,
      truncated: data.truncated === true,
      capturedAt: typeof data.capturedAt === 'number' && Number.isFinite(data.capturedAt)
        ? data.capturedAt
        : null,
      cwd: compactString(data.cwd),
    })
    return true
  }

  if (event === 'cli:autoApprovalReview') {
    // A reviewer's verdict is only meaningful when the item it names is
    // already on screen. Checking the card first is what prevents a
    // phantom row; the store itself never renders anything.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) return true
    const targetItemId = typeof data.targetItemId === 'string' ? data.targetItemId : ''
    if (!targetItemId || !hasToolCardForItemFamily(targetItemId)) return true
    autoApprovalReviewStore.ingest(data)
    return true
  }

  return false
}
