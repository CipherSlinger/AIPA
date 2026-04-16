/**
 * StructuredOutputCard — renders a StructuredOutput tool call.
 *
 * StructuredOutput is a CLI tool that constrains Claude's response to a
 * JSON Schema. The tool input contains the `schema` (JSON Schema object)
 * and the tool result contains the structured JSON value.
 */
import React, { useState } from 'react'
import { Database, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { ToolUseInfo } from '../../../types/app.types'

interface Props {
  tool: ToolUseInfo
}

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactElement {
  if (value === null) return <span style={{ color: 'rgba(239,68,68,0.85)' }}>null</span>
  if (typeof value === 'boolean') return <span style={{ color: 'rgba(251,146,60,0.9)' }}>{String(value)}</span>
  if (typeof value === 'number') return <span style={{ color: 'rgba(99,102,241,0.9)' }}>{String(value)}</span>
  if (typeof value === 'string') return <span style={{ color: 'rgba(52,211,153,0.9)' }}>"{value}"</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--text-faint)' }}>[]</span>
    return (
      <span>
        {'['}
        <div style={{ paddingLeft: 14 * (depth + 1) }}>
          {value.map((item, i) => (
            <div key={i}>
              <JsonValue value={item} depth={depth + 1} />
              {i < value.length - 1 && <span style={{ color: 'var(--text-faint)' }}>,</span>}
            </div>
          ))}
        </div>
        {']'}
      </span>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span style={{ color: 'var(--text-faint)' }}>{'{}'}</span>
    return (
      <span>
        {'{'}
        <div style={{ paddingLeft: 14 * (depth + 1) }}>
          {entries.map(([k, v], i) => (
            <div key={k}>
              <span style={{ color: 'rgba(167,139,250,0.85)' }}>"{k}"</span>
              <span style={{ color: 'var(--text-faint)' }}>: </span>
              <JsonValue value={v} depth={depth + 1} />
              {i < entries.length - 1 && <span style={{ color: 'var(--text-faint)' }}>,</span>}
            </div>
          ))}
        </div>
        {'}'}
      </span>
    )
  }
  return <span style={{ color: 'var(--text-secondary)' }}>{String(value)}</span>
}

export function StructuredOutputCard({ tool }: Props) {
  const [schemaExpanded, setSchemaExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const schema = tool.input?.schema as Record<string, unknown> | undefined
  const schemaTitle = (schema?.title as string) || (schema?.description as string) || null

  let parsedResult: unknown = null
  let resultStr = ''
  try {
    if (typeof tool.result === 'string') {
      parsedResult = JSON.parse(tool.result)
      resultStr = tool.result
    } else if (tool.result != null) {
      parsedResult = tool.result
      resultStr = JSON.stringify(tool.result, null, 2)
    }
  } catch {
    resultStr = typeof tool.result === 'string' ? tool.result : ''
    parsedResult = null
  }

  const handleCopy = () => {
    if (!resultStr) return
    navigator.clipboard.writeText(resultStr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = resultStr
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const isRunning = tool.status === 'running'
  const leftBorderColor = isRunning
    ? 'rgba(99,102,241,0.60)'
    : tool.status === 'done'
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(239,68,68,0.50)'

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: `2px solid ${leftBorderColor}`,
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Database size={13} color="rgba(167,139,250,0.85)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          Structured Output
        </span>
        {schemaTitle && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 8,
              background: 'rgba(167,139,250,0.12)',
              color: 'rgba(167,139,250,0.85)',
              fontWeight: 500,
            }}
          >
            {schemaTitle}
          </span>
        )}
        {isRunning && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(99,102,241,0.85)',
              marginLeft: 'auto',
            }}
          >
            generating…
          </span>
        )}
        {!isRunning && resultStr && (
          <button
            onClick={handleCopy}
            title="Copy JSON"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 6,
              color: copied ? 'rgba(34,197,94,0.85)' : 'var(--text-faint)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = copied ? 'rgba(34,197,94,0.85)' : 'var(--text-faint)' }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'copied' : 'copy'}
          </button>
        )}
      </div>

      {/* Schema toggle */}
      {schema && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setSchemaExpanded(!schemaExpanded)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'var(--text-faint)',
              padding: '2px 0',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            {schemaExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            JSON Schema
          </button>
          {schemaExpanded && (
            <pre
              style={{
                margin: '4px 0 2px',
                fontSize: 10,
                lineHeight: 1.55,
                color: 'var(--text-secondary)',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 8px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 160,
                overflowY: 'auto',
              }}
            >
              {JSON.stringify(schema, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Result */}
      {!isRunning && (
        <div style={{ padding: '8px 12px' }}>
          {parsedResult !== null ? (
            <div
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                background: 'rgba(0,0,0,0.18)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '8px 10px',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              <JsonValue value={parsedResult} />
            </div>
          ) : resultStr ? (
            <pre
              style={{
                margin: 0,
                fontSize: 11,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                background: 'rgba(0,0,0,0.18)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '8px 10px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {resultStr}
            </pre>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              no output
            </span>
          )}
        </div>
      )}
    </div>
  )
}
