import { getApiKey } from '../../config/config-manager'
import { startPluginAi, abortPluginAi } from '../../plugins/plugin-services'
import { safeHandle } from './safe-handle'
import type { SendFn } from './types'

// ----------------------------------------
// Recruit helpers (department roster)
// ----------------------------------------
// Nothing here reads or writes the roster — departments and their employees are
// renderer-side state. This is only the one-shot model call behind the recruit
// dialog's 「AI 润色」 button, reusing the same generator the plugins use.

const recruitPolishInstructions = (language: string): string => [
  'You are the recruiting assistant inside AIPA, a desktop AI assistant where every "employee" is an AI agent working in one folder.',
  'The recruiter drafts a job description for a new employee: the responsibilities that employee owns and the skills they bring.',
  'Rewrite the draft into a polished job description that can be handed straight to that employee as their first task briefing.',
  `- Write in ${language}.`,
  '- Keep the recruiter\'s intent, facts and scope. Sharpen the wording, fill obvious gaps, drop vagueness.',
  '- A short paragraph, then a few bullet lines covering responsibilities and required skills. No markdown headings, no title line, no preamble.',
  '- Never ask a question, never explain what you changed, never mention that this is a rewrite.',
  '- Under 200 words.',
].join('\n')

export function registerRecruitHandlers(send: SendFn): void {
  safeHandle('recruit:polish:start', async (_e, { requestId, draft, deptName, locale, model }: {
    requestId: string
    draft: string
    deptName: string
    locale?: string
    model?: string
  }) => {
    const body = (draft || '').trim()
    const prompt = [
      `部门 / Department: ${deptName}`,
      body
        ? `招聘者写的职位描述草稿 / The recruiter's draft:\n"""\n${body}\n"""`
        : '招聘者还没有写任何内容，请仅根据部门自行起草这份职位描述。/ The recruiter has written nothing yet — draft the description yourself, using the department as the only context.',
    ].join('\n\n')
    // The scope prefix keeps this generator's request ids from colliding with a
    // plugin's, since both share the one in-flight registry.
    await startPluginAi(
      {
        requestId: `recruit:${requestId}`,
        prompt,
        instructions: recruitPolishInstructions(locale === 'zh-CN' ? 'Simplified Chinese (简体中文)' : 'English'),
        model,
        apiKey: getApiKey() || undefined,
      },
      (event) => send('recruit:polish:event', { ...event, requestId })
    )
    return { started: true }
  })
  safeHandle('recruit:polish:abort', (_e, { requestId }: { requestId: string }) => {
    abortPluginAi(`recruit:${requestId}`)
  })
}
