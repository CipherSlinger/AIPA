/**
 * Small composer helpers that ask the active engine one hidden question:
 * a predicted reply and a "while you were away" recap.
 */
import { runAuxiliaryPrompt } from './internal-turns'

/**
 * Predict the user's next message (ghost text in the composer).
 *
 * Previously spawned `cli --print`; now runs on whichever engine the profile
 * is actually on, through the same private bridge as other background work.
 */
export async function generatePromptSuggestion(context: string): Promise<string> {
  const systemPrompt = 'You are a prompt predictor. Given the conversation context, predict what the user would naturally type next as their follow-up message. Output ONLY the predicted prompt text (2-12 words). Match the user\'s language and style. No quotes, no explanation.'
  const text = await runAuxiliaryPrompt({
    prompt: `${systemPrompt}\n\nConversation context:\n${context}\n\nPredict the user's next message (2-12 words):`,
    timeoutMs: 12_000,
    tag: 'suggestion',
  })
  // Models occasionally wrap the answer in quotes despite the instruction.
  const suggestion = text.replace(/^["'`]+|["'`]+$/g, '').trim()
  return suggestion.length > 0 && suggestion.length <= 120 ? suggestion : ''
}

/**
 * A 1-3 sentence recap for the "while you were away" dialog.
 *
 * Same engine rule as the suggestion; `cli:runInternal` was already the right
 * shape, so this uses it rather than a second spawn path.
 */
export async function generateAwaySummary(context: string): Promise<string> {
  const systemPrompt = 'You are a session recap assistant. The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task — what they are building or debugging, not implementation details. Next: the concrete next step. Skip status reports and commit recaps. Match the user\'s language.'
  const text = await runAuxiliaryPrompt({
    prompt: `${systemPrompt}\n\nConversation context:\n${context}\n\nWrite a 1-3 sentence recap of where we left off:`,
    timeoutMs: 15_000,
    tag: 'away-summary',
  })
  return text.length > 0 && text.length <= 500 ? text : ''
}
