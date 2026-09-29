export interface NavPluginManifest {
  id: string
  name: string
  nameEn?: string
  version?: string
  description?: string
  icon?: string           // Lucide icon name (e.g. 'Blocks', 'Terminal', 'Gauge', 'Zap') or SVG string
  location?: 'top' | 'bottom' // Deprecated: NavRail places all plugins in the top section (Plugin Hub stays at bottom)
  order?: number
  main: string            // Main entry point file (e.g. "index.html")
  permissions?: string[]
}

export interface NavPlugin {
  manifest: NavPluginManifest
  dirPath: string
  entryPath: string       // Absolute path to main html file
  source: 'global' | 'workspace'
  valid: boolean
  error?: string
}

