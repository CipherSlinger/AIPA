import { create } from 'zustand'
import type { NavPlugin } from '../../preload/index'

interface PluginState {
  plugins: NavPlugin[]
  activePluginId: string | null

  loadPlugins: () => Promise<void>
  setActivePluginId: (id: string | null) => void
  openPluginFolder: (id?: string) => Promise<boolean>
  initPluginListener: () => () => void
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  activePluginId: null,

  loadPlugins: async () => {
    if (!window.electronAPI?.pluginNavList) return
    try {
      const list = await window.electronAPI.pluginNavList()
      set({ plugins: list || [] })
    } catch { /* keep previous list */ }
  },

  setActivePluginId: (id: string | null) => {
    set({ activePluginId: id })
  },

  openPluginFolder: async (id?: string) => {
    if (!window.electronAPI?.pluginNavOpenFolder) return false
    return window.electronAPI.pluginNavOpenFolder(id)
  },

  initPluginListener: () => {
    // Initial fetch
    get().loadPlugins()

    if (window.electronAPI?.onPluginNavUpdated) {
      return window.electronAPI.onPluginNavUpdated((updatedPlugins) => {
        set({ plugins: updatedPlugins || [] })
      })
    }
    return () => {}
  },
}))
