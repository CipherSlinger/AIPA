import { useState, useCallback } from 'react'

export interface ImageAttachment {
  id: string
  name: string
  dataUrl: string   // base64 data URL
  mimeType: string
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function useImagePaste() {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const imageFiles = arr.filter(f => ALLOWED_TYPES.includes(f.type))
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

  const clearAttachments = useCallback(() => setAttachments([]), [])

  return { attachments, handlePaste, handleDrop, addFiles, removeAttachment, clearAttachments }
}
