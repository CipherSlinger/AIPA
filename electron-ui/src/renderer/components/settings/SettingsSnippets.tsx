// Settings → Snippets (wave 83A).
//
// The chat composer already expands `::keyword`, and `prefs.textSnippets` is
// already backed up and restored. This page is the missing authoring surface:
// every snippet can be created, renamed, rewritten and deleted here.
//
// Saves persist immediately (prefsSet) instead of waiting for the page-wide
// Save button used by General/AI Engine. A snippet list has no "uncommitted"
// state worth holding: the popup reads the store live, and a draft that only
// lives in this panel would make `::` disagree with what is on screen. For the
// same reason SettingsPanel's save loop skips `textSnippets` — otherwise a
// later click on General's Save would write its mount-time snapshot back over
// these edits.
import React, { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Type } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import type { TextSnippet } from '../../types/app.types'
import { INPUT_STYLE } from './settingsConstants'
import {
  SNIPPET_CONTENT_MAX,
  SNIPPET_KEYWORD_MAX,
  SNIPPET_LIMIT,
  normalizeSnippetKeyword,
  validateSnippet,
  type SnippetValidation,
} from './snippetRules'

/** Stable fallback: a fresh `[]` on every render would invalidate the filter memo. */
const EMPTY_SNIPPETS: TextSnippet[] = []

