/**
 * Turns a stored workflow into the prompts an automation actually sends.
 *
 * The renderer owns the canonical plan (`getWorkflowQueuePlan` /
 * `getStepQueueEntries` in `src/renderer/components/workflows/workflowConstants.ts`):
 * note nodes contribute nothing, parallel nodes contribute every non-empty
 * `parallelPrompts`, and everything else contributes `prompt`. That is mirrored
 * here because a scheduled run has no window to ask.
 *
 * A preset workflow's steps hold the *English* text from PRESET_WORKFLOWS, while
 * the editor shows the translated string for the active locale (see
 * `getPresetStepText`). Reading the renderer's own locale JSON at runtime keeps
 * a Chinese UI from silently running English prompts. The JSON is copied into
 * the main bundle by `scripts/copy-main-locales.js`; the source-tree path is a
 * dev fallback so a bare `tsc` build still resolves the translations.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'

const log = createLogger('automation-workflow-plan')

export type UiLocale = 'en' | 'zh-CN'

export interface MainWorkflowStep {
  nodeType?: string
  prompt?: string
  parallelPrompts?: string[]
}

export interface MainWorkflow {
  id: string
  /** Set on a built-in preset; its step text is localized by the renderer. */
  presetKey?: string
  steps?: MainWorkflowStep[]
}

const localeCache = new Map<UiLocale, Record<string, string>>()

function localeCandidates(locale: UiLocale): string[] {
  return [
    // Packaged / normal build: copied next to the compiled main bundle.
    path.join(__dirname, '..', 'locales', `${locale}.json`),
    // Dev fallback: `electron dist/main/index.js` from electron-ui/.
    path.join(process.cwd(), 'src', 'renderer', 'i18n', 'locales', `${locale}.json`),
  ]
}

/** Flatten nested JSON the same way the renderer's `flattenObject` does. */
function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, fullKey, out)
    } else {
      out[fullKey] = String(value)
    }
  }
  return out
}

function loadLocale(locale: UiLocale): Record<string, string> {
  const cached = localeCache.get(locale)
  if (cached) return cached

  for (const filePath of localeCandidates(locale)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
      const flat = flatten(parsed)
      localeCache.set(locale, flat)
      return flat
    } catch { /* try the next location */ }
  }
  // Missing translations fall back to the workflow's stored text, which is
  // exactly what the old resolver sent — never fail a run over a locale file.
  log.warn(`Locale file for ${locale} not found; preset prompts fall back to stored text`)
  localeCache.set(locale, {})
  return {}
}

/** Mirrors `getPresetStepText` for the prompt field only. */
function presetStepPrompt(
  presetKey: string | undefined,
  stepIndex: number,
  locale: UiLocale,
  fallback: string,
): string {
  if (!presetKey) return fallback
  const translated = loadLocale(locale)[`workflow.presetStep.${presetKey}.s${stepIndex + 1}Prompt`]
  return typeof translated === 'string' && translated ? translated : fallback
}

export function workflowPrompts(workflow: MainWorkflow, locale: UiLocale): string[] {
  const prompts: string[] = []
  const steps = workflow.steps ?? []

  steps.forEach((step, stepPosition) => {
    if (!step || step.nodeType === 'note') return

    if (step.nodeType === 'parallel' && step.parallelPrompts?.length) {
      for (const raw of step.parallelPrompts) {
        const prompt = typeof raw === 'string' ? raw.trim() : ''
        if (prompt) prompts.push(prompt)
      }
      return
    }

    const fallback = typeof step.prompt === 'string' ? step.prompt : ''
    const prompt = presetStepPrompt(workflow.presetKey, stepPosition, locale, fallback).trim()
    if (prompt) prompts.push(prompt)
  })

  return prompts
}
