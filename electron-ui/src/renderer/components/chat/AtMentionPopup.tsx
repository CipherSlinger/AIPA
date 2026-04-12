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
  const prefs = usePrefsStore(s => s.prefs)
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
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: 'rgba(15,15,25,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        zIndex: 1000,
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      <style>{`.at-popup-scroll::-webkit-scrollbar { width: 4px; } .at-popup-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 2px; }`}</style>

      {/* Section header — micro-label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.38)',
        padding: '6px 12px 4px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        Files &amp; Folders
      </div>

      <div className="at-popup-scroll" style={{ maxHeight: 240, overflowY: 'auto' }}>
        {entries.map((entry, i) => {
          const isSelected = i === selectedIndex
          // Directory: amber tint, File: indigo tint
          const iconBg = entry.isDirectory
            ? (isSelected ? 'rgba(251,191,36,0.25)' : 'rgba(251,191,36,0.12)')
            : (isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)')
          const iconColor = entry.isDirectory ? '#fbbf24' : (isSelected ? '#a5b4fc' : '#818cf8')

          return (
            <div
              key={entry.path}
              onClick={() => onSelect(entry.path)}
              onMouseEnter={(e) => {
                setSelectedIndex(i)
                if (!isSelected) {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 12px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                borderLeft: isSelected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Icon — circular for avatar feel */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                flexShrink: 0,
                background: iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
              }}>
                {entry.isDirectory
                  ? <Folder size={13} style={{ color: iconColor }} />
                  : <File size={13} style={{ color: iconColor }} />
                }
              </div>

              {/* Name + type hint */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: isSelected ? '#818cf8' : 'rgba(255,255,255,0.82)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s ease',
                }}>
                  {entry.name}{entry.isDirectory ? '/' : ''}
                </div>
                {/* Subtle path description */}
                <div style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.38)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                  marginTop: 1,
                }}>
                  {entry.isDirectory ? 'directory' : 'file'}
                </div>
              </div>

              {/* Selected checkmark */}
              {isSelected && (
                <span style={{
                  color: '#818cf8',
                  fontSize: 13,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  ✓
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer keyboard hints */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        flexWrap: 'wrap' as const,
      }}>
        {[
          ['↑↓', 'navigate'],
          ['↵', 'select'],
          ['Esc', 'dismiss'],
        ].map(([key, label]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <kbd style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6,
            }}>
              {key}
            </kbd>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
