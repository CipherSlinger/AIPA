// stringUtils — string utility functions (Iteration 497)
// Ported from Claude Code sourcemap: src/utils/stringUtils.ts

/**
 * Escapes special regex characters in a string so it can be used as a literal
 * pattern in a RegExp constructor.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Uppercases the first character of a string, leaving the rest unchanged.
 * Unlike lodash `capitalize`, this does NOT lowercase the remaining characters.
 *
 * @example capitalize('fooBar') → 'FooBar'
 * @example capitalize('hello world') → 'Hello world'
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Returns the singular or plural form of a word based on count.
 *
 * @example plural(1, 'file') → 'file'
 * @example plural(3, 'file') → 'files'
 * @example plural(2, 'entry', 'entries') → 'entries'
 */
export function plural(n: number, word: string, pluralWord = word + 's'): string {
  return n === 1 ? word : pluralWord
}

/**
 * Returns the first line of a string without allocating a split array.
 */
export function firstLineOf(s: string): string {
  const nl = s.indexOf('\n')
  return nl === -1 ? s : s.slice(0, nl)
}

/**
 * Counts occurrences of `char` in `str` using indexOf jumps.
 */
export function countCharInString(str: string, char: string, start = 0): number {
  let count = 0
  let i = str.indexOf(char, start)
  while (i !== -1) {
    count++
    i = str.indexOf(char, i + 1)
  }
  return count
}

/**
 * Normalize full-width (zenkaku) digits to half-width digits.
 * Useful for accepting input from Japanese/CJK IMEs.
 */
export function normalizeFullWidthDigits(input: string): string {
  return input.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

/**
 * Normalize full-width (zenkaku) space to half-width space.
 * Useful for accepting input from Japanese/CJK IMEs (U+3000 → U+0020).
 */
export function normalizeFullWidthSpace(input: string): string {
  return input.replace(/\u3000/g, ' ')
}

/**
 * Truncates text to a maximum number of lines, adding an ellipsis if truncated.
 */
export function truncateToLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return lines.slice(0, maxLines).join('\n') + '…'
}
