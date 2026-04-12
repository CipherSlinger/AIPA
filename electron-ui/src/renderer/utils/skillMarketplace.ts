/**
 * Curated skill marketplace data.
 * Skills sourced from real community GitHub repositories with proper attribution.
 * Each entry represents a community skill that can be installed with one click.
 * Skills are prompt-instruction packages (SKILL.md) -- no executable code.
 */

export type SkillCategory = 'Productivity' | 'Writing' | 'Code' | 'Research' | 'Creative' | 'DevOps' | 'Design'
export type SkillSource = 'Anthropic' | 'OpenClaw' | 'ClawhHub' | 'Community'

export interface MarketplaceSkill {
  id: string
  name: string
  description: string
  descriptionZh?: string  // zh-CN translation of description
  author: string
  sourceUrl: string
  category: SkillCategory
  source: SkillSource
  skillContent: string  // The SKILL.md content to install
}

export const SKILL_CATEGORIES: SkillCategory[] = ['Productivity', 'Writing', 'Code', 'Research', 'Creative', 'DevOps', 'Design']
export const SKILL_SOURCES: SkillSource[] = ['Anthropic', 'OpenClaw', 'ClawhHub', 'Community']

export const CATEGORY_COLORS: Record<SkillCategory, string> = {
  Productivity: '#10b981',
  Writing: '#6366f1',
  Code: '#f59e0b',
  Research: '#3b82f6',
  Creative: '#ec4899',
  DevOps: '#14b8a6',
  Design: '#f97316',
}

export const SOURCE_COLORS: Record<SkillSource, string> = {
  Anthropic: '#d97706',
  OpenClaw: '#8b5cf6',
  ClawhHub: '#e11d48',
  Community: '#06b6d4',
}

