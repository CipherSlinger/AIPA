/**
 * System-prompt assembly shared by the chat turn builder and the harness.
 *
 * Personas used to be applied by copying their model / system prompt / output
 * style into global prefs, so picking one expert in one conversation changed
 * the model behind every other conversation. The turn now resolves the persona
 * that belongs to *this session* and keeps the global prefs as the fallback for
 * sessions that never selected one. Nothing here writes prefs.
 */
import type { AppPrefs, Persona } from '../types/app.types'
import { resolveEffectiveModel } from '../lib/sessionModel'

export interface PersonaTurnSettings {
  /** The persona actually applied to this turn, if any. */
  personaId?: string
  name?: string
  /** A session references a persona that no longer exists in the catalogue. */
  missing: boolean
  model: string
  systemPrompt?: string
  outputStyle: NonNullable<AppPrefs['outputStyle']>
}

/**
 * Resolve the persona for the conversation that is about to send.
 *
 * Deliberately does NOT fall back to `prefs.activePersonaId`: that is the
 * default for *new* conversations (copied into the session when it is created),
 * not a global override for existing ones. Falling back to it here would make
 * "Default (No Expert)" impossible to select for an existing conversation.
 *
 * Model precedence: explicit session override > session persona > global prefs.
 * The override is what the header picker writes when the user chooses a model
 * in a conversation that is running as a persona.
 */
export function resolvePersonaTurnSettings(
  prefs: AppPrefs,
  sessionPersonaId: string | undefined,
  resolvePresetPrompt: (presetKey: string) => string,
  sessionModelOverride?: string,
): PersonaTurnSettings {
  const personas: Persona[] = prefs.personas || []
  const persona = sessionPersonaId ? personas.find((p) => p.id === sessionPersonaId) : undefined
  const missing = Boolean(sessionPersonaId && !persona)

  const systemPrompt = persona
    ? persona.presetKey
      ? resolvePresetPrompt(persona.presetKey)
      : persona.systemPrompt
    : prefs.systemPrompt

  return {
    personaId: persona?.id,
    name: persona?.name,
    missing,
    model: resolveEffectiveModel(prefs.model, persona?.model, sessionModelOverride),
    systemPrompt,
    outputStyle: (persona?.outputStyle || prefs.outputStyle || 'default') as NonNullable<
      AppPrefs['outputStyle']
    >,
  }
}

const OUTPUT_STYLE_PROMPTS: Record<string, string> = {
  explanatory:
    'You are in Explanatory mode. After providing your main response, add an "Insight" callout block that explains the reasoning behind key decisions or provides deeper context.',
  learning:
    'You are in Step-by-Step Learning mode. Break down complex topics into clear, numbered steps. After explaining a concept, add a "Practice" block that challenges the user to try something.',
}

export interface ComposeSystemPromptInput {
  prefs: AppPrefs
  persona: PersonaTurnSettings
  /** Pre-assembled, already-budgeted memory block ('' when none). */
  memoryContext: string
  /** Effective working directory for this turn (tab override > prefs). */
  cwd: string
  /** tempSystemPrompt > prefs.appendSystemPrompt, resolved by the caller. */
  appendSystemPrompt?: string | null
  /** Injected for deterministic harness output. */
  now?: Date
}

/**
 * Build the system-prompt parts that are prepended to the user message.
 * Order matters: presence, persona/custom prompt, output style, memory,
 * appended prompt.
 */
export function composeSystemPromptParts(input: ComposeSystemPromptInput): string[] {
  const { prefs, persona, memoryContext, cwd, appendSystemPrompt } = input
  const parts: string[] = []

  if (prefs.systemPresence !== false) {
    const now = input.now ?? new Date()
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'
    const presenceParts = [`Current date: ${dateStr}`, `Current time: ${timeStr} (${tz})`]
    if (cwd) {
      presenceParts.push(`Working directory: ${cwd}`)
    } else if (prefs.workingDir) {
      presenceParts.push(`Working directory: ${prefs.workingDir}`)
    }
    if (prefs.displayName) {
      presenceParts.push(`User name: ${prefs.displayName}`)
    }
    parts.push(`<system_context>\n${presenceParts.join('\n')}\n</system_context>`)
  }

  if (persona.systemPrompt?.trim()) {
    parts.push(persona.systemPrompt.trim())
  }

  if (persona.outputStyle !== 'default') {
    const stylePrompt = OUTPUT_STYLE_PROMPTS[persona.outputStyle]
    if (stylePrompt) {
      parts.push(`<output_style>\n${stylePrompt}\n</output_style>`)
    }
  }

  if (memoryContext.trim()) {
    parts.push(memoryContext.trim())
  }

  if (appendSystemPrompt?.trim()) {
    parts.push(appendSystemPrompt.trim())
  }

  return parts
}
