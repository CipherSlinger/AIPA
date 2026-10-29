// Who runs the job and how hard it thinks: the expert and effort selects.
//
// Both offer an explicit "follow" choice alongside concrete values, and both
// keep a stored value selectable even when it no longer resolves. The labels
// here are the originals from `AutomationDialog.tsx`.

import { useI18n } from '../../../i18n'
// The one effort list, owned by the main process. This module imports nothing,
// so loading it here is safe; a second literal list would let the dialog offer a
// level the store's whitelist drops.
import { AUTOMATION_EFFORT_LEVELS } from '../../../../main/automation/job-effort'
import type { Persona } from '../../../types/app.types'
import { INPUT_STYLE } from '../../settings/settingsConstants'
import {
  ASSISTANT_PERSONA_ID,
  FOLLOW_APP_EFFORT,
  type WorkflowOption,
} from './types'
import { Hint, labelStyle } from './shared'

export interface AgentFieldsProps {
  actionKind: 'workflow' | 'prompt' | 'skill'
  personas: Persona[]
  personaChoice: string
  onPersonaChoiceChange: (value: string) => void
  workflows: WorkflowOption[]
  workflowId: string
  effortChoice: string
  onEffortChoiceChange: (value: string) => void
  globalEffort: string | undefined
}

export function AgentFields({
  actionKind,
  personas,
  personaChoice,
  onPersonaChoiceChange,
  workflows,
  workflowId,
  effortChoice,
  onEffortChoiceChange,
  globalEffort,
}: AgentFieldsProps) {
  const { t } = useI18n()

  const selectedWorkflow = workflows.find(w => w.id === workflowId)
  const workflowPersona = selectedWorkflow?.personaId
    ? personas.find(p => p.id === selectedWorkflow.personaId)
    : undefined
  const followWorkflowLabel = t('automation.expert.followWorkflow', {
    name: workflowPersona
      ? `${workflowPersona.emoji} ${workflowPersona.name}`.trim()
      : t('automation.expert.noBinding'),
  })
  // A saved override can outlive its persona. Keep it selectable so the field
  // shows what is stored instead of silently displaying a different choice.
  const orphanChoice = personaChoice !== '' &&
    personaChoice !== ASSISTANT_PERSONA_ID &&
    !personas.some(p => p.id === personaChoice)

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{t('automation.field.expert')}</label>
        <select
          value={personaChoice}
          onChange={e => onPersonaChoiceChange(e.target.value)}
          style={INPUT_STYLE}
        >
          {/* Offered only for a workflow: a prompt job has no binding to
              follow, so showing it there would promise what cannot happen. */}
          {actionKind === 'workflow' && (
            <option value="">{followWorkflowLabel}</option>
          )}
          <option value={ASSISTANT_PERSONA_ID}>{t('automation.expert.assistant')}</option>
          {personas.map(p => (
            <option key={p.id} value={p.id}>
              {`${p.emoji} ${p.name}`.trim()}
            </option>
          ))}
          {orphanChoice && (
            <option value={personaChoice}>{t('automation.expert.missingOption')}</option>
          )}
        </select>
        {actionKind === 'workflow' && (
          // The override is durable: re-binding the workflow later must not
          // quietly change who runs this job.
          <Hint>
            {t('automation.expert.overrideHint')}
          </Hint>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{t('automation.field.effort')}</label>
        <select
          value={effortChoice}
          onChange={e => onEffortChoiceChange(e.target.value)}
          style={INPUT_STYLE}
        >
          {/* The app's current level is named here, so "default" is concrete:
              a user can see that the nightly job will run at High without
              opening Settings. The value itself is not stored. */}
          <option value={FOLLOW_APP_EFFORT}>
            {t('automation.effort.followDefault', {
              level: t(`effort.${globalEffort || 'auto'}`),
            })}
          </option>
          {AUTOMATION_EFFORT_LEVELS.map(level => (
            <option key={level} value={level}>
              {t(`effort.${level}`)}
            </option>
          ))}
        </select>
        <Hint>
          {t('automation.effort.hint')}
        </Hint>
      </div>
    </>
  )
}
