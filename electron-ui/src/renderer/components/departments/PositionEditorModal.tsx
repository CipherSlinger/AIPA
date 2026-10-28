// Add or edit a ghost position from the department view.
//
// A position is a seat, not an employee: title, standing brief and the persona
// the seat is hired as. Editing never creates a session, and the id is preserved
// so a seat keeps its identity across renames.

import { useState } from 'react'
import { Briefcase, UserPlus } from 'lucide-react'
import type { Position } from '../../store'
import type { Persona } from '../../types/app.types'
import { useT } from '../../i18n'
import DeptModal, {
  modalFieldStyle,
  modalLabelStyle,
  modalPrimaryButtonStyle,
  modalSecondaryButtonStyle,
} from './DeptModal'
import PersonaChoice from './PersonaChoice'

interface PositionEditorModalProps {
  /** Undefined = create a new position. */
  position?: Position
  deptName: string
  accent?: string
  personas: Persona[]
  /** The department's default persona — what an unbound position inherits. */
  defaultPersonaId?: string
  onCancel: () => void
  onSave: (data: { title: string; brief: string; personaId?: string }) => void
}

export default function PositionEditorModal({
  position, deptName, accent, personas, defaultPersonaId, onCancel, onSave,
}: PositionEditorModalProps) {
  const t = useT()
  const [title, setTitle] = useState(position?.title ?? '')
  const [brief, setBrief] = useState(position?.brief ?? '')
  const [personaId, setPersonaId] = useState<string | undefined>(position?.personaId)
  const canSave = title.trim().length > 0

  const save = () => {
    if (!canSave) return
    onSave({ title: title.trim(), brief: brief.trim(), personaId })
  }

  return (
    <DeptModal
      title={t(position ? 'dept.positionEdit' : 'dept.positionAdd')}
      subtitle={deptName}
      accent={accent}
      icon={position ? <Briefcase size={15} /> : <UserPlus size={15} />}
      onClose={onCancel}
      footer={(
        <>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-faint)' }}>
            {t('dept.positionBriefHint')}
          </span>
          <button onClick={onCancel} style={modalSecondaryButtonStyle}>{t('common.cancel')}</button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              ...modalPrimaryButtonStyle,
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.45,
            }}
          >
            {t('common.save')}
          </button>
        </>
      )}
    >
      <label style={modalLabelStyle}>{t('dept.positionTitle')}</label>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        placeholder={t('dept.positionTitlePlaceholder')}
        style={modalFieldStyle}
      />

      <label style={{ ...modalLabelStyle, marginTop: 4 }}>{t('dept.positionBrief')}</label>
      <textarea
        value={brief}
        onChange={e => setBrief(e.target.value)}
        placeholder={t('dept.positionBriefPlaceholder')}
        rows={6}
        style={{ ...modalFieldStyle, resize: 'vertical', minHeight: 120 }}
      />

      <label style={{ ...modalLabelStyle, marginTop: 4 }}>{t('dept.positionPersona')}</label>
      <PersonaChoice
        personas={personas}
        value={personaId}
        onChange={setPersonaId}
        noneLabel={t(defaultPersonaId ? 'dept.personaInherit' : 'dept.personaNone')}
        accent={accent}
      />
    </DeptModal>
  )
}
