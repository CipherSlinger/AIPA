// Main-process validation for composer image attachments.
//
// The renderer is untrusted here: it may send a path, a declared mime type and
// bytes, all of which are checked again before anything is written. Kept free
// of `electron` so the wave harness can bundle and exercise it directly.

import path from 'path'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

const EXTENSION_BY_MIME: Record<SupportedImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const MIME_BY_EXTENSION: Record<string, SupportedImageMime> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** Magic-byte check — the only authority for what the file actually is. */
export function sniffImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6) {
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5])
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  }
  if (bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

/** Format named by the filename, used only to explain a refusal. */
export function declaredImageMime(name: string): string | null {
  const clean = sanitizeImageFileName(name)
  const dot = clean.lastIndexOf('.')
  if (dot < 0) return null
  const ext = clean.slice(dot + 1).toLowerCase()
  return MIME_BY_EXTENSION[ext] ?? (ext ? `.${ext}` : null)
}

/**
 * The display name is the user's original basename, never a path. Stripping
 * directories here is what keeps `../../evil.png` from becoming part of a
 * filename (the on-disk name is a hash anyway).
 */
export function sanitizeImageFileName(name: unknown): string {
  const raw = typeof name === 'string' ? name : ''
  const base = raw.replace(/\\/g, '/').split('/').pop() || ''
  // Control characters (including NUL) have no business in a label and break
  // paths on Windows.
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'image'
  return cleaned.slice(0, 120)
}

export type ImageBytesCheck =
  | { ok: true; mimeType: SupportedImageMime }
  | { ok: false; code: 'empty_file' | 'too_large' | 'unsupported_type'; mimeType?: string }

export function validateImageBytes(bytes: Uint8Array): ImageBytesCheck {
  if (bytes.length === 0) return { ok: false, code: 'empty_file' }
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: 'too_large' }
  const mimeType = sniffImageMime(bytes)
  if (!mimeType) return { ok: false, code: 'unsupported_type' }
  return { ok: true, mimeType }
}

/**
 * `path.relative` is the containment check: an absolute path or one with `..`
 * cannot produce a relative path that stays inside the directory.
 */
export function isInsideDirectory(dir: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(candidate))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Content-addressed name: same bytes reuse the same file, nothing is replaced. */
export function attachmentFileName(sha256: string, mimeType: SupportedImageMime): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('invalid content hash')
  return `${sha256}.${EXTENSION_BY_MIME[mimeType]}`
}
