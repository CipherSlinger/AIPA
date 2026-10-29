// Wording for a refused conversation restore.
//
// Two surfaces can now undo a conversation delete — the toast that follows the
// delete, and the "Recently deleted" row — and both have to name the same
// reason for the same failure. One mapping means the two sentences can never
// disagree, and a new failure code is explained in one place.
import type { SessionTrashErrorCode } from '../../preload'

type Translate = (key: string, params?: Record<string, string | number>) => string

export function sessionTrashFailureText(
  t: Translate,
  code: SessionTrashErrorCode | undefined,
  error: string | undefined,
): string {
  switch (code) {
    // The holding area has no such entry any more. Nothing came back, so the
    // sentence says so plainly instead of borrowing the restore wording.
    case 'not_found':
      return t('sessionTrash.failure.alreadyGone')
    // Restoring never overwrites: say exactly what is in the way.
    case 'target_exists':
      return t('sessionTrash.failure.targetExists')
    case 'folder_missing':
      return t('sessionTrash.failure.gone')
    case 'outside_sessions':
    case 'outside_trash':
      return t('sessionTrash.failure.outside')
    default:
      return t('trash.failure.generic', { message: error || t('trash.failure.unknown') })
  }
}