export const MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  // ── Built-in: Skill Creator ──
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description: 'Create custom skills interactively. Describe what you want and this skill guides you through defining a reusable SKILL.md template.',
    descriptionZh: '\u4ea4\u4e92\u5f0f\u521b\u5efa\u81ea\u5b9a\u4e49\u6280\u80fd\u3002\u63cf\u8ff0\u4f60\u7684\u9700\u6c42\uff0c\u6b64\u6280\u80fd\u5f15\u5bfc\u4f60\u5b8c\u6210\u53ef\u590d\u7528\u7684 SKILL.md \u6a21\u677f\u5b9a\u4e49\u3002',
    author: 'AIPA',
    sourceUrl: 'https://github.com/CipherSlinger/AIPA',
    category: 'Productivity',
    source: 'Anthropic',
    skillContent: `---
name: skill-creator
description: Interactive skill builder — create custom SKILL.md templates step by step
---

# Skill Creator

You are a skill creation assistant. Help users create custom Claude skills (SKILL.md files) by guiding them through a structured process.

## Step 1: Understand the Goal
Ask the user:
- What should this skill do? (purpose and use case)
- What kind of input does it expect? (text, code, data, questions)
- What should the output look like? (format, structure, tone)

## Step 2: Define the Skill
Based on user answers, draft a SKILL.md with:
1. **Frontmatter**: name (kebab-case, max 30 chars) and description (one-line summary)
2. **Title**: H1 heading with the skill name
3. **Context/Role**: A clear statement of what the AI should act as
4. **Instructions**: Numbered steps for how to process the input
5. **Output Format**: What the final output should look like (bullet list, table, code block, etc.)
6. **Examples** (optional): 1-2 brief examples of input → output

## Step 3: Review & Refine
Present the full SKILL.md content in a code block. Ask if they want to:
- Adjust the instructions
- Add more examples
- Change the output format
- Rename the skill

## Step 4: Install
Once the user approves, tell them to:
1. Copy the skill content
2. Go to the Skills panel → Installed tab
3. The skill will appear after installation

## Template Structure
\\\`\\\`\\\`markdown
---
name: my-skill-name
description: One-line description of what the skill does
---

# Skill Title

[Role/context statement]

## Instructions
1. Step one
2. Step two
3. Step three

## Output Format
- Describe expected output structure

## Examples
**Input**: [example input]
**Output**: [example output]
\\\`\\\`\\\`

## Guidelines
- Keep skill names short and descriptive (kebab-case)
- Instructions should be clear and actionable
- Include edge cases the skill should handle
- Output format should be consistent and predictable
- Skills work best when focused on a single task
`,
  },

  // ── Code (from anthropics/claude-code) ──
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Automated PR code review checking for bugs, security issues, performance, and CLAUDE.md compliance.',
    descriptionZh: '\u81ea\u52a8\u5316 PR \u4ee3\u7801\u5ba1\u67e5\uff0c\u68c0\u67e5 Bug\u3001\u5b89\u5168\u95ee\u9898\u3001\u6027\u80fd\u548c CLAUDE.md \u5408\u89c4\u6027\u3002',
    author: 'Anthropic',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/plugins/code-review',
    category: 'Code',
    source: 'Anthropic',
    skillContent: `---
name: code-review
description: Thorough code review for bugs, security, performance, and best practices
---

# Code Review

When reviewing code (PRs, diffs, or source files):

1. **Bugs & Logic Errors**: Identify logic errors, edge cases, off-by-one errors, null/undefined access, and potential runtime failures
2. **Security**: Check for injection vulnerabilities (SQL, XSS, command), data exposure, unsafe deserialization, and missing auth checks
3. **Performance**: Flag N+1 queries, unnecessary iterations, missing indexes, memory leaks, and unoptimized algorithms
4. **Best Practices**: Naming conventions, DRY violations, proper error handling, consistent code style
5. **Readability**: Complex logic that needs comments, overly nested conditions, unclear variable names

Rate each area: OK / Warning / Critical
Provide specific line-level suggestions with before/after code snippets.
Prioritize issues by severity -- Critical first, then Warning, then OK observations.
`,
  },
  {
    id: 'feature-dev',
    name: 'Feature Development',
    description: 'Structured 7-phase feature development workflow: understand, plan, implement, verify, review, document, finalize.',
    descriptionZh: '\u7ed3\u6784\u5316\u7684 7 \u9636\u6bb5\u529f\u80fd\u5f00\u53d1\u5de5\u4f5c\u6d41\uff1a\u7406\u89e3\u3001\u8ba1\u5212\u3001\u5b9e\u73b0\u3001\u9a8c\u8bc1\u3001\u5ba1\u67e5\u3001\u6587\u6863\u3001\u5b8c\u6210\u3002',
    author: 'Anthropic',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev',
    category: 'Code',
    source: 'Anthropic',
    skillContent: `---
name: feature-dev
description: Structured 7-phase feature development workflow
---

# Feature Development Workflow

Follow this 7-phase workflow for implementing new features:

## Phase 1: Understand
- Read the feature requirements thoroughly
- Identify affected components and files
- List assumptions and clarify ambiguities

## Phase 2: Plan
- Design the solution architecture
- Break into discrete implementation steps
- Identify risks and edge cases

## Phase 3: Implement
- Write code following the plan
- Keep changes minimal and focused
- Add inline comments for complex logic

## Phase 4: Verify
- Run existing tests
- Test edge cases manually
- Check for regressions

## Phase 5: Review
- Self-review the diff
- Check for security issues
- Ensure code style consistency

## Phase 6: Document
- Update relevant documentation
- Add JSDoc/docstrings for new functions
- Update CHANGELOG if applicable

## Phase 7: Finalize
- Clean up temporary code
- Ensure all tests pass
- Prepare commit message
`,
  },
  {
    id: 'commit-commands',
    name: 'Commit Commands',
    description: 'Streamlined Git operations: smart commits with conventional messages, push, and PR creation.',
    descriptionZh: '\u7b80\u5316\u7684 Git \u64cd\u4f5c\uff1a\u667a\u80fd\u63d0\u4ea4\u3001\u89c4\u8303\u5316\u6d88\u606f\u3001\u63a8\u9001\u548c PR \u521b\u5efa\u3002',
    author: 'Anthropic',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/plugins/commit-commands',
    category: 'DevOps',
    source: 'Anthropic',
    skillContent: `---
name: commit-commands
description: Streamlined Git commit, push, and PR creation
---

# Git Commit Commands

## /commit
Create a well-structured git commit:
1. Run \`git diff --staged\` to see what's staged
2. Analyze the changes to understand what was modified and why
3. Write a conventional commit message:
   - feat: new feature
   - fix: bug fix
   - refactor: code restructuring
   - docs: documentation
   - style: formatting
   - test: adding tests
   - chore: maintenance
4. Keep the subject line under 72 characters
5. Add a body explaining the "why" if the change isn't obvious

## /commit-push-pr
Full workflow: commit, push to remote, and create a pull request:
1. Create the commit (as above)
2. Push to the current branch
3. Create a PR with a clear title and description
4. Link any relevant issues
`,
  },
  {
    id: 'security-guidance',
    name: 'Security Guidance',
    description: 'Security-first development: monitors for XSS, eval, command injection, and 9 common vulnerability patterns.',
    descriptionZh: '\u5b89\u5168\u4f18\u5148\u5f00\u53d1\uff1a\u76d1\u63a7 XSS\u3001eval\u3001\u547d\u4ee4\u6ce8\u5165\u7b49 9 \u79cd\u5e38\u89c1\u6f0f\u6d1e\u6a21\u5f0f\u3002',
    author: 'Anthropic',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/plugins/security-guidance',
    category: 'Code',
    source: 'Anthropic',
    skillContent: `---
name: security-guidance
description: Security-first coding guidance and vulnerability detection
---

# Security Guidance

When writing or reviewing code, always check for these common vulnerabilities:

## Critical Patterns to Watch
1. **XSS**: Never insert user input into HTML without sanitization
2. **SQL Injection**: Always use parameterized queries, never string concatenation
3. **Command Injection**: Never pass user input to shell commands directly
4. **eval()**: Never use eval, new Function(), or setTimeout with strings
5. **Path Traversal**: Validate and sanitize file paths, reject ".."
6. **Insecure Deserialization**: Don't deserialize untrusted data
7. **Hardcoded Secrets**: Never commit API keys, passwords, or tokens
8. **Missing Auth**: Verify authentication and authorization on every endpoint
9. **CSRF**: Ensure state-changing requests require valid CSRF tokens

## When Suggesting Code
- Default to the secure option (e.g., parameterized queries over string interpolation)
- Flag any potential security issues with a [SECURITY] warning
- Recommend secure alternatives when detecting risky patterns
`,
  },
  {
    id: 'frontend-design',
    name: 'Frontend Design',
    description: 'Production-grade UI guidance: typography, spacing, animations, and visual polish to avoid "AI aesthetics".',
    descriptionZh: '\u751f\u4ea7\u7ea7 UI \u6307\u5357\uff1a\u6392\u7248\u3001\u95f4\u8ddd\u3001\u52a8\u753b\u548c\u89c6\u89c9\u6253\u78e8\uff0c\u907f\u514d\u201cAI \u98ce\u683c\u201d\u3002',
    author: 'Anthropic',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design',
    category: 'Design',
    source: 'Anthropic',
    skillContent: `---
name: frontend-design
description: Production-grade UI/UX design guidance for professional interfaces
---

# Frontend Design Standards

When building or reviewing UI:

## Typography
- Use a clear type scale (12/14/16/20/24/32px)
- Limit to 2 font weights per page (regular + semibold)
- Line height: 1.5 for body, 1.2 for headings
- Max line length: 65-75 characters

## Spacing
- Use a 4px grid (4/8/12/16/24/32/48)
- Consistent padding within components
- Generous whitespace between sections

## Color
- 60-30-10 rule: 60% neutral, 30% secondary, 10% accent
- Ensure WCAG AA contrast ratios (4.5:1 text, 3:1 large text)
- Use opacity for subtle variations, not new colors

## Animations
- Duration: 0.15s for all transitions and micro-interactions (use 'all 0.15s ease')
- Easing: ease-out for entrances, ease-in for exits
- Respect prefers-reduced-motion

## Common Anti-Patterns to Avoid
- Rainbow gradients and excessive shadows
- Too many competing colors
- Inconsistent border-radius values
- Missing hover/focus/active states
`,
  },

  // ── DevOps (from jezweb/claude-skills) ──
  {
    id: 'git-workflow',
    name: 'Git Workflow',
    description: 'Professional Git workflow management: branching strategy, merge conflict resolution, and release management.',
    descriptionZh: '\u4e13\u4e1a Git \u5de5\u4f5c\u6d41\u7ba1\u7406\uff1a\u5206\u652f\u7b56\u7565\u3001\u5408\u5e76\u51b2\u7a81\u89e3\u51b3\u548c\u53d1\u5e03\u7ba1\u7406\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/dev-tools/git-workflow',
    category: 'DevOps',
    source: 'Community',
    skillContent: `---
name: git-workflow
description: Professional Git branching, merging, and release workflow
---

# Git Workflow Manager

## Branching Strategy
- main/master: production-ready code
- develop: integration branch
- feature/*: new features
- fix/*: bug fixes
- release/*: release preparation

## When Asked About Git:
1. **Branch Creation**: Suggest meaningful names (feature/add-user-auth, fix/login-redirect)
2. **Merge Conflicts**: Walk through resolution step-by-step, explain each conflict
3. **Rebase vs Merge**: Recommend rebase for feature branches, merge for integration
4. **Release Process**: Tag, changelog, version bump, merge to main
5. **Recovery**: Help with git reflog, cherry-pick, and reset operations

## Best Practices
- Write descriptive commit messages (what + why)
- Keep commits atomic (one logical change per commit)
- Never force-push to shared branches
- Use .gitignore to exclude generated files
`,
  },
  {
    id: 'project-health',
    name: 'Project Health Check',
    description: 'Automated project health analysis: dependencies, code quality, test coverage, and technical debt assessment.',
    descriptionZh: '\u81ea\u52a8\u9879\u76ee\u5065\u5eb7\u5206\u6790\uff1a\u4f9d\u8d56\u3001\u4ee3\u7801\u8d28\u91cf\u3001\u6d4b\u8bd5\u8986\u76d6\u7387\u548c\u6280\u672f\u503a\u52a1\u8bc4\u4f30\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/dev-tools/project-health',
    category: 'DevOps',
    source: 'Community',
    skillContent: `---
name: project-health
description: Analyze project health across dependencies, quality, and tech debt
---

# Project Health Check

When asked to assess a project's health:

## 1. Dependency Analysis
- Check for outdated packages (major/minor/patch)
- Identify known vulnerabilities (npm audit / pip audit)
- Flag abandoned dependencies (no updates in 12+ months)

## 2. Code Quality
- Linting configuration and compliance
- TypeScript strict mode status
- Code complexity metrics (cyclomatic complexity)

## 3. Test Coverage
- Test file presence and organization
- Coverage percentage if available
- Missing test categories (unit, integration, e2e)

## 4. Technical Debt
- TODO/FIXME/HACK comment count and age
- Large files that need decomposition (>500 lines)
- Circular dependencies
- Dead code detection

## 5. Documentation
- README completeness
- API documentation coverage
- Inline code documentation

Output a health score (A-F) with specific recommendations for each area.
`,
  },

  // ── Writing (from alirezarezvani/claude-skills) ──
  {
    id: 'technical-writer',
    name: 'Technical Writer',
    description: 'Professional technical documentation: API docs, tutorials, architecture decision records, and user guides.',
    descriptionZh: '\u4e13\u4e1a\u6280\u672f\u6587\u6863\uff1aAPI \u6587\u6863\u3001\u6559\u7a0b\u3001\u67b6\u6784\u51b3\u7b56\u8bb0\u5f55\u548c\u7528\u6237\u6307\u5357\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/engineering',
    category: 'Writing',
    source: 'Community',
    skillContent: `---
name: technical-writer
description: Professional technical documentation for APIs, tutorials, and user guides
---

# Technical Writer

When asked to write technical documentation:

## API Documentation
- Endpoint description with HTTP method
- Request parameters (path, query, body) with types and examples
- Response format with status codes
- Error responses and handling
- Code examples in at least 2 languages

## Tutorials
- Prerequisites and setup steps
- Step-by-step instructions with code blocks
- Expected output at each step
- Common pitfalls and troubleshooting

## Architecture Decision Records (ADR)
- Status: Proposed/Accepted/Deprecated
- Context: What is the issue?
- Decision: What did we decide?
- Consequences: What are the trade-offs?

## README Template
- Project title and one-line description
- Installation instructions
- Quick start example
- Configuration options
- Contributing guidelines
`,
  },
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description: 'Draft professional emails with appropriate tone, structure, and formatting for any business context.',
    descriptionZh: '\u8d77\u8349\u4e13\u4e1a\u90ae\u4ef6\uff0c\u9002\u914d\u5404\u79cd\u5546\u52a1\u573a\u666f\u7684\u8bed\u6c14\u3001\u7ed3\u6784\u548c\u683c\u5f0f\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/product-team',
    category: 'Writing',
    source: 'Community',
    skillContent: `---
name: email-drafter
description: Draft professional emails with appropriate tone and structure
---

# Email Drafter

When asked to draft an email:

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
    id: 'proposal-writer',
    name: 'Proposal Writer',
    description: 'Write structured business proposals with executive summary, scope, timeline, budget, and terms.',
    descriptionZh: '\u64b0\u5199\u7ed3\u6784\u5316\u5546\u4e1a\u63d0\u6848\uff0c\u5305\u542b\u6267\u884c\u6458\u8981\u3001\u8303\u56f4\u3001\u65f6\u95f4\u7ebf\u3001\u9884\u7b97\u548c\u6761\u6b3e\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/writing/proposal-writer',
    category: 'Writing',
    source: 'Community',
    skillContent: `---