function newSnippetId(): string {
  return `snip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** One-line preview; the list must stay one row tall per snippet. */
function contentPreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

export default function SettingsSnippets() {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const snippets: TextSnippet[] = prefs.textSnippets ?? EMPTY_SNIPPETS

  const [query, setQuery] = useState('')
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

  const beginAdd = () => {
    setShowAdd(true)
    setEditingId(null)
    setFormKeyword('')
    setFormContent('')
    setDeletingId(null)
  }

  const beginEdit = (snippet: TextSnippet) => {
    setShowAdd(false)
    setEditingId(snippet.id)
    setFormKeyword(snippet.keyword)
    setFormContent(snippet.content)
    setDeletingId(null)
  }

  const formOpen = showAdd || editingId !== null
  const validation: SnippetValidation = validateSnippet({
    keyword: formKeyword,
    content: formContent,
    existing: snippets,
    editingId,
  })
  const hasTyped = formKeyword.trim().length > 0 || formContent.trim().length > 0
  const refusal = !validation.ok && hasTyped ? validation : null

  const refusalText = (result: Exclude<SnippetValidation, { ok: true }>): string => {
    switch (result.code) {
      case 'keyword_empty':
        return t('snippet.error.keywordEmpty')
      case 'keyword_too_long':
        return t('snippet.error.keywordTooLong', { max: String(SNIPPET_KEYWORD_MAX) })
      case 'keyword_invalid':
        return t('snippet.error.keywordInvalid')
      case 'keyword_duplicate':
        return t('snippet.error.keywordDuplicate', { keyword: result.existingKeyword ?? result.keyword })
      case 'content_empty':
        return t('snippet.error.contentEmpty')
      case 'content_too_long':
        return t('snippet.error.contentTooLong', { max: String(SNIPPET_CONTENT_MAX) })
      case 'limit_reached':
        return t('snippet.error.limitReached', { max: String(SNIPPET_LIMIT) })
    }
  }

  const submit = () => {
    const result = validateSnippet({
      keyword: formKeyword,
      content: formContent,
      existing: snippets,
      editingId,
    })
    if (!result.ok) return

    if (editingId) {
      // The row can disappear while the form is open only through an outside
      // store write (a restore, say). Saving into nothing would look like a
      // success while dropping the edit, so close instead of pretending.
      if (!snippets.some(s => s.id === editingId)) {
        resetForm()
        return
      }
      saveSnippets(
        snippets.map(s =>
          s.id === editingId
            ? { ...s, keyword: result.keyword, content: result.content }
            : s,
        ),
      )
    } else {
      saveSnippets([
        ...snippets,
        { id: newSnippetId(), keyword: result.keyword, content: result.content },
      ])
    }
    resetForm()
  }

  const confirmDelete = (id: string) => {
    saveSnippets(snippets.filter(s => s.id !== id))
    if (editingId === id) resetForm()
    setDeletingId(null)
  }

  const searchVisible = snippets.length > 6
  const trimmedQuery = query.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!searchVisible || !trimmedQuery) return snippets
    return snippets.filter(
      s =>
        s.keyword.toLowerCase().includes(trimmedQuery) ||
        s.content.toLowerCase().includes(trimmedQuery),
    )
  }, [snippets, searchVisible, trimmedQuery])

  const atCap = snippets.length >= SNIPPET_LIMIT
  const normalizedPreview = normalizeSnippetKeyword(formKeyword)
  const formTitle = editingId ? t('snippet.formEditTitle') : t('snippet.formAddTitle')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Type size={15} style={{ color: 'var(--accent-text)' }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('snippet.title')}
          </h2>
          <span style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: atCap ? 'var(--warning-text)' : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {t('snippet.count', { count: String(snippets.length), max: String(SNIPPET_LIMIT) })}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('snippet.hint')}
        </div>
      </div>

      {searchVisible && (
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none',
            }}
          />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('snippet.searchPlaceholder')}
            aria-label={t('snippet.searchPlaceholder')}
            style={{ ...INPUT_STYLE, paddingLeft: 30 }}
          />
        </div>
      )}

      {formOpen && (
        <div style={{
          padding: '12px 14px',
          background: 'var(--glass-bg-low)',
          border: '1px solid rgba(99,102,241,0.30)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {formTitle}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {t('snippet.keyword')}
          </div>
          <input
            value={formKeyword}
            onChange={e => setFormKeyword(e.target.value)}
            placeholder={t('snippet.keywordPlaceholder')}
            aria-label={t('snippet.keyword')}
            style={{ ...INPUT_STYLE, fontFamily: 'monospace' }}
            autoFocus
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('snippet.triggerPreview')}</span>
            <code style={{
              fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
              color: 'var(--accent-text)',
              background: 'rgba(99,102,241,0.12)', borderRadius: 5, padding: '1px 6px',
            }}>
              {normalizedPreview ? `::${normalizedPreview}` : t('snippet.keywordPreviewEmpty')}
            </code>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {t('snippet.content')}
          </div>
          <textarea
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
            placeholder={t('snippet.contentPlaceholder')}
            aria-label={t('snippet.content')}
            rows={4}
            style={{
              ...INPUT_STYLE,
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              minHeight: 70,
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, fontSize: 10, color: 'var(--text-muted)',
          }}>
            <span>{t('snippet.keywordHint')}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t('snippet.contentCounter', {
                // Same value the rules measure: leading/trailing whitespace is
                // trimmed before the 4000-character check.
                count: String(formContent.trim().length),
                max: String(SNIPPET_CONTENT_MAX),
              })}
            </span>
          </div>

          {refusal && (
            <div role="alert" style={{ fontSize: 11, color: 'var(--danger-text)', lineHeight: 1.45 }}>
              {refusalText(refusal)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={!validation.ok}
              title={!validation.ok && refusal ? refusalText(refusal) : undefined}
              style={{
                background: validation.ok
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'var(--bg-hover)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                cursor: validation.ok ? 'pointer' : 'not-allowed',
                opacity: validation.ok ? 1 : 0.5,
              }}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {snippets.length === 0 && !formOpen && (
        <div style={{
          padding: '28px 20px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 10,
          color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6,
        }}>
          <div style={{ marginBottom: 4 }}>{t('snippet.empty')}</div>
          <div style={{ fontSize: 11 }}>{t('snippet.triggerHint')}</div>
        </div>
      )}

      {snippets.length > 0 && visible.length === 0 && (
        <div style={{
          padding: '20px 16px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 12,
        }}>
          {t('snippet.noMatches', { query: query.trim() })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(snippet => {
          const isDeleting = deletingId === snippet.id
          const isEditing = editingId === snippet.id
          if (isEditing) return null
          return (
            <div key={snippet.id}>
              <div style={{
                padding: '9px 12px',
                background: 'var(--glass-bg-low)',
                border: isDeleting ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--border)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: 'var(--accent-text)', fontFamily: 'monospace',
                  }}>
                    ::{snippet.keyword}
                  </div>
                  <div
                    title={contentPreview(snippet.content)}
                    style={{
                      fontSize: 11, color: 'var(--text-secondary)', marginTop: 3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {contentPreview(snippet.content)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => beginEdit(snippet)}
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 8,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-text)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setDeletingId(isDeleting ? null : snippet.id)}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    style={{
                      background: isDeleting ? 'rgba(239,68,68,0.12)' : 'none',
                      border: 'none',
                      color: isDeleting ? 'var(--danger-text)' : 'var(--text-muted)',
                      cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 8,
                    }}
                    onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.color = 'var(--danger-text)' }}
                    onMouseLeave={e => { if (!isDeleting) e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {isDeleting && (
                <div
                  role="alertdialog"
                  aria-label={t('snippet.deleteTitle', { keyword: snippet.keyword })}
                  style={{
                    margin: '4px 0 0 10px', padding: '8px 12px',
                    borderLeft: '2px solid rgba(239,68,68,0.45)',
                    background: 'rgba(239,68,68,0.06)', borderRadius: '0 8px 8px 0',
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 180, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {t('snippet.deleteTitle', { keyword: snippet.keyword })}
                    </div>
                    <div>{t('snippet.deleteBody')}</div>
                  </div>
                  <button
                    onClick={() => setDeletingId(null)}
                    style={{
                      background: 'var(--bg-hover)', border: '1px solid var(--border)',
                      borderRadius: 7, padding: '5px 10px', fontSize: 11,
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => confirmDelete(snippet.id)}
                    style={{
                      background: 'rgba(239,68,68,0.85)', border: 'none',
                      borderRadius: 7, padding: '5px 10px', fontSize: 11,
                      fontWeight: 600, color: 'white', cursor: 'pointer',
                    }}
                  >
                    {t('snippet.deleteConfirm')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!formOpen && (
        <>
          <button
            onClick={beginAdd}
            disabled={atCap}
            title={atCap ? t('snippet.error.limitReached', { max: String(SNIPPET_LIMIT) }) : undefined}
            style={{
              background: 'var(--bg-hover)',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              padding: '8px 16px',
              color: atCap ? 'var(--text-faint)' : 'var(--text-muted)',
              cursor: atCap ? 'not-allowed' : 'pointer',
              opacity: atCap ? 0.6 : 1,
              fontSize: 12,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Plus size={14} />
            {t('snippet.add')}
          </button>
          {atCap && (
            <div style={{ fontSize: 11, color: 'var(--warning-text)', textAlign: 'center' }}>
              {t('snippet.error.limitReached', { max: String(SNIPPET_LIMIT) })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
