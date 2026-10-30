/**
 * Preserve a damaged store file once, not once per read.
 *
 * A corrupt store keeps failing every read: the badge polls tasks, the task
 * detail lists them, usage lookups run per window focus. Copying the file on
 * each failed parse would leave a new `.corrupt-*` twin every few seconds and
 * eventually fill `userData` with identical megabytes. One copy per path per
 * process is enough to recover the data by hand; the next launch takes a fresh
 * copy only if the file is still damaged.
 */
import fs from 'fs'

const preserved = new Set<string>()

export function preserveCorruptFile(file: string): void {
  if (preserved.has(file)) return
  preserved.add(file)
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(file, `${file}.corrupt-${stamp}`)
  } catch {
    /* best effort — the damaged file is still on disk under its own name */
  }
}
