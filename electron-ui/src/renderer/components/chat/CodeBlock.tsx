// CodeBlock — extracted from MessageContent.tsx (Iteration 220)
// Sub-components: CopyButton, WrapToggleButton, CollapsiblePre, CodeBlockWithHeader, PreviewButton
// Iteration 510: Added RunButton + SaveButton for actionable code blocks
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Copy, Check, ChevronDown, ChevronUp, WrapText, Play, X, Download, Loader2, Square, RotateCcw, MessageCircle, FolderOpen } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useSessionStore, useUiStore } from '../../store'
import { grantOutcome, pickFolderToGrant } from '../../lib/grantFolder'
import { CODE_COLLAPSE_THRESHOLD } from './messageContentConstants'
import RunConfirmDialog from './RunConfirmDialog'
import { useBlockRun, formatElapsed, type BlockRunState } from './useBlockRun'
import { blockGrantOffer, blockGrantOutcome } from './blockRunGrant'
import { planRunInFolder, runFolderNote, type RunFolderNote } from './blockRunFolder'
import { SHELL_OUTPUT_CAP } from './shellOutput'
import { buildRunDraft, planOutputCopy } from './runFollowThrough'
import { prepareTerminalCommand } from './terminalSend'
import SendToTerminalButton from './SendToTerminalButton'
import { useTerminalStore } from '../../store/terminalStore'

// Languages that support live preview
const PREVIEWABLE_LANGS = new Set(['html', 'svg', 'css', 'javascript', 'js', 'jsx', 'htm'])

// Languages that represent shell commands (show Run button)
const SHELL_LANGS = new Set(['bash', 'sh', 'zsh', 'shell', 'powershell', 'cmd', 'bat', 'ps1'])

// Map language names to default file extensions for Save dialog
const LANG_EXTENSIONS: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py', ruby: 'rb', java: 'java',
  kotlin: 'kt', swift: 'swift', go: 'go', rust: 'rs', c: 'c', cpp: 'cpp',
  csharp: 'cs', php: 'php', html: 'html', htm: 'html', css: 'css', scss: 'scss',
  less: 'less', json: 'json', yaml: 'yaml', yml: 'yml', xml: 'xml',
  markdown: 'md', sql: 'sql', bash: 'sh', sh: 'sh', zsh: 'zsh',
  powershell: 'ps1', cmd: 'bat', bat: 'bat', dockerfile: 'Dockerfile',
  makefile: 'Makefile', toml: 'toml', ini: 'ini', lua: 'lua', perl: 'pl',
  r: 'r', dart: 'dart', scala: 'scala', elixir: 'ex', haskell: 'hs',
  jsx: 'jsx', tsx: 'tsx', vue: 'vue', svelte: 'svelte',
  graphql: 'graphql', proto: 'proto', text: 'txt', txt: 'txt',
  svg: 'svg', ps1: 'ps1', shell: 'sh', code: 'txt',
}

function wrapForPreview(code: string, lang: string): string {
  const l = lang.toLowerCase()
  if (l === 'svg') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100%;background:#080810;}</style></head><body>${code}</body></html>`
  }
  if (l === 'css') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${code}</style></head><body><div class="preview">CSS Preview</div></body></html>`
  }
  if (l === 'javascript' || l === 'js' || l === 'jsx') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:8px;font-family:system-ui,sans-serif;color:#e0e0e0;background:#080810;}</style></head><body><div id="root"></div><script>${code}<\/script></body></html>`
  }
  // html, htm — render as-is
  return code
}

function PreviewButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const t = useT()
  return (
    <button
      onClick={onToggle}
      title={active ? t('message.closePreview') : t('message.preview')}
      className="code-action"
      style={{
        background: active ? 'rgba(99,102,241,0.3)' : 'var(--code-btn-bg)',
        border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'var(--code-border)'}`,
        // One 6px radius for every control in the code header. They were
        // 6 and 8, so the row of buttons was visibly ragged.
        borderRadius: 6,
        padding: '2px 6px',
        color: active ? '#a5b4fc' : 'var(--code-text-muted)',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        transition: 'all 0.15s ease',
      }}
    >
      {active ? <X size={11} /> : <Play size={11} />}
      {active ? t('message.closePreview') : t('message.preview')}
    </button>
  )
}

function PreviewPane({ code, lang }: { code: string; lang: string }) {
  const t = useT()
  const srcDoc = wrapForPreview(code, lang)
  return (
    <div
      style={{
        border: '1px solid rgba(99,102,241,0.3)',
        borderTop: 'none',
        // 9px = the code block's 10px outer radius minus its 1px border; the
        // preview pane sits inside the same frame as the pre above it.
        borderRadius: '0 0 9px 9px',
        overflow: 'hidden',
        background: '#080810',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          background: 'rgba(99,102,241,0.1)',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
          fontSize: 11,
          color: '#a5b4fc',
        }}
      >
        <Play size={10} />
        {t('tool.livePreview')}
      </div>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        style={{
          width: '100%',
          height: 200,
          border: 'none',
          background: '#fff',
        }}
        title={t('tool.codePreview')}
      />
    </div>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const t = useT()

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      // The always-visible copy affordance: same geometry as the other header
      // buttons, with a light focus ring that stays legible on the dark header
      // in both app themes (see .code-action in globals.css).
      className="code-action"
      style={{
        background: copied ? 'rgba(74,222,128,0.15)' : 'var(--code-btn-bg)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'var(--code-border)'}`,
        borderRadius: 6,
        padding: '2px 6px',
        color: copied ? '#4ade80' : 'var(--code-text-muted)',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.15s ease',
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? t('message.codeCopied') : t('message.copyCode')}
    </button>
  )
}

function RunButton({
  onRun,
  disabled,
  running,
}: {
  onRun: () => void
  disabled: boolean
  running: boolean
}) {
  const t = useT()
  return (
    <button
      onClick={onRun}
      disabled={disabled}
      aria-disabled={disabled}
      aria-busy={running || undefined}
      aria-label={disabled ? t('codeAction.run.running') : t('codeAction.runInTerminal')}
      title={disabled ? t('codeAction.run.running') : t('codeAction.runInTerminal')}
      className="code-action"
      style={{
        background: 'rgba(63,185,80,0.15)',
        border: '1px solid rgba(63,185,80,0.3)',
        borderRadius: 6,
        padding: '2px 6px',
        color: '#4ade80',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.65 : 1,
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.15s ease',
      }}
    >
      {running
        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
        : <Play size={11} />}
      {running ? t('codeAction.run.running') : t('codeAction.run')}
    </button>
  )
}

