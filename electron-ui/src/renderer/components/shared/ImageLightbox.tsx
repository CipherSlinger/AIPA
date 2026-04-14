import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  src: string
  alt?: string
  onClose: () => void
}

export default function ImageLightbox({ src, alt, onClose }: Props) {
  const t = useT()
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
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 6,
          zIndex: 601,
        }}
      >
        <button
          onClick={() => setZoom(z => Math.min(z + 0.25, 5))}
          title={t('lightbox.zoomIn')}
          style={btnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.25)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.50)'
            e.currentTarget.style.color = '#a5b4fc'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg-low)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
          title={t('lightbox.zoomOut')}
          style={btnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.25)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.50)'
            e.currentTarget.style.color = '#a5b4fc'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg-low)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => setRotation(r => (r + 90) % 360)}
          title={t('lightbox.rotate')}
          style={btnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.25)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.50)'
            e.currentTarget.style.color = '#a5b4fc'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg-low)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
        >
          <RotateCw size={16} />
        </button>
        <button
          onClick={onClose}
          title={t('lightbox.close')}
          style={btnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.25)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.50)'
            e.currentTarget.style.color = '#a5b4fc'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg-low)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
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
          background: 'var(--glass-bg-low)',
          border: '1px solid var(--glass-border-md)',
          color: 'var(--text-secondary)',
          padding: '4px 12px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 500,
          zIndex: 601,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}>
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Image */}
      <div
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          maxWidth: '90vw',
          maxHeight: '85vh',
        }}
      >
        <img
          src={src}
          alt={alt || t('lightbox.preview')}
          style={{
            maxWidth: '90vw',
            maxHeight: '85vh',
            objectFit: 'contain',
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'all 0.15s ease',
            display: 'block',
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
      </div>

      {/* Alt text / caption */}
      {alt && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 12,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          marginTop: 10,
          zIndex: 601,
          maxWidth: '60%',
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
  background: 'var(--glass-bg-low)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: '50%',
  width: 36,
  height: 36,
  cursor: 'pointer',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}
