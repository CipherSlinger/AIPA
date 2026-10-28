// One date vocabulary for the whole renderer.
//
// The app previously mixed the OS locale (welcome hero), a bare
// `toLocaleDateString()` (command palette) and the app locale with seconds
// (archive). The same session could show three different dates depending on
// where you looked. These two helpers are the only formatters user-facing
// timestamps should use: `dateStyle: 'medium'` for a date, plus a short time
// with no seconds when the timestamp matters.

export type AppLocale = 'en' | 'zh-CN'

/** "Oct 28, 2026" / "2026年10月28日" */
export function formatDateMedium(locale: AppLocale, ts: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(ts))
}

/** "Oct 28, 2026, 8:41 PM" / "2026年10月28日 20:41" — never seconds. */
export function formatDateTimeShort(locale: AppLocale, ts: number): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts))
}
