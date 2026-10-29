// The department picker: attribution for a job, not the folder it runs in.
//
// A stale id is kept selectable and saveable; the warning below the field
// explains that it is kept, not moved. The tree walk itself lives in
// `../jobDepartment.ts`.

import { useMemo } from 'react'
import { useI18n } from '../../../i18n'
import { useDepartmentStore } from '../../../store'
import { INPUT_STYLE } from '../../settings/settingsConstants'
import {
  buildJobDepartmentOptions,
  jobDepartmentOptionText,
  resolveJobDepartment,
} from '../jobDepartment'
import { Hint, WarningNote, labelStyle } from './shared'

export interface DepartmentFieldProps {
  departmentChoice: string
  onDepartmentChoiceChange: (value: string) => void
}

export function DepartmentField({
  departmentChoice,
  onDepartmentChoiceChange,
}: DepartmentFieldProps) {
  const { t, resolvedLocale } = useI18n()
  const departments = useDepartmentStore(s => s.departments)

  const departmentOptions = useMemo(
    () => buildJobDepartmentOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  // A stale id resolves to nothing in the tree but must stay selectable and
  // saveable; the warning below the field explains that it is kept, not moved.
  const departmentResolution = resolveJobDepartment(departmentChoice, departmentOptions)

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{t('automation.department.field')}</label>
      <select
        value={departmentChoice}
        onChange={e => onDepartmentChoiceChange(e.target.value)}
        style={INPUT_STYLE}
        title={t('automation.department.hint')}
      >
        <option value="">{t('automation.department.none')}</option>
        {departmentOptions.map(option => (
          // The label is the node's own name, indented by depth; the title
          // carries the whole root → node path so two similarly named teams
          // can still be told apart.
          <option key={option.id} value={option.id} title={option.path}>
            {jobDepartmentOptionText(option)}
          </option>
        ))}
        {departmentResolution.state === 'stale' && (
          // Kept selectable and selected-by-label: the job really is filed
          // under this id, even though the node is gone. Save sends it back
          // unless the user deliberately picks something else.
          <option
            value={departmentResolution.id}
            title={t('automation.department.missingTitle', { id: departmentResolution.id })}
          >
            {t('automation.department.missingOption')}
          </option>
        )}
      </select>
      <Hint>
        {t('automation.department.hint')}
      </Hint>
      {departmentResolution.state === 'stale' && (
        <WarningNote>
          {t('automation.department.missingHint')}
        </WarningNote>
      )}
    </div>
  )
}
