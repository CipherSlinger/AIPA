// Is there anything to see in "Recently deleted"?
//
// The command palette offers a jump to that section only when the holding area
// has at least one row. An entry that opens an empty page is a promise the app
// cannot keep — and the section renders nothing at all when it is empty, so
// there is not even an anchor to scroll to. The probe is cheap (two manifests,
// one job list, one pref) and runs when the palette opens.
//
// A failed probe returns `null`, which also hides the entry: "could not ask"
// is not evidence that something is there.

export interface TrashPaletteEntryDescriptor {
  id: string
  name: string
  description: string
}

/**
 * Count every restorable row: workflow records from prefs plus the three
 * manifests main keeps. Entries whose payload is gone are counted too — they
 * are still rows the user must see in order to delete them for good.
 */
export async function countTrashedItems(workflowCount: number): Promise<number | null> {
  try {
    const [skills, sessions, jobs] = await Promise.all([
      window.electronAPI.skillsTrashList(),
      window.electronAPI.sessionsTrashList(),
      window.electronAPI.automationTrashList(),
    ])
    if (!skills.ok || !sessions.ok || !jobs.ok) return null
    return workflowCount + skills.entries.length + sessions.entries.length + jobs.entries.length
  } catch {
    return null
  }
}

/**
 * The palette row, or `null` when there is no destination worth offering.
 * Pure so the empty / unknown cases can be checked without a palette.
 */
export function buildTrashPaletteEntry(
  t: (key: string, params?: Record<string, string>) => string,
  count: number | null,
): TrashPaletteEntryDescriptor | null {
  if (count === null || count <= 0) return null
  return {
    id: 'open-trash',
    name: t('command.openTrash'),
    // The count is the evidence: an entry that says how many items are
    // waiting is not pretending there is something when there is not.
    description: t('command.openTrashDesc', { count: String(count) }),
  }
}
