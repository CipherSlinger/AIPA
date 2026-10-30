// The one-click suggestion chip. It is deliberately a chip, not a default:
// rendering it changes nothing, and only the click hands the id to the caller.
// Callers must still re-check that the department exists before writing, since
// the tree can change between render and click.
import React from 'react'
import { Sparkles } from 'lucide-react'
import { useT } from '../../i18n'
import type { DepartmentSuggestion } from '../../lib/taskRouting'

interface Props {
  suggestion: DepartmentSuggestion
  onAccept: () => void
  disabled?: boolean
}

export default function DepartmentSuggestionChip({ suggestion, onAccept, disabled = false }: Props) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onAccept}
      disabled={disabled}
      data-department-suggestion={suggestion.departmentId}
      title={t('tasks.suggest.hint')}
      aria-label={t('tasks.suggest.labelWith', { terms: suggestion.explain })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        height: 24, maxWidth: 260, padding: '0 7px', borderRadius: 8,
        border: '1px solid var(--accent-border)', background: 'var(--accent-bg)',
        color: 'var(--accent-text)', fontSize: 10, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
        flexShrink: 0,
      }}
    >
      <Sparkles size={10} style={{ flexShrink: 0 }} />
      <span style={{ flexShrink: 0 }}>{t('tasks.suggest.label')}</span>
      <span style={{
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-secondary)', fontWeight: 500,
      }}>
        {suggestion.explain}
      </span>
    </button>
  )
}
