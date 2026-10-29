// The expanded per-run file disclosure: the coverage sentence, the path list
// with its edit markers, and the note for a capture that saw no edits.
//
// It was the block inside one run row of `SettingsAutomations.tsx`. The toggle
// button stays in the run row because it is what opens this panel; this module
// owns only the panel's content, with the same styles and wording.

import { fileKindMarker, type RunFilesView } from '../runFilesView'
import { SECONDARY, WARNING } from '../../automation/automationStyles'
import type { Translate } from './automationStatusText'

export function AutomationRunFilesPanel({
  t,
  fileView,
}: {
  t: Translate
  fileView: RunFilesView
}) {
  return (
    // One quiet panel inside the existing row, not a second card. The coverage
    // sentence is always present here — the path list must never read as the
    // run's complete effect on disk.
    <div style={{
      flexBasis: '100%', minWidth: 0,
      margin: '2px 0 4px', paddingLeft: 10,
      borderLeft: '2px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 3,
      lineHeight: 1.5,
    }}>
      <div style={{ fontSize: 10, color: SECONDARY }}>
        {t('automation.files.coverageNote')}
      </div>
      {fileView.coverage === 'captured' ? (
        <>
          <div style={{ fontSize: 10, color: SECONDARY }}>
            {t('automation.files.listLabel')}
            {fileView.editCalls > 0
              ? ` · ${t('automation.files.editCalls', { count: fileView.editCalls })}`
              : ''}
          </div>
          <ul
            aria-label={t('automation.files.listLabel')}
            style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column',
              gap: 2, minWidth: 0,
            }}
          >
            {fileView.files.map(file => (
              <li
                key={file.path}
                title={file.state === 'edited'
                  ? t('automation.files.editedHint')
                  : t('automation.files.attemptedHint')}
                style={{
                  display: 'flex', alignItems: 'baseline',
                  gap: 6, minWidth: 0, fontSize: 11,
                }}
              >
                <span aria-hidden="true" style={{
                  width: 8, flexShrink: 0, textAlign: 'center',
                  fontFamily: 'monospace',
                  color: file.kind === 'add'
                    ? 'var(--success-text)'
                    : file.kind === 'delete'
                      ? 'var(--danger-text)'
                      : file.kind === 'update'
                        ? 'var(--accent-text)'
                        : SECONDARY,
                }}>
                  {fileKindMarker(file.kind)}
                </span>
                <span style={{
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)',
                  overflowWrap: 'anywhere', minWidth: 0,
                }}>
                  {file.path}
                </span>
                {file.state === 'attempted' && (
                  // A call the engine never confirmed. It stays visible but
                  // is never counted as an edit.
                  <span style={{ flexShrink: 0, fontSize: 10, color: WARNING }}>
                    {t('automation.files.attempted')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {fileView.omitted > 0 && (
            <div style={{ fontSize: 10, color: SECONDARY }}>
              {t('automation.files.more', { count: fileView.omitted })}
            </div>
          )}
        </>
      ) : (
        // The capture ran; an empty list is an answer, and its limits are still
        // stated above rather than left implicit.
        <div style={{ fontSize: 10, color: SECONDARY }}>
          {t('automation.files.noneNote')}
        </div>
      )}
    </div>
  )
}
