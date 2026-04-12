import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { SlashCommand, SLASH_COMMANDS } from './SlashCommandPopup'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { TextSnippet, Note, NoteCategory } from '../../types/app.types'
import { useT } from '../../i18n'
import { Terminal } from 'lucide-react'

interface UseInputPopupsOptions {
  input: string
  setInput: (val: string | ((prev: string) => string)) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSend: (text: string) => Promise<void>
  onNewConversation: () => void
}

export function useInputPopups({
  input,
  setInput,
  textareaRef,
  onSend,
  onNewConversation,
}: UseInputPopupsOptions) {
  const t = useT()
  const prefs = usePrefsStore((s) => s.prefs)

  // @mention state
  const [atQuery, setAtQuery] = useState<string | null>(null)

  // @note: reference state (Iteration 438)
  const [noteQuery, setNoteQuery] = useState<string | null>(null)
  const [noteIndex, setNoteIndex] = useState(0)

  // Slash command state
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [customCommands, setCustomCommands] = useState<SlashCommand[]>([])

  // Text snippet state
  const [snippetQuery, setSnippetQuery] = useState<string | null>(null)
  const [snippetIndex, setSnippetIndex] = useState(0)

  // Filtered snippets
  const textSnippets: TextSnippet[] = prefs.textSnippets || []
  const filteredSnippets =
    snippetQuery !== null && textSnippets.length > 0
      ? textSnippets
          .filter((s) =>
            s.keyword.toLowerCase().startsWith(snippetQuery.toLowerCase()),
          )
          .slice(0, 8)
      : []

  // Filtered notes for @note: popup (Iteration 438)
  const allNotes: Note[] = prefs.notes || []
  const noteCategories: NoteCategory[] = prefs.noteCategories || []
  const filteredNotes = useMemo(() => {
    if (noteQuery === null || allNotes.length === 0) return []
    const q = noteQuery.toLowerCase()
    return allNotes
      .filter((n) =>
        !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [noteQuery, allNotes])

  // Parse popup triggers from input change
  const parsePopupTriggers = useCallback(
    (val: string, cursor: number) => {
      const textBefore = val.slice(0, cursor)

      // Detect @note: trigger before generic @ (Iteration 438)
      const noteMatch = textBefore.match(/@note:([^\s]*)$/i)
      if (noteMatch) {
        setNoteQuery(noteMatch[1])
        setNoteIndex(0)
        setAtQuery(null)
        setSlashQuery(null)
        setSnippetQuery(null)
        return
      }
      setNoteQuery(null)

      const atMatch = textBefore.match(/@([^\s]*)$/)
      if (atMatch) {
        setAtQuery(atMatch[1])
      } else {
        setAtQuery(null)
      }
      const slashMatch = textBefore.match(/(?:^|\s)(\/[^\s]*)$/)
      if (slashMatch) {
        setSlashQuery(slashMatch[1].slice(1))
        setSlashIndex(0)
        setAtQuery(null)
      } else if (!atMatch) {
        setSlashQuery(null)
      }
      // Detect ::keyword for text snippets
      const snippetMatch = textBefore.match(/::(\w*)$/)
      if (snippetMatch && !atMatch && !slashMatch) {
        setSnippetQuery(snippetMatch[1])
        setSnippetIndex(0)
      } else {
        setSnippetQuery(null)
      }
    },
    [],
  )

  // Handle @mention selection
  const handleAtSelect = useCallback(
    (filePath: string) => {
      const cursor = textareaRef.current?.selectionStart ?? input.length
      const textBefore = input.slice(0, cursor)
      const textAfter = input.slice(cursor)
      const atMatch = textBefore.match(/@([^\s]*)$/)
      if (atMatch) {
        const replaced =
          textBefore.slice(0, textBefore.length - atMatch[0].length) +
          `@${filePath}` +
          textAfter
        setInput(replaced)
      }
      setAtQuery(null)
      textareaRef.current?.focus()
    },
    [input, setInput, textareaRef],
  )

  // Handle snippet selection
  const handleSnippetSelect = useCallback(
    (snippet: TextSnippet) => {
      const cursor = textareaRef.current?.selectionStart ?? input.length
      const textBefore = input.slice(0, cursor)
      const textAfter = input.slice(cursor)
      const snippetMatch = textBefore.match(/::(\w*)$/)
      if (snippetMatch) {
        const replaced =
          textBefore.slice(0, textBefore.length - snippetMatch[0].length) +
          snippet.content +
          textAfter
        setInput(replaced)
      }
      setSnippetQuery(null)
      textareaRef.current?.focus()
    },
    [input, setInput, textareaRef],
  )

  // Handle note reference selection (Iteration 438)
  const handleNoteSelect = useCallback(
    (note: Note) => {
      const cursor = textareaRef.current?.selectionStart ?? input.length
      const textBefore = input.slice(0, cursor)
      const textAfter = input.slice(cursor)
      const noteMatch = textBefore.match(/@note:[^\s]*$/i)
      if (noteMatch) {
        // Build blockquote from note content
        const quotedContent = note.content
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n')
        const insertion = `> **${note.title}**\n${quotedContent}\n`
        const replaced =
          textBefore.slice(0, textBefore.length - noteMatch[0].length) +
          insertion +
          textAfter
        setInput(replaced)
      }
      setNoteQuery(null)
      textareaRef.current?.focus()
    },
    [input, setInput, textareaRef],
  )

  // Handle slash command selection
  const handleSlashSelect = useCallback(
    async (cmd: SlashCommand) => {
      setSlashQuery(null)
      setInput('')
      if (cmd.clientOnly) {
        if (cmd.name === '/clear') {
          onNewConversation()
        } else if (cmd.name === '/help') {
          useChatStore.getState().addMessage({
            id: `help-${Date.now()}`,
            role: 'assistant',
            content:
              `**${t('command.availableCommands')}:**\n\n` +
              SLASH_COMMANDS.map((c) => `- \`${c.name}\` — ${c.description}`).join('\n'),
            timestamp: Date.now(),
          } as any)
        } else if (cmd.name === '/vim') {
          const current = usePrefsStore.getState().prefs.vimMode as boolean | undefined
          const next = !current
          usePrefsStore.getState().setPrefs({ vimMode: next } as any)
          window.electronAPI?.prefsSet('vimMode', next)
          useUiStore.getState().addToast('success', next ? 'Vim mode enabled' : 'Vim mode disabled')
        } else if (cmd.name === '/fast') {
          const currentModel = usePrefsStore.getState().prefs.model || ''
          const isHaiku = currentModel.includes('haiku')
          const nextModel = isHaiku ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
          usePrefsStore.getState().setPrefs({ model: nextModel })
          window.electronAPI?.prefsSet('model', nextModel)
          useUiStore.getState().addToast('success', `Model: ${nextModel}`)
        } else if (cmd.name === '/output-style') {
          const styles: Array<'default' | 'explanatory' | 'learning'> = ['default', 'explanatory', 'learning']
          const current = usePrefsStore.getState().prefs.outputStyle || 'default'
          const idx = styles.indexOf(current as any)
          const next = styles[(idx + 1) % styles.length]
          usePrefsStore.getState().setPrefs({ outputStyle: next })
          window.electronAPI?.prefsSet('outputStyle', next)
          useUiStore.getState().addToast('success', `Output style: ${next}`)
        } else if (cmd.name === '/statusline') {
          useUiStore.getState().toggleStatusBar()
          const show = useUiStore.getState().showStatusBar
          useUiStore.getState().addToast('success', show ? 'Status bar shown' : 'Status bar hidden')
        } else if (cmd.name === '/rename') {
          window.dispatchEvent(new CustomEvent('aipa:renameSession'))
        } else if (cmd.name === '/export') {
          window.dispatchEvent(new CustomEvent('aipa:openExport'))
        } else if (cmd.name === '/plan') {
          window.dispatchEvent(new CustomEvent('aipa:togglePlan'))
        } else if (cmd.name === '/permissions') {
          useUiStore.getState().openSettingsAt('permissions')
        } else if (cmd.name === '/hooks') {
          useUiStore.getState().openSettingsAt('hooks')
        } else if (cmd.name === '/mcp') {
          useUiStore.getState().openSettingsAt('plugins')
        } else if (cmd.name === '/memory') {
          useUiStore.getState().openSettingsAt('memory')
        } else if (cmd.name === '/model') {
          useUiStore.getState().openSettingsAt('general')
          useUiStore.getState().addToast('info', 'Model settings → General tab')
        } else if (cmd.name === '/cost') {
          useUiStore.getState().openSettingsAt('stats')
        } else if (cmd.name === '/skills') {
          useUiStore.getState().setActiveNavItem('skills')
        }
        return
      }
      const isBuiltin = SLASH_COMMANDS.some((c) => c.name === cmd.name)
      if (isBuiltin) {
        await onSend(cmd.name)
      } else {
        setInput(cmd.name + ' ')
        textareaRef.current?.focus()
      }
    },
    [setInput, onSend, onNewConversation, t, textareaRef],
  )

  // Load custom slash commands once when popup opens
  const slashPopupOpen = slashQuery !== null
  useEffect(() => {
    if (!slashPopupOpen) return
    window.electronAPI
      .fsListCommands(prefs.workingDir || '')
      .then(
        (cmds: { name: string; description: string; source: string }[]) => {
          setCustomCommands(
            cmds.map((c) => ({
              name: c.name,
              description:
                c.description +
                (c.source === 'project'
                  ? ` ${t('command.sourceProject')}`
                  : ` ${t('command.sourceUser')}`),
              icon: Terminal,
            })),
          )
        },
      )
      .catch(() => {})
  }, [slashPopupOpen, prefs.workingDir])

  // Slash command keyboard navigation
  useEffect(() => {
    if (slashQuery === null) return
    const filtered = SLASH_COMMANDS.filter(
      (c) =>
        !slashQuery || c.name.toLowerCase().includes(slashQuery.toLowerCase()),
    )
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[slashIndex]) handleSlashSelect(filtered[slashIndex])
      } else if (e.key === 'Escape') {
        setSlashQuery(null)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [slashQuery, slashIndex])

  // Note popup keyboard navigation (Iteration 438)
  useEffect(() => {
    if (noteQuery === null || filteredNotes.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setNoteIndex((i) => Math.min(i + 1, filteredNotes.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setNoteIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredNotes[noteIndex]) handleNoteSelect(filteredNotes[noteIndex])
      } else if (e.key === 'Escape') {
        setNoteQuery(null)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [noteQuery, noteIndex, filteredNotes, handleNoteSelect])

  return {
    // @mention
    atQuery,
    setAtQuery,
    handleAtSelect,
    // @note: reference (Iteration 438)
    noteQuery,
    setNoteQuery,
    noteIndex,
    setNoteIndex,
    filteredNotes,
    noteCategories,
    handleNoteSelect,
    // Slash commands
    slashQuery,
    setSlashQuery,
    slashIndex,
    setSlashIndex,
    customCommands,
    handleSlashSelect,
    // Snippets
    snippetQuery,
    setSnippetQuery,
    snippetIndex,
    setSnippetIndex,
    filteredSnippets,
    handleSnippetSelect,
    // Trigger parser
    parsePopupTriggers,
  }
}
