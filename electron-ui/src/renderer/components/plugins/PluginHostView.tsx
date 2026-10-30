import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  RotateCw,
  FolderOpen,
  AlertTriangle,
  Puzzle,
  FileCode,
  Sparkles,
  Cpu,
  ChevronDown,
  Check,
} from 'lucide-react'
import { usePluginStore } from '../../store/pluginStore'
import { useUiStore, usePrefsStore } from '../../store'
import { getPluginIconComponent, getPluginDisplayName } from './pluginIcons'
import PluginSourcePreview from './PluginSourcePreview'
import PluginEditDrawer from './PluginEditDrawer'
import { useI18n } from '../../i18n'
import type { PluginAiModel, PluginAiModelState } from '../../../preload/index'

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
  // The models a plugin may offer: enabled providers only, credentials stripped
  // by main. The plugin still decides which one a generation should use.
  'ai.models': { permission: 'ai', call: (api, id) => api.pluginAiModels(id) },
  // The user's work-model choice for this plugin, set from the toolbar. `get`
  // lets the plugin discover it; `set` lets the plugin change it, and main
  // pushes the stored value back to both surfaces.
  'ai.model.get': { permission: 'ai', call: (api, id) => api.pluginAiModel(id) },
  'ai.model.set': { permission: 'ai', call: (api, id, p) => api.pluginAiSetModel(id, String(p?.model ?? '')) },
  // An answer-only assistant turn: the answer comes back as the invoke result,
  // not as a stream. Private by default (no session); `visible: true` persists
  // a conversation the archive can open, which main announces separately.
  'chat.ask': {
    permission: 'chat',
    call: (api, id, p) => api.pluginChatAsk(id, {
      prompt: String(p?.prompt || ''),
      visible: p?.visible === true,
      // Continuing a conversation this plugin started: pass through the id an
      // earlier visible ask returned. Main owns every validation (ownership,
      // engine, visibility), so this only forwards a string.
      sessionId: typeof p?.sessionId === 'string' ? p.sessionId : undefined,
      title: typeof p?.title === 'string' ? p.title : undefined,
      timeoutMs: typeof p?.timeoutMs === 'number' ? p.timeoutMs : undefined,
    }),
  },
  // A plugin's own schedules. Main stamps `originPluginId` from the calling
  // plugin, and `action` is never accepted here: a plugin may schedule a prompt
  // of its own, not point the scheduler at one of the user's workflows. Every
  // other field is copied literally; main validates cadence, name and limits
  // and refuses with a coded error the response path lifts into `code`.
  'automation.create': {
    permission: 'schedule',
    call: (api, id, p) => api.pluginAutomationCreate(id, {
      name: String(p?.name || ''),
      prompt: String(p?.prompt || ''),
      trigger: p?.trigger,
      enabled: typeof p?.enabled === 'boolean' ? p.enabled : undefined,
      quietOnSuccess: typeof p?.quietOnSuccess === 'boolean' ? p.quietOnSuccess : undefined,
      retryOnFailure: typeof p?.retryOnFailure === 'boolean' ? p.retryOnFailure : undefined,
      dailyCostLimitUsd: typeof p?.dailyCostLimitUsd === 'number' && Number.isFinite(p.dailyCostLimitUsd)
        ? p.dailyCostLimitUsd
        : undefined,
    }),
  },
  // Neither call accepts a plugin id from the payload: main scopes both to the
  // calling plugin, so a plugin can never see or remove a job that is not its
  // own. Delete takes only the job id, as a string so a number or object cannot
  // reach the store lookup by accident.
  'automation.list': {
    permission: 'schedule',
    call: (api, id) => api.pluginAutomationList(id),
  },
  'automation.delete': {
    permission: 'schedule',
    call: (api, id, p) => api.pluginAutomationDelete(id, String(p?.id ?? '')),
  },
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

/** One selectable row of the work-model menu (also used for the clear row). */
const MODEL_MENU_ROW: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 12,
  textAlign: 'left',
  cursor: 'pointer',
}

