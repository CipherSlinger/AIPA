// The dialog's frame pieces: the informational notes above the form, the
// error box, and the Cancel / Save row.
//
// The overlay, panel and title stay in `AutomationDialog.tsx`; these are the
// blocks inside it that do not depend on the form's state machine. Copied
// verbatim from the original file.

import type { ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { primaryButtonStyle, smallButtonStyle } from '../automationStyles'
import type { SchedulePreviewState } from './types'
import { InfoNote } from './shared'

/**
 * Informational only: every field stays enabled because the user owns the job.
 * The warning exists so an edit that the plugin later overwrites is not a
 * surprise.
 */
export function PluginOriginNote({ pluginName }: { pluginName: string }) {
  const { t } = useI18n()
  return (
    <InfoNote>
      {t('automation.pluginOrigin.dialogNote', { plugin: pluginName })}
    </InfoNote>
  )
}

/**
 * A scheduled run opens its own session. Saying so here, where the schedule is
 * decided, keeps anyone from expecting the assistant to remember the
 * conversation this prompt was lifted from.
 */
export function PromptFreshRunHint() {
  const { t } = useI18n()
  return (
    <InfoNote>
      {t('automation.prompt.freshRunHint')}
    </InfoNote>
  )
}

/**
 * The refusal box. `action` is the one honest way out of a refusal that the
 * form itself cannot fix — today, confirming the job's folder in the OS
 * dialog — so it sits inside the box that named the refusal.
 */
export function DialogErrorBox({ error, action }: { error: string; action?: ReactNode }) {
  return (
    <div style={{
      marginBottom: 12, padding: '6px 9px', borderRadius: 6, fontSize: 11,
      background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)', color: 'var(--danger-text)',
    }}>
      <div>{error}</div>
      {action && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>{action}</div>
      )}
    </div>
  )
}

export interface DialogFooterProps {
  canSave: boolean
  saving: boolean
  preview: SchedulePreviewState
  errorText: (code: string, detail?: string) => string
  onSave: () => void
  onClose: () => void
}

export function DialogFooter({
  canSave,
  saving,
  preview,
  errorText,
  onSave,
  onClose,
}: DialogFooterProps) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button style={smallButtonStyle} onClick={onClose} disabled={saving}>
        {t('automation.cancel')}
      </button>
      <button
        style={{ ...primaryButtonStyle, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
        onClick={onSave}
        disabled={!canSave}
        // When the schedule is the reason Save is off, hovering names it in
        // the same words the line above shows.
        title={preview.kind === 'invalid' ? errorText(preview.error) : undefined}
      >
        {saving ? t('automation.saving') : t('automation.save')}
      </button>
    </div>
  )
}
