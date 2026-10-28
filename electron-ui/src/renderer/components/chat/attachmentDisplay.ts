/**
 * Shared display helpers for on-disk image attachments.
 *
 * The app loads its renderer from `file://` in production, so a `file://` src
 * is the one mechanism already proven by the tool-card ImageThumbnail. Windows
 * paths need the extra slash and forward slashes in a URL.
 */

import type { MessageAttachment } from '../../types/app.types'

export function imageFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const rooted = normalized.startsWith('/') ? normalized : `/${normalized}`
  // A file URL is a URL: spaces, '#', '?' and '%' in a userData path must be
  // encoded or Chromium reads them as syntax. The drive segment keeps its
  // colon (`/C:/…`), which is structural rather than a character in the path.
  const encoded = rooted.split('/').map((segment, index) => {
    if (index === 0) return ''
    if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment
    return encodeURIComponent(segment)
  }).join('/')
  return `file://${encoded}`
}

/**
 * New messages carry `path`; pre-wave-41 transcripts only have a base64
 * `dataUrl`. Returns null when neither exists, so callers render a placeholder
 * instead of a broken image.
 */
export function messageAttachmentSrc(attachment: Pick<MessageAttachment, 'path' | 'dataUrl'>): string | null {
  if (attachment.path) return imageFileUrl(attachment.path)
  if (attachment.dataUrl) return attachment.dataUrl
  return null
}
