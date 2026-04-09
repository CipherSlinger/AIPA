import React from 'react'
import { AtSign, TerminalSquare, Mic, MicOff, ListPlus, Paperclip, Camera, ShieldOff, Shield, Shrink, WrapText, AlignLeft, ClipboardList } from 'lucide-react'
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
  isPlanMode?: boolean
  onTogglePlanMode?: () => void
  isStreaming?: boolean
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
  isPlanMode,
  onTogglePlanMode,
  isStreaming: isStreamingProp,
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
      {/* Plan Mode toggle (Iteration 520) */}
      {onTogglePlanMode && (
        <button
          onClick={onTogglePlanMode}
          disabled={isStreamingProp}
          aria-pressed={isPlanMode}
          title={isPlanMode ? t('plan.exitHint') : t('plan.enterHint')}
          style={{
            ...toolbarBtnStyle,
            color: isPlanMode ? '#a78bfa' : 'var(--input-toolbar-icon)',
            background: isPlanMode ? 'rgba(167, 139, 250, 0.15)' : 'none',
            opacity: isStreamingProp ? 0.4 : 1,
            cursor: isStreamingProp ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={(e) => { if (!isPlanMode && !isStreamingProp) toolbarHoverIn(e) }}
          onMouseLeave={(e) => { if (!isPlanMode && !isStreamingProp) toolbarHoverOut(e) }}
        >
          <ClipboardList size={14} />
        </button>
      )}
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
