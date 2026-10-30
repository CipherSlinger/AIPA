// The Tasks list's view switch: by status (the default) or by due day.
// Two native buttons in a pressed-state group, styled to sit beside the
// archived pill on the header row. The choice is local view state; nothing
// about it is persisted.

import React, { useState } from 'react'
import type { CSSProperties } from 'react'
import { useT } from '../../i18n'
import type { TaskGroupBy } from './taskUi'

interface Props {
  value: TaskGroupBy
  onChange: (value: TaskGroupBy) => void
}

const GROUP: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
  height: 24, boxSizing: 'border-box', padding: 2, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-hover)',
}

const OPTIONS: Array<{ id: TaskGroupBy; labelKey: string }> = [
  { id: 'status', labelKey: 'tasks.groupBy.status' },
  { id: 'due', labelKey: 'tasks.groupBy.due' },
]

export function TaskGroupBySwitch({ value, onChange }: Props) {
  const t = useT()
  const [hovered, setHovered] = useState<TaskGroupBy | null>(null)

  return (
    <div role="group" aria-label={t('tasks.groupBy.label')} style={GROUP}>
      {OPTIONS.map(option => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            onMouseEnter={() => setHovered(option.id)}
            onMouseLeave={() => setHovered(prev => (prev === option.id ? null : prev))}
            style={{
              height: 18, padding: '0 7px', borderRadius: 6, border: 'none',
              fontSize: 10, fontWeight: 600, lineHeight: '18px', cursor: 'pointer',
              background: active
                ? 'var(--accent-bg)'
                : hovered === option.id ? 'var(--border)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'var(--text-muted)',
              transition: 'background 0.15s ease, color 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {t(option.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
