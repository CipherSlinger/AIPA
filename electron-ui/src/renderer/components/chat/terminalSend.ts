/**
 * Reading a fenced block as something that can be typed into a shell.
 *
 * A shell runs a line the moment a newline reaches it, so a multi-line block
 * cannot be "typed in without running it": the first lines would execute while
 * the rest were still arriving. Such a block is refused by name; Run — with its
 * own confirmation — is the honest action for it. Kept pure so the harness can
 * check the refusal without rendering a code block.
 */

export type TerminalCommandIssue = 'empty' | 'multiLine'

export interface PreparedTerminalCommand {
  /** Single-line text with no trailing newline — safe to write without submitting. */
  command: string
  /** 0 for an empty block, otherwise the number of lines in the block. */
  lineCount: number
  issue: TerminalCommandIssue | null
}

export function prepareTerminalCommand(codeText: string): PreparedTerminalCommand {
  const command = codeText.replace(/\r\n?/g, '\n').trim()
  if (!command) return { command: '', lineCount: 0, issue: 'empty' }
  const lineCount = command.split('\n').length
  if (lineCount > 1) return { command, lineCount, issue: 'multiLine' }
  return { command, lineCount, issue: null }
}
