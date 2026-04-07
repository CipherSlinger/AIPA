// usePromptKeywords — prompt keyword detection from Claude Code sourcemap (Iteration 490)
// Ports matchesKeepGoingKeyword + matchesNegativeKeyword from userPromptKeywords.ts

/**
 * Returns true if the input is a "keep going" / continuation signal.
 * Matches: "continue" (alone), "keep going", "go on", Chinese equivalents.
 */
export function matchesKeepGoingKeyword(input: string): boolean {
  const trimmed = input.trim().toLowerCase()

  // Exact match for bare "continue" / "继续" / "続けて"
  if (trimmed === 'continue' || trimmed === '继续' || trimmed === '続けて') {
    return true
  }

  // Phrase matches anywhere in the input
  const keepGoingPattern =
    /\b(keep going|go on|please continue|continue please|keep it going)\b/i
  if (keepGoingPattern.test(trimmed)) return true

  // Chinese continuation phrases
  const cnPattern = /^(继续|请继续|继续下去|继续吧|请继续生成|继续生成)$/
  return cnPattern.test(trimmed)
}

/**
 * Returns true if the input contains negative / frustration keywords.
 * Used to show a friendly response hint.
 */
export function matchesNegativeKeyword(input: string): boolean {
  const lower = input.toLowerCase()
  const negativePattern =
    /\b(wtf|wth|ffs|omfg|this sucks|so frustrating|what the hell|so annoying|not working|broken|useless|terrible|awful|horrible|doesn'?t work|won'?t work|fuck(ing)?|damn it|piece of (shit|crap|junk))\b/i
  return negativePattern.test(lower)
}
