import { useState, useCallback, useRef } from 'react'
import { useUiStore } from '../store'
import { useT } from '../i18n'
import {
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  checkImageCandidate,
  imageMimeForFile,
} from '../components/chat/imageAttachmentRules'

/**
 * An image waiting in the composer. The bytes are already on disk (written by
 * the main process); only this metadata lives in React state and later in the
 * transcript. No base64, ever.
 */
export interface ImageAttachment {
  id: string
  name: string
  path: string
  size: number
  mimeType: string
}

export interface FileAttachment {
  id: string
  name: string
  path: string       // absolute file path
  size: number       // file size in bytes
  content?: string   // text content (loaded lazily for text files)
  mimeType: string
  isImage: boolean   // true if this is an image attachment
  dataUrl?: string   // legacy field; new code never fills it
}

/** Text-like file extensions that we can read and inject as context */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala', 'c', 'cpp',
  'h', 'hpp', 'cs', 'swift', 'php', 'lua', 'r', 'pl', 'sh', 'bash', 'zsh', 'fish',
  'sql', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'env', 'gitignore',
  'log', 'tex', 'rst', 'org', 'adoc', 'conf', 'properties',
])

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_FILE_ATTACHMENTS = 10

/** Formats the OS picker / drag layer may hand us before the main process decides. */
const POTENTIAL_IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'avif', 'heic',
])

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase()
}

function baseName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name))
}

function getMimeType(name: string): string {
  const ext = getExtension(name)
  const imageMime = imageMimeForFile(name)
  if (imageMime) return imageMime
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'text/javascript'
  if (['py'].includes(ext)) return 'text/x-python'
  if (['json'].includes(ext)) return 'application/json'
  if (['xml'].includes(ext)) return 'application/xml'
  if (['html', 'htm'].includes(ext)) return 'text/html'
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'text/css'
  if (['md', 'markdown'].includes(ext)) return 'text/markdown'
  if (['csv'].includes(ext)) return 'text/csv'
  if (['yaml', 'yml'].includes(ext)) return 'text/yaml'
  if (['pdf'].includes(ext)) return 'application/pdf'
  return 'application/octet-stream'
}

function isPotentialImage(file: { name: string; type?: string }): boolean {
  if ((file.type || '').toLowerCase().startsWith('image/')) return true
  return POTENTIAL_IMAGE_EXTENSIONS.has(getExtension(file.name))
}

/** Decode a data URL without a network fetch (CSP-safe). */
function dataUrlToBuffer(dataUrl: string): ArrayBuffer | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const meta = dataUrl.slice(0, comma)
  if (!/;base64/i.test(meta)) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  } catch {
    return null
  }
}

interface UseImagePasteOptions {
  /** False when the active engine is not Codex; images are refused, not silently dropped. */
  enabled: boolean
}

