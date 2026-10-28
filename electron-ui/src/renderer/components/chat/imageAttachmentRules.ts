// Pure rules for the composer's image attachments.
//
// Kept free of React and Electron so the wave harness can exercise the same
// code the UI runs: the cap, the format whitelist, the engine gate and the
// exact `UserInput[]` shape sent to Codex are all decided here.

export const MAX_IMAGE_ATTACHMENTS = 4
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const SUPPORTED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type SupportedImageMime = typeof SUPPORTED_IMAGE_MIMES[number]

/** Extensions are only a hint; the main process sniffs the bytes again. */
const MIME_BY_EXT: Record<string, SupportedImageMime> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function imageExtension(name: string): string {
  const clean = name.split(/[/\\]/).pop() || name
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : ''
}

/**
 * Resolve the declared type, falling back to the extension. A `File` pasted
 * from a browser clipboard often has an empty `type`, while a drop carries one.
 * Returning null means "not one of the four formats Codex accepts" — the
 * caller names the file instead of converting it.
 */
export function imageMimeForFile(name: string, declaredType?: string): SupportedImageMime | null {
  const declared = (declaredType || '').toLowerCase()
  if ((SUPPORTED_IMAGE_MIMES as readonly string[]).includes(declared)) {
    return declared as SupportedImageMime
  }
  return MIME_BY_EXT[imageExtension(name)] ?? null
}

export interface ImageCandidate {
  name: string
  size: number
  type?: string
}

export type ImageRejectCode = 'count' | 'size' | 'type' | 'empty'

export type ImageCheck =
  | { ok: true; mimeType: SupportedImageMime }
  | { ok: false; code: ImageRejectCode; mimeType?: string }

/**
 * Decide whether one candidate may join the strip. The count applies to the
 * images already attached *and* accepted from this same drop/paste batch, so a
 * five-image drop cannot slip past the cap.
 */
export function checkImageCandidate(candidate: ImageCandidate, currentCount: number): ImageCheck {
  if (currentCount >= MAX_IMAGE_ATTACHMENTS) return { ok: false, code: 'count' }
  const mimeType = imageMimeForFile(candidate.name, candidate.type)
  if (!mimeType) return { ok: false, code: 'type', mimeType: candidate.type || undefined }
  if (candidate.size <= 0) return { ok: false, code: 'empty', mimeType }
  if (candidate.size > MAX_IMAGE_BYTES) return { ok: false, code: 'size', mimeType }
  return { ok: true, mimeType }
}

/**
 * Images may only ride a turn the Codex bridge will run. A third-party
 * provider route is a separate send API with no file input, so it is excluded
 * even when the active engine reports Codex.
 */
export function canSendCodexImages(
  engineKind: 'codex' | 'claude' | 'none',
  routing: 'claude-cli' | 'provider',
): boolean {
  return engineKind === 'codex' && routing !== 'provider'
}

export type CodexImageInput =
  | { type: 'text'; text: string }
  | { type: 'localImage'; path: string }

/**
 * The wire shape `turn/start.input` expects: one text part followed by one
 * `localImage` part per file. The text part stays first so an image-only turn
 * still has a prompt for the engine's session title.
 */
export function buildCodexImageInput(text: string, paths: string[]): CodexImageInput[] {
  const input: CodexImageInput[] = [{ type: 'text', text }]
  for (const filePath of paths) {
    if (typeof filePath === 'string' && filePath.length > 0) {
      input.push({ type: 'localImage', path: filePath })
    }
  }
  return input
}
