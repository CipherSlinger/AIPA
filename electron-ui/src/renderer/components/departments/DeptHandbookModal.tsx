// The department handbook ("部门手册") plus its default persona.
//
// The handbook is the standing brief every employee started from this desk
// receives before its own first message: conventions, reporting lines, where
// things live. It is plain text on the department, not a new document store —
// it only ever travels with the first message of a new session.

import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import type { Department } from '../../store'
import type { Persona } from '../../types/app.types'
import { useI18n } from '../../i18n'
import { deptDisplayName } from './deptUtils'
import DeptModal, {
  modalFieldStyle,
  modalLabelStyle,
  modalPrimaryButtonStyle,
  modalSecondaryButtonStyle,
} from './DeptModal'
import PersonaChoice from './PersonaChoice'

interface DeptHandbookModalProps {
  dept: Department
  personas: Persona[]
  onCancel: () => void
  onSave: (data: { handbook: string; defaultPersonaId?: string }) => void
}

export default function DeptHandbookModal({ dept, personas, onCancel, onSave }: DeptHandbookModalProps) {
  const { t, resolvedLocale } = useI18n()
  const [handbook, setHandbook] = useState(dept.handbook ?? '')
  const [defaultPersonaId, setDefaultPersonaId] = useState<string | undefined>(dept.defaultPersonaId)
  const accent = dept.color || '#6366f1'

  return (
    <DeptModal
      title={t('dept.handbookTitle')}
      subtitle={deptDisplayName(dept, resolvedLocale)}
      accent={accent}
      icon={<BookOpen size={15} />}
      width={500}
      onClose={onCancel}
      footer={(
        <>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-faint)' }}>
            {t('dept.handbookHint')}
          </span>
          <button onClick={onCancel} style={modalSecondaryButtonStyle}>{t('common.cancel')}</button>
          <button
            onClick={() => onSave({ handbook: handbook.trim(), defaultPersonaId })}
            style={modalPrimaryButtonStyle}
          >
            {t('common.save')}
          </button>
        </>
      )}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        {t('dept.handbookSubtitle')}
      </div>

      <label style={modalLabelStyle}>{t('dept.handbook')}</label>
      <textarea
        autoFocus
        value={handbook}
        onChange={e => setHandbook(e.target.value)}
        placeholder={t('dept.handbookPlaceholder')}
        rows={7}
        style={{ ...modalFieldStyle, resize: 'vertical', minHeight: 140 }}
      />

      <label style={{ ...modalLabelStyle, marginTop: 4 }}>{t('dept.defaultPersona')}</label>
      <PersonaChoice
        personas={personas}
        value={defaultPersonaId}
        onChange={setDefaultPersonaId}
        noneLabel={t('dept.personaNone')}
        accent={accent}
      />
    </DeptModal>
  )
}
