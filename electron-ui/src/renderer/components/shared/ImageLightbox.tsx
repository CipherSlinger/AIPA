import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

interface Props {
  src: string
  alt?: string
  onClose: () => void
}

export default function ImageLightbox({ src, alt, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(1)
  const [rotation, setRotation] = React.useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 5))
      if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25))
      if (e.key === '0') { setZoom(1); setRotation(0) }
      if (e.key === 'r') setRotation(r => (r + 90) % 360)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const overlay = (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          gap: 6,
          zIndex: 301,
        }}
      >
        <button
          onClick={() => setZoom(z => Math.min(z + 0.25, 5))}
          title="Zoom in (+)"
          style={btnStyle}
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
          title="Zoom out (-)"
          style={btnStyle}
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => setRotation(r => (r + 90) % 360)}
          title="Rotate (R)"
          style={btnStyle}
        >
          <RotateCw size={16} />
        </button>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={btnStyle}
        >
          <X size={16} />
        </button>
      </div>

      {/* Zoom label */}
      {zoom !== 1 && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          padding: '4px 12px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 500,
          zIndex: 301,
        }}>
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Image */}
      <img
        src={src}
        alt={alt || 'Preview'}
        style={{
          maxWidth: '90vw',
          maxHeight: '85vh',
          objectFit: 'contain',
          transform: `scale(${zoom}) rotate(${rotation}deg)`,
          transition: 'transform 0.2s ease',
          borderRadius: 4,
          cursor: zoom > 1 ? 'grab' : 'default',
        }}
        onWheel={(e) => {
          e.preventDefault()
          if (e.deltaY < 0) {
            setZoom(z => Math.min(z + 0.1, 5))
          } else {
            setZoom(z => Math.max(z - 0.1, 0.25))
          }
        }}
        draggable={false}
      />

      {/* Alt text */}
      {alt && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 11,
          zIndex: 301,
          maxWidth: '60%',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {alt}
        </div>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  padding: 8,
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}
