import { useState, useRef, useEffect, useCallback } from 'react'
import { SlashCommand, SLASH_COMMANDS } from './SlashCommandPopup'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { TextSnippet } from '../../types/app.types'
import { useT } from '../../i18n'

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

  // Parse popup triggers from input change
  const parsePopupTriggers = useCallback(
    (val: string, cursor: number) => {
      const textBefore = val.slice(0, cursor)
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

  // Handle slash command selection
  const handleSlashSelect = useCallback(
    async (cmd: SlashCommand) => {
      setSlashQuery(null)
      setInput('')
      if (cmd.clientOnly) {
        if (cmd.name === '/clear') onNewConversation()
        else if (cmd.name === '/help') {
          useChatStore.getState().addMessage({
            id: `help-${Date.now()}`,
            role: 'assistant',
            content:
              `**${t('command.availableCommands')}:**\n\n` +
              SLASH_COMMANDS.map((c) => `- \`${c.name}\` — ${c.description}`).join('\n'),
            timestamp: Date.now(),
          } as any)
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

  return {
    // @mention
    atQuery,
    setAtQuery,
    handleAtSelect,
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
