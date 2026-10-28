/**
 * Turn a finished conversation into reusable artefacts: a workflow draft and a
 * SKILL.md draft.
 *
 * Both are derived deterministically from what the user actually typed. No
 * model call: the point is a faithful first draft the user can edit, not an
 * invented summary. Assistant turns never become steps; they only contribute
 * file/command context that makes a step easier to replay.
 */

import type { ChatMessage, StandardChatMessage } from '../types/app.types'
import { isNoisyTitle, firstMeaningfulLine } from './sessionTitle'
import {
  MAX_STEPS,
  MAX_STEP_PROMPT,
  MAX_NAME_LENGTH,
  MAX_DESC_LENGTH,
} from '../components/workflows/workflowConstants'

/** Skill bodies stay short enough to read; 12 requests is a skill, 20 is a runbook. */
export const MAX_SKILL_STEPS = 12
/** Each request is quoted in the skill body, not dumped whole. */
const MAX_SKILL_STEP_CHARS = 800
const MAX_SKILL_DESCRIPTION = 120

const FILE_TOOL_NAMES = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'NotebookRead'])
const COMMAND_TOOL_NAMES = new Set(['Bash', 'Shell', 'exec_command', 'shell', 'run_command', 'terminal'])

type Translate = (key: string, params?: Record<string, string | number>) => string

interface TurnContext {
  files: string[]
  commands: string[]
}

export interface DerivedStep {
  id: string
  title: string
  prompt: string
  /** True when the original request could not fit MAX_STEP_PROMPT verbatim. */
  promptTruncated: boolean
}

export interface WorkflowDraft {
  name: string
  description: string
  steps: DerivedStep[]
  totalTurns: number
  truncated: boolean
}

export interface SkillDraft {
  name: string
  description: string
  body: string
  totalTurns: number
  truncated: boolean
}

/**
 * Transcripts record more than human turns as `user` messages. `isNoisyTitle`
 * already covers slash commands, wrapper tags, image placeholders and
 * interruption notices; these are the remaining harness artefacts seen in
 * real transcripts.
 */
export function isHumanTurn(content: string): boolean {
  if (isNoisyTitle(content)) return false
  const trimmed = content.trim()
  if (/^This session is being continued from a previous conversation/i.test(trimmed)) return false
  if (/^\[Your previous response had no visible output/i.test(trimmed)) return false
  if (/^Caveat: The messages below were generated/i.test(trimmed)) return false
  return true
}

function messageText(message: ChatMessage): string | null {
  if (message.role !== 'user') return null
  const content = (message as StandardChatMessage).content
  return typeof content === 'string' ? content : null
}

function titleFor(content: string, index: number, t: Translate): string {
  const line = firstMeaningfulLine(content) || content.split('\n')[0]?.trim() || ''
  const cleaned = line.replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ').trim()
  return (cleaned || t('sessionReuse.workflow.stepFallback', { n: index + 1 })).slice(0, MAX_NAME_LENGTH)
}

function readablePath(value: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean)
  return parts.length <= 3 ? value : `.../${parts.slice(-3).join('/')}`
}

function firstString(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function collectContext(messages: ChatMessage[], start: number, end: number): TurnContext {
  const files = new Set<string>()
  const commands = new Set<string>()
  for (let i = start; i < end; i++) {
    const message = messages[i]
    if (message.role !== 'assistant') continue
    for (const tool of (message as StandardChatMessage).toolUses ?? []) {
      const input = tool.input ?? {}
      if (FILE_TOOL_NAMES.has(tool.name)) {
        const file = firstString(input, ['file_path', 'notebook_path', 'path'])
        if (file) files.add(readablePath(file))
      } else if (COMMAND_TOOL_NAMES.has(tool.name)) {
        // Commands end up inside Markdown code spans; strip backticks so a
        // shell pipeline cannot break the generated file, and keep the first
        // line only — a heredoc is not useful provenance. The ellipsis marks
        // the cut so the text does not read as a malformed command.
        const singleLine = firstString(input, ['command', 'cmd'])
          .split('\n')[0]
          .replace(/`/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
        const command = singleLine.length > 90
          ? `${singleLine.slice(0, 89).trimEnd()}…`
          : singleLine
        if (command) commands.add(command)
      }
    }
  }
  return {
    files: [...files].slice(0, 4),
    commands: [...commands].slice(0, 3),
  }
}

function contextBlock(context: TurnContext, t: Translate): string {
  const lines: string[] = []
  if (context.files.length > 0) {
    lines.push(t('sessionReuse.contextFiles', { items: context.files.join(', ') }))
  }
  if (context.commands.length > 0) {
    lines.push(
      t('sessionReuse.contextCommands', {
        items: context.commands.map(command => `\`${command}\``).join(', '),
      }),
    )
  }
  return lines.length > 0 ? `\n\n${lines.join('\n')}` : ''
}

function buildPrompt(content: string, context: TurnContext, t: Translate): {
  prompt: string
  truncated: boolean
} {
  const raw = content.trim()
  const truncated = raw.length > MAX_STEP_PROMPT
  const base = truncated ? `${raw.slice(0, MAX_STEP_PROMPT - 1)}…` : raw
  const block = contextBlock(context, t)
  // Prefer the user's own words over context: if both do not fit, drop the
  // context rather than eating the request.
  return block && base.length + block.length <= MAX_STEP_PROMPT
    ? { prompt: base + block, truncated }
    : { prompt: base, truncated: truncated || block.length > 0 }
}

interface HumanTurn {
  index: number
  content: string
}

