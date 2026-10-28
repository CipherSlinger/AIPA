import React, { useMemo, useState } from 'react'
import { CodexQuestion } from '../../types/app.types'
import { useT } from '../../i18n'
import { ElicitationActions } from './ElicitationActions'

interface Props {
  questions: CodexQuestion[]
  onSubmit: (content: Record<string, string>) => void
  onDecline: () => void
  onCancel: () => void
}

interface Draft {
  /** Chosen option label (options questions only). */
  option?: string
  /** The free-text "Other" choice is active. */
  other: boolean
  /** Free-text answer — used by "Other" and by questions without options. */
  text: string
}

const EMPTY_DRAFT: Draft = { other: false, text: '' }

/**
 * Choice form for Codex's `requestUserInput` questions. The protocol has no
 * multi-select, so every question takes exactly one answer. Options are shown
 * as single-select rows with their descriptions; `isOther` adds a free-text
 * choice; a question with no options is a plain text input. Submit stays
 * disabled until every question has an answer — the answer map is keyed by
 * question id, which is what the bridge maps back onto `answers`.
 */
export function ElicitationQuestionForm({ questions, onSubmit, onDecline, onCancel }: Props) {
  const t = useT()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const draftFor = (id: string): Draft => drafts[id] ?? EMPTY_DRAFT

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_DRAFT), ...patch } }))
  }

  const answers = useMemo(() => {
    const result: Record<string, string> = {}
    for (const question of questions) {
      const draft = drafts[question.id] ?? EMPTY_DRAFT
      const hasOptions = Array.isArray(question.options) && question.options.length > 0
      const answer = hasOptions && !draft.other ? (draft.option ?? '') : draft.text.trim()
      if (answer) result[question.id] = answer
    }
    return result
  }, [questions, drafts])

  const complete = questions.every((question) => (answers[question.id] ?? '') !== '')

  const submit = () => {
    if (!complete) return
    onSubmit(answers)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Enter in a text field submits once the form is answerable. Deliberately
    // no Escape handler: the app owns that key, and a card-level binding would
    // fight it. Enter on a radio row keeps selecting, as buttons expect.
    const target = event.target as HTMLElement
    if (event.key === 'Enter' && !event.shiftKey && complete && target.tagName === 'INPUT') {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div onKeyDown={handleKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {questions.map((question, index) => {
        const draft = draftFor(question.id)
        const hasOptions = Array.isArray(question.options) && question.options.length > 0
        const textInputType = question.isSecret ? 'password' : 'text'
        return (
          <div
            key={question.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              ...(index > 0 ? { borderTop: '1px solid var(--border)', paddingTop: 10 } : {}),
            }}
          >
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-faint)',
            }}>
              {question.header || question.id}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {question.question}
            </div>

            {hasOptions && (
              <div
                role="radiogroup"
                aria-label={question.question || question.header}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {question.options!.map((option, optionIndex) => {
                  const selected = !draft.other && draft.option === option.label
                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => updateDraft(question.id, { option: option.label, other: false })}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 9px',
                        borderRadius: 6,
                        border: selected ? '1px solid rgba(99,102,241,0.55)' : '1px solid var(--border)',
                        background: selected ? 'rgba(99,102,241,0.12)' : 'var(--bg-hover)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        border: selected ? '4px solid rgba(99,102,241,0.85)' : '1px solid var(--border-strong)',
                        background: selected ? 'var(--bg-hover)' : 'transparent',
                        flexShrink: 0,
                        marginTop: 2,
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease',
                      }} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>{option.label}</span>
                        {option.description && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {option.description}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}

                {question.isOther && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.other}
                    onClick={() => updateDraft(question.id, { other: true })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 9px',
                      borderRadius: 6,
                      border: draft.other ? '1px solid rgba(99,102,241,0.55)' : '1px solid var(--border)',
                      background: draft.other ? 'rgba(99,102,241,0.12)' : 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: draft.other ? '4px solid rgba(99,102,241,0.85)' : '1px solid var(--border-strong)',
                      background: draft.other ? 'var(--bg-hover)' : 'transparent',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                      transition: 'all 0.15s ease',
                    }} />
                    {t('codex.questions.other')}
                  </button>
                )}
              </div>
            )}

            {hasOptions && question.isOther && draft.other && (
              <input
                type={textInputType}
                autoComplete="off"
                value={draft.text}
                onChange={(e) => updateDraft(question.id, { text: e.target.value })}
                placeholder={t('codex.questions.otherPlaceholder')}
                style={inputStyle}
                onFocus={(e) => {
                  // A 1px border colour change alone is too quiet for keyboard
                  // focus; pair it with a soft ring the way the other inputs do.
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.18)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            )}

            {!hasOptions && (
              <input
                type={textInputType}
                autoComplete="off"
                value={draft.text}
                onChange={(e) => updateDraft(question.id, { text: e.target.value })}
                placeholder={t('codex.questions.placeholder')}
                style={inputStyle}
                onFocus={(e) => {
                  // A 1px border colour change alone is too quiet for keyboard
                  // focus; pair it with a soft ring the way the other inputs do.
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.18)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            )}
          </div>
        )
      })}

      {!complete && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {t('codex.questions.answerRequired')}
        </div>
      )}

      <ElicitationActions
        onSubmit={submit}
        onDecline={onDecline}
        onCancel={onCancel}
        submitLabel={t('codex.questions.submit')}
        declineLabel={t('codex.questions.decline')}
        cancelLabel={t('codex.questions.cancel')}
        submitDisabled={!complete}
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 6,
  border: '1px solid var(--border)',
  padding: '7px 10px',
  fontSize: 12,
  background: 'var(--bg-hover)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s ease',
}
