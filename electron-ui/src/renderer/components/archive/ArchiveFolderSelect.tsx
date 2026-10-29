// The archive's folder selector: a native select over the folders the loaded
// conversations actually ran in, plus one action that only makes sense once a
// folder is chosen.
//
// Kept out of ArchivePanel so the panel stays about filtering, grouping and the
// scroll window. The control follows the department select beside it: same
// height, border, focus ring, and a "clear filters" path in the panel rather
// than a second clear button here.

import React from 'react'
import { FolderPlus } from 'lucide-react'
import { useT } from '../../i18n'
import { workingDirLabel } from '../../lib/workingDir'
import { applyFolderForView } from '../../lib/folderPickAction'
import {
  ALL_FOLDERS_VALUE,
  NO_FOLDER_VALUE,
  folderFilterFromValue,
  folderFilterValue,
  folderOptionsWithSelection,
  type ArchiveFolderFilter,
  type ArchiveFolderOptions,
} from './archiveFolderFilter'

export default function ArchiveFolderSelect({
  filter, options, homeDir, onChange,
}: {
  filter: ArchiveFolderFilter
  options: ArchiveFolderOptions
  homeDir: string | null
  onChange: (filter: ArchiveFolderFilter) => void
}) {
  const t = useT()

  // No folder recorded anywhere and no folder to offer: a selector whose only
  // choice is "all" would be decoration, so it stays out of the row.
  if (options.folders.length === 0 && !options.hasMissing) return null

  const folders = folderOptionsWithSelection(options.folders, filter)
  const chosen = filter.kind === 'folder' ? filter : null
  const chosenLabel = chosen ? workingDirLabel(chosen.dir, homeDir) : ''
  // The full path is the tooltip: the closed select can only afford one segment,
  // and two folders can share a last segment.
  const title = chosen
    ? chosen.dir
    : filter.kind === 'none'
      ? t('archive.folderFilter.none')
      : t('archive.folderFilter.group')

  return (
    <>
      <select
        value={folderFilterValue(filter)}
        onChange={e => onChange(folderFilterFromValue(e.target.value, folders))}
        aria-label={t('archive.folderFilter.group')}
        title={title}
        onFocus={e => {
          e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-bg)'
          e.currentTarget.style.borderColor = 'var(--accent-border)'
        }}
        onBlur={e => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
        style={{
          // Matches the department select: the filter row's common 24px height.
          height: 24, boxSizing: 'border-box', padding: '0 8px',
          borderRadius: 8, fontSize: 11, maxWidth: 180,
          border: '1px solid var(--border)', background: 'var(--bg-hover)',
          color: 'var(--text-secondary)', cursor: 'pointer',
          transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        }}
      >
        <option value={ALL_FOLDERS_VALUE}>{t('archive.folderFilter.all')}</option>
        {folders.map(option => (
          <option key={option.key} value={`folder:${option.key}`}>
            {option.label || workingDirLabel(option.dir, homeDir)}
          </option>
        ))}
        {options.hasMissing && (
          <option value={NO_FOLDER_VALUE}>{t('archive.folderFilter.none')}</option>
        )}
      </select>

      {/* A recorded Codex conversation cannot be moved, so this action may
          start a fresh conversation instead — `applyFolderForView` owns that
          decision and its toast. The button never writes a tab folder or a
          preference itself. */}
      {chosen && (
        <button
          type="button"
          onClick={() => { applyFolderForView(chosen.dir) }}
          title={t('archive.folderFilter.startNew', { folder: chosen.dir })}
          aria-label={t('archive.folderFilter.startNew', { folder: chosenLabel })}
          className="archive-hover-btn"
          style={{
            height: 24, width: 24, flexShrink: 0, boxSizing: 'border-box',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          <FolderPlus size={12} />
        </button>
      )}
    </>
  )
}
