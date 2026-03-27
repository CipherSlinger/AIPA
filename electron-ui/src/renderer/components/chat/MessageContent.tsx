import React from 'react'
import ReactDOM from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, ChevronDown, ChevronUp, ZoomIn, WrapText } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface Props {
  content: string
  isUser?: boolean
  searchQuery?: string
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} style={{ background: 'var(--warning)', color: '#1a1a1a', borderRadius: 2, padding: '0 1px' }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

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
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function WrapToggleButton({ wrapped, onToggle }: { wrapped: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={wrapped ? 'Disable word wrap' : 'Enable word wrap'}
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

const CODE_COLLAPSE_THRESHOLD = 300 // px height before showing collapse toggle

// Language badge colors for code blocks
const LANG_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  js: '#f7df1e',
  typescript: '#3178c6',
  ts: '#3178c6',
  tsx: '#3178c6',
  jsx: '#f7df1e',
  python: '#3776ab',
  py: '#3776ab',
  rust: '#dea584',
  go: '#00add8',
  java: '#ed8b00',
  kotlin: '#7f52ff',
  swift: '#f05138',
  ruby: '#cc342d',
  rb: '#cc342d',
  php: '#777bb4',
  c: '#a8b9cc',
  cpp: '#00599c',
  'c++': '#00599c',
  csharp: '#239120',
  'c#': '#239120',
  cs: '#239120',
  html: '#e34f26',
  css: '#1572b6',
  scss: '#cc6699',
  sass: '#cc6699',
  less: '#1d365d',
  json: '#292929',
  yaml: '#cb171e',
  yml: '#cb171e',
  toml: '#9c4121',
  xml: '#f16529',
  markdown: '#083fa1',
  md: '#083fa1',
  sql: '#e38c00',
  bash: '#4eaa25',
  sh: '#4eaa25',
  shell: '#4eaa25',
  zsh: '#4eaa25',
  powershell: '#012456',
  dockerfile: '#2496ed',
  docker: '#2496ed',
  lua: '#000080',
  r: '#276dc3',
  scala: '#dc322f',
  perl: '#39457e',
  elixir: '#6e4a7e',
  haskell: '#5e5086',
  dart: '#0175c2',
  vue: '#42b883',
  svelte: '#ff3e00',
  graphql: '#e10098',
  prisma: '#2d3748',
  terraform: '#7b42bc',
  nginx: '#009639',
}

function getLangColor(lang: string): string | undefined {
  return LANG_COLORS[lang.toLowerCase()]
}

function CodeBlockWithHeader({
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
    </div>
  )
}

function CollapsiblePre({ children, className }: { children: React.ReactNode; className?: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [isOverflow, setIsOverflow] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

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
          {collapsed ? 'Show more' : 'Show less'}
        </button>
      )}
    </div>
  )
}

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [showLightbox, setShowLightbox] = useState(false)

  if (!src) return null

  return (
    <>
      <span
        onClick={() => setShowLightbox(true)}
        style={{
          display: 'inline-block',
          position: 'relative',
          cursor: 'zoom-in',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          maxWidth: '100%',
          marginBottom: 8,
        }}
      >
        <img
          src={src}
          alt={alt || ''}
          style={{ maxWidth: '100%', maxHeight: 400, display: 'block', borderRadius: 6 }}
        />
        <span
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 4,
            padding: '2px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            color: '#ccc',
            fontSize: 10,
            opacity: 0.7,
          }}
        >
          <ZoomIn size={10} />
          Click to zoom
        </span>
      </span>
      {showLightbox && (
        <ImageLightboxInline src={src} alt={alt || 'Image'} onClose={() => setShowLightbox(false)} />
      )}
    </>
  )
}

function ImageLightboxInline({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, cursor: 'default' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'var(--text-muted)',
          fontSize: 12,
          background: 'rgba(0,0,0,0.6)',
          padding: '4px 12px',
          borderRadius: 4,
        }}
      >
        {alt} &middot; Esc to close
      </div>
    </div>,
    document.body
  )
}

// Extract plain text from React children tree (used for callout detection)
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (React.isValidElement(children) && (children.props as any)?.children) {
    return extractText((children.props as any).children)
  }
  return ''
}