name: proposal-writer
description: Write structured business proposals and project bids
---

# Proposal Writer

When drafting a business proposal:

## Structure
1. **Executive Summary**: 2-3 paragraphs capturing the key value proposition
2. **Problem Statement**: What challenge does the client face?
3. **Proposed Solution**: How your approach addresses the problem
4. **Scope of Work**: Detailed deliverables with acceptance criteria
5. **Timeline**: Phased approach with milestones and dates
6. **Budget**: Line-item cost breakdown with total
7. **Team**: Key personnel and their roles
8. **Terms & Conditions**: Payment schedule, IP ownership, warranties

## Tone
- Professional but not stuffy
- Confident without being arrogant
- Specific over vague -- use numbers and concrete examples
- Focus on client outcomes, not your process
`,
  },

  // ── Productivity (from alirezarezvani/claude-skills + community) ──
  {
    id: 'meeting-summarizer',
    name: 'Meeting Summarizer',
    description: 'Summarize meeting notes into action items, decisions, and key takeaways with assigned owners.',
    descriptionZh: '\u5c06\u4f1a\u8bae\u8bb0\u5f55\u6574\u7406\u4e3a\u884c\u52a8\u9879\u3001\u51b3\u7b56\u548c\u5173\u952e\u8981\u70b9\uff0c\u5e76\u5206\u914d\u8d1f\u8d23\u4eba\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/product-team',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: meeting-summarizer
description: Summarize meeting notes into structured action items and decisions
---

# Meeting Summarizer

When provided with meeting notes, transcript, or recording summary:

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
    descriptionZh: '\u4ece\u7b14\u8bb0\u3001\u63d0\u4ea4\u8bb0\u5f55\u6216\u8981\u70b9\u751f\u6210\u7ed3\u6784\u5316\u5468\u62a5\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/product-team',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: weekly-report
description: Generate structured weekly status reports
---

# Weekly Report Generator

When provided with weekly activities (notes, bullet points, or raw data):

1. Organize into sections: **Accomplishments**, **In Progress**, **Blockers**, **Next Week Plans**
2. Use clear, professional language suitable for management review
3. Quantify results where possible (e.g., "Completed 5 of 7 planned tasks")
4. Flag blockers with severity and suggested resolution
5. Keep each bullet point to one sentence

Output format should be clean Markdown with headers and bullet points.
`,
  },
  {
    id: 'project-planner',
    name: 'Project Planner',
    description: 'Break down projects into phases, tasks, milestones, and timelines with dependency tracking.',
    descriptionZh: '\u5c06\u9879\u76ee\u5206\u89e3\u4e3a\u9636\u6bb5\u3001\u4efb\u52a1\u3001\u91cc\u7a0b\u7891\u548c\u65f6\u95f4\u7ebf\uff0c\u5e76\u8ffd\u8e2a\u4f9d\u8d56\u5173\u7cfb\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/project-management',
    category: 'Productivity',
    source: 'Community',
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
  {
    id: 'agile-scrum',
    name: 'Agile Scrum Master',
    description: 'Facilitate Scrum ceremonies, write user stories, manage sprint planning, and track velocity.',
    descriptionZh: '\u4e3b\u6301 Scrum \u4eea\u5f0f\u3001\u7f16\u5199\u7528\u6237\u6545\u4e8b\u3001\u7ba1\u7406\u51b2\u523a\u8ba1\u5212\u5e76\u8ffd\u8e2a\u901f\u5ea6\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/project-management',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: agile-scrum
description: Scrum facilitation, user stories, sprint planning, and velocity tracking
---

# Agile Scrum Master

## User Story Writing
- Format: As a [user type], I want [goal] so that [benefit]
- Include acceptance criteria as checkboxes
- Add story points estimate (Fibonacci: 1, 2, 3, 5, 8, 13)

## Sprint Planning
- Help define sprint goals
- Break epics into sprint-sized stories
- Estimate capacity based on team velocity

## Retrospective Facilitation
- What went well?
- What could be improved?
- Action items for next sprint

## Standup Notes
- What did you do yesterday?
- What will you do today?
- Any blockers?

Keep all outputs concise and action-oriented.
`,
  },

  // ── Research ──
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Organize research, synthesize findings from multiple sources, and identify knowledge gaps.',
    descriptionZh: '\u7ec4\u7ec7\u7814\u7a76\u3001\u7efc\u5408\u591a\u6e90\u53d1\u73b0\u5e76\u8bc6\u522b\u77e5\u8bc6\u7a7a\u767d\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/product-team',
    category: 'Research',
    source: 'Community',
    skillContent: `---
name: research-assistant
description: Organize research, synthesize findings, and identify gaps
---

# Research Assistant

When asked for research help:

1. **Topic Breakdown**: Break the research question into sub-questions
2. **Key Findings**: Organize information by theme or chronology
3. **Source Evaluation**: Note the quality and relevance of each source
4. **Synthesis**: Connect findings across sources to build a coherent narrative
5. **Knowledge Gaps**: Identify what is not well-covered and suggest further research directions

Present findings in structured Markdown with clear headings and citations where applicable.
`,
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyze data, create summaries, identify trends, and recommend visualization approaches.',
    descriptionZh: '\u5206\u6790\u6570\u636e\u3001\u521b\u5efa\u6458\u8981\u3001\u8bc6\u522b\u8d8b\u52bf\u5e76\u63a8\u8350\u53ef\u89c6\u5316\u65b9\u6848\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/finance',
    category: 'Research',
    source: 'Community',
    skillContent: `---
name: data-analyst
description: Analyze data, identify trends, and suggest visualizations
---

# Data Analyst

When provided with data (tables, CSVs, or descriptions):

1. **Summary Statistics**: Calculate mean, median, range, and other relevant stats
2. **Trends**: Identify patterns, trends, and anomalies
3. **Comparisons**: Compare groups or time periods
4. **Insights**: Provide actionable insights based on the data
5. **Visualization Suggestions**: Recommend chart types (bar, line, scatter, etc.) for key findings

Present analysis in Markdown tables and bullet points. Be specific about what the numbers mean in context.
`,
  },
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: 'In-depth research automation using browser tools to find, analyze, and synthesize information from the web.',
    descriptionZh: '\u6df1\u5ea6\u7814\u7a76\u81ea\u52a8\u5316\uff0c\u4f7f\u7528\u6d4f\u89c8\u5668\u5de5\u5177\u4ece\u7f51\u4e0a\u67e5\u627e\u3001\u5206\u6790\u548c\u7efc\u5408\u4fe1\u606f\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/dev-tools/deep-research',
    category: 'Research',
    source: 'Community',
    skillContent: `---
name: deep-research
description: In-depth research with web browsing, analysis, and synthesis
---

# Deep Research

When conducting deep research on a topic:

## Process
1. **Define Scope**: Clarify the research question and boundaries
2. **Source Identification**: Identify authoritative sources (academic papers, official docs, reputable sites)
3. **Information Gathering**: Collect key facts, data points, and expert opinions
4. **Cross-Reference**: Verify claims across multiple sources
5. **Analysis**: Identify patterns, contradictions, and consensus
6. **Synthesis**: Create a cohesive narrative from the findings

## Output Format
- Executive summary (3-5 sentences)
- Detailed findings organized by theme
- Source list with reliability assessment
- Remaining questions and recommended next steps

Always note when information might be outdated or when sources conflict.
`,
  },

  // ── Creative ──
  {
    id: 'brainstorm-facilitator',
    name: 'Brainstorm Facilitator',
    description: 'Facilitate creative brainstorming with SCAMPER, mind mapping, and structured ideation techniques.',
    descriptionZh: '\u4f7f\u7528 SCAMPER\u3001\u601d\u7ef4\u5bfc\u56fe\u548c\u7ed3\u6784\u5316\u521b\u610f\u6280\u672f\u4fc3\u8fdb\u5934\u8111\u98ce\u66b4\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/product-team',
    category: 'Creative',
    source: 'Community',
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
    id: 'translator-pro',
    name: 'Translator Pro',
    description: 'Professional translation with context awareness, tone matching, and cultural adaptation.',
    descriptionZh: '\u4e13\u4e1a\u7ffb\u8bd1\uff0c\u5177\u5907\u8bed\u5883\u611f\u77e5\u3001\u8bed\u6c14\u5339\u914d\u548c\u6587\u5316\u9002\u914d\u80fd\u529b\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/marketing-skill',
    category: 'Creative',
    source: 'Community',
    skillContent: `---
name: translator-pro
description: Professional translation with context and cultural awareness
---

# Translator Pro

When asked for translation:

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
    id: 'social-media-posts',
    name: 'Social Media Content',
    description: 'Generate platform-formatted posts for LinkedIn, Twitter/X, and other social networks with hashtags.',
    descriptionZh: '\u751f\u6210\u9002\u914d\u5404\u5e73\u53f0\u683c\u5f0f\u7684\u793e\u4ea4\u5a92\u4f53\u5e16\u5b50\uff0c\u5305\u542b\u6807\u7b7e\u548c\u53d1\u5e03\u5efa\u8bae\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/social-media/social-media-posts',
    category: 'Creative',
    source: 'Community',
    skillContent: `---
name: social-media-posts
description: Generate platform-formatted social media posts with hashtags
---

# Social Media Content Generator

When creating social media content:

## Platform Formats
- **LinkedIn**: Professional tone, 1300 char limit, use line breaks for readability, 3-5 hashtags
- **Twitter/X**: Concise, 280 char limit, engaging hook in first line, 1-3 hashtags
- **Instagram**: Visual description + caption, up to 2200 chars, 15-30 hashtags in first comment
- **Facebook**: Conversational tone, no character limit but keep under 500 chars for engagement

## Best Practices
- Start with a hook (question, statistic, bold statement)
- Use emojis sparingly for visual breaks
- Include a call-to-action
- Suggest best posting times for the target audience
- Offer 2-3 variations for A/B testing
`,
  },

  // ── Design ──
  {
    id: 'color-palette',
    name: 'Color Palette Generator',
    description: 'Generate accessible color palettes with primary, secondary, accent colors and WCAG contrast validation.',
    descriptionZh: '\u751f\u6210\u65e0\u969c\u788d\u8272\u5f69\u65b9\u6848\uff0c\u5305\u542b\u4e3b\u8272\u3001\u8f85\u8272\u3001\u5f3a\u8c03\u8272\u548c WCAG \u5bf9\u6bd4\u5ea6\u9a8c\u8bc1\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/design-assets/color-palette',
    category: 'Design',
    source: 'Community',
    skillContent: `---
name: color-palette
description: Generate accessible color palettes with WCAG contrast validation
---

# Color Palette Generator

When asked to create a color palette:

## Process
1. **Understand the Brand**: Ask about mood, industry, target audience
2. **Generate Colors**:
   - Primary: main brand color (used for key actions)
   - Secondary: complementary color (used for accents)
   - Neutral: gray scale for text and backgrounds (50-950 scale)
   - Semantic: success (green), warning (amber), error (red), info (blue)
3. **Validate Accessibility**: Check WCAG AA contrast ratios (4.5:1 for text)
4. **Output Format**: Provide CSS custom properties, hex values, and HSL values

## Color System Template
- 50-950 shade scale for each color (10 steps)
- Light and dark theme variants
- Surface colors for cards, backgrounds, and overlays
`,
  },
  {
    id: 'landing-page',
    name: 'Landing Page Designer',
    description: 'Design high-converting landing pages with hero sections, CTAs, social proof, and responsive layouts.',
    descriptionZh: '\u8bbe\u8ba1\u9ad8\u8f6c\u5316\u7740\u9646\u9875\uff0c\u5305\u542b Hero \u533a\u57df\u3001CTA\u3001\u793e\u4f1a\u8bc1\u660e\u548c\u54cd\u5e94\u5f0f\u5e03\u5c40\u3002',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/landing-page',
    category: 'Design',
    source: 'Community',
    skillContent: `---
name: landing-page
description: Design high-converting landing pages with best practices
---

# Landing Page Designer

When designing a landing page:

## Essential Sections
1. **Hero**: Clear headline, subheadline, primary CTA, hero image/video
2. **Social Proof**: Testimonials, logos, stats, trust badges
3. **Features**: 3-6 key benefits with icons and descriptions
4. **How It Works**: 3-step process visualization
5. **Pricing**: Clear tiers with feature comparison
6. **FAQ**: Address top 5-7 objections
7. **Final CTA**: Repeat the primary action with urgency

## Design Principles
- Single primary CTA color (use the accent color)
- F-pattern or Z-pattern eye flow
- Mobile-first responsive design
- Maximum 2 fonts, 3 colors
- Whitespace is your friend
- Above-the-fold content must capture attention in 3 seconds
`,
  },

  // ── Code (additional from community) ──
  {
    id: 'refactoring-expert',
    name: 'Refactoring Expert',
    description: 'Systematic code refactoring: identify code smells, suggest patterns, and execute safe transformations.',
    descriptionZh: '\u7cfb\u7edf\u5316\u4ee3\u7801\u91cd\u6784\uff1a\u8bc6\u522b\u4ee3\u7801\u5f02\u5473\u3001\u5efa\u8bae\u6a21\u5f0f\u5e76\u6267\u884c\u5b89\u5168\u8f6c\u6362\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/engineering',
    category: 'Code',
    source: 'Community',
    skillContent: `---
name: refactoring-expert
description: Systematic code refactoring with pattern identification and safe transformations
---

# Refactoring Expert

When refactoring code:

## 1. Identify Code Smells
- Long methods (>30 lines)
- Large classes (>300 lines)
- Duplicate code
- Long parameter lists (>3 params)
- Feature envy (method uses another class's data more than its own)
- Primitive obsession (using primitives instead of small objects)

## 2. Suggest Refactoring Patterns
- Extract Method / Extract Class
- Introduce Parameter Object
- Replace Conditional with Polymorphism
- Move Method / Move Field
- Introduce Facade / Adapter

## 3. Execute Safely
- Ensure tests exist before refactoring (or write them first)
- Make one refactoring at a time
- Verify behavior is preserved after each change
- Keep commits atomic -- one refactoring per commit

## 4. Measure Improvement
- Lines of code reduced
- Cyclomatic complexity before/after
- Number of dependencies reduced
`,
  },
  {
    id: 'api-designer',
    name: 'API Designer',
    description: 'Design RESTful and GraphQL APIs with consistent naming, versioning, error handling, and documentation.',
    descriptionZh: '\u8bbe\u8ba1 RESTful \u548c GraphQL API\uff0c\u5177\u5907\u4e00\u81f4\u7684\u547d\u540d\u3001\u7248\u672c\u63a7\u5236\u3001\u9519\u8bef\u5904\u7406\u548c\u6587\u6863\u3002',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/engineering',
    category: 'Code',
    source: 'Community',
    skillContent: `---
name: api-designer
description: Design RESTful and GraphQL APIs with best practices
---

# API Designer

When designing APIs:

## REST Best Practices
- Use nouns for resources (/users, /orders), verbs for actions (/auth/login)
- HTTP methods: GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)
- Plural resource names (/users not /user)
- Nested resources for relationships (/users/:id/orders)
- Query params for filtering, sorting, pagination (?sort=created&limit=20&offset=0)
- Consistent error response format: { error: { code, message, details } }

## Versioning
- URL versioning (/v1/users) for major changes
- Header versioning (Accept: application/vnd.api+json;version=2) for flexibility

## Documentation
- OpenAPI/Swagger specification
- Request/response examples for every endpoint
- Authentication and rate limiting details
- Changelog for breaking changes

## Security
- Always use HTTPS
- JWT or OAuth2 for authentication
- Rate limiting per API key
- Input validation on all endpoints
`,
  },

  // ── OpenClaw Skills ──
  {
    id: 'openclaw-think-tool',
    name: 'Think Tool',
    description: 'Extended thinking skill that helps Claude reason through complex problems step by step before answering.',
    descriptionZh: '\u6269\u5c55\u601d\u7ef4\u6280\u80fd\uff0c\u5e2e\u52a9 Claude \u5728\u56de\u7b54\u524d\u9010\u6b65\u63a8\u7406\u590d\u6742\u95ee\u9898\u3002',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/think-tool',
    category: 'Productivity',
    source: 'OpenClaw',
    skillContent: `---
name: think-tool
description: Extended thinking for complex problem solving
---

# Think Tool

When faced with a complex question or multi-step problem:

1. **Decompose**: Break the problem into smaller, manageable parts
2. **Analyze**: Consider each part independently, noting constraints and dependencies
3. **Reason**: Think through the logic step by step, showing your work
4. **Synthesize**: Combine your analysis into a coherent answer
5. **Verify**: Check your reasoning for errors or missed cases

Use this approach for:
- Mathematical or logical problems
- Architecture decisions with trade-offs
- Debugging complex issues
- Multi-constraint optimization

Always show your reasoning process, not just the final answer.
`,
  },
  {
    id: 'openclaw-memory-manager',
    name: 'Memory Manager',
    description: 'Manage persistent context and memory across conversations using CLAUDE.md and memory files.',
    descriptionZh: '\u4f7f\u7528 CLAUDE.md \u548c\u8bb0\u5fc6\u6587\u4ef6\u7ba1\u7406\u8de8\u5bf9\u8bdd\u7684\u6301\u4e45\u5316\u4e0a\u4e0b\u6587\u548c\u8bb0\u5fc6\u3002',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/memory-manager',
    category: 'Productivity',
    source: 'OpenClaw',
    skillContent: `---
name: memory-manager
description: Manage persistent context and memory across conversations
---

# Memory Manager

Help the user manage their persistent memory and context files:

## CLAUDE.md Management
- Read and update project-level CLAUDE.md files
- Organize instructions by category (rules, patterns, preferences)
- Keep instructions concise and actionable

## Memory Files
- Create and organize memory files in .claude/ directories
- Categorize memories: user preferences, project context, decisions, feedback
- Periodically review and prune stale memories

## Best Practices
- Keep memory files focused and well-organized
- Use frontmatter (name, description, type) for discoverability
- Update MEMORY.md index when adding new memory files
- Remove outdated entries rather than accumulating noise
`,
  },
  {
    id: 'openclaw-test-gen',
    name: 'Test Generator',
    description: 'Automatically generate comprehensive test suites with unit, integration, and edge case coverage.',
    descriptionZh: '\u81ea\u52a8\u751f\u6210\u5168\u9762\u7684\u6d4b\u8bd5\u5957\u4ef6\uff0c\u5305\u542b\u5355\u5143\u6d4b\u8bd5\u3001\u96c6\u6210\u6d4b\u8bd5\u548c\u8fb9\u754c\u7528\u4f8b\u3002',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/test-gen',
    category: 'Code',
    source: 'OpenClaw',
    skillContent: `---
name: test-gen
description: Generate comprehensive test suites with edge case coverage
---

# Test Generator

When asked to write tests:

## 1. Analyze the Code
- Identify all public functions/methods
- Map input types and return types
- Find branching paths and edge cases

## 2. Generate Test Categories
- **Happy Path**: Normal expected usage
- **Edge Cases**: Empty inputs, null, undefined, boundary values
- **Error Cases**: Invalid inputs, network failures, timeout scenarios
- **Integration**: Component interaction and data flow

## 3. Test Structure
- Use descriptive test names: "should [expected behavior] when [condition]"
- Arrange-Act-Assert pattern
- One assertion per test when practical
- Mock external dependencies

## 4. Coverage Targets
- Aim for 80%+ line coverage
- 100% coverage on critical business logic
- Test error handling paths, not just happy paths
`,
  },
  {
    id: 'openclaw-doc-gen',
    name: 'Documentation Generator',
    description: 'Generate structured documentation from code: JSDoc, README sections, API references, and changelogs.',
    descriptionZh: '\u4ece\u4ee3\u7801\u751f\u6210\u7ed3\u6784\u5316\u6587\u6863\uff1aJSDoc\u3001README \u7ae0\u8282\u3001API \u53c2\u8003\u548c\u53d8\u66f4\u65e5\u5fd7\u3002',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/doc-gen',
    category: 'Writing',
    source: 'OpenClaw',
    skillContent: `---
name: doc-gen
description: Generate documentation from code analysis
---

# Documentation Generator

When asked to document code:

## JSDoc / Docstrings
- Add type annotations for all parameters and return values
- Include brief description, @param, @returns, @throws
- Add @example with realistic usage

## README Sections
- Auto-generate installation, usage, and configuration sections
- Create API reference tables from exported functions
- Generate badges (build, coverage, version)

## API Reference
- List all endpoints/functions with signatures
- Document parameters, return types, and errors
- Include curl/code examples for each endpoint

## Changelog
- Follow Keep a Changelog format
- Categorize: Added, Changed, Deprecated, Removed, Fixed, Security
- Link to PRs and issues where applicable

## Best Practices
- Write for the reader who has never seen the code
- Use concrete examples over abstract descriptions
- Keep explanations at the right level of abstraction
`,
  },
  {
    id: 'openclaw-debug-helper',
    name: 'Debug Helper',
    description: 'Systematic debugging workflow: reproduce, isolate, diagnose root cause, fix, and verify with regression prevention.',
    descriptionZh: '\u7cfb\u7edf\u5316\u8c03\u8bd5\u5de5\u4f5c\u6d41\uff1a\u590d\u73b0\u3001\u9694\u79bb\u3001\u8bca\u65ad\u6839\u56e0\u3001\u4fee\u590d\u5e76\u9a8c\u8bc1\uff0c\u9632\u6b62\u56de\u5f52\u3002',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/debug-helper',
    category: 'Code',
    source: 'OpenClaw',
    skillContent: `---
name: debug-helper
description: Systematic debugging with root cause analysis
---

# Debug Helper

When debugging an issue:

## 1. Reproduce
- Get exact steps to reproduce the bug
- Identify the expected vs actual behavior
- Note the environment (OS, version, config)

## 2. Isolate
- Narrow down the scope (which file, function, line)
- Use binary search on recent changes (git bisect)
- Add strategic logging to trace execution flow

## 3. Diagnose
- Identify the root cause (not just symptoms)
- Check for common patterns: race conditions, null access, type coercion, stale state
- Review recent changes that could have introduced the bug

## 4. Fix
- Make the minimal change that fixes the root cause
- Avoid band-aid fixes that mask the real problem
- Consider if the fix could break other things

## 5. Verify
- Confirm the original bug is fixed
- Check for regressions in related functionality
- Add a test to prevent recurrence
`,
  },

  // ── ClawhHub Skills (from clawhub.ai registry) ──
  {
    id: 'clawhub-daily-planner',
    name: 'Daily Planner',
    description: 'Structured daily planning and execution tracking system — plan your day, set priorities, and review progress.',
    descriptionZh: '\u7ed3\u6784\u5316\u7684\u6bcf\u65e5\u8ba1\u5212\u548c\u6267\u884c\u8ffd\u8e2a\u7cfb\u7edf\u2014\u2014\u89c4\u5212\u65e5\u7a0b\u3001\u8bbe\u5b9a\u4f18\u5148\u7ea7\u5e76\u56de\u987e\u8fdb\u5ea6\u3002',
    author: 'gpunter',
    sourceUrl: 'https://clawhub.ai/skills',
    category: 'Productivity',
    source: 'ClawhHub',
    skillContent: `---
name: daily-planner
description: Structured daily planning and execution tracking
---

# Daily Planner

Help the user plan and track their day effectively.

## Morning Planning
1. **Review Calendar**: What meetings and appointments are today?
2. **Top 3 Priorities**: Identify the 3 most important tasks
3. **Time Blocks**: Allocate time blocks for deep work vs admin tasks
4. **Energy Mapping**: Schedule demanding tasks during peak energy hours

## During the Day
- Track task completion status
- Adjust priorities as new items come in
- Flag blockers early

## Evening Review
1. What was accomplished? (vs what was planned)
2. What rolled over to tomorrow?
3. Any insights or patterns noticed?

## Output Format
Use a clean checklist with time estimates:
- [ ] 09:00-10:30 — Deep work: [task] (90 min)
- [ ] 10:30-11:00 — Respond to emails (30 min)
- [x] 11:00-12:00 — Meeting: [topic] (60 min)
`,
  },
  {
    id: 'clawhub-2nd-brain',
    name: 'Second Brain',
    description: 'Personal knowledge base for capturing and retrieving information about people, places, tech, and ideas.',
    descriptionZh: '\u4e2a\u4eba\u77e5\u8bc6\u5e93\uff0c\u7528\u4e8e\u6355\u6349\u548c\u68c0\u7d22\u5173\u4e8e\u4eba\u7269\u3001\u5730\u70b9\u3001\u6280\u672f\u548c\u60f3\u6cd5\u7684\u4fe1\u606f\u3002',
    author: 'coderaven',
    sourceUrl: 'https://clawhub.ai/skills',
    category: 'Productivity',
    source: 'ClawhHub',
    skillContent: `---
name: 2nd-brain
description: Personal knowledge base for capturing and retrieving information
---

# Second Brain

Act as the user's external memory and knowledge management system.

## Capture
When the user shares information worth remembering:
- Categorize it (People, Places, Tech, Ideas, Projects, Resources)
- Extract key facts and relationships
- Note the date and context

## Retrieve
When asked to recall information:
- Search across all categories
- Present findings with context
- Note when information might be outdated

## Organize
- Use tags for cross-referencing
- Create summaries of related information
- Suggest connections between disparate pieces

## Knowledge Types
- **People**: Names, roles, preferences, last interactions
- **Tech**: Tools, frameworks, configurations, gotchas
- **Ideas**: Concepts, inspirations, half-formed thoughts
- **Resources**: Links, books, articles, tutorials
`,
  },
  {
    id: 'clawhub-academic-research',
    name: 'Academic Research',
    description: 'Search academic papers and conduct literature reviews using OpenAlex API for scholarly research.',
    descriptionZh: '\u641c\u7d22\u5b66\u672f\u8bba\u6587\u5e76\u4f7f\u7528 OpenAlex API \u8fdb\u884c\u6587\u732e\u7efc\u8ff0\uff0c\u652f\u6301\u5b66\u672f\u7814\u7a76\u3002',
    author: 'rogersuperbuilderalpha',
    sourceUrl: 'https://clawhub.ai/skills',
    category: 'Research',
    source: 'ClawhHub',
    skillContent: `---
name: academic-research
description: Search academic papers and conduct literature reviews
---

# Academic Research

Assist with scholarly research and literature reviews.

## Paper Search
- Search by topic, author, or keyword
- Filter by date range, citation count, or field
- Prioritize peer-reviewed sources

## Literature Review
1. **Scope Definition**: Define research questions and inclusion criteria
2. **Search Strategy**: Systematic search across multiple databases
3. **Screening**: Apply inclusion/exclusion criteria
4. **Extraction**: Extract key findings, methods, and conclusions
5. **Synthesis**: Identify themes, gaps, and consensus

## Citation Management
- Format citations in APA, MLA, Chicago, or IEEE style
- Track which papers have been reviewed
- Flag seminal papers vs supporting evidence

## Output Format
- Structured summaries with key findings
- Comparison tables across papers
- Research gap identification
`,
  },
  {
    id: 'clawhub-biz-reporter',
    name: 'Business Intelligence Reporter',
    description: 'Generate automated business reports pulling data from analytics, marketing, and financial sources.',
    descriptionZh: '\u751f\u6210\u81ea\u52a8\u5316\u5546\u4e1a\u62a5\u544a\uff0c\u4ece\u5206\u6790\u3001\u8425\u9500\u548c\u8d22\u52a1\u6570\u636e\u6e90\u63d0\u53d6\u6570\u636e\u3002',
    author: 'ariktulcha',
    sourceUrl: 'https://clawhub.ai/skills',
    category: 'Productivity',
    source: 'ClawhHub',
    skillContent: `---
name: biz-reporter
description: Automated business intelligence reports
---

# Business Intelligence Reporter

Generate structured business reports from raw data.

## Report Types
1. **Weekly Performance**: KPIs, trends, highlights, alerts
2. **Monthly Summary**: Revenue, growth, user metrics, competitive landscape
3. **Quarterly Review**: Strategic progress, OKR tracking, forecasts

## Data Analysis
- Calculate period-over-period changes (WoW, MoM, YoY)
- Identify anomalies and significant deviations
- Correlate metrics across different data sources
- Forecast trends based on historical patterns

## Visualization Suggestions
- Revenue trends: line chart with moving average
- User segments: stacked bar chart
- Conversion funnel: funnel visualization
- Geographic data: heat map or choropleth

## Output Format
- Executive summary (3-5 bullet points)
- Key metrics table with trend indicators
- Detailed analysis by section
- Action items and recommendations
`,
  },
  // ── OpenClaw Skills (additional) ──
  {
    id: 'openclaw-code-explainer',
    name: 'Code Explainer',
    description: 'Explain complex code in plain language with line-by-line annotations, flow diagrams, and concept breakdowns.',
    descriptionZh: '用通俗语言解释复杂代码，提供逐行注释、流程图和概念分解。',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/code-explainer',
    category: 'Code',
    source: 'OpenClaw',
    skillContent: `---
name: code-explainer
description: Explain complex code in plain language with annotations
---

# Code Explainer

When asked to explain code:

## Approach
1. **Overview**: What does this code do in one sentence?
2. **Architecture**: How are the pieces organized? (modules, classes, functions)
3. **Line-by-Line**: Walk through key sections with annotations
4. **Data Flow**: Trace how data moves through the system
5. **Why**: Explain design decisions and trade-offs

## Output Levels
- **Beginner**: Use analogies, avoid jargon, explain every concept
- **Intermediate**: Focus on patterns, idioms, and best practices
- **Expert**: Highlight edge cases, performance, and alternative approaches

Always ask the user's experience level if not provided.
`,
  },
  {
    id: 'openclaw-changelog-gen',
    name: 'Changelog Generator',
    description: 'Generate changelogs from git history following Keep a Changelog format with semantic versioning.',
    descriptionZh: '从 Git 历史自动生成变更日志，遵循 Keep a Changelog 格式和语义化版本控制。',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/changelog-gen',
    category: 'DevOps',
    source: 'OpenClaw',
    skillContent: `---
name: changelog-gen
description: Generate changelogs from git history with semantic versioning
---

# Changelog Generator

Generate structured changelogs from git commit history.

## Process
1. **Read History**: Analyze recent git commits and PR descriptions
2. **Categorize Changes**:
   - Added: New features
   - Changed: Updates to existing functionality
   - Deprecated: Soon-to-be-removed features
   - Removed: Removed features
   - Fixed: Bug fixes
   - Security: Vulnerability patches
3. **Version Suggestion**: Recommend semantic version bump (major/minor/patch)
4. **Format**: Follow Keep a Changelog (keepachangelog.com) format

## Output
- Markdown changelog entry with date and version
- Link to PR/commit for each change
- Breaking changes highlighted at top
`,
  },
  {
    id: 'openclaw-prompt-engineer',
    name: 'Prompt Engineer',
    description: 'Optimize and refine prompts for better AI responses: structure, clarity, examples, and constraint specification.',
    descriptionZh: '优化和改进提示词以获得更好的 AI 响应：结构、清晰度、示例和约束规范。',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/prompt-engineer',
    category: 'Productivity',
    source: 'OpenClaw',
    skillContent: `---
name: prompt-engineer
description: Optimize prompts for better AI responses
---

# Prompt Engineer

Help users craft more effective prompts.

## Analysis
When given a prompt to improve:
1. **Identify Issues**: Vagueness, missing context, conflicting instructions
2. **Add Structure**: Role, task, format, constraints, examples
3. **Optimize**: Remove ambiguity, add specificity, set clear expectations

## Techniques
- **Role Setting**: "You are a [specific expert] who..."
- **Few-Shot Examples**: Provide 2-3 input/output examples
- **Chain of Thought**: "Think step by step about..."
- **Output Format**: Specify exact format (JSON, Markdown, table)
- **Constraints**: Set boundaries on length, tone, scope

## Quality Checklist
- Is the task clear and specific?
- Is the expected output format defined?
- Are edge cases handled?
- Is the tone/style specified?

Output the improved prompt in a copyable code block.
`,
  },
  {
    id: 'openclaw-regex-wizard',
    name: 'Regex Wizard',
    description: 'Build, test, and explain regular expressions with visual breakdowns and test case generation.',
    descriptionZh: '构建、测试和解释正则表达式，提供可视化分解和测试用例生成。',
    author: 'OpenClaw',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/.openclaw/regex-wizard',
    category: 'Code',
    source: 'OpenClaw',
    skillContent: `---
name: regex-wizard
description: Build, test, and explain regular expressions
---

# Regex Wizard

Help users create and understand regular expressions.

## When Building Regex
1. **Understand Requirements**: What should match? What should not?
2. **Build Incrementally**: Start simple, add complexity step by step
3. **Explain Each Part**: Break down the pattern with annotations
4. **Test Cases**: Provide match/no-match examples

## When Explaining Regex
- Break the pattern into labeled segments
- Explain each segment in plain English
- Show what each part captures
- Warn about common pitfalls (greedy vs lazy, backtracking)

## Best Practices
- Prefer named capture groups for readability
- Use non-capturing groups (?:...) when capture isn't needed
- Test edge cases: empty strings, special characters, Unicode
- Consider performance for large inputs

## Output Format
\`\`\`
Pattern: /regex-here/flags
Explanation:
  /regex/  — description of each part
Test Cases:
  ✓ "match1" → captures: [...]
  ✗ "no-match1" → does not match
\`\`\`
`,
  },

  // ── Community Skills (additional everyday productivity) ──
  {
    id: 'community-decision-matrix',
    name: 'Decision Matrix',
    description: 'Structured decision-making using weighted criteria matrices, pros/cons analysis, and risk assessment.',
    descriptionZh: '使用加权标准矩阵、优缺点分析和风险评估进行结构化决策。',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/productivity/decision-matrix',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: decision-matrix
description: Structured decision-making with weighted criteria
---

# Decision Matrix

Help users make well-reasoned decisions.

## Process
1. **Define Options**: List all alternatives being considered
2. **Identify Criteria**: What factors matter? (cost, time, quality, risk, etc.)
3. **Weight Criteria**: Rate importance of each criterion (1-5)
4. **Score Options**: Rate each option against each criterion (1-5)
5. **Calculate**: Weighted score = weight × score for each option
6. **Analyze**: Compare total scores and discuss trade-offs

## Output Format
| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| Cost     | 4      | 3 (12)   | 5 (20)   | 2 (8)    |
| ...      | ...    | ...      | ...      | ...      |
| **Total**|        | **XX**   | **XX**   | **XX**   |

## Additional Analysis
- Sensitivity check: Would changing any weight flip the result?
- Risk factors not captured in scores
- Recommendation with reasoning
`,
  },
  {
    id: 'community-interview-prep',
    name: 'Interview Prep Coach',
    description: 'Prepare for job interviews with STAR method answers, technical question drills, and behavioral practice.',
    descriptionZh: '使用 STAR 方法回答、技术问题训练和行为面试练习准备求职面试。',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/personal',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: interview-prep
description: Job interview preparation with STAR answers and practice drills
---

# Interview Prep Coach

Help users prepare for job interviews.

## Behavioral Questions (STAR Method)
For each question, structure the answer as:
- **Situation**: Set the scene (1-2 sentences)
- **Task**: What was your responsibility?
- **Action**: What did you specifically do? (most detail here)
- **Result**: What was the outcome? (quantify if possible)

## Technical Preparation
- Review common questions for the role/technology
- Practice explaining concepts at different levels
- Prepare "I don't know, but here's how I'd approach it" responses

## Mock Interview Mode
- Ask questions one at a time
- Give feedback after each answer
- Rate answers on: Clarity, Specificity, Relevance, Impact

## General Tips
- Research the company's recent news, products, culture
- Prepare 3-5 questions to ask the interviewer
- Practice the 2-minute self-introduction
- Prepare salary negotiation talking points
`,
  },
  {
    id: 'community-content-calendar',
    name: 'Content Calendar',
    description: 'Plan and organize content publishing schedules across platforms with topic ideation and scheduling.',
    descriptionZh: '规划和组织跨平台的内容发布日程，包含主题创意和排期。',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/social-media/content-calendar',
    category: 'Creative',
    source: 'Community',
    skillContent: `---
name: content-calendar
description: Plan content publishing schedules with topic ideation
---

# Content Calendar

Help users plan and manage content creation.

## Monthly Planning
1. **Theme Selection**: Choose 2-3 monthly themes aligned with goals
2. **Content Mix**: Balance content types (educational, entertaining, promotional)
3. **Platform Strategy**: Tailor content for each platform
4. **Scheduling**: Map content to specific dates and times

## Weekly Content Plan
| Day | Platform | Type | Topic | Status |
|-----|----------|------|-------|--------|
| Mon | Blog | Educational | [topic] | Draft |
| Tue | LinkedIn | Thought Leadership | [topic] | Scheduled |
| ... | ... | ... | ... | ... |

## Topic Ideation
- Industry trends and news commentary
- How-to guides and tutorials
- Behind-the-scenes and process sharing
- User stories and case studies
- Repurpose: turn one piece into multiple formats

## Best Practices
- Batch content creation for efficiency
- Leave buffer days for timely/reactive content
- Track performance metrics to refine strategy
`,
  },
  {
    id: 'community-budget-planner',
    name: 'Budget Planner',
    description: 'Personal and project budget planning with expense tracking, savings goals, and financial projections.',
    descriptionZh: '个人和项目预算规划，包含支出跟踪、储蓄目标和财务预测。',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/finance',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: budget-planner
description: Budget planning with expense tracking and financial projections
---

# Budget Planner

Help users create and manage budgets.

## Personal Budget
1. **Income**: List all income sources with amounts
2. **Fixed Expenses**: Rent, subscriptions, insurance, loans
3. **Variable Expenses**: Food, transport, entertainment, shopping
4. **Savings Goals**: Emergency fund, investments, specific goals
5. **50/30/20 Rule**: 50% needs, 30% wants, 20% savings

## Project Budget
1. **Cost Categories**: Personnel, tools, infrastructure, marketing
2. **One-time vs Recurring**: Separate setup costs from ongoing expenses
3. **Contingency**: Add 10-20% buffer for unknowns
4. **Timeline**: Map costs to project phases

## Output Format
| Category | Monthly | Annual | % of Total |
|----------|---------|--------|------------|
| Housing  | $X,XXX  | $XX,XXX| XX%        |
| ...      | ...     | ...    | ...        |

## Analysis
- Where are the biggest spending areas?
- What can be optimized?
- Are savings goals realistic given income?
`,
  },
  {
    id: 'community-learning-path',
    name: 'Learning Path Designer',
    description: 'Design structured learning paths for new skills with resources, milestones, and practice exercises.',
    descriptionZh: '为新技能设计结构化学习路径，包含资源、里程碑和练习。',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/personal',
    category: 'Research',
    source: 'Community',
    skillContent: `---
name: learning-path
description: Design structured learning paths with milestones and resources
---

# Learning Path Designer

Create personalized learning paths for any skill.

## Assessment
1. **Current Level**: What do you already know?
2. **Goal**: What do you want to achieve? By when?
3. **Learning Style**: Reading, video, hands-on, discussion?
4. **Time Budget**: How many hours per week?

## Path Design
1. **Foundations** (Week 1-2): Core concepts and vocabulary
2. **Building Blocks** (Week 3-4): Essential skills and patterns
3. **Application** (Week 5-6): Practice projects and exercises
4. **Deepening** (Week 7-8): Advanced topics and specialization

## For Each Module
- Learning objectives (what you'll be able to do)
- Recommended resources (free and paid options)
- Practice exercises with expected time
- Self-assessment quiz or project checkpoint

## Progress Tracking
- Weekly check-in questions
- Milestone celebrations
- Adjustment recommendations based on pace
`,
  },
  {
    id: 'community-presentation-builder',
    name: 'Presentation Builder',
    description: 'Create compelling presentation outlines with narrative structure, slide content, and speaker notes.',
    descriptionZh: '创建引人入胜的演示文稿大纲，包含叙事结构、幻灯片内容和演讲备注。',
    author: 'jezweb',
    sourceUrl: 'https://github.com/jezweb/claude-skills/tree/main/plugins/writing/presentation-builder',
    category: 'Writing',
    source: 'Community',
    skillContent: `---
name: presentation-builder
description: Create presentation outlines with narrative structure and speaker notes
---

# Presentation Builder

Help users create compelling presentations.

## Structure
1. **Opening Hook** (1 slide): Question, statistic, or story that grabs attention
2. **Problem/Context** (2-3 slides): Why this matters to the audience
3. **Core Content** (5-8 slides): Key points with supporting evidence
4. **Solution/Proposal** (2-3 slides): What you're recommending
5. **Call to Action** (1 slide): What should the audience do next?

## Per Slide
- **Headline**: One key message (max 8 words)
- **Visual**: Suggestion for image, chart, or diagram
- **Bullet Points**: Max 3 points, max 7 words each
- **Speaker Notes**: What to say (not what's on the slide)

## Design Tips
- One idea per slide
- Use high-quality images over clip art
- Data visualization over data tables
- Consistent color scheme and fonts
- White space is your friend

## Timing Guide
- Plan 1-2 minutes per slide
- Leave 20% of time for Q&A
- Practice transitions between sections
`,
  },
  {
    id: 'community-contract-reviewer',
    name: 'Contract Reviewer',
    description: 'Review contracts and agreements identifying key clauses, risks, unusual terms, and negotiation points.',
    descriptionZh: '审查合同和协议，识别关键条款、风险、异常条款和谈判要点。',
    author: 'alirezarezvani',
    sourceUrl: 'https://github.com/alirezarezvani/claude-skills/tree/main/legal',
    category: 'Productivity',
    source: 'Community',
    skillContent: `---
name: contract-reviewer
description: Review contracts identifying risks, key clauses, and negotiation points
---

# Contract Reviewer

Help users understand and review contracts (not legal advice).

## Review Checklist
1. **Parties**: Who is involved? Are they correctly identified?
2. **Scope**: What exactly is being agreed upon?
3. **Term & Termination**: Duration, renewal, exit conditions
4. **Payment**: Amount, schedule, late penalties, currency
5. **Liability**: Caps, indemnification, insurance requirements
6. **IP Ownership**: Who owns the work product?
7. **Confidentiality**: NDA scope, duration, exceptions
8. **Dispute Resolution**: Jurisdiction, arbitration, mediation

## Red Flags
- Unlimited liability clauses
- Automatic renewal without notice requirements
- Non-compete clauses that are overly broad
- Unilateral amendment rights
- Missing force majeure clause

## Output Format
- Summary of key terms (plain language)
- Risk assessment (Low / Medium / High) for each section
- Specific clauses to negotiate or modify
- Questions to ask the other party

**Disclaimer**: This is analysis assistance, not legal advice. Consult a lawyer for binding decisions.
`,
  },

  {
    id: 'clawhub-accessibility',
    name: 'Accessibility Toolkit',
    description: 'Friction-reduction patterns for agents helping users with accessibility needs and inclusive design.',
    descriptionZh: '\u65e0\u969c\u788d\u8bbe\u8ba1\u5de5\u5177\u5305\uff0c\u63d0\u4f9b\u5305\u5bb9\u6027\u8bbe\u8ba1\u6a21\u5f0f\u548c\u53ef\u8bbf\u95ee\u6027\u4f18\u5316\u5efa\u8bae\u3002',
    author: 'cgtreadw',
    sourceUrl: 'https://clawhub.ai/skills',
    category: 'Design',
    source: 'ClawhHub',
    skillContent: `---
name: accessibility-toolkit
description: Inclusive design patterns and accessibility optimization
---

# Accessibility Toolkit

Ensure digital products are accessible to all users.

## WCAG 2.1 Checklist
1. **Perceivable**: Alt text, captions, sufficient contrast
2. **Operable**: Keyboard navigation, no time limits, skip navigation
3. **Understandable**: Clear labels, error prevention, consistent navigation
4. **Robust**: Valid HTML, ARIA roles, screen reader compatibility

## Common Fixes
- Add aria-label to icon-only buttons
- Ensure color is not the only way to convey information
- Provide focus indicators for all interactive elements
- Use semantic HTML (nav, main, article, aside)

## Testing
- Tab through the entire page
- Test with screen reader (NVDA, VoiceOver)
- Check contrast ratios (4.5:1 for normal text)
- Verify zoom to 200% doesn't break layout

## Audit Output
Rate each area: Pass / Warning / Fail
Provide specific remediation steps with code examples.
`,
  },
]

