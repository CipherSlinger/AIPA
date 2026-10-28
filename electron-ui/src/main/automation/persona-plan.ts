/**
 * Resolves the persona a scheduled workflow run executes as.
 *
 * The renderer stores personas in prefs (`prefs.personas`), and a workflow only
 * records the persona's id. A hidden run has no window to ask, so the binding is
 * resolved here from the same stored data the chat path uses: a preset persona's
 * prompt comes from the locale JSON (already loaded for workflow step text),
 * while a custom persona carries its own prompt.
 *
 * Everything in this file is pure and free of Electron imports so the resolution
 * rules can be exercised by a plain Node harness. Reading prefs stays in the
 * scheduler, which already owns the other read-only pref access.
 */
import { loadLocale, type UiLocale } from './workflow-plan'

export type PersonaOutputStyle = 'explanatory' | 'learning'

/** The subset of the renderer's `Persona` the main process cares about. */
export interface StoredPersona {
  id?: unknown
  name?: unknown
  emoji?: unknown
  model?: unknown
  systemPrompt?: unknown
  presetKey?: unknown
  outputStyle?: unknown
}

export interface WorkflowPersonaBinding {
  id: string
  name: string
  /** Preferred model, when the persona names a non-empty one. */
  model?: string
  /** Localized preset prompt, or the persona's custom prompt. May be empty. */
  systemPrompt: string
  outputStyle?: PersonaOutputStyle
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toOutputStyle(value: unknown): PersonaOutputStyle | undefined {
  return value === 'explanatory' || value === 'learning' ? value : undefined
}

/**
 * Look up the persona a workflow is bound to.
 *
 * Returns null when the id is unset or points at a persona the user has since
 * deleted. Callers must treat null as "run as the plain assistant", never as a
 * reason to skip or fail the job.
 */
export function resolveWorkflowPersona(
  personaId: string | undefined,
  personas: readonly StoredPersona[],
  locale: UiLocale,
): WorkflowPersonaBinding | null {
  const id = nonEmptyString(personaId)
  if (!id) return null
  const persona = personas.find((candidate) => candidate && candidate.id === id)
  if (!persona) return null

  const presetKey = nonEmptyString(persona.presetKey)
  // Preset personas also store their English prompt, so a missing translation
  // degrades to that text instead of an empty system prompt — the same fallback
  // workflowPlan() uses for preset step text.
  const presetPrompt = presetKey ? loadLocale(locale)[`persona.presetPrompt.${presetKey}`] : undefined
  const systemPrompt = nonEmptyString(presetPrompt) ?? nonEmptyString(persona.systemPrompt) ?? ''

  return {
    id,
    name: nonEmptyString(persona.name) ?? id,
    model: nonEmptyString(persona.model),
    systemPrompt,
    outputStyle: toOutputStyle(persona.outputStyle),
  }
}

/**
 * Model precedence for a scheduled run: the bound persona's preference wins,
 * then the global chat model pref. Blank strings in either place fall through
 * instead of being sent to an engine as a model id.
 */
export function pickRunModel(personaModel?: string, prefModel?: string): string | undefined {
  return nonEmptyString(personaModel) ?? nonEmptyString(prefModel)
}

/**
 * Keep a model id from crossing engines. Persona presets ship with Claude ids,
 * and Codex rejects one as an unknown model at `thread/start`; dropping it makes
 * Codex use its own default. The legacy Claude path deliberately forwards
 * non-Claude ids to provider endpoints, so it is never filtered here (the runner
 * has its own provider-aware check for that engine).
 */
export function filterModelForEngine(
  model: string | undefined,
  engine: 'codex' | 'claude',
): string | undefined {
  const id = nonEmptyString(model)
  if (!id) return undefined
  if (engine === 'codex' && /^claude[-:]/i.test(id)) return undefined
  return id
}

/**
 * Output-style blocks. Mirrors `OUTPUT_STYLE_PROMPTS` in the renderer's
 * `promptAssembly.ts` — chat and scheduled runs must say the same thing to the
 * model, so a wording change there belongs here too.
 */
const OUTPUT_STYLE_PROMPTS: Record<string, string> = {
  explanatory:
    'You are in Explanatory mode. After providing your main response, add an "Insight" callout block that explains the reasoning behind key decisions or provides deeper context.',
  learning:
    'You are in Step-by-Step Learning mode. Break down complex topics into clear, numbered steps. After explaining a concept, add a "Practice" block that challenges the user to try something.',
}

/**
 * The persona part of one prompt, already terminated by a blank line, or '' when
 * there is no persona. Chat order is persona prompt → `<output_style>`; the
 * caller puts memory outside this prefix, so it stays free of memory text.
 */
export function buildPersonaPromptPrefix(
  systemPrompt: string | undefined,
  outputStyle?: PersonaOutputStyle,
): string {
  const parts: string[] = []
  const prompt = nonEmptyString(systemPrompt)
  if (prompt) parts.push(prompt)
  if (outputStyle) {
    const stylePrompt = OUTPUT_STYLE_PROMPTS[outputStyle]
    if (stylePrompt) parts.push(`<output_style>\n${stylePrompt}\n</output_style>`)
  }
  return parts.length > 0 ? `${parts.join('\n\n')}\n\n` : ''
}