export default React.memo(function MessageContent({ content, isUser, searchQuery }: Props) {
  if (isUser) {
    return (
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-primary)', fontSize: 13 }}>
        {searchQuery ? <HighlightedText text={content} query={searchQuery} /> : content}
      </div>
    )
  }

  return (
    <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ node, inline, className, children, ...props }: Record<string, unknown>) {
            const isInline = inline as boolean
            const match = /language-(\w+)/.exec((className as string) || '')
            const codeText = String(children).replace(/\n$/, '')
            const lineCount = codeText.split('\n').length

            if (isInline) {
              return (
                <code
                  className={className as string}
                  style={{
                    background: 'var(--bg-active, rgba(255,255,255,0.08))',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontSize: '0.9em',
                    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                    color: 'var(--accent)',
                  }}
                  {...props}
                >
                  {children as React.ReactNode}
                </code>
              )
            }

            const langName = match?.[1] || 'code'
            const langColor = getLangColor(langName)

            return (
              <CodeBlockWithHeader
                langName={langName}
                langColor={langColor}
                lineCount={lineCount}
                codeText={codeText}
                className={className as string}
                children={children as React.ReactNode}
                props={props}
              />
            )
          },
          p({ children }) {
            return <p style={{ marginBottom: 10 }}>{children}</p>
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                    window.electronAPI.shellOpenExternal(href)
                  }
                }}
                style={{
                  color: 'var(--accent)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
                title={href}
              >
                {children}
              </a>
            )
          },
          ul({ children }) {
            return <ul style={{ paddingLeft: 20, marginBottom: 10 }}>{children}</ul>
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: 20, marginBottom: 10 }}>{children}</ol>
          },
          li({ children, ...props }) {
            // Detect task list items (GFM checkboxes)
            const className = (props as any).className as string | undefined
            if (className && className.includes('task-list-item')) {
              return (
                <li style={{ marginBottom: 4, listStyle: 'none', marginLeft: -20, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  {children}
                </li>
              )
            }
            return <li style={{ marginBottom: 4 }}>{children}</li>
          },
          input({ type, checked, ...props }) {
            if (type === 'checkbox') {
              return (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: checked ? 'none' : '1.5px solid var(--text-muted)',
                    background: checked ? 'var(--accent)' : 'transparent',
                    color: '#fff',
                    fontSize: 10,
                    flexShrink: 0,
                    marginTop: 3,
                    cursor: 'default',
                  }}
                >
                  {checked && '\u2713'}
                </span>
              )
            }
            return <input type={type} checked={checked} readOnly {...props} />
          },
          blockquote({ children }) {
            // Detect GitHub-style callout blocks: > [!NOTE], > [!WARNING], etc.
            const childText = extractText(children)
            const calloutMatch = childText.match(/^\[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\]/)
            if (calloutMatch) {
              const type = calloutMatch[1]
              const colors: Record<string, { bg: string; border: string; label: string }> = {
                NOTE:      { bg: 'rgba(56, 139, 253, 0.08)', border: '#388bfd', label: 'Note' },
                TIP:       { bg: 'rgba(63, 185, 80, 0.08)', border: '#3fb950', label: 'Tip' },
                IMPORTANT: { bg: 'rgba(168, 133, 255, 0.08)', border: '#a885ff', label: 'Important' },
                WARNING:   { bg: 'rgba(210, 153, 34, 0.08)', border: '#d29922', label: 'Warning' },
                CAUTION:   { bg: 'rgba(248, 81, 73, 0.08)', border: '#f85149', label: 'Caution' },
              }
              const style = colors[type] || colors.NOTE
              return (
                <div
                  style={{
                    background: style.bg,
                    borderLeft: `3px solid ${style.border}`,
                    borderRadius: '0 6px 6px 0',
                    padding: '10px 14px',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: style.border, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {style.label}
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                    {children}
                  </div>
                </div>
              )
            }
            return (
              <blockquote
                style={{
                  borderLeft: '3px solid var(--accent)',
                  paddingLeft: 12,
                  color: 'var(--text-muted)',
                  marginBottom: 10,
                  fontStyle: 'italic',
                }}
              >
                {children}
              </blockquote>
            )
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', marginBottom: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table>
              </div>
            )
          },
          thead({ children }) {
            return (
              <thead style={{ background: 'var(--action-btn-bg)' }}>{children}</thead>
            )
          },
          tr({ children, ...props }) {
            const isEven = (props as any)['data-even'] !== undefined
            return (
              <tr
                style={{ transition: 'background 0.1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                {children}
              </tr>
            )
          },
          th({ children }) {
            return (
              <th style={{
                borderBottom: '2px solid var(--accent)',
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--text-bright)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                whiteSpace: 'nowrap',
              }}>
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td style={{
                borderBottom: '1px solid var(--border)',
                padding: '6px 12px',
                color: 'var(--text-primary)',
              }}>
                {children}
              </td>
            )
          },
          hr() {
            return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
          },
          img({ src, alt }) {
            return <MarkdownImage src={src} alt={alt} />
          },
          h1({ children }) {
            return <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, marginTop: 16, color: 'var(--text-bright)' }}>{children}</h1>
          },
          h2({ children }) {
            return <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, marginTop: 14, color: 'var(--text-bright)' }}>{children}</h2>
          },
          h3({ children }) {
            return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 12, color: 'var(--text-bright)' }}>{children}</h3>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}, (prevProps, nextProps) => prevProps.content === nextProps.content && prevProps.isUser === nextProps.isUser && prevProps.searchQuery === nextProps.searchQuery)
