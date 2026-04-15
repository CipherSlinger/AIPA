// SessionFolders — folder management for session list
// Iteration 417

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
  '#6366f1', // blue
  '#a78bfa', // violet
  '#ec4899', // pink
  '#f87171', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#67e8f9', // cyan
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
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null)
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
          background: activeFolder && activeFolderObj?.color ? `${activeFolderObj.color}18` : activeFolder ? 'rgba(99,102,241,0.1)' : 'transparent',
          border: `1px solid ${activeFolder && activeFolderObj?.color ? activeFolderObj.color + '40' : 'var(--border)'}`,
          borderRadius: 8,
          cursor: 'pointer',
          color: activeFolder && activeFolderObj?.color ? activeFolderObj.color : activeFolder ? '#818cf8' : 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          transition: 'all 0.15s ease',
          maxWidth: 120,
          overflow: 'hidden',
        }}
        title={t('session.folders')}
      >
        <Folder size={11} style={{ color: activeFolder ? '#818cf8' : 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeFolderObj ? activeFolderObj.name : t('session.allSessions')}
        </span>
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.6, transition: 'all 0.15s ease', transform: showMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
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
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: 6,
            zIndex: 300,
            animation: 'slideUp 0.15s ease',
          }}
        >
          {/* Section header */}
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            padding: '2px 8px 6px',
          }}>
            Folders
          </div>

          {/* All Sessions */}
          <button
            onClick={() => { onFolderSelect(null); setShowMenu(false) }}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 6px 6px 6px',
              paddingLeft: !activeFolder ? 4 : 8,
              borderRadius: 7,
              background: !activeFolder ? 'rgba(99,102,241,0.10)' : hoveredFolderId === '__all' ? 'var(--bg-hover)' : 'transparent',
              borderLeft: !activeFolder ? '2px solid rgba(99,102,241,0.40)' : '2px solid transparent',
              borderTop: 'none', borderRight: 'none', borderBottom: 'none',
              cursor: 'pointer',
              color: !activeFolder ? '#818cf8' : 'var(--text-primary)',
              fontSize: 11,
              fontWeight: !activeFolder ? 600 : 400,
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={() => setHoveredFolderId('__all')}
            onMouseLeave={() => setHoveredFolderId(null)}
          >
            <Folder size={12} style={{ color: !activeFolder ? '#818cf8' : 'var(--text-muted)', flexShrink: 0 }} />
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
                      flex: 1,
                      background: 'var(--bg-hover)',
                      border: '1px solid rgba(99,102,241,0.45)',
                      borderRadius: 6,
                      padding: '3px 6px',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      outline: 'none',
                      boxShadow: '0 0 0 3px rgba(99,102,241,0.12)',
                      transition: 'all 0.15s ease',
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => { onFolderSelect(f.id); setShowMenu(false) }}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 6px 6px 6px',
                    paddingLeft: activeFolder === f.id ? 4 : 8,
                    borderRadius: 7,
                    background: activeFolder === f.id
                      ? (f.color ? `${f.color}18` : 'rgba(99,102,241,0.10)')
                      : hoveredFolderId === f.id ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: activeFolder === f.id ? `2px solid ${f.color || 'rgba(99,102,241,0.40)'}` : '2px solid transparent',
                    borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                    cursor: 'pointer',
                    color: activeFolder === f.id ? (f.color || '#818cf8') : 'var(--text-primary)',
                    fontSize: 11,
                    fontWeight: activeFolder === f.id ? 600 : 400,
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={() => setHoveredFolderId(f.id)}
                  onMouseLeave={() => setHoveredFolderId(null)}
                >
                  {f.color ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, flexShrink: 0 }} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />}
                  <span style={{ fontSize: 12 }}>{f.emoji}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 12, fontWeight: 600 }}>{f.name}</span>
                  {(folderCounts[f.id] ?? 0) > 0 && (
                    <span style={{
                      background: 'var(--border)',
                      borderRadius: 10,
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                      fontFeatureSettings: '"tnum"',
                    }}>
                      {folderCounts[f.id]}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => { setEditingId(f.id); setEditName(f.name) }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 6, transition: 'all 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => deleteFolder(f.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', borderRadius: 6, transition: 'all 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
                      width: 24, height: 24, borderRadius: 8, fontSize: 12,
                      border: newEmoji === emoji ? '1px solid rgba(99,102,241,0.45)' : '1px solid transparent',
                      background: newEmoji === emoji ? 'rgba(99,102,241,0.1)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
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
                    flex: 1,
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    outline: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  onClick={createFolder}
                  disabled={!newName.trim()}
                  style={{
                    background: newName.trim() ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))' : 'var(--bg-hover)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 8px',
                    color: newName.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: newName.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 10,
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (newName.trim()) e.currentTarget.style.boxShadow = '0 0 10px rgba(99,102,241,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
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
                padding: '6px 8px', borderRadius: 7,
                background: 'transparent', border: 'none',
                cursor: folders.length >= 10 ? 'not-allowed' : 'pointer',
                color: folders.length >= 10 ? 'var(--text-muted)' : '#818cf8',
                fontSize: 11, textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (folders.length < 10) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
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
