// URLPreviewCard — renders a link preview card with OG metadata (Iteration 462)

import React, { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'

interface URLMeta {
  title: string
  description: string
  favicon: string
  domain: string
}

// Simple in-memory cache for URL metadata
const metaCache = new Map<string, URLMeta | null>()

export default function URLPreviewCard({ url }: { url: string }) {
  const [meta, setMeta] = useState<URLMeta | null | undefined>(() => {
    return metaCache.has(url) ? metaCache.get(url) : undefined
  })
  const [hovered, setHovered] = useState(false)
  const [faviconError, setFaviconError] = useState(false)

  useEffect(() => {
    if (meta !== undefined) return  // Already cached
    let cancelled = false
    window.electronAPI.urlFetchMeta(url).then((result) => {
      if (!cancelled) {
        metaCache.set(url, result)
        setMeta(result)
      }
    }).catch(() => {
      if (!cancelled) {
        metaCache.set(url, null)
        setMeta(null)
      }
    })
    return () => { cancelled = true }
  }, [url])

  // Loading shimmer
  if (meta === undefined) {
    return (
      <div style={{
        display: 'flex', gap: 10, padding: '10px 12px',
        background: 'var(--tool-card-bg)', border: '1px solid var(--tool-card-border)',
        borderRadius: 8, marginTop: 6, marginBottom: 6,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: '60%', height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 6 }} />
          <div style={{ width: '80%', height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>
    )
  }

  // Failed: show simple link with domain
  if (!meta) {
    const domain = (() => { try { return new URL(url).hostname } catch { return url } })()
    return (
      <a
        href={url}
        onClick={(e) => { e.preventDefault(); window.electronAPI.shellOpenExternal(url) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: 'var(--accent)', textDecoration: 'underline',
          fontSize: 13, cursor: 'pointer',
        }}
      >
        {domain} <ExternalLink size={11} />
      </a>
    )
  }

  // Card with metadata
  return (
    <a
      href={url}
      onClick={(e) => { e.preventDefault(); window.electronAPI.shellOpenExternal(url) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: 10, padding: '10px 12px',
        background: hovered ? 'var(--popup-item-hover)' : 'var(--tool-card-bg)',
        border: '1px solid var(--tool-card-border)',
        borderRadius: 8, marginTop: 6, marginBottom: 6,
        textDecoration: 'none', color: 'inherit',
        cursor: 'pointer', transition: 'background 150ms',
      }}
    >
      {/* Favicon */}
      {meta.favicon && !faviconError ? (
        <img
          src={meta.favicon}
          width={16}
          height={16}
          alt=""
          onError={() => setFaviconError(true)}
          style={{ borderRadius: 3, flexShrink: 0, marginTop: 2 }}
        />
      ) : (
        <ExternalLink size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />
      )}

      {/* Text */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3, marginBottom: 2,
        }}>
          {meta.title}
        </div>
        {meta.description && (
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {meta.description}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, opacity: 0.7 }}>
          {meta.domain}
        </div>
      </div>
    </a>
  )
}
