import React from 'react'
import { AtSign, TerminalSquare, Mic, MicOff, ListPlus, Cpu, Paperclip, Camera, ShieldOff, Shield, Shrink, WrapText, AlignLeft } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import ClipboardActionsMenu from './ClipboardActionsMenu'
import InputToolbarTextTransform from './InputToolbarTextTransform'
import InputToolbarSaveNote from './InputToolbarSaveNote'
import InputToolbarStyleSelector from './InputToolbarStyleSelector'
import EffortPicker from './EffortPicker'
import { toolbarBtnStyle, toolbarHoverIn, toolbarHoverOut } from './chatInputConstants'

interface InputToolbarProps {
  listening: boolean
  recordingSeconds: number
  toggleSpeech: () => void
  onAtClick: () => void
  onSlashClick: () => void
  onQueueClick: () => void
  onSend: (text: string) => Promise<void>
  onAttachFiles: () => void
  onScreenshot: () => void
  fileAttachmentCount: number
  hasInput: boolean
  inputText: string
  multiLineMode?: boolean
  onToggleMultiLine?: () => void
}

export default function InputToolbar({
  listening,
  recordingSeconds,
  toggleSpeech,
  onAtClick,
  onSlashClick,
  onQueueClick,
  onSend,
  onAttachFiles,
  onScreenshot,
  fileAttachmentCount,
  hasInput,
  inputText,
  multiLineMode,
  onToggleMultiLine,
}: InputToolbarProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const taskQueue = useChatStore(s => s.taskQueue)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6, paddingLeft: 4 }}>
      {/* @ mention */}
      <button
        onClick={onAtClick}
        title={t('toolbar.insertMention')}
        style={toolbarBtnStyle}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={toolbarHoverOut}
      >
        <AtSign size={16} />
      </button>
      {/* Attach files */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={onAttachFiles}
          title={t('toolbar.attachFiles')}
          style={{
            ...toolbarBtnStyle,
            color: fileAttachmentCount > 0 ? 'var(--accent)' : 'var(--input-toolbar-icon)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0, 122, 204, 0.10)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = fileAttachmentCount > 0 ? 'var(--accent)' : 'var(--input-toolbar-icon)'; e.currentTarget.style.background = 'none' }}
        >
          <Paperclip size={16} />
        </button>
        {fileAttachmentCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 14,
            height: 14,
            background: 'var(--accent)',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 600,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            {fileAttachmentCount > 9 ? '9+' : fileAttachmentCount}
          </span>
        )}
      </div>
      {/* Screenshot capture */}
      <button
        onClick={onScreenshot}
        title={t('toolbar.captureScreen')}
        style={toolbarBtnStyle}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={toolbarHoverOut}
      >
        <Camera size={16} />
      </button>
      {/* / slash command */}
      <button
        onClick={onSlashClick}
        title={t('toolbar.insertSlashCommand')}
        style={toolbarBtnStyle}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={toolbarHoverOut}
      >
        <TerminalSquare size={16} />
      </button>
      {/* Voice input with enhanced recording indicator */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {/* Pulsing ring animation when recording */}
        {listening && (
          <div
            style={{
              position: 'absolute',
              top: -2, left: -2, right: -2, bottom: -2,
              borderRadius: '50%',
              border: '2px solid var(--error)',
              animation: 'voicePulse 1.5s ease-in-out infinite',
              pointerEvents: 'none',
              width: 30, height: 30,
            }}
          />
        )}
        <button
          onClick={toggleSpeech}
          title={listening ? t('toolbar.stopRecording') : t('toolbar.voiceInput')}
          style={{
            ...toolbarBtnStyle,
            background: listening ? 'var(--error)' : 'none',
            color: listening ? '#fff' : 'var(--input-toolbar-icon)',
          }}
          onMouseEnter={(e) => { if (!listening) toolbarHoverIn(e) }}
          onMouseLeave={(e) => { if (!listening) toolbarHoverOut(e) }}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        {/* Recording duration counter */}
        {listening && recordingSeconds > 0 && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--error)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            animation: 'voiceFadeIn 0.3s ease-in',
          }}>
            {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
          </span>
        )}
      </div>
      {/* Clipboard actions */}
      <ClipboardActionsMenu onSend={onSend} />
      {/* Text transform */}
      <InputToolbarTextTransform inputText={inputText} onSend={onSend} />
      {/* Favorite prompts */}
      {/* Save input as note */}
      <InputToolbarSaveNote inputText={inputText} />
      {/* Model indicator chip */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'P' }))}
        title={t('chat.switchModel')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 9,
          flexShrink: 0,
          transition: 'border-color 150ms, color 150ms',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <Cpu size={9} />
        {(() => {
          const m = prefs.model || 'claude-sonnet-4-6'
          const parts = m.replace('claude-', '').split('-')
          return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? ' ' + parts.slice(1).join('.') : '')
        })()}
      </button>
      {/* Response tone selector */}
      <InputToolbarStyleSelector />
      {/* Effort level dropdown picker */}
      <EffortPicker />
      {/* Skip permissions toggle */}
      {(() => {
        const skipPerms = prefs.skipPermissions ?? false
        return (
          <button
            onClick={() => {
              const next = !skipPerms
              usePrefsStore.getState().setPrefs({ skipPermissions: next })
              window.electronAPI.prefsSet('skipPermissions', next)
              useUiStore.getState().addToast(
                next ? 'warning' : 'info',
                next ? t('toolbar.skipPermsOn') : t('toolbar.skipPermsOff'),
              )
            }}
            title={skipPerms ? t('toolbar.skipPermsOnTitle') : t('toolbar.skipPermsOffTitle')}
            style={{
              ...toolbarBtnStyle,
              color: skipPerms ? 'var(--warning)' : 'var(--input-toolbar-icon)',
              background: skipPerms ? 'rgba(234, 179, 8, 0.12)' : 'none',
            }}
            onMouseEnter={(e) => { if (!skipPerms) toolbarHoverIn(e) }}
            onMouseLeave={(e) => { if (!skipPerms) toolbarHoverOut(e) }}
          >
            {skipPerms ? <ShieldOff size={14} /> : <Shield size={14} />}
          </button>
        )
      })()}
      {/* Manual compact button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('aipa:compact'))}
        title={t('toolbar.compactContext')}
        style={toolbarBtnStyle}
        onMouseEnter={toolbarHoverIn}
        onMouseLeave={toolbarHoverOut}
      >
        <Shrink size={14} />
      </button>
      {/* Multi-line mode toggle (Iteration 418) */}
      {onToggleMultiLine && (
        <button
          onClick={onToggleMultiLine}
          title={multiLineMode ? t('input.multiLineOn') : t('input.multiLineOff')}
          style={{
            ...toolbarBtnStyle,
            color: multiLineMode ? 'var(--accent)' : 'var(--input-toolbar-icon)',
            background: multiLineMode ? 'rgba(0, 122, 204, 0.12)' : 'none',
          }}
          onMouseEnter={(e) => { if (!multiLineMode) toolbarHoverIn(e) }}
          onMouseLeave={(e) => { if (!multiLineMode) toolbarHoverOut(e) }}
        >
          {multiLineMode ? <AlignLeft size={14} /> : <WrapText size={14} />}
        </button>
      )}
      <span style={{ flex: 1 }} />
      {/* Queue button */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={onQueueClick}
          disabled={!hasInput}
          aria-label={t('taskQueue.addToQueue')}
          title={t('taskQueue.addToQueueShortcut')}
          style={{
            ...toolbarBtnStyle,
            color: taskQueue.length > 0 ? '#a78bfa' : 'var(--input-toolbar-icon)',
            cursor: hasInput ? 'pointer' : 'not-allowed',
            opacity: hasInput ? 1 : 0.4,
          }}
          onMouseEnter={(e) => {
            if (hasInput) {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#a78bfa'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 92, 246, 0.10)'
            }
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = taskQueue.length > 0 ? '#a78bfa' : 'var(--input-toolbar-icon)'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
          }}
        >
          <ListPlus size={16} />
        </button>
        {taskQueue.length > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 14,
            height: 14,
            background: '#8b5cf6',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 600,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            {taskQueue.length > 9 ? '9+' : taskQueue.length}
          </span>
        )}
      </div>
    </div>
  )
}
