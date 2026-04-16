// MarkdownImage — extracted from MessageContent.tsx (Iteration 221)
// Image display with zoom lightbox overlay, loading skeleton, and error state
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { ZoomIn, ImageOff } from 'lucide-react'

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
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
          fontSize: 11,
          fontStyle: 'italic',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          padding: '4px 14px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}
      >
        {alt} &middot; Esc to close
      </div>
    </div>,
    document.body
  )
}

export default function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [showLightbox, setShowLightbox] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  if (!src) return null

  return (
    <>
      <span
        onClick={() => { if (loaded && !errored) setShowLightbox(true) }}
        style={{
          display: 'inline-block',
          position: 'relative',
          cursor: loaded && !errored ? 'zoom-in' : 'default',
          borderRadius: 8,
          overflow: 'hidden',
          border: errored
            ? '1px solid rgba(239,68,68,0.45)'
            : '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          maxWidth: '100%',
          marginBottom: 8,
          transition: 'all 0.15s ease',
          background: loaded && !errored ? undefined : 'var(--bg-primary)',
        }}
      >
        {/* Loading skeleton — shown until image loads or errors */}
        {!loaded && !errored && (
          <span style={{
            display: 'block',
            width: '100%',
            minWidth: 160,
            height: 100,
            background: 'linear-gradient(90deg, rgba(99,102,241,0.07) 25%, rgba(99,102,241,0.14) 50%, rgba(99,102,241,0.07) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.6s ease-in-out infinite',
            borderRadius: 8,
          }} />
        )}

        {/* Error state */}
        {errored && (
          <span style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '20px 24px',
            minWidth: 120,
            minHeight: 80,
          }}>
            <ImageOff size={20} style={{ color: 'rgba(248,113,113,0.8)' }} />
            <span style={{ fontSize: 11, color: 'rgba(248,113,113,0.75)' }}>
              Image failed to load
            </span>
          </span>
        )}

        <img
          src={src}
          alt={alt || ''}
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setErrored(true) }}
          style={{
            maxWidth: '100%',
            maxHeight: 400,
            display: loaded && !errored ? 'block' : 'none',
          }}
        />

        {/* Zoom hint — only shown when loaded without error */}
        {loaded && !errored && (
          <span
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              background: 'var(--popup-bg)',
              border: '1px solid var(--border)',
              padding: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              color: 'var(--text-muted)',
              fontSize: 10,
            }}
          >
            <ZoomIn size={10} />
            Click to zoom
          </span>
        )}
      </span>
      {alt && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          textAlign: 'center',
          paddingTop: 4,
          fontStyle: 'italic',
        }}>
          {alt}
        </div>
      )}
      {showLightbox && (
        <ImageLightbox src={src} alt={alt || 'Image'} onClose={() => setShowLightbox(false)} />
      )}
    </>
  )
}
