import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

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
                  </span>
                  <CopyButton text={codeText} />
                </div>
                <pre
                  style={{
                    margin: 0,
                    borderRadius: '0 0 4px 4px',
                    borderTop: 'none',
                  }}
                >
                  <code className={className as string} {...props}>{children as React.ReactNode}</code>
                </pre>
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
          li({ children }) {
            return <li style={{ marginBottom: 4 }}>{children}</li>
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
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th style={{ border: '1px solid var(--border)', padding: '6px 12px', background: 'var(--bg-secondary)', textAlign: 'left' }}>
                {children}
              </th>
            )
          },
          td({ children }) {
            return <td style={{ border: '1px solid var(--border)', padding: '6px 12px' }}>{children}</td>
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
