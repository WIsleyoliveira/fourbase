import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconNotes } from '../icons.jsx'

const formatDate = (iso) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

const stripHtml = (html) => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerText.trim()
}

export default function NotesView({ notes, onCreate, onSave, onDelete }) {
  const editorRef = useRef(null)
  const [activeId, setActiveId] = useState(notes[0]?.id ?? null)
  const [title, setTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [wordCount, setWordCount] = useState(0)

  const active = notes.find((n) => n.id === activeId) || null

  // carrega a nota ativa no editor
  useEffect(() => {
    setTitle(active?.title || '')
    if (editorRef.current) editorRef.current.innerHTML = active?.content || ''
    setDirty(false)
    updateCount()
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // se a nota ativa sumiu (excluída) ou não há seleção, seleciona a primeira
  useEffect(() => {
    if (!notes.find((n) => n.id === activeId)) {
      setActiveId(notes[0]?.id ?? null)
    }
  }, [notes]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateCount = () => {
    const text = editorRef.current?.innerText || ''
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
  }

  const save = async () => {
    if (!active || saving) return
    setSaving(true)
    try {
      await onSave(active.id, title.trim() || 'Sem título', editorRef.current?.innerHTML || '')
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const selectNote = async (id) => {
    if (id === activeId) return
    if (dirty) await save() // salva silenciosamente antes de trocar
    setActiveId(id)
  }

  const createNote = async () => {
    if (dirty) await save()
    const note = await onCreate()
    if (note) setActiveId(note.id)
  }

  const removeNote = (id) => {
    if (!confirm('Excluir esta nota?')) return
    onDelete(id)
  }

  const exec = (cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    setDirty(true)
    updateCount()
  }

  const insertLink = () => {
    const url = prompt('URL do link:')
    if (url) exec('createLink', url)
  }

  const insertDate = () => exec('insertText', new Date().toLocaleDateString('pt-BR'))

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    }
  }

  return (
    <div className="notes-layout">
      <aside className="notes-list panel">
        <div className="notes-list-header">
          <h3>Suas notas</h3>
          <button className="icon-btn" title="Nova nota" onClick={createNote}>
            <IconPlus size={16} />
          </button>
        </div>
        <div className="notes-items">
          {notes.length === 0 && (
            <div className="empty-hint">Nenhuma nota — crie a primeira.</div>
          )}
          {notes.map((n) => {
            const preview = stripHtml(n.content).slice(0, 64)
            return (
              <div
                key={n.id}
                className={`note-item${n.id === activeId ? ' active' : ''}`}
                onClick={() => selectNote(n.id)}
              >
                <div className="note-item-body">
                  <strong>{n.title || 'Sem título'}</strong>
                  {preview && <small className="note-preview">{preview}</small>}
                  <small className="note-date">{formatDate(n.updated_at)}</small>
                </div>
                <button
                  className="icon-btn danger"
                  title="Excluir nota"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeNote(n.id)
                  }}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      {active ? (
        <div className="panel editor-panel" onKeyDown={onKeyDown}>
          <input
            className="note-title"
            type="text"
            placeholder="Título da nota"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setDirty(true)
            }}
          />
          <div className="notes-toolbar">
            <div className="toolbar-group">
              <button className="secondary" title="Título" onClick={() => exec('formatBlock', 'H2')}>
                H2
              </button>
              <button className="secondary" title="Parágrafo" onClick={() => exec('formatBlock', 'P')}>
                ¶
              </button>
            </div>
            <div className="toolbar-group">
              <button className="secondary" title="Negrito (Ctrl+B)" onClick={() => exec('bold')}>
                <b>B</b>
              </button>
              <button className="secondary" title="Itálico (Ctrl+I)" onClick={() => exec('italic')}>
                <i>I</i>
              </button>
              <button className="secondary" title="Sublinhado" onClick={() => exec('underline')}>
                <u>U</u>
              </button>
              <button className="secondary" title="Tachado" onClick={() => exec('strikeThrough')}>
                <s>S</s>
              </button>
            </div>
            <div className="toolbar-group">
              <button className="secondary" title="Lista" onClick={() => exec('insertUnorderedList')}>
                • Lista
              </button>
              <button className="secondary" title="Lista numerada" onClick={() => exec('insertOrderedList')}>
                1. Lista
              </button>
              <button className="secondary" title="Citação" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}>
                ❝
              </button>
            </div>
            <div className="toolbar-group">
              <button className="secondary" title="Inserir link" onClick={insertLink}>
                Link
              </button>
              <button className="secondary" title="Inserir data de hoje" onClick={insertDate}>
                Data
              </button>
              <button className="secondary" title="Limpar formatação" onClick={() => exec('removeFormat')}>
                Tx
              </button>
            </div>
            <span className="toolbar-spacer" />
            <button className={dirty ? '' : 'secondary'} disabled={saving} onClick={save}>
              {saving ? 'Salvando...' : dirty ? 'Salvar' : 'Salvo ✓'}
            </button>
          </div>
          <div
            ref={editorRef}
            className="editor"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Escreva ideias, observações, links, decisões e documentação interna da fourbase..."
            onInput={() => {
              setDirty(true)
              updateCount()
            }}
          />
          <div className="editor-footer">
            <span>
              {wordCount} palavra{wordCount === 1 ? '' : 's'}
            </span>
            <span>
              {dirty ? 'Alterações não salvas · Ctrl+S para salvar' : `Atualizada em ${formatDate(active.updated_at)}`}
            </span>
          </div>
        </div>
      ) : (
        <div className="panel editor-empty">
          <IconNotes size={34} />
          <strong>Nenhuma nota selecionada</strong>
          <p>Crie sua primeira nota para começar a documentar.</p>
          <button onClick={createNote}>
            <IconPlus size={16} />
            <span>Nova nota</span>
          </button>
        </div>
      )}
    </div>
  )
}
