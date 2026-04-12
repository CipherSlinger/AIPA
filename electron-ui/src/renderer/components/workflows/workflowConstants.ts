import React from 'react'
import { Workflow, WorkflowStep } from '../../types/app.types'

export const MAX_WORKFLOWS = 50
export const MAX_STEPS = 20
export const MAX_STEP_PROMPT = 2000
export const MAX_NAME_LENGTH = 50
export const MAX_DESC_LENGTH = 200

export const WORKFLOW_ICONS = ['🔄', '📝', '🔍', '📊', '🎯', '🚀', '💡', '📧', '🗂️', '✅', '📋', '🔧']

export const PRESET_WORKFLOWS: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>[] = [
  {
    name: 'Weekly Report',
    description: 'Generate a structured weekly status report',
    icon: '📊',
    presetKey: 'weeklyReport',
    steps: [
      { id: 'p1', title: 'Gather accomplishments', prompt: 'List my key accomplishments this week based on our conversation history. Focus on concrete outcomes and deliverables.' },
      { id: 'p2', title: 'Identify blockers', prompt: 'Based on what we discussed, what blockers or challenges did I face? How were they resolved or what still needs attention?' },
      { id: 'p3', title: 'Draft the report', prompt: 'Now compile this into a professional weekly status report with sections: Accomplishments, Challenges, Next Week Plans. Keep it concise and actionable.' },
    ],
  },
  {
    name: 'Code Review',
    description: 'Thorough code review pipeline',
    icon: '🔍',
    presetKey: 'codeReview',
    steps: [
      { id: 'p1', title: 'Overview scan', prompt: 'Give me a high-level overview of this code. What does it do? What patterns does it use?' },
      { id: 'p2', title: 'Bug & security check', prompt: 'Now examine it for potential bugs, edge cases, and security vulnerabilities. Be thorough.' },
      { id: 'p3', title: 'Improvement suggestions', prompt: 'Suggest specific improvements for readability, performance, and maintainability. Prioritize by impact.' },
    ],
  },
  {
    name: 'Research & Summarize',
    description: 'Deep-dive research with structured output',
    icon: '📝',
    presetKey: 'researchSummarize',
    steps: [
      { id: 'p1', title: 'Initial research', prompt: 'Research this topic thoroughly. Provide key facts, different perspectives, and recent developments.' },
      { id: 'p2', title: 'Analysis', prompt: 'Analyze the findings. What are the pros and cons? What trade-offs exist? What does the evidence suggest?' },
      { id: 'p3', title: 'Executive summary', prompt: 'Create a concise executive summary with: Key Takeaways (3-5 bullets), Recommendation, and Next Steps.' },
    ],
  },
  {
    name: 'Daily Summary',
    description: 'End-of-day review of tasks and progress',
    icon: '📋',
    presetKey: 'dailySummary',
    steps: [
      { id: 'p1', title: 'Recap the day', prompt: 'Give me a brief summary of today\'s key tasks and progress. What should I focus on tomorrow?' },
    ],
  },
  {
    name: 'Weekly Review',
    description: 'Reflect on the week and plan ahead',
    icon: '📅',
    presetKey: 'weeklyReview',
    steps: [
      { id: 'p1', title: 'Review the week', prompt: 'Help me review this week: What went well? What could be improved? What are my priorities for next week?' },
    ],
  },
  {
    name: 'Morning Motivation',
    description: 'Start the day with inspiration and goals',
    icon: '🌅',
    presetKey: 'morningMotivation',
    steps: [
      { id: 'p1', title: 'Get inspired', prompt: 'Good morning! Give me an inspiring thought for today and suggest 3 productive things I could accomplish.' },
    ],
  },
]

export const PRESET_TEAMWORK_WORKFLOWS: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>[] = [
  {
    name: 'Product Launch',
    description: 'Coordinate a full product launch across roles',
    icon: '🚀',
    presetKey: 'productLaunch',
    teamwork: true,
    steps: [
      { id: 'p1', title: 'PM: Define scope', prompt: 'As the Product Manager, define the product launch scope: target audience, key features, success metrics, and timeline.' },
      { id: 'p2', title: 'Designer: UX plan', prompt: 'As the UX Designer, outline the key user flows, wireframe priorities, and design deliverables needed for launch.' },
      { id: 'p3', title: 'Engineer: Tech plan', prompt: 'As the Tech Lead, estimate implementation effort, identify technical risks, and propose the development roadmap.' },
      { id: 'p4', title: 'Marketing: Go-to-market', prompt: 'As the Marketing Lead, create a go-to-market strategy: messaging, channels, launch timeline, and success KPIs.' },
    ],
  },
  {
    name: 'Incident Response',
    description: 'Multi-role incident analysis and resolution',
    icon: '🚨',
    presetKey: 'incidentResponse',
    teamwork: true,
    steps: [
      { id: 'p1', title: 'On-call: Triage', prompt: 'As the on-call engineer, triage the incident: What is broken? Who is affected? What is the current severity level?' },
      { id: 'p2', title: 'Ops: Root cause', prompt: 'As the Ops lead, investigate the root cause. Review logs, metrics, and recent deployments to identify what triggered the issue.' },
      { id: 'p3', title: 'Comms: Status update', prompt: 'As the Comms lead, draft a clear status update for stakeholders and customers. Be transparent about impact and ETA.' },
      { id: 'p4', title: 'Team: Post-mortem', prompt: 'Collaboratively write a post-mortem: timeline of events, root cause, impact, remediation steps, and prevention measures.' },
    ],
  },
  {
    name: 'Content Pipeline',
    description: 'Multi-role content creation and review',
    icon: '✍️',
    presetKey: 'contentPipeline',
    teamwork: true,
    steps: [
      { id: 'p1', title: 'Strategist: Brief', prompt: 'As the Content Strategist, define the content brief: goal, target audience, key messages, tone, and SEO keywords.' },
      { id: 'p2', title: 'Writer: Draft', prompt: 'As the Content Writer, write a full draft based on the brief. Focus on clarity, engagement, and hitting the key messages.' },
      { id: 'p3', title: 'Editor: Review', prompt: 'As the Editor, review the draft for tone, grammar, structure, and alignment with the brief. Provide specific revision notes.' },
      { id: 'p4', title: 'Publisher: Finalize', prompt: 'As the Publisher, finalize the content: apply edits, format for the target platform, and prepare the publishing checklist.' },
    ],
  },
]

export const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  padding: 2,
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.45)',
  display: 'flex',
  alignItems: 'center',
}

/**
 * Resolve a translated step field (title or prompt) for a preset workflow.
 * Falls back to the raw step value if no translation is found.
 * @param presetKey - The workflow's presetKey (e.g. 'weeklyReport')
 * @param stepIndex - 0-based step index
 * @param field - 'title' or 'prompt'
 * @param t - i18n translation function
 * @param fallback - raw value to use if no translation key exists
 */
export function getPresetStepText(
  presetKey: string | undefined,
  stepIndex: number,
  field: 'title' | 'prompt',
  t: (key: string) => string,
  fallback: string,
): string {
  if (!presetKey) return fallback
  const key = `workflow.presetStep.${presetKey}.s${stepIndex + 1}${field === 'title' ? 'Title' : 'Prompt'}`
  const translated = t(key)
  // If t() returns the key itself, the translation is missing — use fallback
  return translated === key ? fallback : translated
}

export const smallBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 10,
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  transition: 'all 0.15s ease',
}