function humanTurns(messages: ChatMessage[]): HumanTurn[] {
  const turns: HumanTurn[] = []
  messages.forEach((message, index) => {
    const content = messageText(message)
    if (content && isHumanTurn(content)) turns.push({ index, content })
  })
  return turns
}

function turnContexts(messages: ChatMessage[], turns: HumanTurn[]): TurnContext[] {
  return turns.map((turn, i) => {
    const end = i + 1 < turns.length ? turns[i + 1].index : messages.length
    return collectContext(messages, turn.index + 1, end)
  })
}

function baseTitle(
  sessionTitle: string | null | undefined,
  turns: HumanTurn[],
  t: Translate,
): string {
  const stored = sessionTitle?.trim() ?? ''
  if (stored && !isNoisyTitle(stored)) return stored
  if (turns.length > 0) {
    const derived = firstMeaningfulLine(turns[0].content)
    if (derived) return derived
  }
  return t('sessionReuse.untitled')
}

export function buildWorkflowDraft(
  messages: ChatMessage[],
  sessionTitle: string | null | undefined,
  t: Translate,
): WorkflowDraft {
  const turns = humanTurns(messages)
  const contexts = turnContexts(messages, turns)
  const shown = turns.slice(0, MAX_STEPS)
  const name = baseTitle(sessionTitle, turns, t).slice(0, MAX_NAME_LENGTH)
  const steps = shown.map((turn, i) => {
    const built = buildPrompt(turn.content, contexts[i], t)
    return {
      // Stable within the draft; the caller owns the final workflow id.
      id: `derived-step-${i + 1}`,
      title: titleFor(turn.content, i, t),
      prompt: built.prompt,
      promptTruncated: built.truncated,
    }
  })
  const count = turns.length
  return {
    name,
    description: t(
      count === 1
        ? 'sessionReuse.workflow.descriptionTextOne'
        : 'sessionReuse.workflow.descriptionText',
      { count },
    ).slice(0, MAX_DESC_LENGTH),
    steps,
    totalTurns: turns.length,
    truncated: turns.length > shown.length,
  }
}

/**
 * The directory name `skills:install` will create.
 *
 * The installer is the authority: it lowercases and replaces every character
 * outside `[a-zA-Z0-9_-]` with `-` (see skills-handlers.ts). This mirrors that
 * rule exactly so the dialog's preview is the real path, and the result is
 * passed as the install `name` (the transform is idempotent), which also makes
 * SKILL.md's `name:` agree with its folder. Keep the two in sync — if the
 * installer's rule changes, this must change with it.
 *
 * The empty fallback is applied here because the installer has none; sending
 * this slug means the installer never receives an empty name.
 */
export function skillInstallSlug(raw: string): string {
  const slug = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
  return slug || `session-${new Date().toISOString().slice(0, 10)}`
}

/** Markdown continuation lines need indentation to stay inside the list item. */
function listItem(text: string): string {
  const clamped = text.length > MAX_SKILL_STEP_CHARS
    ? `${text.slice(0, MAX_SKILL_STEP_CHARS - 1)}…`
    : text
  return clamped.split('\n').map((line, i) => (i === 0 ? line : `   ${line}`)).join('\n')
}

export function buildSkillDraft(
  messages: ChatMessage[],
  sessionTitle: string | null | undefined,
  t: Translate,
): SkillDraft {
  const turns = humanTurns(messages)
  const contexts = turnContexts(messages, turns)
  const shown = turns.slice(0, MAX_SKILL_STEPS)
  const title = baseTitle(sessionTitle, turns, t)
  const name = skillInstallSlug(title)
  const description = title.replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_DESCRIPTION)
    || t('sessionReuse.skill.nameFallback')

  const bodyParts: string[] = [
    `# ${title}`,
    '',
    t('sessionReuse.skill.skillIntro'),
    '',
    `## ${t('sessionReuse.skill.skillStepsHeading')}`,
    '',
  ]
  shown.forEach((turn, i) => {
    bodyParts.push(`${i + 1}. ${listItem(turn.content.trim())}`)
    bodyParts.push('')
  })

  // Context from all included turns, deduplicated. Labelled as provenance so
  // nobody mistakes it for an instruction the user typed.
  const files = new Set<string>()
  const commands = new Set<string>()
  contexts.slice(0, shown.length).forEach(context => {
    context.files.forEach(file => files.add(file))
    context.commands.forEach(command => commands.add(command))
  })
  if (files.size > 0 || commands.size > 0) {
    bodyParts.push(`## ${t('sessionReuse.skill.skillContextHeading')}`)
    bodyParts.push('')
    ;[...files].slice(0, 6).forEach(file => {
      bodyParts.push(`- ${t('sessionReuse.skill.skillContextFile', { path: file })}`)
    })
    ;[...commands].slice(0, 4).forEach(command => {
      bodyParts.push(`- ${t('sessionReuse.skill.skillContextCommand', { command })}`)
    })
    bodyParts.push('')
  }

  return {
    name,
    description,
    body: bodyParts.join('\n').trimEnd(),
    totalTurns: turns.length,
    truncated: turns.length > shown.length,
  }
}

function escapeFrontmatter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' ')
}

export function assembleSkillContent(name: string, description: string, body: string): string {
  const safeName = escapeFrontmatter(name.trim())
  const safeDescription = escapeFrontmatter(description.trim()).slice(0, MAX_SKILL_DESCRIPTION)
  return [
    '---',
    `name: "${safeName}"`,
    `description: "${safeDescription}"`,
    '---',
    '',
    body.trim(),
    '',
  ].join('\n')
}
