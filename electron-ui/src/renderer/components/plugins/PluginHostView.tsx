import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  RotateCw,
  FolderOpen,
  X,
  AlertTriangle,
  Puzzle,
  FileCode,
  Sparkles,
} from 'lucide-react'
import { usePluginStore } from '../../store/pluginStore'
import { useUiStore, usePrefsStore } from '../../store'
import { getPluginIconComponent, getPluginDisplayName } from './pluginIcons'
import PluginSourcePreview from './PluginSourcePreview'
import PluginEditDrawer from './PluginEditDrawer'
import { useI18n } from '../../i18n'

type ElectronAPI = typeof window.electronAPI

// Capabilities a plugin can call through `aipa:invoke`: the manifest
// permission each one requires, and how it maps onto the host API.
const INVOKE_METHODS: Record<string, {
  permission: string
  call: (api: ElectronAPI, pluginId: string, payload: any) => Promise<unknown>
}> = {
  'data.get': { permission: 'storage', call: (api, id, p) => api.pluginDataGet(id, p?.key) },
  'data.set': { permission: 'storage', call: (api, id, p) => api.pluginDataSet(id, p?.key, p?.value) },
  'github.commits': { permission: 'network', call: (api, id, p) => api.pluginGithubCommits(id, p) },
  'fs.scanFolder': { permission: 'fs', call: (api, id, p) => api.pluginScanFolder(id, p) },
  'fs.pickFolder': { permission: 'fs', call: (api, id, p) => api.pluginPickFolder(id, p?.title) },
  'ai.generate': {
    permission: 'ai',
    call: (api, id, p) => api.pluginAiGenerate({
      pluginId: id,
      requestId: String(p?.requestId || ''),
      prompt: String(p?.prompt || ''),
      instructions: p?.instructions,
      model: p?.model,
    }),
  },
  'ai.abort': { permission: 'ai', call: (api, id, p) => api.pluginAiAbort(id, String(p?.requestId || '')) },
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // Strip Electron's "Error invoking remote method 'x': Error: " prefix
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

/** Shared chrome for the toolbar buttons; each spreads it and overrides only
 *  the state-dependent background/border/color. */
const TOOLBAR_BTN: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 11,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

export default function PluginHostView() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeKey, setIframeKey] = useState(0)
  // Source preview overlays the plugin frame (which stays mounted, so the
  // running plugin keeps its state while you read its files). Per-plugin, so it
  // resets on switch.
  const [showSource, setShowSource] = useState(false)
  // AI edit drawer: chats with the agent, whose cwd is this plugin's folder.
  const [showEdit, setShowEdit] = useState(false)

  const plugins = usePluginStore(s => s.plugins)
  const activePluginId = usePluginStore(s => s.activePluginId)
  const openFolder = usePluginStore(s => s.openPluginFolder)
  const setActiveNavItem = useUiStore(s => s.setActiveNavItem)
  const addToast = useUiStore(s => s.addToast)
  const theme = usePrefsStore(s => s.prefs.theme || 'light')
  const { resolvedLocale, t } = useI18n()

  const plugin = plugins.find(p => p.manifest.id === activePluginId) || plugins[0]
  // Read the current plugin through a ref so the message listener is bound once
  // instead of re-subscribing on every plugin list refresh.
  const pluginRef = useRef(plugin)
  pluginRef.current = plugin

  // Synchronize theme with iframe
  const sendThemeToIframe = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      const isDark = theme === 'vscode' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      iframeRef.current.contentWindow.postMessage({
        type: 'aipa:theme',
        theme: isDark ? 'dark' : 'light',
      }, '*')
    }
  }, [theme])

  useEffect(() => {
    sendThemeToIframe()
  }, [sendThemeToIframe, iframeKey])

  // Forward streaming AI events for the active plugin into its iframe
  const activeManifestId = plugin?.manifest.id
  useEffect(() => {
    if (!activeManifestId) return
    return window.electronAPI.onPluginAiEvent((event) => {
      if (event.pluginId !== activeManifestId) return
      iframeRef.current?.contentWindow?.postMessage({ type: 'aipa:ai:event', event }, '*')
    })
  }, [activeManifestId])

  // Handle bidirectional bridge messages from the plugin iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      const plugin = pluginRef.current

      if (data.type === 'aipa:invoke') {
        // Only accept capability calls from the hosted plugin frame
        const target = iframeRef.current?.contentWindow
        if (!plugin || !target || event.source !== target) return
        const method = String(data.method || '')
        const reply = (body: Record<string, unknown>) =>
          target.postMessage({ type: 'aipa:response', requestId: data.requestId, ...body }, '*')
        const spec = Object.prototype.hasOwnProperty.call(INVOKE_METHODS, method) ? INVOKE_METHODS[method] : undefined
        if (!spec) {
          reply({ ok: false, error: `未知的宿主能力：${method}` })
          return
        }
        if (!plugin.manifest.permissions?.includes(spec.permission)) {
          reply({ ok: false, error: `插件未声明 "${spec.permission}" 权限（plugin.json → permissions）` })
          return
        }
        spec.call(window.electronAPI, plugin.manifest.id, data.payload)
          .then(result => reply({ ok: true, result }))
          .catch(err => reply({ ok: false, error: errorMessage(err) }))
      } else if (data.type === 'aipa:ready') {
        sendThemeToIframe()
      } else if (data.type === 'aipa:toast') {
        const type = data.payload?.type || 'info'
        const message = data.payload?.message || String(data.payload || '')
        addToast(type, message)
      } else if (data.type === 'aipa:sendPrompt') {
        const prompt = data.payload?.prompt || data.prompt || String(data.payload || '')
        if (prompt) {
          // Switch to chat, then let ChatInput (mounted on the next render) take the text
          useUiStore.getState().setActiveNavItem('chat')
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('aipa:insertText', { detail: prompt }))
          }, 100)
          addToast('success', t('pluginHost.sentToChat'))
        }
      } else if (data.type === 'aipa:openPlugin' || data.type === 'aipa:switchPlugin') {
        const targetId = data.payload?.pluginId || data.pluginId
        if (targetId) useUiStore.getState().setActiveNavItem(`plugin:${targetId}`)
      } else if (data.type === 'aipa:openFolder') {
        const targetId = data.payload?.pluginId || data.pluginId || usePluginStore.getState().activePluginId
        openFolder(targetId)
      } else if (data.type === 'aipa:storage:set') {
        if (plugin) {
          const key = `aipa_plugin_${plugin.manifest.id}_${data.payload?.key}`
          localStorage.setItem(key, JSON.stringify(data.payload?.value))
        }
      } else if (data.type === 'aipa:storage:get') {
        if (plugin && iframeRef.current?.contentWindow) {
          const key = `aipa_plugin_${plugin.manifest.id}_${data.payload?.key}`
          const val = localStorage.getItem(key)
          iframeRef.current.contentWindow.postMessage({
            type: 'aipa:storage:response',
            requestId: data.requestId,
            value: val ? JSON.parse(val) : null,
          }, '*')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendThemeToIframe, addToast, openFolder, t])

  // Reset the source preview when the active plugin changes
  useEffect(() => { setShowSource(false); setShowEdit(false) }, [activePluginId])

  const handleReload = useCallback(() => {
    setIframeKey(k => k + 1)
  }, [])

  const handleClose = () => setActiveNavItem('chat')

  if (!plugin) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        gap: 12,
      }}>
        <Puzzle size={40} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t('pluginHost.notFound')}</div>
        <button
          onClick={() => openFolder()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <FolderOpen size={14} />
          {t('pluginHost.openPluginsDir')}
        </button>
      </div>
    )
  }

  const IconComp = getPluginIconComponent(plugin.manifest.icon, Puzzle)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Plugin Header Toolbar */}
      <div style={{
        height: 42,
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-nav)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        {/* Left: Icon, Name, Version, Source */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'rgba(99,102,241,0.12)',
            color: '#818cf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <IconComp size={15} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {getPluginDisplayName(plugin.manifest, resolvedLocale)}
            </span>
            {plugin.manifest.version && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                v{plugin.manifest.version}
              </span>
            )}
            <span style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 4,
              background: plugin.source === 'workspace' ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)',
              color: plugin.source === 'workspace' ? '#22c55e' : '#818cf8',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              {plugin.source}
            </span>
          </div>
        </div>

        {/* Right: Actions (Reload, Open Folder, Close) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleReload}
            title={t('pluginHost.reloadTitle')}
            style={{
              ...TOOLBAR_BTN,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <RotateCw size={12} />
            {t('pluginHost.reload')}
          </button>

          <button
            onClick={() => setShowSource(v => !v)}
            title={t('pluginHost.sourceTitle')}
            aria-pressed={showSource}
            style={{
              ...TOOLBAR_BTN,
              background: showSource ? 'rgba(99,102,241,0.14)' : 'transparent',
              border: `1px solid ${showSource ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
              color: showSource ? '#818cf8' : 'var(--text-secondary)',
            }}
          >
            <FileCode size={12} />
            {t('pluginHost.source')}
          </button>

          <button
            onClick={() => setShowEdit(v => !v)}
            title={t('pluginHost.editTitle')}
            aria-pressed={showEdit}
            style={{
              ...TOOLBAR_BTN,
              background: showEdit ? 'rgba(99,102,241,0.14)' : 'transparent',
              border: `1px solid ${showEdit ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
              color: showEdit ? '#818cf8' : 'var(--text-secondary)',
            }}
          >
            <Sparkles size={12} />
            {t('pluginHost.edit')}
          </button>

          <button
            onClick={handleClose}
            title={t('pluginHost.backToChat')}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Plugin Main Area — a flex row, so the edit drawer takes its width off the
          plugin rather than covering it: the frame always stays fully visible. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          {!plugin.valid ? (
            <div style={{
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
            }}>
              <AlertTriangle size={36} color="#f87171" />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t('pluginHost.loadFailed')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 450, textAlign: 'center' }}>
                {plugin.error || t('pluginHost.entryMissing')}
              </div>
              <button
                onClick={() => openFolder(plugin.manifest.id)}
                style={{
                  marginTop: 8,
                  padding: '6px 14px',
                  borderRadius: 8,
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t('pluginHost.openDirToCheck')}
              </button>
            </div>
          ) : (
          <iframe
            // Locale is passed via ?lang=; a change remounts so the plugin renders in the new language
            key={`${iframeKey}:${resolvedLocale}`}
            ref={iframeRef}
            src={`file:///${plugin.entryPath.replace(/\\/g, '/')}?lang=${resolvedLocale}`}
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups allow-downloads"
            title={getPluginDisplayName(plugin.manifest, resolvedLocale)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'var(--bg-primary)',
            }}
            onLoad={() => {
              sendThemeToIframe()
            }}
          />
          )}

          {/* Overlaid rather than swapped in: the frame above stays mounted, so an
              open source view never reboots the plugin (it keeps its state). */}
          {showSource && (
            <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-primary)' }}>
              <PluginSourcePreview
                key={plugin.manifest.id}
                plugin={plugin}
                onClose={() => setShowSource(false)}
                onOpenFolder={() => openFolder(plugin.manifest.id)}
              />
            </div>
          )}
        </div>

        {/* Edit drawer — a flex sibling, not an overlay: the plugin frame is
            squeezed to the remaining width and stays fully visible. It also keeps
            running, so a finished turn can just reload it to show the change. */}
        {showEdit && (
          <PluginEditDrawer
            key={plugin.manifest.id}
            plugin={plugin}
            onClose={() => setShowEdit(false)}
            onChanged={handleReload}
          />
        )}
      </div>
    </div>
  )
}
