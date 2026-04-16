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
  const [btnHovered, setBtnHovered] = useState(false)
  const [dismissHovered, setDismissHovered] = useState(false)

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
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid rgba(99,102,241,0.5)',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        marginTop: 6, marginBottom: 6,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: '60%', height: 12, borderRadius: 3, background: 'var(--border)', marginBottom: 6 }} />
          <div style={{ width: '80%', height: 10, borderRadius: 3, background: 'var(--bg-hover)' }} />
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
          color: '#6366f1', textDecoration: 'underline',
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
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: hovered ? '1px solid var(--border)' : '1px solid var(--border)',
        borderLeft: '3px solid rgba(99,102,241,0.5)',
        borderRadius: 10,
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
        marginTop: 6, marginBottom: 6,
        textDecoration: 'none', color: 'inherit',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Favicon */}
      {meta.favicon && !faviconError ? (
        <img
          src={meta.favicon}
          width={14}
          height={14}
          alt=""
          onError={() => setFaviconError(true)}
          style={{ borderRadius: 4, flexShrink: 0, marginTop: 2 }}
        />
      ) : (
        <ExternalLink size={14} style={{ flexShrink: 0, marginTop: 2, color: 'rgba(165,180,252,0.75)' }} />
      )}

      {/* Text */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {/* Site name / domain */}
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'rgba(165,180,252,0.75)',
          marginBottom: 2,
        }}>
          {meta.domain}
        </div>

        {/* Page title */}
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {meta.title}
        </div>

        {/* Description snippet */}
        {meta.description && (
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginBottom: 3,
          }}>
            {meta.description}
          </div>
        )}

        {/* URL text */}
        <div style={{
          fontSize: 10, color: 'var(--text-muted)',
          fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {url}
        </div>
      </div>

      {/* Open link button */}
      <button
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.electronAPI.shellOpenExternal(url) }}
        style={{
          background: btnHovered ? 'rgba(99,102,241,0.12)' : 'transparent',
          border: 'none',
          color: '#818cf8',
          borderRadius: 5,
          cursor: 'pointer',
          padding: '3px 6px',
          display: 'flex', alignItems: 'center',
          flexShrink: 0,
          alignSelf: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        <ExternalLink size={12} />
      </button>

      {/* Dismiss button */}
      <button
        onMouseEnter={() => setDismissHovered(true)}
        onMouseLeave={() => setDismissHovered(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMeta(null) }}
        style={{
          background: 'transparent',
          border: 'none',
          color: dismissHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
          borderRadius: 5,
          cursor: 'pointer',
          padding: '3px 5px',
          display: 'flex', alignItems: 'center',
          flexShrink: 0,
          alignSelf: 'center',
          fontSize: 14, lineHeight: 1,
          transition: 'all 0.15s ease',
        }}
      >
        ×
      </button>
    </a>
  )
}
