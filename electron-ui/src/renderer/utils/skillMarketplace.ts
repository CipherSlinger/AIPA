/**
 * Curated skill marketplace data.
 * Each entry represents a community skill that can be installed with one click.
 * Skills are prompt-instruction packages (SKILL.md) — no executable code.
 */

export type SkillCategory = 'Productivity' | 'Writing' | 'Code' | 'Research' | 'Creative'

export interface MarketplaceSkill {
  id: string
  name: string
  description: string
  author: string
  category: SkillCategory
  skillContent: string  // The SKILL.md content to install
}

export const SKILL_CATEGORIES: SkillCategory[] = ['Productivity', 'Writing', 'Code', 'Research', 'Creative']

export const CATEGORY_COLORS: Record<SkillCategory, string> = {
  Productivity: '#10b981',
  Writing: '#6366f1',
  Code: '#f59e0b',
  Research: '#3b82f6',
  Creative: '#ec4899',
}

export const MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description: 'Draft professional emails with appropriate tone, structure, and formatting. Supports formal, casual, and follow-up styles.',
    author: 'AIPA Team',
    category: 'Writing',
    skillContent: `---
name: email-drafter
description: Draft professional emails with appropriate tone and structure
---

# Email Drafter

You are an expert email writer. When the user asks you to draft an email:

1. Ask for the recipient, purpose, and desired tone (formal/casual/friendly) if not provided
2. Structure the email with a clear subject line, greeting, body, and sign-off
3. Keep paragraphs short (2-3 sentences)
4. Use bullet points for multiple items
5. Match the formality level to the context
6. Offer to adjust tone or add/remove details after the first draft

Always output the email in a copyable format with clear subject line.
`,
  },
  {
    id: 'meeting-summarizer',
    name: 'Meeting Summarizer',
    description: 'Summarize meeting notes into action items, decisions, and key takeaways with assigned owners.',
    author: 'AIPA Team',
    category: 'Productivity',
    skillContent: `---
name: meeting-summarizer
description: Summarize meeting notes into structured action items and decisions
---

# Meeting Summarizer

When the user provides meeting notes, transcript, or recording summary:

1. Extract a concise **Summary** (2-3 sentences)
2. List all **Decisions Made** with context
3. Create an **Action Items** table with columns: Task | Owner | Deadline
4. Note any **Open Questions** that were not resolved
5. Highlight **Key Takeaways** (3-5 bullet points)

Format the output in clean Markdown. If owners or deadlines are unclear, mark them as "TBD" and flag them.
`,
  },
  {
    id: 'weekly-report',
    name: 'Weekly Report Generator',
    description: 'Generate structured weekly status reports from notes, commits, or bullet points.',
    author: 'AIPA Team',
    category: 'Productivity',
    skillContent: `---
name: weekly-report
description: Generate structured weekly status reports
---

# Weekly Report Generator

When the user provides their weekly activities (notes, bullet points, or raw data):

1. Organize into sections: **Accomplishments**, **In Progress**, **Blockers**, **Next Week Plans**
2. Use clear, professional language suitable for management review
3. Quantify results where possible (e.g., "Completed 5 of 7 planned tasks")
4. Flag blockers with severity and suggested resolution
5. Keep each bullet point to one sentence

Output format should be clean Markdown with headers and bullet points.
`,
  },
  {
    id: 'document-reviewer',
    name: 'Document Reviewer',
    description: 'Review documents for clarity, grammar, consistency, and provide detailed improvement suggestions.',
    author: 'AIPA Team',
    category: 'Writing',
    skillContent: `---
name: document-reviewer
description: Review documents for clarity, grammar, and consistency
---

# Document Reviewer

When the user provides a document for review:

1. **Grammar & Spelling**: Fix errors and awkward phrasing
2. **Clarity**: Identify confusing sentences and suggest rewrites
3. **Consistency**: Check for consistent terminology, formatting, and style
4. **Structure**: Evaluate flow and suggest reorganization if needed
5. **Tone**: Assess whether tone matches the intended audience

Provide feedback in a structured format:
- Use inline suggestions with original vs. suggested text
- Group feedback by category (Grammar, Clarity, Structure, etc.)
- Rate overall quality: Excellent / Good / Needs Improvement
`,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Perform thorough code reviews focusing on bugs, security, performance, and best practices.',
    author: 'AIPA Team',
    category: 'Code',
    skillContent: `---
name: code-reviewer
description: Thorough code review for bugs, security, and best practices
---

# Code Reviewer

When the user shares code for review:

1. **Bugs**: Identify logic errors, edge cases, and potential runtime failures
2. **Security**: Check for injection vulnerabilities, data exposure, and unsafe operations
3. **Performance**: Flag N+1 queries, unnecessary iterations, memory leaks
4. **Best Practices**: Naming conventions, DRY violations, proper error handling
5. **Readability**: Complex logic that needs comments or refactoring

Rate each area: OK / Warning / Critical
Provide specific line-level suggestions with before/after code snippets.
`,
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Help organize research, synthesize findings, create literature summaries, and identify knowledge gaps.',
    author: 'AIPA Team',
    category: 'Research',
    skillContent: `---
name: research-assistant
description: Organize research, synthesize findings, and identify gaps
---

# Research Assistant

When the user asks for research help:

1. **Topic Breakdown**: Break the research question into sub-questions
2. **Key Findings**: Organize information by theme or chronology
3. **Source Evaluation**: Note the quality and relevance of each source
4. **Synthesis**: Connect findings across sources to build a coherent narrative
5. **Knowledge Gaps**: Identify what is not well-covered and suggest further research directions

Present findings in structured Markdown with clear headings and citations where applicable.
`,
  },
  {
    id: 'brainstorm-facilitator',
    name: 'Brainstorm Facilitator',
    description: 'Facilitate creative brainstorming sessions with structured ideation techniques and idea evaluation.',
    author: 'AIPA Team',
    category: 'Creative',
    skillContent: `---
name: brainstorm-facilitator
description: Facilitate creative brainstorming with structured ideation techniques
---

# Brainstorm Facilitator

When the user wants to brainstorm:

1. **Clarify the Challenge**: Restate the problem in a clear, actionable format
2. **Generate Ideas**: Use techniques like SCAMPER, mind mapping, or reverse brainstorming
3. **Diverge First**: Generate 10+ ideas without judgment
4. **Categorize**: Group related ideas into themes
5. **Evaluate**: Rate each idea on Feasibility (1-5) and Impact (1-5)
6. **Top Picks**: Recommend the top 3 ideas with rationale

Encourage wild ideas first, then narrow down. Always build on the user's initial thoughts.
`,
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyze data, create summaries, identify trends, and suggest visualizations for datasets.',
    author: 'AIPA Team',
    category: 'Research',
    skillContent: `---
name: data-analyst
description: Analyze data, identify trends, and suggest visualizations
---

# Data Analyst

When the user provides data (tables, CSVs, or descriptions):

1. **Summary Statistics**: Calculate mean, median, range, and other relevant stats
2. **Trends**: Identify patterns, trends, and anomalies
3. **Comparisons**: Compare groups or time periods
4. **Insights**: Provide actionable insights based on the data
5. **Visualization Suggestions**: Recommend chart types (bar, line, scatter, etc.) for key findings

Present analysis in Markdown tables and bullet points. Be specific about what the numbers mean in context.
`,
  },
  {
    id: 'translator-pro',
    name: 'Translator Pro',
    description: 'Professional translation with context awareness, tone matching, and cultural adaptation.',
    author: 'AIPA Team',
    category: 'Writing',
    skillContent: `---
name: translator-pro
description: Professional translation with context and cultural awareness
---

# Translator Pro

When the user asks for translation:

1. **Detect Source Language** automatically if not specified
2. **Translate** with attention to:
   - Context and meaning (not word-for-word)
   - Idiomatic expressions adapted to target language
   - Technical terminology kept accurate
   - Tone matching (formal/casual/literary)
3. **Cultural Adaptation**: Note any cultural differences that affect meaning
4. **Alternatives**: For ambiguous phrases, provide 2-3 translation options with explanations
5. **Format**: Preserve the original formatting (headings, lists, etc.)

Output both the translation and brief notes on any significant translation choices.
`,
  },
  {
    id: 'project-planner',
    name: 'Project Planner',
    description: 'Break down projects into phases, tasks, milestones, and timelines with dependency tracking.',
    author: 'AIPA Team',
    category: 'Productivity',
    skillContent: `---
name: project-planner
description: Break down projects into phases, tasks, and timelines
---

# Project Planner

When the user describes a project or goal:

1. **Project Overview**: Restate the objective and success criteria
2. **Phase Breakdown**: Divide into 3-5 logical phases
3. **Task List**: Break each phase into specific tasks with estimated durations
4. **Dependencies**: Identify which tasks must be completed before others
5. **Milestones**: Define key checkpoints for progress tracking
6. **Risk Assessment**: Flag potential risks and mitigation strategies

Output as a structured plan with Markdown tables for tasks and a timeline overview.
`,
  },
]