const MODEL_MENU_NAME: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** Muted second line of a row: provider name or the unavailable note. */
const MODEL_MENU_NOTE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  maxWidth: 110,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const MODEL_MENU_NOTICE: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  color: 'var(--text-muted)',
  lineHeight: 1.45,
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

  // The active plugin's host-chosen "work model" and its picker. The model
  // state is what the toolbar button shows; the option list is loaded lazily
  // when the menu first opens, because it only changes with the provider setup.
  const [aiModel, setAiModel] = useState<PluginAiModelState | null>(null)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelOptions, setModelOptions] = useState<PluginAiModel[] | null>(null)
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false)
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  const plugins = usePluginStore(s => s.plugins)
  const activePluginId = usePluginStore(s => s.activePluginId)
  const openFolder = usePluginStore(s => s.openPluginFolder)
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

  // Each plugin has its own work model. Switching plugins resets everything the
  // toolbar cached, so a slow read started for the previous plugin cannot paint
  // into the new plugin's header.
  useEffect(() => {
    setAiModel(null)
    setModelMenuOpen(false)
    setModelOptions(null)
    setModelOptionsError(null)
    setModelOptionsLoading(false)
  }, [activePluginId])

  // Every plugin gets the picker: the toolbar is the same for every plugin, and
  // the choice belongs to the host, not to a capability the plugin happens to
  // declare. A plugin that never calls AI simply never spends it.
  // Read the saved model as soon as a plugin becomes active, not when the menu
  // first opens: the button must name the current model before anyone clicks.
  useEffect(() => {
    if (!activeManifestId) return
    let live = true
    const read = () => {
      window.electronAPI.pluginAiModel(activeManifestId)
        .then(state => { if (live) setAiModel(state) })
        .catch(() => { /* keep the neutral label; the menu surfaces real errors */ })
    }
    read()
    const off = window.electronAPI.onPluginAiModelChange((change) => {
      if (change.pluginId !== activeManifestId) return
      // The push carries only the id; re-read the state so the label and the
      // unavailable marker come from the same place the menu uses.
      read()
      // Keep the hosted plugin in step: a change made in the toolbar (or by
      // another surface) must reach a page that may still hold the old id.
      iframeRef.current?.contentWindow?.postMessage({ type: 'aipa:ai:model', model: change.model }, '*')
    })
    return () => {
      live = false
      off()
    }
  }, [activeManifestId])

  // Outside click / Escape close the mini menu. The listeners exist only while
  // it is open, so nothing outlives the menu, a plugin switch or unmount.
  useEffect(() => {
    if (!modelMenuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) setModelMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenuOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [modelMenuOpen])

  // Handle bidirectional bridge messages from the plugin iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      const plugin = pluginRef.current

      // Every bridge message must originate from the hosted plugin frame
      // itself, not merely look like one. A plugin page may embed its own
      // iframes (video, docs, maps), and those could otherwise forge
      // `aipa:storage:set` / `aipa:sendPrompt` / `aipa:openPlugin` into the
      // host. `event.source` is set by the browser and cannot be spoofed, so
      // this single check covers every message type below.
      const target = iframeRef.current?.contentWindow
      if (!target || event.source !== target) return

      if (data.type === 'aipa:invoke') {
        if (!plugin) return
        const method = String(data.method || '')
        const reply = (body: Record<string, unknown>) =>
          target.postMessage({ type: 'aipa:response', requestId: data.requestId, ...body }, '*')
        const spec = Object.prototype.hasOwnProperty.call(INVOKE_METHODS, method) ? INVOKE_METHODS[method] : undefined
        if (!spec) {
          reply({ ok: false, error: `未知的宿主能力：${method}`, code: 'unknown_method' })
          return
        }
        if (!plugin.manifest.permissions?.includes(spec.permission)) {
          reply({ ok: false, error: `插件未声明 "${spec.permission}" 权限（plugin.json → permissions）`, code: 'permission_denied' })
          return
        }
        spec.call(window.electronAPI, plugin.manifest.id, data.payload)
          .then(result => reply({ ok: true, result }))
          .catch(err => {
            // Main-process capabilities prefix their message with a stable
            // `[code]` (IPC only carries the message string), so lift it into
            // a typed field the plugin can branch on.
            const message = errorMessage(err)
            const coded = /^\[([a-z_]+)\]\s*([\s\S]*)$/.exec(message)
            reply(coded
              ? { ok: false, error: coded[2], code: coded[1] }
              : { ok: false, error: message })
          })
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

  const handleModelMenu = useCallback(() => {
    if (modelMenuOpen) {
      setModelMenuOpen(false)
      return
    }
    setModelMenuOpen(true)
    // The list only changes with the provider setup, so load it the first time
    // this plugin's menu opens and keep it until the active plugin changes.
    if (modelOptions !== null || modelOptionsLoading) return
    const id = pluginRef.current?.manifest.id
    if (!id) return
    setModelOptionsLoading(true)
    setModelOptionsError(null)
    window.electronAPI.pluginAiModels(id)
      .then(options => {
        // Ignore a list that arrives after the user switched plugins.
        if (pluginRef.current?.manifest.id === id) setModelOptions(options)
      })
      .catch(err => {
        if (pluginRef.current?.manifest.id === id) setModelOptionsError(errorMessage(err))
      })
      .finally(() => {
        if (pluginRef.current?.manifest.id === id) setModelOptionsLoading(false)
      })
  }, [modelMenuOpen, modelOptions, modelOptionsLoading])

  const chooseModel = useCallback(async (model: string) => {
    const id = pluginRef.current?.manifest.id
    if (!id) return
    setModelMenuOpen(false)
    try {
      const state = await window.electronAPI.pluginAiSetModel(id, model)
      setAiModel(state)
      addToast('success', t('pluginHost.modelSaved'))
    } catch (err) {
      addToast('error', errorMessage(err))
    }
  }, [addToast, t])

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
        {/* Left: Icon, Name, Version */}
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

          {/* Work model: every plugin gets the same picker, whether or not it
              calls AI today — the toolbar is one layout, and the choice is the
              user's, not a capability the plugin declares. It sits between
              Reload and Source because it describes what the plugin runs on,
              not the page itself. */}
          <div ref={modelMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={handleModelMenu}
              title={t('pluginHost.modelTitle')}
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              style={{
                ...TOOLBAR_BTN,
                background: modelMenuOpen ? 'rgba(99,102,241,0.14)' : 'transparent',
                border: `1px solid ${modelMenuOpen ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
                color: modelMenuOpen ? 'var(--accent-text)' : 'var(--text-secondary)',
              }}
            >
              <Cpu size={12} style={{ flexShrink: 0 }} />
              <span style={{
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {aiModel?.model ? (aiModel.name || aiModel.model) : t('pluginHost.modelPick')}
              </span>
              <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.65 }} />
            </button>

            {modelMenuOpen && (
              <div
                role="listbox"
                aria-label={t('pluginHost.modelTitle')}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  zIndex: 60,
                  minWidth: 240,
                  maxWidth: 320,
                  maxHeight: 320,
                  overflowY: 'auto',
                  padding: 4,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
                }}
              >
                <button
                  role="option"
                  aria-selected={!aiModel?.model}
                  onClick={() => chooseModel('')}
                  style={MODEL_MENU_ROW}
                >
                  <span style={MODEL_MENU_NAME}>{t('pluginHost.modelNone')}</span>
                  {!aiModel?.model && <Check size={12} color="var(--accent-text)" style={{ flexShrink: 0 }} />}
                </button>

                {/* A saved model the current provider setup no longer offers
                    stays visible as the current selection. It is not clickable
                    because saving it again would be refused; clearing it is. */}
                {aiModel?.model && !aiModel.available && (
                  <div
                    role="option"
                    aria-selected
                    aria-disabled
                    style={{ ...MODEL_MENU_ROW, cursor: 'default' }}
                  >
                    <span style={MODEL_MENU_NAME}>{aiModel.name || aiModel.model}</span>
                    <span style={MODEL_MENU_NOTE}>{t('pluginHost.modelUnavailable')}</span>
                    <Check size={12} color="var(--accent-text)" style={{ flexShrink: 0 }} />
                  </div>
                )}

                {modelOptionsError ? (
                  <div style={MODEL_MENU_NOTICE}>{modelOptionsError}</div>
                ) : modelOptionsLoading ? (
                  <div style={MODEL_MENU_NOTICE}>{t('common.loading')}</div>
                ) : modelOptions === null ? null : modelOptions.length === 0 ? (
                  <div style={MODEL_MENU_NOTICE}>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{t('pluginHost.modelEmpty')}</div>
                    <div style={{ marginTop: 2 }}>{t('pluginHost.modelEmptyHint')}</div>
                  </div>
                ) : (
                  modelOptions.map(option => {
                    const selected = aiModel?.model === option.id
                    return (
                      <button
                        key={option.id}
                        role="option"
                        aria-selected={selected}
                        onClick={() => chooseModel(option.id)}
                        style={MODEL_MENU_ROW}
                      >
                        <span style={MODEL_MENU_NAME}>{option.name || option.id}</span>
                        {/* `default` means no provider owns the id: the turn
                            runs on the default engine, so there is no provider
                            name to print rather than a made-up one. */}
                        {option.providerName && <span style={MODEL_MENU_NOTE}>{option.providerName}</span>}
                        {selected && <Check size={12} color="var(--accent-text)" style={{ flexShrink: 0 }} />}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowSource(v => !v)}
            title={t('pluginHost.sourceTitle')}
            aria-pressed={showSource}
            style={{
              ...TOOLBAR_BTN,
              background: showSource ? 'rgba(99,102,241,0.14)' : 'transparent',
              border: `1px solid ${showSource ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
              color: showSource ? 'var(--accent-text)' : 'var(--text-secondary)',
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
              color: showEdit ? 'var(--accent-text)' : 'var(--text-secondary)',
            }}
          >
            <Sparkles size={12} />
            {t('pluginHost.edit')}
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
            src={`${plugin.url}?lang=${resolvedLocale}`}
            // allow-same-origin is required by localStorage (the frames throw
            // SecurityError without it). Isolation comes from the scheme instead:
            // each plugin's URL has its own host, so its origin — and therefore its
            // storage — is separate from the app and from every other plugin.
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
