import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
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
          <mark key={i} style={{ background: 'var(--warning)', color: 'var(--bg-primary)', borderRadius: 2, padding: '0 1px' }}>
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

const CODE_COLLAPSE_THRESHOLD = 300 // px height before showing collapse toggle

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
              return <code className={className as string} {...props}>{children as React.ReactNode}</code>
            }

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
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {match?.[1] || 'code'}
                    {lineCount > 1 && <span style={{ opacity: 0.6, marginLeft: 6 }}>{lineCount} lines</span>}
                  </span>
                  <CopyButton text={codeText} />
                </div>
                <CollapsiblePre>
                  <code className={className as string} {...props}>{children as React.ReactNode}</code>
                </CollapsiblePre>
              </div>
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
              <thead style={{ background: 'var(--bg-active, var(--bg-secondary))' }}>{children}</thead>
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
