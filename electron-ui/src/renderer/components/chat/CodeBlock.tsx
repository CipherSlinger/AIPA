// CodeBlock — extracted from MessageContent.tsx (Iteration 220)
// Sub-components: CopyButton, WrapToggleButton, CollapsiblePre, CodeBlockWithHeader, PreviewButton
// Iteration 510: Added RunButton + SaveButton for actionable code blocks
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Copy, Check, ChevronDown, ChevronUp, WrapText, Play, X, Download, Loader2 } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import { CODE_COLLAPSE_THRESHOLD } from './messageContentConstants'
import RunConfirmDialog from './RunConfirmDialog'

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
      style={{
        background: active ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 8,
        padding: '2px 6px',
        color: active ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
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
        borderRadius: '0 0 8px 8px',
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
          background: 'rgba(255,255,255,1)',
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
      style={{
        background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 6,
        padding: '3px 8px',
        color: copied ? '#4ade80' : 'rgba(255,255,255,0.45)',
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

function RunButton({ code, onRun }: { code: string; onRun: () => void }) {
  const t = useT()
  return (
    <button
      onClick={onRun}
      aria-label={t('codeAction.runInTerminal')}
      title={t('codeAction.runInTerminal')}
      style={{
        background: 'rgba(63,185,80,0.15)',
        border: '1px solid rgba(63,185,80,0.3)',
        borderRadius: 8,
        padding: '2px 6px',
        color: '#4ade80',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.15s ease',
      }}
    >
      <Play size={11} />
      {t('codeAction.run')}
    </button>
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
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 8,
        padding: '2px 6px',
        color: 'rgba(255,255,255,0.45)',
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
      style={{
        background: wrapped ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 8,
        padding: '2px 5px',
        color: wrapped ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
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
          borderRadius: '0 0 8px 8px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(8,8,16,1)',
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
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '4px 0',
            background: collapsed ? 'linear-gradient(transparent, rgba(12,12,22,0.98))' : 'rgba(255,255,255,0.05)',
            border: collapsed ? 'none' : '1px solid rgba(255,255,255,0.09)',
            borderTop: collapsed ? 'none' : '1px solid rgba(255,255,255,0.09)',
            borderRadius: collapsed ? 0 : '0 0 8px 8px',
            color: 'rgba(255,255,255,0.6)',
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
  const [runStatus, setRunStatus] = useState<'idle' | 'executing' | 'done' | 'error'>('idle')
  const isPreviewable = PREVIEWABLE_LANGS.has(langName.toLowerCase())
  const isShellLang = SHELL_LANGS.has(langName.toLowerCase())
  const addToast = useUiStore(s => s.addToast)
  const workingDir = usePrefsStore(s => s.prefs.workingDir)

  const handleRunConfirm = useCallback(async () => {
    setShowRunConfirm(false)
    if (!window.electronAPI) return
    const cwd = workingDir || undefined
    if (!cwd) {
      addToast('error', t('codeAction.noWorkingDir'))
      return
    }
    setRunStatus('executing')
    try {
      const { sessionId } = await window.electronAPI.ptyCreate({ cwd }) as { sessionId: string }
      // Write command + Enter to the PTY
      await window.electronAPI.ptyWrite({ sessionId, data: codeText.trim() + '\n' })
      setRunStatus('done')
      addToast('success', t('codeAction.executed'))
      // Auto-reset status after 3 seconds
      setTimeout(() => setRunStatus('idle'), 3000)
    } catch (err) {
      setRunStatus('error')
      addToast('error', t('codeAction.executeFailed'))
      setTimeout(() => setRunStatus('idle'), 3000)
    }
  }, [codeText, workingDir, addToast, t])

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', margin: '4px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '4px 12px',
          borderRadius: '8px 8px 0 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>
            {langName}
          </span>
          {lineCount > 1 && <span style={{ opacity: 0.6 }}>{t('tool.linesCount', { count: lineCount })}</span>}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isShellLang && (
            runStatus === 'executing' ? (
              <span style={{ fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                {t('codeAction.executing')}
              </span>
            ) : (
              <RunButton code={codeText} onRun={() => setShowRunConfirm(true)} />
            )
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
                paddingTop: 14,
                paddingBottom: 14,
                borderRight: '1px solid rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.25)',
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
      {showPreview && isPreviewable && (
        <PreviewPane code={codeText} lang={langName} />
      )}
    </div>
  )
}
