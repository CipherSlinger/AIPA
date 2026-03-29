import { useState, useRef, useCallback } from 'react'
import { IMAGE_EXTENSIONS, MAX_FILE_SIZE, MAX_FILE_COUNT } from './chatPanelConstants'
import { useT } from '../../i18n'

/**
 * Hook encapsulating file drag-and-drop handling for ChatPanel.
 * Dispatches 'aipa:dropFiles' custom event with processed file data.
 */
export function useDragAndDrop(
  addToast: (type: string, message: string) => void,
) {
  const t = useT()
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    if (files.length > MAX_FILE_COUNT) {
      addToast('warning', t('chat.tooManyFiles', { max: String(MAX_FILE_COUNT) }))
    }

    const processFiles = files.slice(0, MAX_FILE_COUNT)
    const imageFiles: File[] = []
    const pathFiles: string[] = []

    for (const file of processFiles) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const isImage = IMAGE_EXTENSIONS.includes(ext)

      if (isImage) {
        if (file.size > MAX_FILE_SIZE) {
          addToast('error', t('chat.fileTooLarge', { name: file.name }))
          continue
        }
        imageFiles.push(file)
      } else {
        const filePath = (file as any).path as string
        if (filePath) {
          pathFiles.push(filePath)
        }
      }
    }

    // Dispatch to ChatInput via CustomEvent
    const atPaths = pathFiles.length > 0 ? pathFiles.map(p => `@${p}`).join(' ') : undefined
    window.dispatchEvent(new CustomEvent('aipa:dropFiles', {
      detail: { imageFiles, atPaths }
    }))
  }, [addToast, t])

  return {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleFileDrop,
  }
}
