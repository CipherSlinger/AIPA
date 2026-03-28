# PRD: System Prompt Templates Personal Assistant Update
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-03-28_

## One-line Definition
Update system prompt templates from all-developer roles to a mix of personal assistant and technical roles, aligning with the personal assistant product vision.

## Background & Motivation
- Continuation of the product repositioning effort (Iteration 114)
- Current 6 templates are ALL developer-focused: Code Reviewer, Technical Writer, Bug Hunter, Refactoring Expert, Programming Tutor, Software Architect
- For a personal desktop AI assistant, templates should help with diverse tasks: writing, analysis, learning, productivity
- README.md also references these templates and needs updating

## Scope

### In Scope
- Replace 6 developer-only templates with a balanced mix (3 general + 3 technical)
- Update i18n strings for both en and zh-CN
- Update README.md and README_CN.md prompt template descriptions

### Out of Scope
- Custom template creation UI (future feature)
- Template import/export

## New Templates
1. **Writing Assistant** -- helps draft emails, reports, documents with proper tone and structure
2. **Research Analyst** -- helps analyze information, summarize findings, compare options
3. **Language Tutor** -- patient explanation of concepts, step-by-step teaching
4. **Code Reviewer** -- (keep) code quality, bugs, security review
5. **Creative Writer** -- storytelling, brainstorming, creative content generation
6. **Productivity Coach** -- task planning, time management, goal setting, workflow optimization

## Acceptance Criteria
- [ ] 6 templates: 4 general-purpose + 2 technical
- [ ] All template names and prompts updated in en.json and zh-CN.json
- [ ] README.md updated with new template names
- [ ] README_CN.md updated with new template names
- [ ] Build passes with zero errors
