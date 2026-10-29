// The action column of one job row: Investigate (failures only), Run now,
// Edit, Duplicate, Delete, and the inline delete confirmation that replaces
// them.
//
// It was the right-hand block inside each row of `SettingsAutomations.tsx`.
// Splitting it out keeps the row's content readable; the handlers still live in
// the page shell, and each button calls exactly the one it always did.

import { Copy, Pencil, Play, Sparkles, Trash2 } from 'lucide-react'
import { SECONDARY, smallButtonStyle } from '../../automation/automationStyles'
import type { AutomationJobData } from '../../../../preload'
import type { Translate } from './automationStatusText'

export function AutomationJobActions({
  t,
  job,
  busy,
  busyId,
  confirming,
  onInvestigate,
  onRunNow,
  onEdit,
  onDuplicate,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  t: Translate
  job: AutomationJobData
  busy: boolean
  busyId: string | null
  confirming: boolean
  onInvestigate: () => void
  onRunNow: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {confirming ? (
        // Deleting now leaves the job in Recently deleted, but a
        // scheduled job disappearing is still worth a second
        // look: the confirmation replaces the row's actions
        // instead of opening a dialog on top of the page.
        <>
          <button
            style={{ ...smallButtonStyle, borderColor: 'rgba(248,113,113,0.5)', color: 'var(--danger-text)' }}
            onClick={onDelete}
          >
            <Trash2 size={11} />
            {t('automation.delete')}
          </button>
          <button style={smallButtonStyle} onClick={onCancelDelete}>
            {t('automation.cancel')}
          </button>
        </>
      ) : (
        <>
          {job.lastStatus === 'error' && !job.running && (
            // Offered only in a failed state: the point is to turn
            // the failure the row is already showing into a
            // question. The label stays short so five actions fit;
            // the aria-label names the job, because five rows with
            // the same words are indistinguishable by ear.
            <button
              style={{ ...smallButtonStyle, color: 'var(--accent-text)' }}
              onClick={onInvestigate}
              aria-label={t('automation.investigate.aria', { name: job.name })}
              title={t('automation.investigate.title')}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--accent-text)' }}
            >
              <Sparkles size={11} />
              {t('automation.investigate.ask')}
            </button>
          )}
          <button
            style={{ ...smallButtonStyle, opacity: busy ? 0.5 : 1 }}
            disabled={busy}
            onClick={onRunNow}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
          >
            <Play size={11} />
            {t('automation.runNow')}
          </button>
          <button
            style={{ ...smallButtonStyle, opacity: busy ? 0.5 : 1 }}
            disabled={busy}
            onClick={onEdit}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
          >
            <Pencil size={11} />
            {t('automation.edit')}
          </button>
          <button
            style={{ ...smallButtonStyle, opacity: busyId === job.id ? 0.5 : 1 }}
            disabled={busyId === job.id}
            onClick={onDuplicate}
            title={t('automation.duplicateJobHint')}
            onMouseEnter={e => { if (busyId !== job.id) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
          >
            <Copy size={11} />
            {t('automation.duplicateJob')}
          </button>
          <button
            style={smallButtonStyle}
            disabled={busyId === job.id}
            onClick={onConfirmDelete}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger-text)' }}
            onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
          >
            <Trash2 size={11} />
            {t('automation.delete')}
          </button>
        </>
      )}
    </div>
  )
}
