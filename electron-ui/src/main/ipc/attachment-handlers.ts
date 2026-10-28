// Composer image attachments: the one write path from the renderer to disk.
//
// Codex's `turn/start` accepts `{ type: 'localImage', path }`, and the engine
// reads that file itself — so the bytes have to exist on disk before the turn
// starts. Everything here is confined to `<userData>/attachments`; the
// renderer's declared mime/size/name are re-checked against the real bytes and
// the user's name never reaches the filesystem.

import { app, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createLogger } from '../utils/logger'
import type { CodexUserInput } from '../codex/codex-bridge'
import {
  MAX_IMAGE_BYTES,
  attachmentFileName,
  isInsideDirectory,
  sanitizeImageFileName,
  validateImageBytes,
} from './image-attachment-rules'

const log = createLogger('ipc:attachments')

const ATTACHMENTS_DIR_NAME = 'attachments'

export interface StoredImageAttachment {
  /** Original basename, sanitized — display only. */
  name: string
  /** Absolute path inside the app-owned attachments directory. */
  path: string
  size: number
  mimeType: string
}

export type SaveImageAttachmentResult =
  | { success: true; attachment: StoredImageAttachment }
  | {
      success: false
      code: 'invalid_payload' | 'source_unreadable' | 'empty_file' | 'too_large' | 'unsupported_type' | 'write_failed'
      error: string
      /** Present for `too_large`, so the renderer can name the exact limit. */
      maxBytes?: number
      /** Present for `unsupported_type`: the declared type or extension. */
      mimeType?: string
    }

export function attachmentsDirectory(): string {
  return path.join(app.getPath('userData'), ATTACHMENTS_DIR_NAME)
}

/** True only for a file the app itself stored under the attachments directory. */
export function isAttachmentPath(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || !candidate || candidate.includes('\0')) return false
  if (!path.isAbsolute(candidate)) return false
  return isInsideDirectory(attachmentsDirectory(), candidate)
}

/**
 * The renderer boundary for `cli:sendMessage.input`. The protocol also has
 * `image`/`audio` URL variants, but this app only ever produces text and
 * `localImage`; anything else is dropped rather than trusted. A `localImage`
 * must name a file this process wrote, so a compromised renderer cannot ask
 * Codex to read an arbitrary file.
 */
export function sanitizeCodexInput(input: unknown): CodexUserInput[] | undefined {
  if (!Array.isArray(input)) return undefined
  const cleaned: CodexUserInput[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      cleaned.push({ type: 'text', text: record.text })
    } else if (record.type === 'localImage' && isAttachmentPath(record.path)) {
      cleaned.push({ type: 'localImage', path: path.resolve(record.path) })
    }
  }
  return cleaned.length > 0 ? cleaned : undefined
}

function bytesFromPayload(data: unknown): Buffer | null {
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
  }
  return null
}

export function registerAttachmentHandlers(): void {
  ipcMain.handle(
    'fs:saveImageAttachment',
    (_e, payload: {
      name?: unknown
      mimeType?: unknown
      data?: unknown
      sourcePath?: unknown
    }): SaveImageAttachmentResult => {
      try {
        const name = sanitizeImageFileName(payload?.name)
        let bytes: Buffer | null = null

        if (typeof payload?.sourcePath === 'string' && payload.sourcePath) {
          const sourcePath = payload.sourcePath
          if (sourcePath.includes('\0') || !path.isAbsolute(sourcePath)) {
            return { success: false, code: 'source_unreadable', error: 'Image source path is not absolute' }
          }
          try {
            const stat = fs.statSync(sourcePath)
            if (!stat.isFile()) {
              return { success: false, code: 'source_unreadable', error: 'Image source is not a file' }
            }
            // Reject before reading a 4 GB file into memory.
            if (stat.size > MAX_IMAGE_BYTES) {
              return { success: false, code: 'too_large', error: 'Image exceeds the size limit', maxBytes: MAX_IMAGE_BYTES }
            }
            bytes = fs.readFileSync(sourcePath)
          } catch (err) {
            return { success: false, code: 'source_unreadable', error: String(err) }
          }
        } else {
          bytes = bytesFromPayload(payload?.data)
          if (!bytes) {
            return { success: false, code: 'invalid_payload', error: 'No image bytes were supplied' }
          }
        }

        const check = validateImageBytes(bytes)
        if (!check.ok) {
          return {
            success: false,
            code: check.code,
            error:
              check.code === 'too_large'
                ? 'Image exceeds the size limit'
                : check.code === 'empty_file'
                  ? 'Image file is empty'
                  : 'Image format is not supported',
            ...(check.code === 'too_large' ? { maxBytes: MAX_IMAGE_BYTES } : {}),
            ...(check.mimeType ? { mimeType: check.mimeType } : {}),
          }
        }

        const dir = attachmentsDirectory()
        fs.mkdirSync(dir, { recursive: true })
        const hash = crypto.createHash('sha256').update(bytes).digest('hex')
        const filePath = path.join(dir, attachmentFileName(hash, check.mimeType))
        // Content-addressed: identical bytes reuse the existing file. `wx`
        // guarantees an existing file is never overwritten; EEXIST is success.
        try {
          fs.writeFileSync(filePath, bytes, { flag: 'wx' })
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }

        return {
          success: true,
          attachment: { name, path: filePath, size: bytes.length, mimeType: check.mimeType },
        }
      } catch (err) {
        log.warn('fs:saveImageAttachment error:', String(err))
        return { success: false, code: 'write_failed', error: String(err) }
      }
    },
  )
}
