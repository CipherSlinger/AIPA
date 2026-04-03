// SessionFolders — folder management for session list
// Iteration 415

import React, { useState, useRef, useEffect } from 'react'
import { FolderPlus, Folder, ChevronDown, X, Pencil, Trash2 } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import type { SessionFolder } from '../../types/app.types'

const FOLDER_EMOJIS = [
  '\u{1F4C1}', '\u{1F4BC}', '\u{1F3E0}', '\u{1F50D}', '\u{1F4DA}',
  '\u{1F4BB}', '\u{1F680}', '\u{1F3AF}', '\u2764\uFE0F', '\u2699\uFE0F',
]

const EMPTY_FOLDERS: SessionFolder[] = []

const FOLDER_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
]

interface SessionFoldersProps {
  activeFolder: string | null  // null = all sessions
  onFolderSelect: (folderId: string | null) => void
  folderCounts?: Record<string, number>  // folderId -> session count
}

export default function SessionFolders({ activeFolder, onFolderSelect, folderCounts = {} }: SessionFoldersProps) {
  const t = useT()
  const folders = usePrefsStore(s => s.prefs.sessionFolders || EMPTY_FOLDERS)
  const [showMenu, setShowMenu] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('\u{1F4C1}')
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
        setShowCreate(false)
        setEditingId(null)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [showMenu])

  const saveFolders = (updated: SessionFolder[]) => {
    usePrefsStore.getState().setPrefs({ sessionFolders: updated })
    window.electronAPI.prefsSet('sessionFolders', updated)
  }

  const createFolder = () => {
    const name = newName.trim()
    if (!name || folders.length >= 10) return
    const newFolder: SessionFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      emoji: newEmoji,
      color: newColor,
      collapsed: false,
    }
    saveFolders([...folders, newFolder])
    setNewName('')
    setNewEmoji('\u{1F4C1}')
    setNewColor(FOLDER_COLORS[0])
    setShowCreate(false)
  }

  const deleteFolder = (id: string) => {
    saveFolders(folders.filter(f => f.id !== id))
    // Remove sessions from deleted folder
    const map = { ...(usePrefsStore.getState().prefs.sessionFolderMap || {}) }
    for (const [sid, fid] of Object.entries(map)) {
      if (fid === id) delete map[sid]
    }
    usePrefsStore.getState().setPrefs({ sessionFolderMap: map })
    window.electronAPI.prefsSet('sessionFolderMap', map)
    if (activeFolder === id) onFolderSelect(null)
  }

  const renameFolder = (id: string) => {
    const name = editName.trim()
    if (!name) return
    saveFolders(folders.map(f => f.id === id ? { ...f, name } : f))
    setEditingId(null)
  }

  const activeFolderObj = activeFolder ? folders.find(f => f.id === activeFolder) : null

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Folder selector button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          background: activeFolder && activeFolderObj?.color ? `${activeFolderObj.color}18` : activeFolder ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.1)' : 'transparent',
          border: `1px solid ${activeFolder && activeFolderObj?.color ? activeFolderObj.color + '40' : 'var(--border)'}`,
          borderRadius: 5,
          cursor: 'pointer',
          color: activeFolder && activeFolderObj?.color ? activeFolderObj.color : activeFolder ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 500,
          transition: 'background 100ms',
          maxWidth: 120,
          overflow: 'hidden',
        }}
        title={t('session.folders')}
      >
        <Folder size={11} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeFolderObj ? activeFolderObj.name : t('session.allSessions')}
        </span>
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            width: 200,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: 6,
            zIndex: 300,
            animation: 'popup-in 0.12s ease',
          }}
        >
          {/* All Sessions */}
          <button
            onClick={() => { onFolderSelect(null); setShowMenu(false) }}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 5,
              background: !activeFolder ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.1)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: !activeFolder ? 'var(--accent)' : 'var(--text-primary)',
              fontSize: 11, fontWeight: !activeFolder ? 600 : 400,
              textAlign: 'left',
            }}
          >
            <Folder size={12} />
            {t('session.allSessions')}
          </button>

          {/* Folder list */}
          {folders.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {editingId === f.id ? (
                <div style={{ flex: 1, display: 'flex', gap: 4, padding: '4px 0' }}>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameFolder(f.id); if (e.key === 'Escape') setEditingId(null) }}
                    maxLength={30}
                    autoFocus
                    style={{
                      flex: 1, background: 'var(--bg-input)', border: '1px solid var(--accent)',
                      borderRadius: 4, padding: '3px 6px', color: 'var(--text-primary)',
                      fontSize: 11, outline: 'none',
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => { onFolderSelect(f.id); setShowMenu(false) }}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5,
                    background: activeFolder === f.id ? (f.color ? `${f.color}18` : 'rgba(var(--accent-rgb, 0, 122, 204), 0.1)') : 'transparent',
                    border: 'none', cursor: 'pointer',
                    color: activeFolder === f.id ? (f.color || 'var(--accent)') : 'var(--text-primary)',
                    fontSize: 11, fontWeight: activeFolder === f.id ? 600 : 400,
                    textAlign: 'left',
                  }}
                >
                  {f.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 12 }}>{f.emoji}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                  {(folderCounts[f.id] ?? 0) > 0 && (
                    <span style={{ fontSize: 9, color: f.color || 'var(--text-muted)', opacity: 0.7, flexShrink: 0 }}>
                      {folderCounts[f.id]}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => { setEditingId(f.id); setEditName(f.name) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => deleteFolder(f.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}

          {/* Divider */}
          {folders.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}

          {/* Create new folder */}
          {showCreate ? (
            <div style={{ padding: '6px 4px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {FOLDER_EMOJIS.slice(0, 5).map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => setNewEmoji(emoji)}
                    style={{
                      width: 24, height: 24, borderRadius: 4, fontSize: 12,
                      border: newEmoji === emoji ? '1px solid var(--accent)' : '1px solid transparent',
                      background: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {/* Color picker */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {FOLDER_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: color, cursor: 'pointer',
                      border: newColor === color ? '2px solid var(--text-primary)' : '2px solid transparent',
                      outline: newColor === color ? `1px solid ${color}` : 'none',
                      padding: 0,
                    }}
                    title={color}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowCreate(false) }}
                  placeholder={t('session.folderName')}
                  maxLength={30}
                  autoFocus
                  style={{
                    flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '4px 8px', color: 'var(--text-primary)',
                    fontSize: 11, outline: 'none',
                  }}
                />
                <button
                  onClick={createFolder}
                  disabled={!newName.trim()}
                  style={{
                    background: newName.trim() ? 'var(--accent)' : 'var(--bg-input)',
                    border: 'none', borderRadius: 4, padding: '4px 8px',
                    color: newName.trim() ? '#fff' : 'var(--text-muted)',
                    cursor: newName.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 10, fontWeight: 600,
                  }}
                >
                  {t('session.createFolder')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              disabled={folders.length >= 10}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 5,
                background: 'transparent', border: 'none',
                cursor: folders.length >= 10 ? 'not-allowed' : 'pointer',
                color: folders.length >= 10 ? 'var(--text-muted)' : 'var(--accent)',
                fontSize: 11, textAlign: 'left',
              }}
            >
              <FolderPlus size={12} />
              {folders.length >= 10 ? t('session.folderMax') : t('session.newFolder')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Assign a session to a folder */
export function assignSessionToFolder(sessionId: string, folderId: string | null) {
  const prefs = usePrefsStore.getState()
  const map = { ...(prefs.prefs.sessionFolderMap || {}) }
  if (folderId) {
    map[sessionId] = folderId
  } else {
    delete map[sessionId]
  }
  prefs.setPrefs({ sessionFolderMap: map })
  window.electronAPI.prefsSet('sessionFolderMap', map)
}
