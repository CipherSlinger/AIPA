import React from 'react'
import { useUiStore } from '../../store'
import SessionList from '../sessions/SessionList'
import FileBrowser from '../filebrowser/FileBrowser'
import SettingsPanel from '../settings/SettingsPanel'
import NotesPanel from '../notes/NotesPanel'
import SkillsPanel from '../skills/SkillsPanel'

export default function Sidebar() {
  const { sidebarTab } = useUiStore()

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-sessionpanel)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Tab content — NavRail controls which tab is active */}
      <div className="flex-1 overflow-auto">
        {sidebarTab === 'history' && <SessionList />}
        {sidebarTab === 'files' && <FileBrowser />}
        {sidebarTab === 'notes' && <NotesPanel />}
        {sidebarTab === 'skills' && <SkillsPanel />}
        {sidebarTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