/** Status row and streaming output for one run of this block. */
function RunOutputPanel({
  run,
  elapsedMs,
  onStop,
  onToggleOutput,
  onRunAgain,
  onCopyOutput,
  onAskAipa,
  grantOffer,
  granting,
  grantElsewhere,
  onGrantFolder,
  folderNote,
  pickingFolder,
  onRunInFolder,
}: {
  run: BlockRunState
  elapsedMs: number
  onStop: () => void
  onToggleOutput: () => void
  onRunAgain: () => void
  onCopyOutput: () => void
  onAskAipa: () => void
  /** Present only when this failure is a folder refusal that named its folder. */
  grantOffer: { folder: string } | null
  /** True while the OS dialog is open; the button cannot be pressed twice. */
  granting: boolean
  /** The different folder the user confirmed, if that was the dialog's answer. */
  grantElsewhere: string | null
  onGrantFolder: () => void
  /** Names the folder this attempt used, when the panel must say which one. */
  folderNote: RunFolderNote | null
  /** True while the "another folder" dialog is open; one dialog at a time. */
  pickingFolder: boolean
  onRunInFolder: () => void
}) {
  const t = useT()
  const outputRef = useRef<HTMLPreElement>(null)
  const stickToBottom = useRef(true)
  const running = run.status === 'running'
  // One folder dialog at a time, whichever of the two buttons opened it.
  const dialogBusy = granting || pickingFolder
  const showOutput = running || run.outputVisible
  // The pre shows "No output." when there is none; Copy has nothing to write,
  // so it says why instead of reporting a successful copy of an empty string.
  const copyable = run.output.length > 0

  // Follow the tail while the command runs, but stop following as soon as the
  // user scrolls up to read something earlier.
  useEffect(() => {
    const el = outputRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [run.output, run.status, showOutput])

  let tone = 'var(--code-text-muted)'
  let label = ''
  switch (run.status) {
    case 'running':
      tone = '#a5b4fc'
      label = `${t('codeAction.run.running')} · ${t('codeAction.run.elapsed', { time: formatElapsed(elapsedMs) })}`
      break
    case 'exited':
      if (run.exitCode === 0) {
        tone = '#4ade80'
        label = t('codeAction.run.exited', { code: 0 })
      } else if (run.exitCode !== null) {
        // Non-zero is a warning, not a failure of the app: the command ran and
        // told us something went wrong.
        tone = '#fbbf24'
        label = t('codeAction.run.exited', { code: run.exitCode })
      } else {
        tone = '#fbbf24'
        label = t('codeAction.run.exitedSignal', { signal: run.signal || t('codeAction.run.unknownError') })
      }
      break
    case 'stopped':
      tone = '#fbbf24'
      label = run.stoppedReason === 'timeout'
        ? t('codeAction.run.stoppedAfterTimeout', {
          seconds: Math.round((run.timeoutMs ?? 120_000) / 1000),
        })
        : run.exitCode !== null
          ? t('codeAction.run.stoppedWithCode', { code: run.exitCode })
          : t('codeAction.run.stopped')
      break
    case 'failed':
      tone = '#f87171'
      label = t('codeAction.run.couldNotStart', {
        reason: run.failureMessage || t('codeAction.run.unknownError'),
      })
      break
    default:
      break
  }

  const controlStyle: React.CSSProperties = {
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    background: 'var(--code-btn-bg)',
    border: '1px solid var(--code-border)',
    color: 'var(--code-text-muted)',
  }

  return (
    <div style={{ borderTop: '1px solid var(--code-border)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 4,
          gap: 8,
          padding: '5px 12px',
          background: 'var(--code-header-bg)',
          borderBottom: showOutput ? '1px solid var(--code-border)' : 'none',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: tone,
            flexShrink: 0,
          }}
        />
        <span
          aria-live="polite"
          style={{ fontSize: 11, color: tone, fontVariantNumeric: 'tabular-nums' }}
        >
          {label}
        </span>
        {/*
          Which folder this attempt used. Quiet, shortened with `~` under home,
          the full path in the title — and absent for an ordinary run in the
          working directory, so a cancelled dialog leaves the panel untouched.
        */}
        {folderNote && (
          <span
            title={folderNote.title}
            style={{
              fontSize: 10,
              color: 'var(--code-text-muted)',
              maxWidth: 280,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {folderNote.text}
          </span>
        )}
        {running && elapsedMs >= 30_000 && (
          <span style={{ fontSize: 10, color: 'var(--code-text-muted)' }}>
            {t('codeAction.run.stillRunning')}
          </span>
        )}
        {run.truncated && (
          <span style={{ fontSize: 10, color: 'var(--code-text-muted)' }}>
            {t('codeAction.run.truncated', { chars: SHELL_OUTPUT_CAP.toLocaleString() })}
          </span>
        )}
        {/*
          The last surface that could only fail: the label is the consent for
          both halves of the action (grant, then run the same command in the
          same folder). It is only rendered from the offer predicate, so a
          missing folder or an invalid command never shows it.
        */}
        {grantOffer && (
          <button
            type="button"
            onClick={onGrantFolder}
            disabled={dialogBusy}
            aria-disabled={dialogBusy}
            aria-busy={dialogBusy || undefined}
            title={t('codeAction.run.grant.action')}
            style={{
              ...controlStyle,
              cursor: dialogBusy ? 'default' : 'pointer',
              opacity: dialogBusy ? 0.65 : 1,
            }}
          >
            <FolderOpen size={9} />
            {t('codeAction.run.grant.action')}
          </button>
        )}
        {grantOffer && grantElsewhere && (
          <span style={{ fontSize: 10, color: 'var(--code-text-muted)', lineHeight: 1.5 }}>
            {t('codeAction.run.grant.elsewhere', {
              picked: grantElsewhere,
              cwd: grantOffer.folder,
            })}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {running ? (
          <button
            onClick={onStop}
            disabled={run.stopping}
            aria-label={t('codeAction.run.stop')}
            style={{
              ...controlStyle,
              cursor: run.stopping ? 'default' : 'pointer',
              opacity: run.stopping ? 0.6 : 1,
              borderColor: 'rgba(251,191,36,0.35)',
              color: '#fbbf24',
            }}
          >
            <Square size={9} />
            {run.stopping ? t('codeAction.run.stopping') : t('codeAction.run.stop')}
          </button>
        ) : (
          <>
            {/*
              A second run is still a run the user authorizes: this opens the
              same confirmation dialog as the header's Run (CodeBlock passes
              handleRunRequest, whose first act is setShowRunConfirm(true)).
              It is absent while the command runs — Stop already owns that slot.
            */}
            <button
              onClick={onRunAgain}
              aria-label={t('codeAction.run.runAgain')}
              title={t('codeAction.run.runAgain')}
              style={controlStyle}
            >
              <RotateCcw size={9} />
              {t('codeAction.run.runAgain')}
            </button>
            {/*
              A run in another folder: the OS dialog is the grant, and its
              answer decides both halves. Disabled while that dialog is open so
              one press is one dialog; absent while a command runs.
            */}
            <button
              onClick={onRunInFolder}
              disabled={dialogBusy}
              aria-disabled={dialogBusy}
              aria-busy={dialogBusy || undefined}
              aria-label={t('codeAction.run.folder.action')}
              title={t('codeAction.run.folder.actionTitle')}
              style={{
                ...controlStyle,
                cursor: dialogBusy ? 'default' : 'pointer',
                opacity: dialogBusy ? 0.65 : 1,
              }}
            >
              <FolderOpen size={9} />
              {t('codeAction.run.folder.action')}
            </button>
            <button
              onClick={onCopyOutput}
              disabled={!copyable}
              aria-disabled={!copyable}
              aria-label={copyable ? t('codeAction.run.copyOutput') : t('codeAction.run.copyEmpty')}
              title={copyable ? t('codeAction.run.copyOutput') : t('codeAction.run.copyEmpty')}
              style={{
                ...controlStyle,
                cursor: copyable ? 'pointer' : 'default',
                opacity: copyable ? 1 : 0.6,
              }}
            >
              <Copy size={9} />
              {t('codeAction.run.copyOutput')}
            </button>
            <button
              onClick={onAskAipa}
              aria-label={t('codeAction.run.askAipa')}
              title={t('codeAction.run.askAipa')}
              style={controlStyle}
            >
              <MessageCircle size={9} />
              {t('codeAction.run.askAipa')}
            </button>
            <button
              onClick={onToggleOutput}
              aria-expanded={run.outputVisible}
              aria-label={run.outputVisible ? t('codeAction.run.hide') : t('codeAction.run.show')}
              style={controlStyle}
            >
              {run.outputVisible ? t('codeAction.run.hide') : t('codeAction.run.show')}
            </button>
          </>
        )}
      </div>
      {showOutput && (
        <pre
          ref={outputRef}
          aria-label={t('codeAction.run.outputLabel')}
          onScroll={() => {
            const el = outputRef.current
            if (!el) return
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          style={{
            margin: 0,
            padding: '10px 12px',
            maxHeight: 240,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: 'var(--code-surface)',
            color: '#c9d1d9',
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {run.output || (
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>
              {running ? t('codeAction.run.noOutputYet') : t('codeAction.run.noOutput')}
            </span>
          )}
        </pre>
      )}
    </div>
  )
}

function SaveButton({ code, langName }: { code: string; langName: string }) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)

  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return
    const ext = LANG_EXTENSIONS[langName.toLowerCase()] || 'txt'
    const defaultName = `untitled.${ext}`
    const filters = [
      { name: ext.toUpperCase() + ' File', extensions: [ext] },
      { name: 'All Files', extensions: ['*'] },
    ]
    try {
      const filePath = await window.electronAPI.fsShowSaveDialog(defaultName, filters)
      if (!filePath) return // user canceled
      const result = await window.electronAPI.fsWriteFile(filePath, code)
      if (result && (result as any).error) {
        addToast('error', t('codeAction.saveFailed', { error: (result as any).error }))
      } else {
        addToast('success', t('codeAction.savedToFile', { path: filePath }))
      }
    } catch (err) {
      addToast('error', t('codeAction.saveFailed', { error: String(err) }))
    }
  }, [code, langName, addToast, t])

  return (
    <button
      onClick={handleSave}
      aria-label={t('codeAction.saveToFile')}
      title={t('codeAction.saveToFile')}
      className="code-action"
      style={{
        background: 'var(--code-btn-bg)',
        border: '1px solid var(--code-border)',
        borderRadius: 6,
        padding: '2px 6px',
        color: 'var(--code-text-muted)',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.15s ease',
      }}
    >
      <Download size={11} />
      {t('codeAction.save')}
    </button>
  )
}

function WrapToggleButton({ wrapped, onToggle }: { wrapped: boolean; onToggle: () => void }) {
  const t = useT()
  return (
    <button
      onClick={onToggle}
      title={wrapped ? t('message.disableWordWrap') : t('message.enableWordWrap')}
      className="code-action"
      style={{
        background: wrapped ? 'rgba(255,255,255,0.16)' : 'var(--code-btn-bg)',
        border: '1px solid var(--code-border)',
        borderRadius: 6,
        padding: '2px 6px',
        color: wrapped ? '#ffffff' : 'var(--code-text-muted)',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        transition: 'all 0.15s ease',
      }}
    >
      <WrapText size={11} />
    </button>
  )
}

function CollapsiblePre({ children, className }: { children: React.ReactNode; className?: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [isOverflow, setIsOverflow] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const t = useT()

  useEffect(() => {
    const el = preRef.current
    if (el && el.scrollHeight > CODE_COLLAPSE_THRESHOLD) {
      setIsOverflow(true)
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <pre
        ref={preRef}
        style={{
          margin: 0,
          borderRadius: '0 0 9px 9px',
          borderTop: '1px solid var(--code-border)',
          // The bundled highlight theme (github-dark) paints the <code> itself,
          // so the panel behind it stays dark in both themes by design.
          background: 'var(--code-surface)',
          lineHeight: 1.5,
          maxHeight: isOverflow && collapsed ? CODE_COLLAPSE_THRESHOLD : undefined,
          overflow: isOverflow && collapsed ? 'hidden' : undefined,
        }}
      >
        {children}
      </pre>
      {isOverflow && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="code-action"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '4px 0',
            background: collapsed ? 'linear-gradient(transparent, rgba(12,12,22,0.98))' : 'var(--code-header-bg)',
            border: collapsed ? 'none' : '1px solid var(--code-border)',
            borderTop: collapsed ? 'none' : '1px solid var(--code-border)',
            borderRadius: collapsed ? 0 : '0 0 9px 9px',
            color: 'var(--code-text-muted)',
            cursor: 'pointer',
            fontSize: 11,
            position: collapsed ? 'absolute' : 'relative',
            bottom: collapsed ? 0 : undefined,
            left: 0,
            paddingTop: collapsed ? 24 : 4,
            transition: 'all 0.15s ease',
          }}
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          {collapsed ? t('message.showMore') : t('message.showLess')}
        </button>
      )}
    </div>
  )
}

export default function CodeBlockWithHeader({
  langName,
  langColor,
  lineCount,
  codeText,
  className,
  children,
  props,
}: {
  langName: string
  langColor: string | undefined
  lineCount: number
  codeText: string
  className: string | undefined
  children: React.ReactNode
  props: Record<string, unknown>
}) {
  const t = useT()
  const showLineNumbers = lineCount > 1
  const [wordWrap, setWordWrap] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showRunConfirm, setShowRunConfirm] = useState(false)
  const isPreviewable = PREVIEWABLE_LANGS.has(langName.toLowerCase())
  const isShellLang = SHELL_LANGS.has(langName.toLowerCase())
  const addToast = useUiStore(s => s.addToast)
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  const homeDir = useSessionStore(s => s.homeDir)
  const run = useBlockRun(codeText)
  const isRunning = run.state.status === 'running'
  // Only a `cwd_not_allowed` failure with a named folder offers the grant
  // button; every other code is a different problem with a different answer.
  const grantOffer = blockGrantOffer(run.state)
  const [grantingFolder, setGrantingFolder] = useState(false)
  // The different folder the dialog returned, if any. It is reported beside
  // the refusal but never causes a run.
  const [grantElsewhere, setGrantElsewhere] = useState<string | null>(null)
  // A native dialog can outlive this block; after it returns, a block that is
  // gone must not start a process into nothing.
  const grantingRef = useRef(false)
  // Same shape for "run in another folder": the ref is what makes a double
  // click one press, because state updates arrive after the second click.
  const pickingFolderRef = useRef(false)
  const [pickingFolder, setPickingFolder] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const prepared = prepareTerminalCommand(codeText)
  const sendIssue = prepared.issue ?? (workingDir ? null : 'noWorkingDir')
  const sendDisabled = sendIssue !== null
  const sendReason = sendIssue === 'empty'
    ? t('codeAction.terminal.disabled.emptyCommand')
    : sendIssue === 'multiLine'
      ? t('codeAction.terminal.disabled.multiLine', { count: prepared.lineCount })
      : sendIssue === 'noWorkingDir'
        ? t('codeAction.noWorkingDir')
        : ''

  // The confirmation dialog is the consent boundary. No working directory means
  // there is nothing truthful to show in it, so explain instead of opening it.
  const handleRunRequest = useCallback(() => {
    if (!workingDir) {
      addToast('error', t('codeAction.noWorkingDir'))
      return
    }
    setShowRunConfirm(true)
  }, [workingDir, addToast, t])

  const handleRunConfirm = useCallback(() => {
    setShowRunConfirm(false)
    // A fresh run replaces the refusal, so a sentence about an earlier
    // different-folder pick no longer describes anything on screen.
    setGrantElsewhere(null)
    void run.start(workingDir || undefined)
  }, [run, workingDir])

  // The folder refusal's one way forward. The button says "allow and run", so
  // the dialog's answer decides both halves: same folder means the cause is
  // gone and the same command runs in that same folder once; a different
  // folder granted AIPA a folder but not this one, and nothing runs.
  const handleGrantFolder = useCallback(async () => {
    if (!grantOffer || grantingRef.current || pickingFolderRef.current) return
    grantingRef.current = true
    setGrantingFolder(true)
    setGrantElsewhere(null)
    try {
      let picked: string | null
      try {
        picked = await pickFolderToGrant(grantOffer.folder)
      } catch {
        return
      }
      const outcome = blockGrantOutcome(grantOutcome(grantOffer.folder, picked))
      if (!mountedRef.current) return
      if (outcome === 'allow_and_run') {
        // The hook owns the command and this offer owns the folder; neither is
        // re-read from the composer, so the retry is exactly the refused run.
        void run.start(grantOffer.folder)
        return
      }
      if (outcome === 'granted_elsewhere' && picked) {
        setGrantElsewhere(picked)
      }
    } finally {
      grantingRef.current = false
      if (mountedRef.current) setGrantingFolder(false)
    }
  }, [grantOffer, run])

  // "Run in another folder…" — one folder, for this attempt only.
  //
  // The folder dialog is the grant (main records a root only when a human
  // confirms it), so this path goes through the same `pickFolderToGrant` helper
  // the refusal above uses; there is no second channel. The block's command is
  // the one the hook already owns. A cancelled dialog changes nothing at all,
  // and the working-directory preference is neither read for the run nor
  // written.
  const handleRunInFolder = useCallback(async () => {
    // The panel never renders this while a command runs (Stop owns that slot)
    // and the plan below refuses an in-flight answer as well; the ref is what
    // makes a double click one press, since state arrives after the second.
    if (pickingFolderRef.current || grantingRef.current) return
    pickingFolderRef.current = true
    setPickingFolder(true)
    try {
      // Seed the dialog where this block last ran, so the user starts near the
      // folder that was refused. The seed grants nothing; only the answer does.
      let picked: string | null
      try {
        picked = await pickFolderToGrant(run.state.cwd || workingDir || null)
      } catch {
        return
      }
      // A native dialog can outlive this block; after it returns, a block that
      // is gone must not start a process into nothing.
      if (!mountedRef.current) return
      const plan = planRunInFolder({
        picked,
        command: codeText,
        // The panel hides this button while a run is going; the plan still
        // refuses an answer that arrives into an attempt already under way.
        running: isRunning,
      })
      if (plan.kind !== 'run') return
      // A fresh attempt replaces the refusal, so the earlier different-folder
      // sentence no longer describes anything on screen.
      setGrantElsewhere(null)
      void run.start(plan.folder)
    } finally {
      pickingFolderRef.current = false
      if (mountedRef.current) setPickingFolder(false)
    }
  }, [run, codeText, workingDir, isRunning])

  // The folder this attempt used, named only when it is worth naming: a moved
  // attempt, or a refusal whose retry will reuse that folder.
  const folderNote = runFolderNote({
    attemptFolder: run.state.cwd,
    workingDir,
    homeDir,
    status: run.state.status,
    failureCode: run.state.failureCode,
    t,
  })

  // Copy writes exactly the stripped tail the panel shows. When the collector
  // already dropped the start of the output, the toast says so rather than
  // letting a short clipboard look like the whole story.
  const handleCopyOutput = useCallback(() => {
    const plan = planOutputCopy(run.state)
    if (!plan.copyable) {
      addToast('info', t('codeAction.run.copyEmpty'))
      return
    }
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      addToast('error', t('codeAction.run.copyFailed', { error: t('codeAction.run.unknownError') }))
      return
    }
    clipboard.writeText(plan.text).then(() => {
      addToast('success', plan.truncated
        ? t('codeAction.run.copiedTruncated', { chars: plan.chars.toLocaleString() })
        : t('codeAction.run.copiedOutput'))
    }).catch((err: unknown) => {
      addToast('error', t('codeAction.run.copyFailed', {
        error: err instanceof Error ? err.message : String(err),
      }))
    })
  }, [run.state, addToast, t])

  // The draft is put in the composer and never sent: ChatInput appends the
  // detail to what the user already typed, so they can edit before sending.
  const handleAskAipa = useCallback(() => {
    // The folder the run's state recorded, not the preference: a run moved to
    // another folder must not be described as having happened in the global
    // working directory.
    const draft = buildRunDraft(run.state, {
      command: codeText,
      cwd: run.state.cwd || workingDir || null,
      t,
    })
    if (!draft) return
    window.dispatchEvent(new CustomEvent('aipa:insertText', { detail: draft }))
    addToast('info', t('codeAction.run.draftInserted'))
  }, [run.state, codeText, workingDir, addToast, t])

  // Send stays enabled while Run is going: they are independent mechanisms (one
  // writes to a PTY, the other goes through the sandboxed shell:exec runner), so
  // refusing would hide a safe action. The toast says a separate run is still in
  // progress, because "typed in" and "ran it" must never read as the same thing.
  // Exactly one store call per press; the store owns opening the dock, picking
  // or creating the tab, and writing without a submit.
  const handleSendToTerminal = useCallback(() => {
    if (sendDisabled || !workingDir) return
    const outcome = useTerminalStore.getState().typeIntoTerminal({
      cwd: workingDir,
      text: prepared.command,
    })
    if (outcome.status === 'no-cwd') {
      addToast('error', t('codeAction.terminal.notSentNoCwd'))
      return
    }
    const sentence = outcome.status === 'typed'
      ? t('codeAction.terminal.typedToast', { title: outcome.title })
      : t('codeAction.terminal.queuedToast', { title: outcome.title })
    addToast('info', isRunning
      ? `${sentence} ${t('codeAction.terminal.separateRunInProgress')}`
      : sentence)
  }, [sendDisabled, workingDir, prepared.command, isRunning, addToast, t])

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--code-border)', margin: '4px 0', boxShadow: 'var(--code-shadow)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--code-header-bg)',
          padding: '4px 12px',
          borderRadius: '9px 9px 0 0',
          borderBottom: '1px solid var(--code-border)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--code-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {langColor && (
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: langColor,
              flexShrink: 0,
              display: 'inline-block',
            }} />
          )}
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--code-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>
            {langName}
          </span>
          {lineCount > 1 && <span>{t('tool.linesCount', { count: lineCount })}</span>}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isShellLang && (
            <RunButton
              onRun={handleRunRequest}
              disabled={isRunning}
              running={isRunning}
            />
          )}
          {isShellLang && (
            <SendToTerminalButton
              onSend={handleSendToTerminal}
              disabled={sendDisabled}
              reason={sendReason}
            />
          )}
          <SaveButton code={codeText} langName={langName} />
          {isPreviewable && (
            <PreviewButton active={showPreview} onToggle={() => setShowPreview(p => !p)} />
          )}
          <WrapToggleButton wrapped={wordWrap} onToggle={() => setWordWrap(w => !w)} />
          <CopyButton text={codeText} />
        </div>
      </div>
      {showRunConfirm && (
        <RunConfirmDialog
          command={codeText.trim()}
          workingDir={workingDir || '~'}
          onConfirm={handleRunConfirm}
          onCancel={() => setShowRunConfirm(false)}
        />
      )}
      <CollapsiblePre>
        {showLineNumbers ? (
          <div style={{ display: 'flex' }}>
            <div
              aria-hidden="true"
              style={{
                userSelect: 'none',
                MozUserSelect: 'none' as any,
                WebkitUserSelect: 'none' as any,
                textAlign: 'right',
                paddingRight: 12,
                paddingLeft: 8,
                // Match the 12px pre padding so line 1 sits level with the code.
                paddingTop: 12,
                paddingBottom: 12,
                // The code surface stays dark in both themes (the bundled
                // highlight theme is dark-only), so the gutter must stay light.
                borderRight: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--code-text-faint)',
                fontSize: 11,
                lineHeight: '1.5',
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                flexShrink: 0,
                minWidth: lineCount >= 100 ? 40 : lineCount >= 10 ? 32 : 24,
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <code
              className={className}
              style={{
                flex: 1,
                display: 'block',
                overflowX: wordWrap ? 'visible' : 'auto',
                whiteSpace: wordWrap ? 'pre-wrap' : undefined,
                wordBreak: wordWrap ? 'break-word' : undefined,
              }}
              {...props}
            >
              {children}
            </code>
          </div>
        ) : (
          <code
            className={className}
            style={{
              overflowX: wordWrap ? 'visible' : undefined,
              whiteSpace: wordWrap ? 'pre-wrap' : undefined,
              wordBreak: wordWrap ? 'break-word' : undefined,
            }}
            {...props}
          >
            {children}
          </code>
        )}
      </CollapsiblePre>
      {isShellLang && run.state.status !== 'idle' && (
        <RunOutputPanel
          run={run.state}
          elapsedMs={run.elapsedMs}
          onStop={run.stop}
          onToggleOutput={run.toggleOutput}
          onRunAgain={handleRunRequest}
          onCopyOutput={handleCopyOutput}
          onAskAipa={handleAskAipa}
          grantOffer={grantOffer}
          granting={grantingFolder}
          grantElsewhere={grantElsewhere}
          onGrantFolder={() => { void handleGrantFolder() }}
          folderNote={folderNote}
          pickingFolder={pickingFolder}
          onRunInFolder={() => { void handleRunInFolder() }}
        />
      )}
      {showPreview && isPreviewable && (
        <PreviewPane code={codeText} lang={langName} />
      )}
    </div>
  )
}
