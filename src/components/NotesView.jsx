import { useEffect, useRef, useState } from 'react'
import {
  IconPlus, IconTrash, IconNotes, IconKanban, IconCheckPlain,
  IconBold, IconItalic, IconUnderline, IconStrikethrough,
  IconList, IconListOrdered, IconQuote,
  IconLink, IconCalendar, IconType,
  IconHeading, IconParagraph,
  IconFolderFilled, IconClose,
} from '../icons.jsx'
import { api } from '../api.js'
import { getPreview } from '../textPreview.js'

const formatDate = (iso) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// ─── Sub-componente: botão de ferramenta da toolbar ───────────────────────────
function ToolBtn({ title, onClick, children }) {
  return (
    <button
      className="toolbar-btn"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault() // evita perder o foco do editor
        onClick()
      }}
    >
      {children}
    </button>
  )
}

// ─── Sub-componente: divisor da toolbar ───────────────────────────────────────
function ToolDivider() {
  return <span className="toolbar-divider" aria-hidden="true" />
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function NotesView({
  notes, onCreate, onSave, onDelete, onSendToKanban, onLinkFolder, onNavigateToFolder,
  targetNoteId, onConsumeNoteTarget,
}) {
  const editorRef = useRef(null)
  // Se chegamos aqui vindos de um documento relacionado (aba Documentações), abre direto naquela nota
  const [activeId, setActiveId] = useState(() =>
    targetNoteId && notes.some((n) => n.id === targetNoteId) ? targetNoteId : notes[0]?.id ?? null,
  )
  const [title, setTitle]         = useState('')
  const [dirty, setDirty]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [search, setSearch]       = useState('')
  const [sortBy, setSortBy]       = useState('recent')

  // Pastas de Documentações (carregadas à parte, só para o seletor "Relacionar")
  const [folders, setFolders]         = useState([])
  const [relateOpen, setRelateOpen]   = useState(false)
  const [relateSearch, setRelateSearch] = useState('')
  const relateRef = useRef(null)

  const active = notes.find((n) => n.id === activeId) || null
  const linkedFolder = active?.folder_id ? folders.find((f) => f.id === active.folder_id) || null : null

  // Caminho "Pai › Filho" de uma pasta, usada na lista de seleção
  const folderPath = (id) => {
    const parts = []
    let cur = folders.find((f) => f.id === id)
    while (cur) {
      parts.unshift(cur.name)
      cur = folders.find((f) => f.id === cur.parent_id) || null
    }
    return parts.join(' › ')
  }

  const visibleNotes = notes
    .filter((n) => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return n.title.toLowerCase().includes(q) || getPreview(n.content).toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'title')  return (a.title || '').localeCompare(b.title || '')
      if (sortBy === 'oldest') return new Date(a.updated_at) - new Date(b.updated_at)
      return new Date(b.updated_at) - new Date(a.updated_at)
    })

  useEffect(() => {
    setTitle(active?.title || '')
    if (editorRef.current) editorRef.current.innerHTML = active?.content || ''
    setDirty(false)
    updateCount()
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notes.find((n) => n.id === activeId)) {
      setActiveId(notes[0]?.id ?? null)
    }
  }, [notes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega as pastas de Documentações uma vez — usadas no badge e no seletor "Relacionar"
  useEffect(() => {
    api.getFolders().then(setFolders).catch(() => {})
  }, [])

  // Consome o alvo de navegação vindo de Documentações (só precisa disparar uma vez, ao montar)
  useEffect(() => {
    if (targetNoteId) onConsumeNoteTarget?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha o seletor de pastas ao clicar fora ou pressionar ESC
  useEffect(() => {
    if (!relateOpen) return
    const handleClick = (e) => {
      if (relateRef.current && !relateRef.current.contains(e.target)) setRelateOpen(false)
    }
    const handleKey = (e) => { if (e.key === 'Escape') setRelateOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [relateOpen])

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
    if (dirty) await save()
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

  const linkFolder = (folderId) => {
    setRelateOpen(false)
    setRelateSearch('')
    if (active) onLinkFolder(active.id, folderId)
  }

  const unlinkFolder = () => {
    if (active) onLinkFolder(active.id, null)
  }

  const relateResults = folders.filter((f) =>
    f.name.toLowerCase().includes(relateSearch.trim().toLowerCase()),
  )

  // execCommand com foco garantido; onMouseDown nos ToolBtn já previne blur
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
      {/* ══ Sidebar de notas ══════════════════════════════════════════════════ */}
      <aside className="notes-list panel">
        <div className="notes-list-header">
          <h3>Suas notas</h3>
          <button className="icon-btn" title="Nova nota" onClick={createNote}>
            <IconPlus size={16} />
          </button>
        </div>

        <div className="notes-filters">
          <input
            type="text"
            placeholder="Buscar notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="title">Título A-Z</option>
          </select>
        </div>

        <div className="notes-items">
          {notes.length === 0 && (
            <div className="empty-hint">Nenhuma nota — crie a primeira.</div>
          )}
          {notes.length > 0 && visibleNotes.length === 0 && (
            <div className="empty-hint">Nenhuma nota encontrada.</div>
          )}
          {visibleNotes.map((n) => {
            const preview = getPreview(n.content)
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
                <div className="note-item-actions">
                  <button
                    className="icon-btn"
                    title="Enviar para o Kanban"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSendToKanban(n.title || 'Sem título', getPreview(n.content))
                    }}
                  >
                    <IconKanban size={14} />
                  </button>
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
              </div>
            )
          })}
        </div>
      </aside>

      {/* ══ Painel de edição ════════════════════════════════════════════════ */}
      {active ? (
        <div className="panel editor-panel" onKeyDown={onKeyDown}>

          {/* ── Cabeçalho: título + relacionar pasta + botão Virar tarefa ── */}
          <div className="editor-panel-header">
            <input
              className="note-title"
              type="text"
              placeholder="Título da nota…"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
            />

            {linkedFolder ? (
              <button
                className="note-folder-badge"
                style={{ '--folder-color': linkedFolder.color }}
                title={`Ir para a pasta "${linkedFolder.name}" em Documentações`}
                onClick={() => onNavigateToFolder(linkedFolder.id)}
              >
                <IconFolderFilled size={13} style={{ color: linkedFolder.color }} />
                <span>{linkedFolder.name}</span>
                <span
                  className="note-folder-badge-x"
                  title="Remover relação"
                  onClick={(e) => { e.stopPropagation(); unlinkFolder() }}
                >
                  <IconClose size={11} />
                </span>
              </button>
            ) : (
              <div className="relate-wrap" ref={relateRef}>
                <button
                  className="btn-relate"
                  title="Relacionar esta nota a uma pasta de Documentações"
                  onClick={() => setRelateOpen((v) => !v)}
                >
                  <IconLink size={14} />
                  Relacionar
                </button>
                {relateOpen && (
                  <div className="relate-popover">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Buscar pasta..."
                      value={relateSearch}
                      onChange={(e) => setRelateSearch(e.target.value)}
                    />
                    <div className="relate-list">
                      {relateResults.length === 0 && (
                        <div className="empty-hint">Nenhuma pasta encontrada.</div>
                      )}
                      {relateResults.map((f) => (
                        <button key={f.id} className="relate-item" onClick={() => linkFolder(f.id)}>
                          <IconFolderFilled size={15} style={{ color: f.color }} />
                          <span className="relate-item-name">{f.name}</span>
                          {f.parent_id && (
                            <small className="relate-item-path">{folderPath(f.parent_id)}</small>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn-to-kanban"
              title="Criar tarefa no Kanban a partir desta nota"
              onClick={() =>
                onSendToKanban(title.trim() || 'Sem título', editorRef.current?.innerText.trim() || '')
              }
            >
              <IconKanban size={14} />
              Virar tarefa
            </button>
          </div>

          {/* ── Toolbar com ícones ── */}
          <div className="notes-toolbar" role="toolbar" aria-label="Formatação">

            {/* Bloco 1: Bloco de texto */}
            <div className="toolbar-group">
              <ToolBtn title="Título (H2)" onClick={() => exec('formatBlock', 'H2')}>
                <IconHeading size={15} />
              </ToolBtn>
              <ToolBtn title="Parágrafo" onClick={() => exec('formatBlock', 'P')}>
                <IconParagraph size={15} />
              </ToolBtn>
            </div>

            <ToolDivider />

            {/* Bloco 2: Estilo inline */}
            <div className="toolbar-group">
              <ToolBtn title="Negrito (Ctrl+B)" onClick={() => exec('bold')}>
                <IconBold size={15} />
              </ToolBtn>
              <ToolBtn title="Itálico (Ctrl+I)" onClick={() => exec('italic')}>
                <IconItalic size={15} />
              </ToolBtn>
              <ToolBtn title="Sublinhado (Ctrl+U)" onClick={() => exec('underline')}>
                <IconUnderline size={15} />
              </ToolBtn>
              <ToolBtn title="Tachado" onClick={() => exec('strikeThrough')}>
                <IconStrikethrough size={15} />
              </ToolBtn>
            </div>

            <ToolDivider />

            {/* Bloco 3: Listas e citação */}
            <div className="toolbar-group">
              <ToolBtn title="Lista de marcadores" onClick={() => exec('insertUnorderedList')}>
                <IconList size={15} />
              </ToolBtn>
              <ToolBtn title="Lista numerada" onClick={() => exec('insertOrderedList')}>
                <IconListOrdered size={15} />
              </ToolBtn>
              <ToolBtn title="Citação" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}>
                <IconQuote size={15} />
              </ToolBtn>
            </div>

            <ToolDivider />

            {/* Bloco 4: Links e extras */}
            <div className="toolbar-group">
              <ToolBtn title="Inserir link" onClick={insertLink}>
                <IconLink size={15} />
              </ToolBtn>
              <ToolBtn title="Inserir data de hoje" onClick={insertDate}>
                <IconCalendar size={15} />
              </ToolBtn>
              <ToolBtn title="Limpar formatação" onClick={() => exec('removeFormat')}>
                <IconType size={15} />
              </ToolBtn>
            </div>
          </div>

          {/* ── Área do editor ── */}
          <div
            ref={editorRef}
            className="editor"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Escreva ideias, observações, links, decisões e documentação interna…"
            onInput={() => {
              setDirty(true)
              updateCount()
            }}
          />

          {/* ── Rodapé: contagem + status salvo ── */}
          <div className="editor-footer">
            <span className="editor-word-count">
              {wordCount} palavra{wordCount === 1 ? '' : 's'}
            </span>
            <div className="editor-footer-right">
              {dirty ? (
                <>
                  <span className="editor-unsaved-hint">Ctrl+S para salvar</span>
                  <button className="btn-save" disabled={saving} onClick={save}>
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                </>
              ) : (
                <span className="editor-saved-badge">
                  <IconCheckPlain size={11} />
                  {saving ? 'Salvando…' : 'Alterações salvas'}
                </span>
              )}
            </div>
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
