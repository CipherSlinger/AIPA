import React from 'react'
import { History, FolderOpen, Settings } from 'lucide-react'
import { useUiStore, useSessionStore } from '../../store'
import SessionList from '../sessions/SessionList'
import FileBrowser from '../filebrowser/FileBrowser'
import SettingsPanel from '../settings/SettingsPanel'

export default function Sidebar() {
  const { sidebarTab, setSidebarTab } = useUiStore()
  const sessionCount = useSessionStore(s => s.sessions.length)

  const tabs = [
    { id: 'history' as const, icon: History, label: 'History', badge: sessionCount > 0 ? sessionCount : undefined },
    { id: 'files' as const, icon: FolderOpen, label: 'Files' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {tabs.map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id}
            onClick={() => setSidebarTab(id)}
            title={label}
            style={{
              flex: 1,
              padding: '8px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: sidebarTab === id ? 'var(--bg-active)' : 'transparent',
              color: sidebarTab === id ? 'var(--text-bright)' : 'var(--text-muted)',
              cursor: 'pointer',
              border: 'none',
              borderBottom: sidebarTab === id ? '2px solid var(--accent)' : '2px solid transparent',
              outline: 'none',
              transition: 'color 0.15s, background 0.15s',
              position: 'relative',
            }}
          >
            <Icon size={16} />
            {badge !== undefined && (
              <span style={{
                fontSize: 9,
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 8,
                padding: '0 4px',
                minWidth: 14,
                textAlign: 'center',
                lineHeight: '14px',
              }}>
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {sidebarTab === 'history' && <SessionList />}
        {sidebarTab === 'files' && <FileBrowser />}
        {sidebarTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
