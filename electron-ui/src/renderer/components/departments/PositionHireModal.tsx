// The hire step for a ghost position.
//
// Hiring used to be a click: the seat's brief became the first message and the
// persona was whatever happened to be globally active. A seat now names a role,
// so the click opens this picker first — the brief still becomes the first
// message, but the employee also starts as the persona the seat was written for.

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import type { Position } from '../../store'
import type { Persona } from '../../types/app.types'
import { useI18n } from '../../i18n'
import { positionDisplayBrief, positionDisplayTitle } from './deptUtils'
import DeptModal, {
  modalLabelStyle,
  modalPrimaryButtonStyle,
  modalSecondaryButtonStyle,
} from './DeptModal'
import PersonaChoice from './PersonaChoice'

interface PositionHireModalProps {
  position: Position
  deptName: string
  accent?: string
  personas: Persona[]
  /** Seat binding → department default → active persona, resolved by the caller. */
  initialPersonaId?: string
  /** A handbook exists, so it will be prepended to the brief. */
  hasHandbook?: boolean
  onCancel: () => void
  onConfirm: (personaId?: string) => void
}

export default function PositionHireModal({
  position, deptName, accent, personas, initialPersonaId, hasHandbook, onCancel, onConfirm,
}: PositionHireModalProps) {
  const { t, resolvedLocale } = useI18n()
  const [personaId, setPersonaId] = useState<string | undefined>(initialPersonaId)

  return (
    <DeptModal
      title={t('dept.positionHireTitle')}
      subtitle={`${deptName} · ${positionDisplayTitle(position, resolvedLocale)}`}
      accent={accent}
      icon={<UserPlus size={15} />}
      onClose={onCancel}
      footer={(
        <>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-faint)' }}>
            {hasHandbook ? t('dept.positionHireHandbookHint') : t('dept.positionHireHint')}
          </span>
          <button onClick={onCancel} style={modalSecondaryButtonStyle}>{t('common.cancel')}</button>
          <button onClick={() => onConfirm(personaId)} style={modalPrimaryButtonStyle}>
            <UserPlus size={12} />
            {t('dept.positionHireConfirm')}
          </button>
        </>
      )}
    >
      <div style={{
        padding: '9px 11px', borderRadius: 9,
        background: 'var(--bg-hover)', border: '1px solid var(--border)',
        fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)',
        maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap',
      }}>
        {positionDisplayBrief(position, resolvedLocale) || t('dept.positionNoBrief')}
      </div>

      <label style={{ ...modalLabelStyle, marginTop: 4 }}>{t('dept.positionPersona')}</label>
      <PersonaChoice
        personas={personas}
        value={personaId}
        onChange={setPersonaId}
        noneLabel={t('dept.personaNone')}
        accent={accent}
      />
    </DeptModal>
  )
}
