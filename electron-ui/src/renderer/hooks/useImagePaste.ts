import { useState, useCallback } from 'react'

export interface ImageAttachment {
  id: string
  name: string
  dataUrl: string   // base64 data URL
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
  dataUrl?: string   // base64 data URL (only for images)
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase()
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name))
}

function getMimeType(name: string): string {
  const ext = getExtension(name)
  if (IMAGE_TYPES.some(t => t.includes(ext))) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
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

export function useImagePaste() {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const imageFiles = arr.filter(f => IMAGE_TYPES.includes(f.type))
    if (imageFiles.length === 0) return

    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (!dataUrl) return
        setAttachments(prev => [...prev, {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          dataUrl,
          mimeType: file.type,
        }])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  /** Add file attachments from file paths (via Electron file dialog) */
  const addFileAttachments = useCallback(async (filePaths: string[]) => {
    const remaining = MAX_FILE_ATTACHMENTS - fileAttachments.length
    const paths = filePaths.slice(0, remaining)

    for (const filePath of paths) {
      const name = filePath.split(/[/\\]/).pop() || filePath
      const ext = getExtension(name)
      const isImage = IMAGE_TYPES.some(t => t.includes(ext === 'jpg' ? 'jpeg' : ext))
      const mimeType = getMimeType(name)

      // Try to read text file content
      let content: string | undefined
      let size = 0
      let dataUrl: string | undefined

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
      } else if (isImage) {
        // For images dropped via file dialog, read as base64
        try {
          const result = await window.electronAPI.fsReadFile(filePath)
          if (result?.content) {
            // fsReadFile returns utf-8 text; for images we need the path reference
            // Images from file dialog just get referenced by path
          }
        } catch {
          // Ignore
        }
      }

      const attachment: FileAttachment = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        path: filePath,
        size,
        content,
        mimeType,
        isImage,
        dataUrl,
      }

      setFileAttachments(prev => {
        // Prevent duplicates by path
        if (prev.some(f => f.path === filePath)) return prev
        return [...prev, attachment]
      })
    }
  }, [fileAttachments.length])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }, [addFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const removeFileAttachment = useCallback((id: string) => {
    setFileAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments([])
    setFileAttachments([])
  }, [])

  return {
    attachments,
    fileAttachments,
    handlePaste,
    handleDrop,
    addFiles,
    addFileAttachments,
    removeAttachment,
    removeFileAttachment,
    clearAttachments,
  }
}
