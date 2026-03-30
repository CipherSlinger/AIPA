// CodeBlock — extracted from MessageContent.tsx (Iteration 220)
// Sub-components: CopyButton, WrapToggleButton, CollapsiblePre, CodeBlockWithHeader, PreviewButton
import React, { useState, useRef, useEffect } from 'react'
import { Copy, Check, ChevronDown, ChevronUp, WrapText, Play, X } from 'lucide-react'
import { useT } from '../../i18n'
import { CODE_COLLAPSE_THRESHOLD } from './messageContentConstants'

// Languages that support live preview
const PREVIEWABLE_LANGS = new Set(['html', 'svg', 'css', 'javascript', 'js', 'jsx', 'htm'])

function wrapForPreview(code: string, lang: string): string {
  const l = lang.toLowerCase()
  if (l === 'svg') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100%;background:#1a1a2e;}</style></head><body>${code}</body></html>`
  }
  if (l === 'css') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${code}</style></head><body><div class="preview">CSS Preview</div></body></html>`
  }
  if (l === 'javascript' || l === 'js' || l === 'jsx') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:8px;font-family:system-ui,sans-serif;color:#e0e0e0;background:#1a1a2e;}</style></head><body><div id="root"></div><script>${code}<\/script></body></html>`
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
        background: active ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)',
        border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.2)'}`,
        borderRadius: 3,
        padding: '2px 6px',
        color: active ? '#a5b4fc' : '#ccc',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {active ? <X size={11} /> : <Play size={11} />}
      {active ? t('message.closePreview') : t('message.preview')}
    </button>
  )
}

function PreviewPane({ code, lang }: { code: string; lang: string }) {
  const srcDoc = wrapForPreview(code, lang)
  return (
    <div
      style={{
        border: '1px solid rgba(99,102,241,0.3)',
        borderTop: 'none',
        borderRadius: '0 0 4px 4px',
        overflow: 'hidden',
        background: '#1a1a2e',
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
        Live Preview
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
        title="Code preview"
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
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 3,
        padding: '2px 6px',
        color: '#ccc',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? t('message.codeCopied') : t('message.copyCode')}
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
        background: wrapped ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 3,
        padding: '2px 5px',
        color: wrapped ? '#fff' : '#ccc',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
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
          borderRadius: '0 0 4px 4px',
          borderTop: 'none',
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
            background: collapsed ? 'linear-gradient(transparent, #1a1a1a)' : '#1a1a1a',
            border: 'none',
            borderTop: collapsed ? 'none' : '1px solid var(--border)',
            borderRadius: collapsed ? 0 : '0 0 4px 4px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 11,
            position: collapsed ? 'absolute' : 'relative',
            bottom: collapsed ? 0 : undefined,
            left: 0,
            paddingTop: collapsed ? 24 : 4,
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
  const showLineNumbers = lineCount > 1
  const [wordWrap, setWordWrap] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const isPreviewable = PREVIEWABLE_LANGS.has(langName.toLowerCase())

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#1a1a2e',
          padding: '4px 12px',
          borderRadius: '4px 4px 0 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <span style={{ color: langColor || 'var(--text-muted)', fontWeight: langColor ? 500 : 400 }}>
            {langName}
          </span>
          {lineCount > 1 && <span style={{ opacity: 0.6 }}>{lineCount} lines</span>}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isPreviewable && (
            <PreviewButton active={showPreview} onToggle={() => setShowPreview(p => !p)} />
          )}
          <WrapToggleButton wrapped={wordWrap} onToggle={() => setWordWrap(w => !w)} />
          <CopyButton text={codeText} />
        </div>
      </div>
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
                borderRight: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.25)',
                fontSize: 11,
                lineHeight: '1.45em',
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
