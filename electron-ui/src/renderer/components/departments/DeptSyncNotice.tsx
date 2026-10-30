// The one line a surface shows when a background department write did not land.
//
// It sits beside the value it is about (the cap under the spend figure, the
// handbook under the department header) and stays there until the next write
// answers differently. It never blocks an edit and never claims a save: the
// sentence comes from `syncNotice`, which only has something to say for
// `unsupported` and `failed`.

import { useSyncExternalStore } from 'react'
import { useI18n } from '../../i18n'
import { getDeptSyncSnapshot, subscribeDeptSyncStatus } from './deptSyncStatus'
import { syncNotice, type SyncSubject } from './syncOutcome'

export default function DeptSyncNotice({ subject }: { subject: SyncSubject }) {
  const snapshot = useSyncExternalStore(
    subscribeDeptSyncStatus,
    getDeptSyncSnapshot,
    getDeptSyncSnapshot,
  )
  const { t } = useI18n()

  const outcome = snapshot[subject]
  if (!outcome) return null
  const notice = syncNotice(outcome, subject)
  if (!notice) return null

  const subjectText = t(notice.subjectKey)
  // The reason is translated first so the outer sentence interpolates a whole
  // clause rather than a raw code.
  const reasonText = notice.error !== undefined
    ? t(notice.reasonKey, { error: notice.error })
    : t(notice.reasonKey)

  return (
    <div
      role="status"
      data-dept-sync={subject}
      style={{
        fontSize: 9.5,
        lineHeight: 1.5,
        color: 'var(--warning-text)',
        wordBreak: 'break-word',
      }}
    >
      {t(notice.key, { subject: subjectText, reason: reasonText })}
    </div>
  )
}
