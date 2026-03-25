import React, { useEffect, useState, useRef } from 'react'
import { File, Folder } from 'lucide-react'
import { usePrefsStore } from '../../store'

interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

interface Props {
  query: string
  onSelect: (path: string) => void
  onDismiss: () => void
  anchorRef: React.RefObject<HTMLElement>
}

export default function AtMentionPopup({ query, onSelect, onDismiss, anchorRef }: Props) {
  const { prefs } = usePrefsStore()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const baseDir = prefs.workingDir || (await window.electronAPI.fsGetHome())
        // If query contains path separator, search inside subdirectory
        const parts = query.split(/[/\\]/)
        const subPath = parts.slice(0, -1).join('/')
        const searchTerm = parts[parts.length - 1].toLowerCase()
        const searchDir = subPath ? `${baseDir}/${subPath}` : baseDir

        const results = await window.electronAPI.fsListDir(searchDir)
        const filtered = (results as FileEntry[]).filter((e) =>
          !searchTerm || e.name.toLowerCase().includes(searchTerm)
        ).slice(0, 10)
        setEntries(filtered)
        setSelectedIndex(0)
      } catch {
        setEntries([])
      }
    }
    load()
  }, [query, prefs.workingDir])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, entries.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (entries[selectedIndex]) onSelect(entries[selectedIndex].path)
      } else if (e.key === 'Escape') {
        onDismiss()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [entries, selectedIndex, onSelect, onDismiss])

  if (entries.length === 0) return null

  return (
    <div
      ref={listRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 1000,
        maxHeight: 240,
        overflowY: 'auto',
        marginBottom: 4,
      }}
    >
      {entries.map((entry, i) => (
        <div
          key={entry.path}
          onClick={() => onSelect(entry.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            cursor: 'pointer',
            background: i === selectedIndex ? 'var(--bg-active)' : 'transparent',
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          {entry.isDirectory
            ? <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            : <File size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          }
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name}
          </span>
          {entry.isDirectory && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>/</span>}
        </div>
      ))}
    </div>
  )
}
