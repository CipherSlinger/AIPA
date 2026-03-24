import React from 'react'
import { FolderTree, History, Settings, MessageSquare } from 'lucide-react'
import { useUiStore } from '../../store'
import FileBrowser from '../filebrowser/FileBrowser'
import SessionList from '../sessions/SessionList'
import SettingsPanel from '../settings/SettingsPanel'

export default function Sidebar() {
  const { sidebarTab, setSidebarTab } = useUiStore()

  const tabs = [
    { id: 'files' as const, icon: FolderTree, label: '文件' },
    { id: 'history' as const, icon: History, label: '历史' },
    { id: 'settings' as const, icon: Settings, label: '设置' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {tabs.map(({ id, icon: Icon, label }) => (
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
              background: sidebarTab === id ? 'var(--bg-active)' : 'transparent',
              borderBottom: sidebarTab === id ? '2px solid var(--accent)' : '2px solid transparent',
              color: sidebarTab === id ? 'var(--text-bright)' : 'var(--text-muted)',
              cursor: 'pointer',
              border: 'none',
              outline: 'none',
            }}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {sidebarTab === 'files' && <FileBrowser />}
        {sidebarTab === 'history' && <SessionList />}
        {sidebarTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
