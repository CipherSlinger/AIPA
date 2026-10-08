import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  X,
  FolderOpen,
  Send,
  Square,
  Wrench,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import type { NavPlugin, PluginEditEvent } from '../../../preload/index'
import { getPluginDisplayName } from './pluginIcons'
import { useI18n } from '../../i18n'

/**
 * AI edit drawer — the right-hand panel behind the toolbar's 「编辑」 button.
 *
 * The chat runs in the main process with the *plugin folder* as its working
 * directory, so the agent reads and rewrites the plugin's own files as the
 * conversation goes; every tool call is streamed here as it happens. When a
 * turn finishes we reload the plugin frame, so an edit shows up immediately.
 */
interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: Array<{ name: string; detail: string }>
  status?: string
  error?: boolean
}

let turnSeq = 0
const nextId = () => `t${++turnSeq}`

const HEADER_BTN: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 7px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 11,
  cursor: 'pointer',
}

export default function PluginEditDrawer({ plugin, onClose, onChanged }: {
  plugin: NavPlugin
  onClose: () => void
  onChanged: () => void
}) {
  const { t, resolvedLocale } = useI18n()
  const pluginId = plugin.manifest.id

  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  // The turn the stream is currently filling, and whether the session has been
  // opened yet (the first message starts it).
  const currentTurnRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const patchCurrent = useCallback((patch: (turn: Turn) => Turn) => {
    const id = currentTurnRef.current
    if (!id) return
    setTurns(prev => prev.map(turn => (turn.id === id ? patch(turn) : turn)))
  }, [])

  useEffect(() => {
    return window.electronAPI.onPluginEditEvent((event: PluginEditEvent) => {
      if (event.pluginId !== pluginId) return
      switch (event.type) {
        case 'delta':
          patchCurrent(turn => ({ ...turn, text: event.text, status: undefined }))
          break
        case 'tool':
          patchCurrent(turn => ({
            ...turn,
            status: undefined,
            // Repeats happen when the agent re-reads the same file — one chip is enough.
            tools: turn.tools.some(c => c.name === event.name && c.detail === event.detail)
              ? turn.tools
              : [...turn.tools, { name: event.name, detail: event.detail }],
          }))
          break
        case 'status':
          patchCurrent(turn => ({ ...turn, status: event.message }))
          break
        case 'done':
          patchCurrent(turn => ({ ...turn, text: event.text || turn.text, status: undefined }))
          currentTurnRef.current = null
          setBusy(false)
          onChanged()
          break
        case 'error':
          patchCurrent(turn => ({ ...turn, error: true, text: turn.text || event.message, status: undefined }))
          currentTurnRef.current = null
          setBusy(false)
          // The session may have died (crashed bridge, timeout); restarting it on
          // the next message costs nothing when it is still alive — the main
          // process routes that to a follow-up.
          startedRef.current = false
          break
      }
    })
  }, [pluginId, patchCurrent, onChanged])

  // Closing the drawer ends the session — an in-flight turn is cancelled.
  useEffect(() => {
    return () => { window.electronAPI.pluginEditClose(pluginId).catch(() => { /* nothing to close */ }) }
  }, [pluginId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  const send = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || busy) return

    const assistantId = nextId()
    currentTurnRef.current = assistantId
    setTurns(prev => [
      ...prev,
      { id: nextId(), role: 'user', text: prompt, tools: [] },
      { id: assistantId, role: 'assistant', text: '', tools: [] },
    ])
    setInput('')
    setBusy(true)

    try {
      if (startedRef.current) {
        await window.electronAPI.pluginEditSend(pluginId, prompt)
      } else {
        startedRef.current = true
        await window.electronAPI.pluginEditStart({ pluginId, prompt })
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      patchCurrent(turn => ({
        ...turn,
        error: true,
        text: raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''),
      }))
      currentTurnRef.current = null
      setBusy(false)
      startedRef.current = false
    }
  }, [input, busy, pluginId, patchCurrent])

  const stop = useCallback(() => {
    window.electronAPI.pluginEditAbort(pluginId).catch(() => { /* already stopped */ })
  }, [pluginId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const examples = [t('pluginEdit.examples.theme'), t('pluginEdit.examples.layout'), t('pluginEdit.examples.bug')]

  return (
    <div style={{
      // A flex sibling of the plugin frame, not an overlay: it takes 380px off
      // the plugin's width so the plugin stays fully visible beside it.
      flex: '0 0 380px',
      maxWidth: '70%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      background: 'var(--bg-primary)',
      borderLeft: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{
        height: 36,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--glass-shimmer)',
      }}>
        <Sparkles size={13} color="#818cf8" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('pluginEdit.title')}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => window.electronAPI.pluginNavOpenFolder(pluginId)}
            title={t('pluginHost.openFolderTitle')}
            style={HEADER_BTN}
          >
            <FolderOpen size={11} />
            {t('pluginHost.openFolder')}
          </button>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            style={{
              width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px' }}>
        {turns.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {t('pluginEdit.empty', { name: getPluginDisplayName(plugin.manifest, resolvedLocale) })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {examples.map(text => (
                <button
                  key={text}
                  onClick={() => { setInput(text); inputRef.current?.focus() }}
                  style={{
                    textAlign: 'left',
                    padding: '7px 9px',
                    borderRadius: 8,
                    border: '1px dashed var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    cursor: 'pointer',
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map(turn => (
            <div key={turn.id} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {turn.role === 'user' ? (
                <div style={{
                  alignSelf: 'flex-end',
                  maxWidth: '90%',
                  padding: '6px 10px',
                  borderRadius: '10px 10px 2px 10px',
                  background: 'rgba(99,102,241,0.14)',
                  border: '1px solid rgba(99,102,241,0.28)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {turn.text}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {turn.tools.map((tool, i) => (
                    <div key={`${tool.name}-${tool.detail}-${i}`} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                      overflow: 'hidden',
                    }}>
                      <Wrench size={10} color="#818cf8" style={{ flexShrink: 0 }} />
                      <span style={{ flexShrink: 0 }}>{tool.name}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tool.detail}
                      </span>
                    </div>
                  ))}

                  {turn.text && (
                    <div style={{
                      padding: '7px 10px',
                      borderRadius: '10px 10px 10px 2px',
                      background: 'var(--bg-hover)',
                      border: `1px solid ${turn.error ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
                      color: turn.error ? '#f87171' : 'var(--text-primary)',
                      fontSize: 12,
                      lineHeight: 1.65,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      display: 'flex',
                      gap: 6,
                    }}>
                      {turn.error && <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 3 }} />}
                      <span>{turn.text}</span>
                    </div>
                  )}

                  {/* A turn that only edited files carries no prose of its own. */}
                  {!turn.text && !turn.error && turn.tools.length > 0 && !busy && (
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', paddingLeft: 2 }}>
                      {t('pluginEdit.editsApplied')}
                    </div>
                  )}

                  {turn.status && (
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', paddingLeft: 2 }}>
                      {turn.status}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {busy && !turns.some(turn => turn.id === currentTurnRef.current && turn.text) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: 'var(--text-muted)', padding: '2px 2px 10px',
          }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            {t('pluginEdit.working')}
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'var(--bg-nav)',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('pluginEdit.placeholder')}
          rows={3}
          style={{
            width: '100%',
            resize: 'none',
            boxSizing: 'border-box',
            padding: '7px 9px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', flex: 1 }}>
            {t('pluginEdit.footerHint')}
          </span>
          {busy ? (
            <button
              onClick={stop}
              style={{
                ...HEADER_BTN,
                borderColor: 'rgba(248,113,113,0.45)',
                color: '#f87171',
              }}
            >
              <Square size={11} />
              {t('pluginEdit.stop')}
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              style={{
                ...HEADER_BTN,
                borderColor: input.trim() ? 'rgba(99,102,241,0.45)' : 'var(--border)',
                color: input.trim() ? '#818cf8' : 'var(--text-faint)',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              <Send size={11} />
              {t('pluginEdit.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
