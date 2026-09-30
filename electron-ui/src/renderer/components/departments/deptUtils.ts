// Shared helpers for the department views (org chart + single department).
// Kept in its own module so OrgChart.tsx and DepartmentDashboard.tsx can both
// use them without importing each other.

/**
 * Encode a real directory path to Claude's project slug format.
 * Claude replaces all path separators (/ and \) and the Windows drive colon (:)
 * with hyphens, e.g. "C:\Users\osr\Desktop" → "C--Users-osr-Desktop".
 *
 * Comparing slugs is the only reliable match — the decoded `project` field is
 * lossy because decodeProjectSlug turns every hyphen back into a separator.
 */
export function dirToSlug(dir: string): string {
  return dir.replace(/[/\\:]/g, '-')
}

/** Last path segment of a directory, for compact display. */
export function baseName(dir: string): string {
  const parts = dir.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || dir
}
