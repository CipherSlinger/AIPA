// MessageContent — decomposed orchestrator (Iteration 220)
// Sub-components: CodeBlock, MarkdownImage, messageContentConstants, URLPreviewCard
// Iteration 510: Added ClickableFilePath for P1 file path links
import React, { useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ExternalLink } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import { getLangColor } from './messageContentConstants'
import CodeBlockWithHeader from './CodeBlock'
import MarkdownImage from './MarkdownImage'
import URLPreviewCard from './URLPreviewCard'

// Detect file path patterns: absolute paths (/home/... or C:\...) and relative paths (./... or ../...)
const FILE_PATH_RE = /^(?:\/[\w.@\-]+(?:\/[\w.@\-]*)*|[A-Z]:\\[\w.@\-\\]+|\.\.?\/[\w.@\-/]*)$/

function isLikelyFilePath(text: string): boolean {
  return FILE_PATH_RE.test(text.trim())
}

function ClickableFilePath({ path }: { path: string }) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)

  const handleClick = useCallback(async () => {
    if (!window.electronAPI) return
    const exists = await window.electronAPI.fsPathExists(path)
    if (exists) {
      const result = await window.electronAPI.shellShowItemInFolder(path)
      if (result && !result.success) {
        addToast('error', result.error || t('codeAction.fileNotFound'))
      }
    } else {
      addToast('error', t('codeAction.fileNotFound'))
    }
  }, [path, addToast, t])

  return (
    <code
      onClick={handleClick}
      title={t('codeAction.openInFileManager')}
      style={{
        background: 'var(--glass-border)',
        border: '1px solid var(--glass-border)',
        borderRadius: 3,
        padding: '1px 5px',
        fontSize: '0.9em',
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        color: '#818cf8',
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted' as const,
        textUnderlineOffset: 2,
      }}
    >
      {path}
      <ExternalLink size={10} style={{ marginLeft: 3, verticalAlign: 'middle', opacity: 0.6 }} />
    </code>
  )
}

interface Props {
  content: string
  isUser?: boolean
  searchQuery?: string
  searchCaseSensitive?: boolean
}

function HighlightedText({ text, query, caseSensitive = false }: { text: string; query: string; caseSensitive?: boolean }) {
  if (!query.trim()) return <>{text}</>
  const flags = caseSensitive ? 'g' : 'gi'
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, flags)
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} style={{ background: 'rgba(99,102,241,0.35)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
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

export default React.memo(function MessageContent({ content, isUser, searchQuery, searchCaseSensitive }: Props) {
  if (isUser) {
    return (
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-primary)', fontSize: 13 }}>
        {searchQuery ? <HighlightedText text={content} query={searchQuery} caseSensitive={searchCaseSensitive} /> : content}
      </div>
    )
  }

  return (
    <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const isInline = inline as boolean
            const match = /language-(\w+)/.exec((className as string) || '')
            const codeText = String(children).replace(/\n$/, '')
            const lineCount = codeText.split('\n').length

            if (isInline) {
              // Detect file paths in inline code and make them clickable (Iteration 510)
              if (isLikelyFilePath(codeText)) {
                return <ClickableFilePath path={codeText} />
              }
              return (
                <code
                  className={className as string}
                  style={{
                    background: 'var(--glass-border)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 4,
                    padding: '1px 4px',
                    fontSize: '0.85em',
                    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                    color: '#a5b4fc',
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
            // Detect paragraphs that contain only a single URL — render as preview card (Iteration 462)
            const childArray = React.Children.toArray(children)
            if (childArray.length === 1) {
              const child = childArray[0]
              if (React.isValidElement(child) && (child.type as any) === 'a' && (child.props as any)?.href) {
                const href = (child.props as any).href as string
                const linkText = extractText((child.props as any).children)
                // Only show card if link text IS the URL (standalone URL, not [text](url))
                if (linkText === href && (href.startsWith('http://') || href.startsWith('https://'))) {
                  return <URLPreviewCard url={href} />
                }
              }
            }
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
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#a5b4fc' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#818cf8' }}
                style={{
                  color: '#818cf8',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease',
                }}
                title={href}
              >
                {children}
              </a>
            )
          },
          ul({ children }) {
            return <ul style={{ paddingLeft: 20, marginBottom: 10, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' }}>{children}</ul>
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: 20, marginBottom: 10, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' }}>{children}</ol>
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
                    background: checked ? '#6366f1' : 'transparent',
                    color: 'rgba(255,255,255,0.95)',
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
                NOTE:      { bg: 'rgba(99,102,241,0.08)', border: '#818cf8', label: 'Note' },
                TIP:       { bg: 'rgba(74,222,128,0.08)', border: '#4ade80', label: 'Tip' },
                IMPORTANT: { bg: 'rgba(167,139,250,0.08)', border: '#a78bfa', label: 'Important' },
                WARNING:   { bg: 'rgba(251,191,36,0.08)', border: '#fbbf24', label: 'Warning' },
                CAUTION:   { bg: 'rgba(248,113,113,0.08)', border: '#f87171', label: 'Caution' },
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
                  borderLeft: '3px solid rgba(99,102,241,0.40)',
                  background: 'rgba(99,102,241,0.06)',
                  padding: '6px 12px',
                  borderRadius: '0 4px 4px 0',
                  color: 'var(--text-secondary)',
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
              <div style={{ overflowX: 'auto', marginBottom: 12, borderRadius: 6, border: '1px solid var(--glass-border)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table>
              </div>
            )
          },
          thead({ children }) {
            return (
              <thead style={{ background: 'rgba(255,255,255,0.06)' }}>{children}</thead>
            )
          },
          tr({ children, ...props }) {
            return (
              <tr
                style={{ transition: 'background 0.15s ease' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                {children}
              </tr>
            )
          },
          th({ children }) {
            return (
              <th style={{
                borderBottom: '2px solid #6366f1',
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--text-primary)',
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
                borderBottom: '1px solid var(--glass-border)',
                padding: '6px 12px',
                color: 'var(--text-primary)',
              }}>
                {children}
              </td>
            )
          },
          hr() {
            return <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '16px 0' }} />
          },
          img({ src, alt }) {
            return <MarkdownImage src={src} alt={alt} />
          },
          h1({ children }) {
            return <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, marginTop: 16, color: 'var(--text-primary)' }}>{children}</h1>
          },
          h2({ children }) {
            return <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, marginTop: 14, color: 'rgba(255,255,255,0.88)' }}>{children}</h2>
          },
          h3({ children }) {
            return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 12, color: 'rgba(255,255,255,0.88)' }}>{children}</h3>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}, (prevProps, nextProps) => prevProps.content === nextProps.content && prevProps.isUser === nextProps.isUser && prevProps.searchQuery === nextProps.searchQuery)
