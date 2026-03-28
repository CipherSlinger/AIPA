# PRD: Welcome Screen & Placeholders Personal Assistant Repositioning
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-03-28_

## One-line Definition
Reposition the Welcome Screen suggestions and input placeholders from developer-centric to personal assistant-oriented, aligning with the product vision.

## Background & Motivation
- User explicitly stated: "The iteration direction has leaned toward a programming AI agent, but what I want is a personal desktop AI assistant"
- Current Welcome Screen shows 4 code-focused suggestions: Analyze Code, Find Bug, New Feature, Write Script
- Current input placeholders are all developer tasks: analyze code, describe bug, explain function, write test, refactor, review PR
- These signals immediately frame AIPA as a coding tool for first-time users
- AIPA should present itself as a versatile personal assistant capable of coding AND general tasks

## Target User
All AIPA users, especially non-developer users encountering the product for the first time.

## User Story
As a new AIPA user,
I want the app to show me a variety of things it can help with,
so that I understand it's a versatile personal assistant, not just a coding tool.

## Scope

### In Scope
- Replace Welcome Screen suggestion cards with a mix of general-purpose and technical suggestions
- Update subtitle text to reflect personal assistant positioning
- Replace input placeholder rotation with diverse, assistant-style suggestions
- Update i18n strings for both en and zh-CN
- Replace developer-focused icons with more general-purpose ones

### Out of Scope
- Structural layout changes to WelcomeScreen (card layout stays the same)
- Adding actual new capabilities (this is framing, not functionality)

## Detailed Changes

### 1. Welcome Screen Suggestions
Replace the 4 developer-focused cards with 4 diverse personal assistant cards:
- "Help me write an email" (general productivity)
- "Summarize this document" (knowledge work)
- "Create a weekly report" (office skill)
- "Explain a concept to me" (learning)

Icons should reflect general purpose: MessageSquare, FileText, ClipboardList, Lightbulb (or similar)

### 2. Welcome Screen Subtitle
Change from "Your AI-powered assistant for coding, analysis, and creative work"
To something like "Your AI-powered personal assistant -- writing, analysis, coding, and more"

### 3. Input Placeholder Rotation
Replace developer-focused placeholders with a mix:
- "Message AIPA..." (default, keep)
- "Help me draft an email..."
- "Summarize this for me..."
- "Write a weekly status report..."
- "Explain this concept..."
- "Help me organize my thoughts..."
- "Translate this text..."
- "Help me with my code..."

### Acceptance Criteria
- [ ] Welcome Screen shows 4 diverse (not all code-focused) suggestion cards
- [ ] Subtitle mentions broad capabilities, not just coding
- [ ] At least 4 of 8 placeholder suggestions are non-coding tasks
- [ ] All new strings have both en and zh-CN translations
- [ ] Build passes with zero errors

## Priority
- **P1**: Product positioning alignment -- important for user perception

## Dependencies & Risks
| Dependency | Owner | Risk Level |
|-----------|-------|-----------|
| None | Engineering | Low -- i18n string + component changes only |
