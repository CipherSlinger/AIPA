/**
 * Whether a transcript's tail may offer "Retry" after an engine failure.
 *
 * The offer is derived from the transcript alone, which is what makes it
 * per-tab: each tab's snapshot carries its own messages, so an error in tab A
 * never puts a button under tab B's answer, and the button lives exactly as
 * long as the failed row is the latest one. Starting a turn (the composer's
 * send appends the user's row), a successful answer, or a stop all move or
 * replace the tail, and the offer goes away with it.
 *
 * A retry replays text and nothing else. A prompt that carried an image or a
 * file cannot be replayed faithfully from the transcript, so it is offered no
 * Retry at all rather than a button that would silently drop the attachment.
 */
import type { ChatMessage, StandardChatMessage } from '../../types/app.types'

export interface RetryTarget {
  /** The row whose text the retry resends. It stays in the transcript. */
  userMessageId: string
  text: string
}

export type RetryOffer =
  | { visible: false; enabled: false; target: null }
  | { visible: true; enabled: boolean; target: RetryTarget }

const HIDDEN: RetryOffer = Object.freeze({ visible: false, enabled: false, target: null })

/** This row is a `cli:turnError` failure rather than model output. */
export function isTurnErrorRow(message: ChatMessage | null | undefined): boolean {
  return message?.role === 'assistant' && (message as StandardChatMessage).turnError === true
}

/**
 * The last user row that started a turn. Guidance rows are skipped: they were
 * steered into a turn that had already begun, so replaying their text as a new
 * turn would answer something the user never asked on its own.
 */
export function findReplayableUserMessage(messages: readonly ChatMessage[]): StandardChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const standard = message as StandardChatMessage
    if (standard.guidance) continue
    return standard
  }
  return null
}

export function resolveRetryOffer(
  messages: readonly ChatMessage[],
  isStreaming: boolean,
): RetryOffer {
  const last = messages[messages.length - 1]
  if (!isTurnErrorRow(last)) return HIDDEN
  const user = findReplayableUserMessage(messages)
  if (!user) return HIDDEN
  // Text is the only thing the transcript can hand back verbatim.
  if ((user.attachments?.length ?? 0) > 0 || (user.fileAttachments?.length ?? 0) > 0) return HIDDEN
  if (!user.content || !user.content.trim()) return HIDDEN
  return {
    visible: true,
    // The send path refuses a turn while one is running; showing a disabled
    // control says that instead of silently queueing a second turn.
    enabled: !isStreaming,
    target: { userMessageId: user.id, text: user.content },
  }
}
