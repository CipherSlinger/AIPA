# AIPA — AI Personal Assistant

> Your always-on desktop companion. Ask anything, automate anything, get things done — powered by Claude.

AIPA is a desktop AI personal assistant built with Electron + React. The goal is not merely a chat window — it is a capable agent that lives on your desktop, understands your files and environment, writes and runs code, browses the web, and handles real-world tasks end-to-end. Under the hood it drives the [Claude Code](https://claude.ai/code) CLI as its execution engine.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-39-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)

## Vision

Most AI tools are answer machines. AIPA is built to be a *doer*.

- You describe what you need — it figures out how to do it.
- It can read, write, and edit files on your machine.
- It can run shell commands and scripts.
- It can browse the web and fetch information.
- It remembers your sessions and picks up where you left off.
- It surfaces every decision it makes, so you stay in control.

The Claude Code CLI is the engine. AIPA is the cockpit.

## Features

- **Chat panel** — structured conversation with Claude via stream-JSON protocol, with tool-use visualization
- **Terminal panel** — full interactive PTY terminal running Claude Code directly (xterm.js), with reconnect button to restart after process exit and clear error recovery; automatic fallback to basic shell mode when native PTY module is unavailable (e.g., on Windows without C++ build tools)
- **Session history** — browse and resume past sessions from `~/.claude/projects/`, with search highlighting, skeleton loaders, and active session indicator
- **File browser** — navigate the working directory from the sidebar
- **Settings** — configure API key, model, font, working directory, CLI flags, and MCP servers
- **Onboarding wizard** — guided setup on first launch
- **Message rating** — thumbs up/down on assistant messages via right-click context menu
- **Message context menu** — right-click any message for quick actions: copy, rate, rewind to checkpoint
- **Thinking blocks** — collapsible extended thinking display
- **Token usage & cost** — live context usage bar, per-turn token counts, and cumulative session cost in status bar
- **Permission prompts** — friendly allow/deny cards for tool permission requests (Bash, Write, Edit, WebFetch, etc.)
- **Slash commands** — `/` popup with available commands in the input box
- **@mention popup** — mention files or contexts with `@`
- **Plan cards** — structured plan visualization in chat
- **Image paste** — paste images directly into the chat input
- **File drag-and-drop** — drag files from the OS file explorer into the chat; images are attached, other files are referenced via `@path`
- **Conversation export** — export conversations as Markdown, HTML, or JSON via toolbar button or `Ctrl+Shift+E`; HTML export produces a self-contained styled file for sharing
- **Command palette** — `Ctrl+Shift+P` to access all actions and slash commands in a fuzzy-search modal
- **Keyboard shortcuts** — `Ctrl+N` new conversation, `Ctrl+B` toggle sidebar, `Ctrl+`` toggle terminal, `Ctrl+L` focus input, `Ctrl+,` settings, `Ctrl+Shift+E` export, `Ctrl+F` search in conversation, `Ctrl+/` shortcut cheatsheet, `Ctrl+Shift+N` toggle notes panel
- **Session auto-title** — conversations are automatically titled after the first exchange, with live sidebar refresh
- **System prompt** — inject a custom system prompt per session
- **Smart auto-scroll** — auto-scroll respects user intent; scroll-to-bottom button appears when reading earlier messages
- **Streaming elapsed timer** — real-time timer shows how long Claude has been working
- **Settings About tab** — version info, external links, keyboard shortcut reference, runtime info, reset to defaults
- **Virtual message list** — uses `@tanstack/react-virtual` for smooth performance with 100+ messages
- **Conversation search** — `Ctrl+F` to search within current conversation with match highlighting and navigation
- **Input history** — press Up/Down arrows to cycle through previously sent messages, like a terminal shell
- **Draft auto-save** — unsent input is preserved across page refreshes within the session
- **External links** — markdown links open in the system browser, not inside the Electron window
- **Completion sound** — configurable audio chime when Claude finishes responding (Settings > Completion Sound)
- **Relative timestamps** — messages show "2m ago", "1h ago" etc., live-updating, with absolute time on hover
- **GFM task list checkboxes** — `- [x]` and `- [ ]` render as styled visual checkboxes
- **Message bookmarks** — right-click to bookmark important messages for quick visual reference
- **Word/token count** — hover over assistant messages to see word count and approximate token estimate
- **Compact mode** — reduce spacing for a denser view (Settings > Compact Mode)
- **Session delete confirmation** — two-click confirmation prevents accidental session deletion
- **Scroll position memory** — scroll positions are remembered when switching between sessions
- **Copy as Markdown** — right-click assistant messages to copy raw Markdown source
- **Copy as Rich Text** — right-click assistant messages to copy formatted content that pastes with styling into emails and documents
- **Shortcut cheatsheet** — `Ctrl+/` opens a floating overlay showing all keyboard shortcuts
- **System message styling** — error and system messages have distinct red-tinted appearance
- **Contextual typing indicator** — shows what Claude is doing: "Thinking...", "Running command...", "Reading file...", etc.
- **Session count badge** — sidebar History tab shows total number of sessions
- **Notes count badge** — sidebar Notes tab shows total number of notes
- **Collapsible code blocks** — long code blocks auto-collapse with "Show more/less" toggle
- **Code block line count** — code blocks display line count in the header
- **Date separators** — messages grouped by day with "Today", "Yesterday", or date headers
- **Focus mode** — `Ctrl+Shift+F` hides sidebar and terminal for distraction-free work
- **Bookmarks panel** — toolbar dropdown lists all bookmarked messages with jump-to navigation
- **Unread count badge** — scroll-to-bottom button shows count of new messages when scrolled up
- **Double-click copy** — double-click any message to copy its text to clipboard
- **Session pinning** — star/pin sessions in the sidebar for quick access; pinned sessions sort to top
- **Message collapse** — collapse individual messages to reduce visual clutter, with content preview
- **Conversation stats** — toolbar popover showing message counts, word totals, tool uses, and session cost
- **Collapse all/expand all** — bulk collapse or expand all messages via the stats panel or `Ctrl+Shift+C`
- **Raw markdown toggle** — view assistant messages as raw markdown source with a toggle button
- **Message count in toolbar** — toolbar shows total message count for the current conversation
- **Scroll progress indicator** — thin progress bar at top of message list showing scroll position
- **Quick session navigation** — `Ctrl+[` / `Ctrl+]` to switch between sessions without using the sidebar
- **Image lightbox** — click any image attachment to open a full-screen preview with zoom, rotate, and keyboard controls
- **Window title notification** — window title shows session name and flashes (*) when Claude finishes responding; taskbar icon flashes to attract attention when window is not focused
- **Native desktop notifications** -- OS-level notifications when Claude finishes responding while the window is not focused; click the notification to focus the window and see the response
- **Ctrl+K clear** — alternative shortcut to clear conversation, matching terminal conventions
- **Streaming spinner** — animated spinner in toolbar next to elapsed timer during active streaming
- **Enhanced table styling** — markdown tables with rounded borders, accent header, hover highlights
- **Responsive sidebar** — sidebar auto-collapses when window width drops below 600px
- **Persistent sort order** — session sort preference (newest/oldest/alpha) is remembered across restarts
- **Clear confirmation** — Ctrl+N/K requires double-press within 1.5s when conversation has 3+ messages
- **Message entrance animation** — new messages slide in with a subtle fade animation
- **Session keyboard navigation** — Up/Down arrow keys to navigate sessions in the sidebar list
- **Status bar streaming indicator** — pulsing green dot and "Streaming" label during active responses
- **Input quick actions** — small "Clear", "@file", "/cmd" buttons above the textarea for quick access
- **Task queue** — queue multiple prompts for sequential auto-execution; pause, resume, or clear the queue at any time
- **Multi-language (i18n)** — supports English and Simplified Chinese; defaults to system locale, switchable in Settings
- **Dark & Light themes** -- clean Dark and soft-toned Light themes; switchable in Settings (Light theme uses gentle off-white backgrounds to reduce eye strain)
- **Working directory in chat header** -- current working directory shown below session title; click to change directory for the current session
- **System tray** -- minimize to system tray; global hotkey `Ctrl+Shift+Space` to summon the window from anywhere; right-click tray for recent sessions, toggle theme, and open working directory
- **Clipboard quick action** -- `Ctrl+Shift+G` from any app reads clipboard text and opens AIPA with it ready to process; great for quick translations, summaries, and rewrites without manually switching windows
- **Continue last conversation** -- welcome screen shows a prominent card to resume the most recent conversation; displays session title and one-click to jump right back in
- **Response regeneration** — regenerate the last AI response with a single click or `Ctrl+Shift+R`; removes the previous response and re-sends your prompt
- **Message editing** — edit any previously sent message; the conversation is truncated at that point and the edited message is re-sent for a fresh response
- **Chat zoom** — `Ctrl+=` to zoom in, `Ctrl+-` to zoom out, `Ctrl+0` to reset; zoom level indicator appears and can be clicked to reset
- **Prompt templates** — pre-configured system prompt roles (Writing Assistant, Research Analyst, Tutor, Code Reviewer, Creative Writer, Productivity Coach) selectable from Settings dropdown; create your own custom templates (up to 20) for reusable workflows like meeting notes, email drafts, or weekly reports
- **Copy conversation** — copy the entire conversation as Markdown to clipboard with `Ctrl+Shift+X` or toolbar button; instant clipboard access without file dialogs
- **ARIA accessibility** — landmark roles (`application`, `banner`, `main`, `complementary`, `navigation`, `status`, `log`), `aria-live` regions, `aria-label` on all interactive elements for screen reader support
- **Zero TypeScript errors** — clean `tsc --noEmit` with full strict mode; SpeechRecognition Web API type declarations included
- **Session tags** — color-coded tag system (Work, Personal, Research, Debug, Docs, Archive) for organizing sessions; assign via hover menu, filter by tag in sidebar, customize tag names in Settings
- **Quick notes** — built-in notepad in the sidebar for jotting down ideas, to-dos, or key points alongside conversations; notes auto-save, persist across restarts, and support up to 100 entries
- **Note-chat integration** — send any note to the chat input with one click ("Send to Chat"); save any assistant response as a note via right-click menu ("Save as Note"); seamlessly bridge note-taking and AI conversation
- **Notes Markdown preview** — toggle between raw editing and rendered Markdown preview; supports headings, bold, italic, lists, code blocks, tables, and GFM checkboxes
- **Notes search** — instant full-text search across all notes by title and content, with match count and clear button
- **Note title auto-generation** — notes automatically pick up their title from the first Markdown heading (`#`, `##`, `###`)
- **Note categories** — organize notes into up to 10 color-coded categories; filter notes by category with a pill-style filter bar; assign categories from the note editor; manage (create, rename, delete) categories inline
- **Clipboard quick actions** — "Paste & Ask" button in the chat toolbar reads clipboard text and offers one-click actions: Summarize, Translate, Rewrite, Explain, Grammar Check; auto-detects target language for translation
- **Note export** — export individual notes as Markdown files via the editor toolbar (Download button + system Save dialog); bulk export all notes (or filtered by category) to a folder via the "Export All" button in the Notes panel header
- **Note import** — import `.md` and `.txt` files as notes via the "Import" button in the Notes panel header; supports multi-file selection, auto-extracts titles from Markdown headings or filenames, respects 100-note limit
- **Streaming speed indicator** — real-time characters-per-second (c/s) display in the status bar during active streaming, with Zap icon; auto-formats large values (e.g., "1.2k c/s")
- **Response time on messages** — each AI response shows how long it took to generate (e.g., "took 12s", "took 1m 5s") with a Timer icon next to the timestamp
- **Context window warning** — dismissible warning banner appears when context usage exceeds 80%, with "New Conversation" quick action; turns red at 90%
- **Input token estimate** — input bar shows estimated token count (~chars/4) alongside word and character counts, helping users gauge context usage before sending
- **Auto-focus input after response** — input textarea automatically receives focus when Claude finishes responding, so you can immediately type your next message without clicking
- **Text selection toolbar** — select any text in a message to reveal a floating toolbar with Copy, Quote, and Save to Notes actions for the selected text
- **Escape to stop** — press `Escape` to immediately stop Claude's response generation; listed in the shortcut cheatsheet
- **Time-of-day greeting** — welcome screen shows "Good morning/afternoon/evening" based on current time, with today's date displayed below
- **Inline title rename** — click the session title in the chat header to rename it inline; press Enter to save or Escape to cancel
- **Persistent input history** — previously sent messages are remembered across page refreshes and app restarts via localStorage (up to 50 entries)
- **Recent prompts on welcome screen** — welcome screen shows up to 3 most recently sent prompts for quick re-use, with a "Clear" button to reset history
- **Context menu completeness** — right-click any message for full actions: Copy, Quote Reply, Edit (user messages), Save as Note (AI messages), Bookmark, Collapse, Rate, and Rewind
- **Quote preview banner** — quoting a message shows a visual preview above the input with dismiss button, instead of raw markdown; quoted text is automatically prepended when sending
- **Session message count badge** — session list rows show message count alongside the timestamp for quick context
- **Welcome screen shortcut hints** — quick action buttons on the welcome screen display their keyboard shortcuts (e.g., `Ctrl+,`, `Ctrl+B`)
- **Enhanced session list empty state** — empty session list shows a friendly icon and hint text instead of a blank panel
- **Note editor word count** — note editor header shows live word count alongside character count
- **Note reading time estimate** — note editor header displays estimated reading time (e.g., "~2 min read") based on word count
- **File browser parent navigation** — ArrowUp button in file browser header navigates to the parent directory without using the folder picker dialog
- **File type icons** — file browser shows color-coded icons for 60+ file types: code files (TypeScript, Python, Rust, etc.), documents, images, video, audio, archives, databases, and config files
- **File click-to-mention** — clicking a file in the file browser inserts `@filepath` into the chat input for quick file referencing
- **Session export** — export any session as a Markdown file directly from the sidebar action buttons (Download icon)
- **Multi-session select & bulk delete** — enter selection mode to check multiple sessions and delete them all at once; select all/deselect all, floating action bar with confirmation, active session protected from deletion
- **Note pinning** — pin important notes to the top of the list; pinned notes display a pin icon and persist across restarts; pin/unpin from note list or editor toolbar
- **Note sorting** — sort notes by last modified, date created, or alphabetically; sort preference persists across restarts; pinned notes always stay at the top regardless of sort order
- **Note templates** — create notes from templates (Meeting Notes, To-Do List, Journal Entry, Idea) via dropdown next to the New Note button; each template provides structured Markdown content
- **Note auto-save indicator** — note editor shows "Saving..." with spinner during debounce and "Saved" with checkmark after save completes, providing visual confirmation that changes are persisted
- **Note markdown toolbar** — formatting toolbar with Bold, Italic, Heading, Bullet List, Numbered List, Code, and Link buttons; wraps selected text with markdown syntax or inserts at cursor position
- **Note duplicate** — duplicate any note with one click from the editor toolbar; creates a copy with the same content and category
- **Note character limit indicator** — visual progress bar appears when approaching the 10,000 character limit; turns yellow at 90% and red at 95% with remaining character count
- **Session project filter** — filter sessions by project path with pill-style buttons; auto-detects unique projects and shows session counts; only appears when sessions span multiple projects
- **Settings grouped sections** — General settings organized into 5 collapsible groups (AI Engine, Prompts, Appearance, Workspace, Behavior) with icons; collapse/expand state persisted across visits
- **Settings search** — search bar at the top of General settings tab to quickly filter settings by keyword; non-matching groups are hidden
- **Scroll-to-top button** — ArrowUp button appears when scrolled down in a conversation, enabling quick jump to the beginning; complements the existing scroll-to-bottom button
- **Session duration** — session list items and hover tooltips show conversation duration (e.g., "12m", "1h 30m") calculated from first to last message timestamp
- **Skill browser** — browse all installed Claude Code skills (personal and project-level) in a dedicated sidebar panel with search, detail view, and one-click invocation via slash command
- **Skill marketplace** — curated collection of 46 community-sourced skills from Anthropic, OpenClaw, ClawhHub, and community contributors across 7 categories; source-based filtering (Anthropic/OpenClaw/ClawhHub/Community) and category filtering; i18n-translated descriptions and labels; one-click install with proper attribution and source links; "Browse on ClawhHub.ai" link for discovering more skills
- **Skill management** — view skill details (SKILL.md content), delete personal skills with two-click confirmation, and install marketplace skills to `~/.claude/skills/`
- **Follow-up suggestions** — after Claude finishes responding, 2-3 contextual follow-up chips appear (e.g., "Explain this code", "Key takeaways", "Give an example") based on content analysis of the response; click to instantly send
- **Model quick-switcher** — click the model name badge in the chat header to open a dropdown and switch between all 8 Claude models instantly; also accessible from Command Palette (`Ctrl+Shift+P`) with searchable "Switch model to X" commands; selected model shown with checkmark and persisted to settings
- **Lazy-loaded sidebar panels** — Settings, Notes, Skills, and File Browser panels use `React.lazy()` + `Suspense` for faster initial load; initial bundle reduced from 1,268 KB to 1,132 KB (-10.7%)
- **Accessibility foundations** — focus trap for modal dialogs (CommandPalette, ImageLightbox) keeps Tab navigation within modal bounds; `role="dialog"` and `aria-modal` on overlays; `role="switch"` and `aria-checked` on toggle buttons; `aria-live="polite"` on toast notifications
- **AI Personas** — create custom assistant profiles (up to 10) with their own name, emoji avatar, preferred model, system prompt, and badge color; quick-switch between personas from the chat header dropdown; activate a persona to automatically apply its model and system prompt; manage personas in Settings > Personas tab; inspired by OpenClaw's multi-agent architecture
- **Ctrl+Home/End navigation** — jump instantly to the first or last message in a conversation; PageUp/PageDown scrolls by 80% of visible height; Alt+Up/Down jumps between user messages for quick review
- **Time-gap separators** — subtle time markers appear between messages that are more than 30 minutes apart within the same day, making long conversations easier to scan
- **Response time badges** — small "replied in Xs" badge between user message and assistant reply shows how long the AI took to respond (visible for responses taking 1s or more)
- **Save to note from toolbar** — one-click NotebookPen button on assistant message hover toolbar saves the response as a note, promoting the feature from context-menu-only to immediate access
- **Per-session draft persistence** — chat input drafts now persist per-session in localStorage; switching sessions restores the draft for that session with a toast notification
- **Bookmarks & stats shortcuts** — `Ctrl+Shift+B` toggles bookmarks panel, `Ctrl+Shift+S` toggles stats panel; both added to shortcut cheatsheet
- **Stats panel reading time** — stats popover now shows total character count and estimated reading time (based on 200 WPM) alongside word count
- **Scroll lock during streaming** — lock/unlock button appears during streaming to prevent auto-scroll while reading earlier parts of a long response; auto-unlocks when streaming completes
- **Bookmarks export** — export only bookmarked messages as a Markdown file via the bookmarks panel header
- **Shortcut cheatsheet search** — search/filter input at the top of the shortcut cheatsheet for quick shortcut lookup by action name or key combo
- **Note search highlighting** — search terms are highlighted in note titles and content snippets with accent-colored background; matching context shown around hits
- **Cross-session search** — press Enter in the session search bar to search across all session files; results shown with match type badges, context snippets, and keyword highlighting; `Ctrl+Shift+F` opens global search from anywhere
- **Input length progress ring** — circular SVG progress ring around the send button fills as you type; color transitions from accent (< 5K chars) to warning yellow (5K-8K) to orange (8K-10K) to error red (10K+)
- **Persistent memory** — AI memory manager in the sidebar (Brain icon, `Ctrl+6`); create, edit, delete, search, pin, and categorize memories across 4 types (Preference, Fact, Instruction, Context); memories persist across all sessions and are injected as context for personalized responses (max 200)
- **Workflow builder** — multi-step prompt pipeline builder in the sidebar (Workflow icon, `Ctrl+7`); chain multiple prompts into reusable workflows; each step runs sequentially via the task queue; create/edit/delete/duplicate/reorder steps; 3 preset workflows (Weekly Report, Code Review, Research & Summarize); run counter tracks usage
- **Command Palette workflow integration** — `Ctrl+Shift+P` now includes all saved workflows as runnable commands; panel-opener shortcuts for Notes, Memory, and Workflows; workflow commands show step count and description
- **Selection toolbar translate & explain** — select text in any message to see Translate and Explain quick actions; Translate auto-detects target language based on UI language; Explain sends a simplified explanation prompt
- **Message Read Aloud** — Volume2 button on assistant messages reads the response aloud using Web Speech API; markdown formatting stripped for cleaner speech; click again to stop
- **Paste URL quick actions** — paste a URL into the chat input and quick action chips appear (Summarize, Explain, Translate) with URL preview; click a chip to prepend the action text
- **Session sort by message count** — sort sessions by message count in the sidebar; most-discussed sessions rise to the top
- **Keyboard UX enhancements** — F2 to rename focused session, Delete key to delete with double-press confirmation, Escape to dismiss URL chips and quote previews
- **Remember This** — save any assistant response as a memory item directly from the hover toolbar (Brain icon) or right-click context menu; automatically categorized as "context" memory with source tracking
- **Memory injection** — persistent memories are automatically injected as context into every conversation; pinned memories always included, plus up to 10 most recent; makes the AI truly personalized over time
- **Scheduled prompts** — schedule recurring AI prompts in the sidebar (Clock icon, `Ctrl+8`); supports one-time, daily, weekly, and monthly schedules with time picker and day selector; auto-executes via the task queue; 3 presets (Daily Summary, Weekly Review, Morning Motivation); inspired by OpenClaw's cron service
- **Prompt history** — searchable history of all sent prompts in the sidebar (ListRestart icon, `Ctrl+9`); tracks usage frequency, favorites, and timestamps; sort by recent/most-used/alphabetical; one-click re-send or copy; automatically records every prompt with deduplication; inspired by OpenClaw's session analytics
- **Inline prompt autocomplete** — as you type 3+ characters, ghost text from your prompt history appears after the cursor; press Tab to accept the suggestion; matches the most frequently used history entry
- **Favorite prompts quick access** — Star button in the input toolbar shows a dropdown of favorited prompt history items; click to send immediately; sorted by last used with usage count badge
- **Conversation summarize** — FileText button in the chat header sends a summarization prompt to generate an AI summary of the current conversation; disabled during streaming or with fewer than 2 messages
- **Long text paste detection** -- pasting text longer than 500 characters shows quick action chips (Summarize, Explain, Translate, Rewrite); auto-dismisses after 12 seconds; Escape to dismiss
- **Typing speed indicator** -- real-time words-per-minute display in the compose status bar when actively typing; calculated from a 10-second rolling keystroke window; highlights in accent color when exceeding 60 WPM
- **Date/time quick insert** -- Calendar button in the input toolbar opens a dropdown with 7 date/time formats (Today, Now, Time, Tomorrow, Yesterday, Weekday, ISO); locale-aware formatting; one-click insert at cursor
- **Emoji picker** -- Smile button in the input toolbar opens a 4-category emoji grid (Smileys, Gestures, Hearts, Objects) with 64 frequently-used emojis; tabbed navigation; hover scale animation
- **Message share button** -- Share button on message hover toolbar copies the message as formatted shareable text with role label and date attribution
- **Text transform actions** -- Wand button in the input toolbar sends the current input text through 5 transform actions: Make formal, Make casual, Shorten, Expand, Fix grammar
- **Regenerate with model picker** -- split regenerate button with dropdown to switch Claude models before regenerating; compare responses from different models easily
- **Pinned messages** -- pin important messages to the top of the chat for quick reference; Pin button on hover toolbar and context menu; pinned messages strip at top of conversation with collapsible header; click any pinned preview to scroll to the original message
- **Text snippets** -- define reusable text snippets with `::keyword` trigger; type `::` followed by a keyword in the chat input to expand the snippet; manage snippets in Settings > Templates tab with full CRUD (max 50); keyboard navigation for snippet popup
- **Save input as note** -- StickyNote button in the input toolbar saves the current chat input text as a new note without sending it to Claude; great for preserving drafts and ideas
- **Message emoji reactions** -- SmilePlus button on message hover toolbar opens an emoji picker with 8 reaction emojis; click to toggle reactions on/off; reactions display as small chips below the message bubble
- **Copy code blocks** -- right-click assistant messages containing code to copy all fenced code blocks at once; shows count of blocks copied in toast notification
- **Translate message** -- Languages button on message hover toolbar sends the full message as a translation request; auto-detects target language based on UI language (Chinese UI -> English, English UI -> Chinese)
- **Response tone selector** -- Palette pill in the input toolbar lets you pick a response style (Default, Concise, Detailed, Professional, Casual, Creative); tone modifier injected into system prompt; persists across messages
- **Quick language toggle** -- `Ctrl+Shift+L` toggles UI language between English and Chinese instantly; mirrors the `Ctrl+Shift+D` theme toggle pattern
- **Command palette toggles** -- Toggle Theme and Toggle Language commands available in the Command Palette (`Ctrl+Shift+P`) with context-aware icons
- **Message annotations** -- attach private notes to any message; StickyNote button on hover toolbar toggles inline annotation editor; annotations display as yellow-tinted strips below the message bubble; searchable via Ctrl+F; annotation count shown in stats panel
- **Input markdown formatting** -- `Ctrl+B` wraps selected text in bold markers, `Ctrl+I` wraps in italic; inserts marker pair with cursor placement when no selection
- **Focus timer (Pomodoro)** -- 25-minute countdown timer in the status bar; visual countdown display; completion notification sound and toast; one-click start/stop
- **Save clipboard as note** -- Command Palette command that reads clipboard text and creates a new note automatically
- **Copy conversation stats** -- Copy Stats button in the statistics panel copies all stats as formatted text to clipboard
- **Message rating in toolbar** -- ThumbsUp/ThumbsDown buttons directly on the assistant message hover toolbar for quick one-click response rating
- **Status bar model switcher** -- click the model badge in the status bar to open a quick-switch dropdown showing all Claude models; instant model switching without opening Settings
- **Click-to-copy token usage & cost** -- token usage and cost displays in the status bar are now clickable; clicking tokens copies "Input: X, Output: Y" to clipboard; clicking cost copies session cost with last-turn breakdown; toast confirmation on copy
- **Context window warning toast** -- when context window usage exceeds 85%, an automatic warning toast suggests starting a new conversation; fires once per session to avoid spam
- **Streaming speed tokens/sec** -- streaming speed indicator in the status bar now shows estimated tokens per second alongside characters per second for better throughput awareness
- **Inline calculator** -- type `= expression` (e.g., `= 42 * 1.18`) in the chat input to see the result instantly below; supports arithmetic, exponentiation (`^`), percent (`%`), and parentheses; press Tab to accept the calculated value
- **Stopwatch timer** -- count-up stopwatch in the status bar next to the Pomodoro timer; click to start, click again to pause, double-click when paused to reset; amber icon when running
- **Message word count** -- each message bubble shows word count next to the timestamp with a Type icon; useful for tracking email, report, or essay word counts in assistant responses
- **Copy last response command** -- "Copy Last Response" in the Command Palette (`Ctrl+Shift+P`) copies the most recent assistant message to clipboard with one action
- **Daily inspiration** -- "Daily Inspiration" command in the Command Palette shows a random motivational quote as an info toast; 20 curated quotes for the personal assistant companion feel
- **Text case cycling** -- `Ctrl+Shift+U` cycles selected text in the chat input through UPPERCASE, lowercase, and Title Case; preserves selection after transform
- **API key pool with auto-failover** -- add multiple API keys in Settings; when one key's quota is exhausted, AIPA automatically rotates to the next enabled key; import keys from JSON/CSV/TXT files; visual status indicators (green=active, red=exhausted, gray=disabled); reset exhausted keys with one click

## Security

AIPA follows Electron security best practices:

- **safeStorage encryption** — API keys are encrypted using the OS keychain (DPAPI on Windows, Keychain on macOS) via `electron.safeStorage`; no hardcoded keys
- **Content Security Policy** — strict CSP headers prevent XSS and unauthorized external resource loading
- **Sandboxed renderer** — `sandbox: true` enabled; renderer has no direct Node.js access
- **IPC input validation** — all file system IPC handlers validate paths against an allowlist of permitted directories
- **Environment sanitization** — CLI child processes only receive an explicit allowlist of environment variables (no secret leakage)

## Requirements

- Windows 10/11 x64
- [Node.js](https://nodejs.org/) 18 or later (must be on PATH)
- An [Anthropic API key](https://console.anthropic.com/)

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/CipherSlinger/AIPA.git
cd AIPA/electron-ui

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Launch
node_modules/.bin/electron dist/main/index.js
```

On first launch, open **Settings** (sidebar → gear icon) and enter your Anthropic API key.

## Development (with Hot Reload)

```bash
# Terminal 1 — start Vite dev server
npm run build:main && npm run build:preload
npx vite

# Terminal 2 — launch Electron pointed at Vite
NODE_ENV=development node_modules/.bin/electron dist/main/index.js
```

## Build Installer (Windows)

```bash
npm run dist:win
# Output: electron-ui/release/
```

## Updating the Bundled CLI

The `package/` directory contains the bundled Claude Code CLI. Two helper scripts are included to check and update it:

```bash
# Bash (Linux / macOS / Git Bash on Windows)
bash update-cli.sh

# Windows Command Prompt
update-cli.bat
```

Both scripts compare the current version in `package/package.json` against the latest release on npm, and prompt you to confirm before downloading and replacing `package/`.

## Project Structure

```
AIPA/
├── package/          # Bundled Claude Code CLI (read-only, vendored)
└── electron-ui/      # Electron app
    ├── src/
    │   ├── main/     # Main process (Node.js): PTY, IPC, sessions, config
    │   ├── preload/  # Context bridge (exposes electronAPI to renderer)
    │   └── renderer/ # React UI (Vite + Tailwind)
    └── dist/         # Compiled output (generated, not committed)
```

## Architecture

The app bridges Claude Code in two modes:

| Mode | Used for | How |
|------|----------|-----|
| **PTY** (node-pty) | Terminal panel | Spawns `node cli.js` in a ConPTY, streams raw terminal I/O to xterm.js |
| **Stream-JSON** | Chat panel | Spawns `node cli.js --input-format stream-json --output-format stream-json --print`, parses NDJSON events |

All IPC between renderer and main process goes through `window.electronAPI` (defined in `src/preload/index.ts`).

## License

MIT
