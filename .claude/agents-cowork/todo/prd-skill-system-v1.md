# PRD: Skill System — Browse, Install & Manage Skills
_Version: 1 | Date: 2026-03-28 | Author: agent-leader (acting as PM)_

## Background

User feedback requests:
1. "你有参考openclaw的功能吗" — user asking if we reference OpenClaw's functionality
2. "开启skill市场功能，搜罗网络上受欢迎的skill库，供用户下载加载，增强自身" — user wants a skill marketplace

AIPA currently has **Custom Prompt Templates** (up to 20 user-defined system prompt presets) but no way to discover, browse, or install community-created skills. Claude Code's native skill system uses `.claude/skills/` directories with `SKILL.md` files containing YAML frontmatter and markdown instructions. Third-party skill collections exist (e.g., `daymade/claude-code-skills` with 43 production-ready skills).

This PRD introduces a **Skill System UI** that makes Claude Code's native skill mechanism accessible to non-technical users through AIPA's graphical interface.

## In Scope (3 Feature Points)

### Feature 1: Skill Browser Panel (NavRail + Sidebar)

**What**: A new "Skills" tab in the NavRail + Sidebar, displaying all installed skills (from `~/.claude/skills/` personal directory and `.claude/skills/` project-level directory).

**Why**: Users currently have no visibility into what skills are available. They need to see installed skills, understand what each one does, and invoke them.

**Details**:
- New NavRail icon: `Puzzle` (lucide) for Skills
- Sidebar panel: `SkillsPanel.tsx`
- Two sections: "Personal Skills" (from `~/.claude/skills/`) and "Project Skills" (from `.claude/skills/` relative to working directory)
- Each skill card shows:
  - Name (from YAML frontmatter `name` field, or folder name as fallback)
  - Description (from frontmatter `description` field, or first line of SKILL.md)
  - Source badge: "Personal" or "Project"
  - Invoke button: inserts `/skill-name` into chat input
- Empty state: friendly message explaining what skills are and how to get started
- Refresh button to re-scan skill directories
- Search/filter by name

### Feature 2: Skill Detail View & Management

**What**: Click on a skill card to see its full details, with options to delete or open in file browser.

**Why**: Users need to understand what a skill does before invoking it, and manage their installed skills.

**Details**:
- Detail view replaces the list view (back button to return)
- Shows: full name, description, instructions preview (first 500 chars of SKILL.md content), source directory path
- Action buttons:
  - "Use Skill" — inserts the slash command into chat input
  - "Open in File Browser" — opens the skill's directory in the sidebar file browser
  - "Delete Skill" — two-click confirmation, only for personal skills (project skills are read-only from AIPA's perspective)
- Shows frontmatter metadata if available: `allowed_tools`, `auto_invoke` settings

### Feature 3: Skill Marketplace — Featured Collection

**What**: A "Marketplace" tab within the Skills panel showing a curated list of popular skill collections that users can browse and install with one click.

**Why**: Most users won't create skills from scratch. They need a discovery mechanism to find and install useful community skills.

**Details**:
- Tab bar at top of SkillsPanel: "Installed" | "Marketplace"
- Marketplace tab shows a hardcoded curated list of popular skill sources (initially 8-12 skills):
  - Each entry: name, description, author, category tag (Productivity, Writing, Code, Research, Creative)
  - "Install" button per entry
- Install mechanism:
  - Creates the skill directory under `~/.claude/skills/[skill-name]/`
  - Writes the `SKILL.md` file with the skill's content
  - Shows success toast with "Use Now" action
- Categories: Productivity, Writing, Code, Research, Creative
- Category filter pills (same visual pattern as note categories)
- The curated skill data is a static JSON array in the source code (no external API needed for v1)
- Skills in the marketplace are generic prompt-instruction skills (no executable code, no security risk)

## Out of Scope
- External API for dynamic skill marketplace (v2)
- Skill creation wizard (users can create skills manually via file system)
- Skill sharing/publishing
- Skill auto-update mechanism
- MCP server integration with skills
- Skill ratings or reviews

## Technical Notes
- IPC channels needed: `skills:list` (scan directories), `skills:read` (read SKILL.md), `skills:install` (write SKILL.md), `skills:delete` (remove directory)
- Main process: new `skill-manager.ts` module to handle file system operations
- Renderer: new `SkillsPanel.tsx` with sub-components
- i18n: all UI strings in en.json and zh-CN.json
- The curated marketplace data goes in `src/renderer/data/skillMarketplace.ts`

## Success Criteria
1. Users can see all installed skills (personal + project) in the Skills sidebar panel
2. Users can click a skill to see its details and invoke it via chat
3. Users can browse a curated marketplace of 8-12 popular skills
4. Users can install marketplace skills with one click
5. Users can delete personal skills with two-click confirmation
6. All UI strings are i18n'd (en + zh-CN)
7. Build succeeds with no TypeScript errors

## Priority
P0 — Direct user request, aligns with "personal assistant that can be enhanced" product direction

## Estimated Scope
Medium-Large: New NavRail tab, new sidebar panel, new IPC channels, new main-process module, marketplace data file. Comparable to the Notes system (iterations 120-125).
