// The answer view: the corpus receipt, the body with its citation chips, the
// empty-answer copy, and the source list.
//
// Every sentence here reads the frozen `askedScope` from the turn, never the
// live toggle. A scope with zero sessions is not "answered from 0
// conversations" — the empty-answer copy names the corpus instead, and a list
// scope that held nothing says so rather than reusing the "no match" wording.
// A scoped empty answer only says no in-scope transcript matched; it does not
// claim the corpus never discussed the topic.

import { Check, Copy } from 'lucide-react'
import { useT } from '../../../i18n'
import { relativeTime } from '../SearchResultRow'
import type { AskedScope, AskSource } from './askHistory'
import { AnswerBody } from './AnswerBody'
import { CHIP_STYLE, GHOST_BUTTON_STYLE, projectLabel } from './shared'

interface Props {
  /** The corpus this answer was asked with, frozen at the press. */
  askedScope: AskedScope | null
  answer: string
  sources: AskSource[]
  copied: boolean
  /** The transcript index was still building when the answer came back. */
  indexing: boolean
  onCopy: () => void
  onFollowUp: () => void
  onCite: (source: AskSource) => void
}

export function AskAnswerView({
  askedScope,
  answer,
  sources,
  copied,
  indexing,
  onCopy,
  onFollowUp,
  onCite,
}: Props) {
  const t = useT()

  return (
    <div
      role="region"
      aria-label={t('askHistory.answerLabel')}
      aria-live="polite"
      style={{ padding: '16px 16px 14px' }}
    >
      {/* After the fact, say which corpus answered: the department the
          turn was scoped to and how many sessions it offered, or the
          archive snapshot you picked and any rows its cap left out. A
          scope with zero sessions is not "answered from 0
          conversations" — the empty-answer copy below already names the
          corpus. */}
      {askedScope && askedScope.count > 0 && (
        <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 8 }}>
          {askedScope.kind === 'dept' ? (
            <>
              {t('search.deptScope.answerScope', {
                dept: askedScope.label,
                count: askedScope.count,
              })}
              {askedScope.truncated && (
                <> {t('search.deptScope.capped', { count: askedScope.count })}</>
              )}
            </>
          ) : (
            <>
              {askedScope.dept
                ? t('search.listScope.answerScopeDept', {
                    dept: askedScope.dept.label,
                    count: askedScope.count,
                  })
                : t('search.listScope.answerScope', { count: askedScope.count })}
              {askedScope.omitted > 0 && (
                <> {t('search.listScope.answerCapped', {
                  listed: askedScope.listed,
                  total: askedScope.total,
                })}</>
              )}
            </>
          )}
        </div>
      )}
      {answer ? (
        <>
          {/* The row keeps its height in both states: growing it on
              "Copied" would shift the answer under the cursor. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 2, minHeight: 22 }}>
            <button
              type="button"
              onClick={onCopy}
              title={t(copied ? 'askHistory.copied' : 'askHistory.copy')}
              aria-label={t(copied ? 'askHistory.copied' : 'askHistory.copy')}
              style={{
                ...GHOST_BUTTON_STYLE,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: copied ? 'var(--success-text)' : 'var(--text-muted)',
                padding: '3px 8px',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{t(copied ? 'askHistory.copied' : 'askHistory.copy')}</span>
            </button>
            <button
              type="button"
              onClick={onFollowUp}
              title={t('askHistory.followUp')}
              aria-label={t('askHistory.followUp')}
              style={{ ...GHOST_BUTTON_STYLE, padding: '3px 8px' }}
            >
              {t('askHistory.followUp')}
            </button>
          </div>
          <AnswerBody
            answer={answer}
            sources={sources}
            onCite={(_n, source) => onCite(source)}
          />
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {/* A scoped empty answer only says no in-scope transcript
              matched; it does not claim the corpus never discussed the
              topic. An empty list scope has no transcript to name, so
              it says the scope itself held nothing rather than reusing
              the "no match" wording. The generic copy would erase that
              difference. */}
          {askedScope
            ? askedScope.kind === 'dept'
              ? t('search.deptScope.noMatch', { dept: askedScope.label })
              : askedScope.count > 0
                ? t('search.listScope.noMatch', { count: askedScope.count })
                : askedScope.dept
                  ? t('search.listScope.emptyAfterDept', { dept: askedScope.dept.label })
                  : t('search.listScope.emptyList')
            : t(indexing ? 'askHistory.stillIndexing' : 'askHistory.noSources')}
          {askedScope && indexing && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {askedScope.kind === 'dept'
                ? t('search.deptScope.searching')
                : t('search.listScope.searching')}
            </div>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div role="group" aria-label={t('askHistory.sourcesTitle')} style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {t('askHistory.sourcesTitle')}
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sources.map((source, i) => (
              <button
                key={`${source.sessionId}-${i}`}
                type="button"
                onClick={() => onCite(source)}
                aria-label={t('askHistory.citeLabel', {
                  n: i + 1,
                  title: source.title || t('askHistory.untitled'),
                })}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '2px solid transparent',
                  borderRadius: 0,
                  padding: '5px 6px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: 'inherit',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ ...CHIP_STYLE, cursor: 'inherit' }}>[{i + 1}]</span>
                <span
                  title={source.title || t('askHistory.untitled')}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {source.title || t('askHistory.untitled')}
                </span>
                <span
                  title={projectLabel(source.project, t('askHistory.unknownProject'))}
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flexShrink: 1,
                  }}
                >
                  {projectLabel(source.project, t('askHistory.unknownProject'))}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginLeft: 'auto',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {relativeTime(source.timestamp, t)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
