import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Type } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import type { TextSnippet } from '../../types/app.types'
import { INPUT_STYLE } from './settingsConstants'

/* ── Text Snippets Management ── */

export function SnippetsSection() {
  const { t } = useI18n()
  const prefs = usePrefsStore(s => s.prefs)
  const { setPrefs } = usePrefsStore()
  const snippets: TextSnippet[] = prefs.textSnippets || []

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formKeyword, setFormKeyword] = useState('')
  const [formContent, setFormContent] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const saveSnippets = (updated: TextSnippet[]) => {
    setPrefs({ textSnippets: updated })
    window.electronAPI.prefsSet('textSnippets', updated)
  }

  const resetForm = () => {
    setShowAdd(false)
    setEditingId(null)
    setFormKeyword('')
    setFormContent('')
  }

  const handleAdd = () => {
    const kw = formKeyword.trim().replace(/\s/g, '')
    const ct = formContent.trim()
    if (!kw || !ct) return
    if (snippets.some(s => s.keyword.toLowerCase() === kw.toLowerCase())) return
    const newSnippet: TextSnippet = {
      id: `snip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      keyword: kw,
      content: ct,
    }
    saveSnippets([...snippets, newSnippet])
    resetForm()
  }

  const handleUpdate = (id: string) => {
    const kw = formKeyword.trim().replace(/\s/g, '')
    const ct = formContent.trim()
    if (!kw || !ct) return
    if (snippets.some(s => s.keyword.toLowerCase() === kw.toLowerCase() && s.id !== id)) return
    const updated = snippets.map(s => s.id === id ? { ...s, keyword: kw, content: ct } : s)
    saveSnippets(updated)
    resetForm()
  }

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      saveSnippets(snippets.filter(s => s.id !== id))
      setDeletingId(null)
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(prev => prev === id ? null : prev), 2000)
    }
  }

  const snippetForm = (onSubmit: () => void) => (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(15,15,25,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(99,102,241,0.30)',
      borderRadius: 10,
      marginBottom: editingId ? 0 : 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{t('snippet.keyword')}</div>
      <input
        value={formKeyword}
        onChange={(e) => setFormKeyword(e.target.value.replace(/\s/g, '').slice(0, 20))}
        placeholder={t('snippet.keywordPlaceholder')}
        maxLength={20}
        style={{ ...INPUT_STYLE, marginBottom: 8, fontFamily: 'monospace' }}
        autoFocus
      />
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{t('snippet.content')}</div>
      <textarea
        value={formContent}
        onChange={(e) => setFormContent(e.target.value.slice(0, 2000))}
        placeholder={t('snippet.contentPlaceholder')}
        maxLength={2000}
        rows={3}
        style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 60, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('snippet.triggerHint')}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={resetForm}
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >{t('common.cancel')}</button>
          <button
            onClick={onSubmit}
            disabled={!formKeyword.trim() || !formContent.trim()}
            style={{
              background: formKeyword.trim() && formContent.trim()
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-hover)',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: formKeyword.trim() && formContent.trim() ? 'pointer' : 'not-allowed',
              opacity: formKeyword.trim() && formContent.trim() ? 1 : 0.5,
            }}
          >{t('common.save')}</button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 14px' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Type size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
          {t('snippet.title')} ({snippets.length}/50)
        </span>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
        {t('snippet.hint')}
      </div>

      {snippets.length === 0 && !showAdd && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
          {t('snippet.empty')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {snippets.map(s => (
          <div key={s.id}>
            {editingId === s.id ? (
              snippetForm(() => handleUpdate(s.id))
            ) : (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(15,15,25,0.85)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'rgba(165,180,252,0.9)',
                      fontFamily: 'monospace',
                    }}>::{s.keyword}</span>
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                    lineHeight: 1.4,
                  }}>
                    {s.content}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 2 }}>
                  <button
                    onClick={() => {
                      setEditingId(s.id)
                      setFormKeyword(s.keyword)
                      setFormContent(s.content)
                      setShowAdd(false)
                    }}
                    title={t('common.edit')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 8, transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(165,180,252,0.9)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    title={deletingId === s.id ? t('common.confirm') : t('common.delete')}
                    style={{
                      background: deletingId === s.id ? 'rgba(239,68,68,0.12)' : 'none',
                      border: 'none',
                      color: deletingId === s.id ? '#fca5a5' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: 4,
                      borderRadius: 8,
                      fontWeight: deletingId === s.id ? 600 : 400,
                      fontSize: deletingId === s.id ? 10 : 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (deletingId !== s.id) e.currentTarget.style.color = '#fca5a5' }}
                    onMouseLeave={(e) => { if (deletingId !== s.id) e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    {deletingId === s.id ? t('common.confirm') : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd && snippetForm(handleAdd)}

      {!showAdd && snippets.length < 50 && (
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setFormKeyword(''); setFormContent('') }}
          style={{
            background: 'var(--bg-hover)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            padding: '8px 16px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'
            e.currentTarget.style.color = 'rgba(165,180,252,0.9)'
            e.currentTarget.style.background = 'rgba(99,102,241,0.07)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
        >
          <Plus size={14} />
          {t('snippet.add')}
        </button>
      )}
      {snippets.length >= 50 && !showAdd && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
          {t('snippet.limitReached')}
        </div>
      )}
    </>
  )
}
