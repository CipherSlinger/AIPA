// The answer with its `[n]` markers as chips.
//
// Only markers that point at a real source become buttons; an out-of-range
// number stays literal text rather than offering an action that cannot work.
// The segmentation itself comes from `parseAnswerCitations`, shared with the
// in-chat history row, so the two surfaces cannot disagree about what counts
// as a citation.

import React, { useMemo } from 'react'
import { useT } from '../../../i18n'
import { parseAnswerCitations } from '../answerCitations'
import type { AskSource } from './askHistory'
import { CHIP_STYLE } from './shared'

export function AnswerBody({
  answer,
  sources,
  onCite,
}: {
  answer: string
  sources: AskSource[]
  onCite: (n: number, source: AskSource) => void
}) {
  const t = useT()
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = []
    // Shared with the in-chat history row: a number that does not map to a
    // returned source must stay literal text in both places.
    for (const segment of parseAnswerCitations(answer, sources.length)) {
      if (segment.kind === 'text') {
        out.push(segment.text)
        continue
      }
      const source = sources[segment.sourceIndex]
      if (!source) {
        out.push(segment.raw)
        continue
      }
      out.push(
        <button
          key={`cite-${segment.start}`}
          type="button"
          onClick={() => onCite(segment.n, source)}
          aria-label={t('askHistory.citeLabel', {
            n: segment.n,
            title: source.title || t('askHistory.untitled'),
          })}
          style={CHIP_STYLE}
        >
          [{segment.n}]
        </button>,
      )
    }
    return out
  }, [answer, sources, onCite, t])

  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
      {nodes}
    </div>
  )
}