export function useImagePaste({ enabled }: UseImagePasteOptions) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([])
  // Async persistence needs a synchronous view of the current strip to enforce
  // the cap across a multi-file paste/drop.
  const attachmentsRef = useRef<ImageAttachment[]>([])
  // While a file is being written, sending would silently omit it. The
  // composer refuses to send instead (and says why) until the strip settles.
  const savingRef = useRef(0)
  const [isSavingImages, setIsSavingImages] = useState(false)

  const beginSave = useCallback(() => {
    savingRef.current++
    setIsSavingImages(true)
  }, [])
  const endSave = useCallback(() => {
    savingRef.current = Math.max(0, savingRef.current - 1)
    if (savingRef.current === 0) setIsSavingImages(false)
  }, [])

  const commitImages = useCallback((next: ImageAttachment[]) => {
    attachmentsRef.current = next
    setAttachments(next)
  }, [])

  const toastReject = useCallback((code: 'count' | 'size' | 'type' | 'empty', name: string) => {
    if (code === 'count') {
      addToast('warning', t('chat.imageAttachment.limit', { max: String(MAX_IMAGE_ATTACHMENTS) }))
    } else if (code === 'size') {
      addToast('warning', t('chat.imageAttachment.tooLarge', {
        name,
        max: `${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`,
      }))
    } else if (code === 'empty') {
      addToast('warning', t('chat.imageAttachment.empty', { name }))
    } else {
      addToast('warning', t('chat.imageAttachment.unsupported', { name }))
    }
  }, [addToast, t])

  const toastSaveFailure = useCallback((name: string, result: { code: string; error: string }) => {
    if (result.code === 'too_large') {
      addToast('warning', t('chat.imageAttachment.tooLarge', {
        name,
        max: `${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`,
      }))
    } else if (result.code === 'unsupported_type') {
      addToast('warning', t('chat.imageAttachment.unsupported', { name }))
    } else if (result.code === 'empty_file') {
      addToast('warning', t('chat.imageAttachment.empty', { name }))
    } else if (result.code === 'source_unreadable') {
      addToast('warning', t('chat.imageAttachment.unreadable', { name }))
    } else {
      addToast('error', t('chat.imageAttachment.saveFailed', { name, reason: result.error }))
    }
  }, [addToast, t])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const candidates = Array.from(files).filter(isPotentialImage)
    if (candidates.length === 0) return
    if (!enabled) {
      addToast('warning', t('chat.imageAttachment.codexOnly'))
      return
    }

    for (const file of candidates) {
      // In-flight saves hold their slots too, otherwise two quick pastes can
      // each see a half-empty strip and together exceed the cap.
      const check = checkImageCandidate(
        { name: file.name, size: file.size, type: file.type },
        attachmentsRef.current.length + savingRef.current,
      )
      if (!check.ok) {
        toastReject(check.code, file.name)
        // Once the cap is hit, every later file in this batch would repeat the
        // same toast; stop instead.
        if (check.code === 'count') break
        continue
      }
      beginSave()
      try {
        const result = await window.electronAPI.fsSaveImageAttachment({
          name: file.name,
          mimeType: file.type,
          data: await file.arrayBuffer(),
        })
        if (!result.success) {
          toastSaveFailure(file.name, result)
          continue
        }
        const saved = result.attachment
        if (attachmentsRef.current.some(a => a.path === saved.path)) continue
        const attachment: ImageAttachment = {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: saved.name,
          path: saved.path,
          size: saved.size,
          mimeType: saved.mimeType,
        }
        commitImages([...attachmentsRef.current, attachment])
      } catch (err) {
        addToast('error', t('chat.imageAttachment.saveFailed', { name: file.name, reason: String(err) }))
      } finally {
        endSave()
      }
    }
  }, [addToast, beginSave, commitImages, enabled, endSave, t, toastReject, toastSaveFailure])

  /** Persist images picked through the OS dialog (only their paths reach us). */
  const addImagePaths = useCallback(async (filePaths: string[]) => {
    if (filePaths.length === 0) return
    if (!enabled) {
      addToast('warning', t('chat.imageAttachment.codexOnly'))
      return
    }
    for (const filePath of filePaths) {
      const name = baseName(filePath)
      if (attachmentsRef.current.length + savingRef.current >= MAX_IMAGE_ATTACHMENTS) {
        toastReject('count', name)
        break
      }
      beginSave()
      try {
        const result = await window.electronAPI.fsSaveImageAttachment({ name, sourcePath: filePath })
        if (!result.success) {
          toastSaveFailure(name, result)
          continue
        }
        const saved = result.attachment
        if (attachmentsRef.current.some(a => a.path === saved.path)) continue
        commitImages([...attachmentsRef.current, {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: saved.name,
          path: saved.path,
          size: saved.size,
          mimeType: saved.mimeType,
        }])
      } catch (err) {
        addToast('error', t('chat.imageAttachment.saveFailed', { name, reason: String(err) }))
      } finally {
        endSave()
      }
    }
  }, [addToast, beginSave, commitImages, enabled, endSave, t, toastReject, toastSaveFailure])

  /** Add file attachments from file paths (via Electron file dialog). */
  const addFileAttachments = useCallback(async (filePaths: string[]) => {
    const remaining = MAX_FILE_ATTACHMENTS - fileAttachments.length
    const paths = filePaths.slice(0, remaining)

    for (const filePath of paths) {
      const name = baseName(filePath)
      const ext = getExtension(name)
      const mimeType = getMimeType(name)
      const isImage = !!imageMimeForFile(name)

      // The paperclip may still land on an image. Route it through the same
      // persisted-image path instead of treating it as an unreadable document.
      if (isImage || POTENTIAL_IMAGE_EXTENSIONS.has(ext)) {
        if (isImage) {
          await addImagePaths([filePath])
        } else if (enabled) {
          // Let the main process name the real reason (bmp/svg/… are refused).
          await addImagePaths([filePath])
        } else {
          addToast('warning', t('chat.imageAttachment.codexOnly'))
        }
        continue
      }

      // Try to read text file content
      let content: string | undefined
      let size = 0

      if (isTextFile(name)) {
        try {
          const result = await window.electronAPI.fsReadFile(filePath)
          if (result?.content) {
            const fileContent = result.content
            content = fileContent
            size = fileContent.length
            if (size > MAX_FILE_SIZE) {
              // Truncate very large files
              content = fileContent.slice(0, MAX_FILE_SIZE)
              size = MAX_FILE_SIZE
            }
          }
        } catch {
          // Could not read file, attach as reference only
        }
      }

      const attachment: FileAttachment = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        path: filePath,
        size,
        content,
        mimeType,
        isImage: false,
      }

      setFileAttachments(prev => {
        // Prevent duplicates by path
        if (prev.some(f => f.path === filePath)) return prev
        return [...prev, attachment]
      })
    }
  }, [addImagePaths, addToast, enabled, fileAttachments.length, t])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile()
        if (file && isPotentialImage(file)) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      void addFiles(files)
    }
  }, [addFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files).filter(f => isPotentialImage(f))
    if (files.length === 0) return
    e.preventDefault()
    void addFiles(files)
  }, [addFiles])

  const removeAttachment = useCallback((id: string) => {
    commitImages(attachmentsRef.current.filter(a => a.id !== id))
  }, [commitImages])

  const removeFileAttachment = useCallback((id: string) => {
    setFileAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const clearAttachments = useCallback(() => {
    commitImages([])
    setFileAttachments([])
  }, [commitImages])

  /**
   * Persist a screenshot captured as a data URL. The data URL exists only
   * inside this call — it is decoded to bytes and handed to the main process.
   * Returns true only when the file really exists on disk.
   */
  const addImageAttachment = useCallback(async (
    name: string,
    dataUrl: string,
    _mimeType: string = 'image/png',
  ): Promise<boolean> => {
    if (!enabled) {
      addToast('warning', t('chat.imageAttachment.codexOnly'))
      return false
    }
    if (attachmentsRef.current.length + savingRef.current >= MAX_IMAGE_ATTACHMENTS) {
      toastReject('count', name)
      return false
    }
    const data = dataUrlToBuffer(dataUrl)
    if (!data) {
      addToast('error', t('chat.imageAttachment.saveFailed', { name, reason: 'invalid data URL' }))
      return false
    }
    beginSave()
    try {
      const result = await window.electronAPI.fsSaveImageAttachment({
        name,
        mimeType: 'image/png',
        data,
      })
      if (!result.success) {
        toastSaveFailure(name, result)
        return false
      }
      const saved = result.attachment
      commitImages([...attachmentsRef.current, {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: saved.name,
        path: saved.path,
        size: saved.size,
        mimeType: saved.mimeType,
      }])
      return true
    } catch (err) {
      addToast('error', t('chat.imageAttachment.saveFailed', { name, reason: String(err) }))
      return false
    } finally {
      endSave()
    }
  }, [addToast, beginSave, commitImages, enabled, endSave, t, toastReject, toastSaveFailure])

  return {
    attachments,
    fileAttachments,
    isSavingImages,
    /** Synchronous second opinion for send handlers in the same tick. */
    hasPendingImageSaves: () => savingRef.current > 0,
    handlePaste,
    handleDrop,
    addFiles,
    addFileAttachments,
    addImagePaths,
    addImageAttachment,
    removeAttachment,
    removeFileAttachment,
    clearAttachments,
  }
}
