/**
 * MemoryCreateForm — the empty tab's only way to make a memory file.
 *
 * It posts name/description/type/body to `memory:create`, which derives the
 * filename and refuses an existing one. The refusal is not turned into an
 * error string: the form names the file in the way and offers to open it, so
 * a collision cannot be mistaken for a save and nothing is overwritten.
 */
import React, { useState } from 'react'
import { useT } from '../../i18n'
import { MEMORY_TYPES } from './memoryConstants'
import { MAX_MEMORY_EDITOR_BYTES, utf8ByteLength } from './memoryEditor'

const TYPE_LABEL_KEYS: Record<string, string> = {
  user: 'memory.typeUser',
  feedback: 'memory.typeFeedback',
  project: 'memory.typeProject',
  reference: 'memory.typeReference',
}

interface MemoryCreateFormProps {
  onCreated: (filePath: string) => void
  /** Open the file a create collided with, straight in the card's editor. */
  onOpenExisting: (filePath: string) => void
  onCancel: () => void
}

export default function MemoryCreateForm({ onCreated, onOpenExisting, onCancel }: MemoryCreateFormProps) {
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<string>('user')
  const [body, setBody] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collision, setCollision] = useState<{ filePath: string; name: string } | null>(null)

  const nameMissing = !name.trim()
  const bodyTooLarge = utf8ByteLength(body) > MAX_MEMORY_EDITOR_BYTES
  const createDisabled = creating || nameMissing || bodyTooLarge

  const submit = async () => {
    if (createDisabled) return
    setCreating(true)
    setError(null)
    setCollision(null)
    try {
      const res = await window.electronAPI.memoryCreate({
        name: name.trim(),
        description: description.trim(),
        type,
        body,
        scope: 'global',
      })
      if (res.ok) {
        onCreated(res.filePath)
        return
      }
      if (res.code === 'memory_exists' && res.filePath) {
        setCollision({ filePath: res.filePath, name: res.name || res.filePath })
        return
      }
      setError(
        res.code === 'invalid_name' ? t('memory.editor.invalidName')
        : res.code === 'too_large' ? t('memory.editor.createTooLarge')
        : res.code === 'outside_roots' ? t('memory.editor.outsideRoots')
        : t('memory.editor.createFailed', { message: res.message }),
      )
    } catch (err) {
      setError(t('memory.editor.createFailed', { message: String(err) }))
    } finally {
      setCreating(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 9px',
    background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3,
  }

  return (
    <div style={{
      margin: '8px auto', width: 'min(520px, 92%)', padding: '14px 16px',
      background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {t('memory.editor.newTitle')}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        {t('memory.editor.newWhere')}
      </div>

      <div>
        <label style={labelStyle}>{t('memory.editor.nameLabel')}</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('memory.editor.namePlaceholder')}
          autoFocus
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>{t('memory.editor.descriptionLabel')}</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('memory.editor.descriptionPlaceholder')}
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>{t('memory.editor.typeLabel')}</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {MEMORY_TYPES.map(memoryType => (
            <button
              key={memoryType}
              onClick={() => setType(memoryType)}
              style={{
                background: type === memoryType ? 'rgba(99,102,241,0.20)' : 'var(--bg-hover)',
                color: type === memoryType ? 'var(--accent-text)' : 'var(--text-muted)',
                border: type === memoryType ? '1px solid rgba(99,102,241,0.40)' : '1px solid var(--border)',
                borderRadius: 20, padding: '2px 10px', fontSize: 10, cursor: 'pointer',
              }}
            >
              {t(TYPE_LABEL_KEYS[memoryType])}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>{t('memory.editor.bodyLabel')}</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={t('memory.editor.bodyPlaceholder')}
          spellCheck={false}
          style={{
            ...inputStyle, minHeight: 90, resize: 'vertical', fontFamily: 'monospace',
            lineHeight: 1.6,
          }}
        />
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {utf8ByteLength(body)}{' / '}{MAX_MEMORY_EDITOR_BYTES} B
        </div>
      </div>

      {collision && (
        <div style={{
          padding: '8px 10px', borderRadius: 6,
          border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(251,191,36,0.08)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>
            {t('memory.editor.createExists', { name: collision.name })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={() => onOpenExisting(collision.filePath)}
              style={{
                background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '5px 12px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {t('memory.editor.openExisting')}
            </button>
            <button
              onClick={() => setCollision(null)}
              style={{
                background: 'transparent', border: 'none', borderRadius: 8,
                padding: '5px 8px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              {t('memory.editor.keepEditing')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 10, color: 'var(--danger-text)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {nameMissing && (
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>
            {t('memory.editor.createNeedsName')}
          </span>
        )}
        {!nameMissing && bodyTooLarge && (
          <span style={{ flex: 1, fontSize: 10, color: 'var(--danger-text)' }}>
            {t('memory.editor.createTooLarge')}
          </span>
        )}
        {!nameMissing && !bodyTooLarge && <span style={{ flex: 1 }} />}
        <button
          onClick={onCancel}
          style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 13px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          {t('memory.cancel')}
        </button>
        <button
          onClick={() => { void submit() }}
          disabled={createDisabled}
          style={{
            background: createDisabled ? 'var(--bg-hover)' : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600,
            color: createDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
            cursor: createDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {creating ? t('memory.editor.creating') : t('common.create')}
        </button>
      </div>
    </div>
  )
}
