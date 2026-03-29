// MarkdownImage — extracted from MessageContent.tsx (Iteration 220)
// Image display with zoom lightbox overlay
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { ZoomIn } from 'lucide-react'

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

export default function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
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
        <ImageLightbox src={src} alt={alt || 'Image'} onClose={() => setShowLightbox(false)} />
      )}
    </>
  )
}
