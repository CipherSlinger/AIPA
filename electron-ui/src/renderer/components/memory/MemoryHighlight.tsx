/**
 * Range-based highlighting for memory search.
 *
 * The ranges come from `findHighlightRanges` (pure, harnessed); this file only
 * turns them into <mark> nodes. The old `highlightText` helper in
 * memoryConstants mixes matching and rendering and reuses a global regex, so
 * the search surfaces use this one instead.
 */
import React from 'react'
import type { HighlightRange } from './memorySearch'

export function HighlightedText({
  text,
  ranges,
}: {
  text: string
  ranges: readonly HighlightRange[]
}) {
  if (ranges.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let from = 0
  ranges.forEach(([start, end], index) => {
    if (start > from) parts.push(text.slice(from, start))
    parts.push(
      <mark
        key={`${start}-${index}`}
        style={{
          background: 'rgba(99,102,241,0.45)',
          color: 'inherit',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {text.slice(start, end)}
      </mark>,
    )
    from = end
  })
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

/**
 * Bring the first highlighted occurrence into view inside `root`. Called after
 * a result row opens its tier, so the user lands on the matching line rather
 * than the top of the file.
 */
export function scrollToFirstHighlight(root: HTMLElement | null): void {
  if (!root) return
  const mark = root.querySelector('mark')
  if (mark instanceof HTMLElement) mark.scrollIntoView({ block: 'center' })
}
