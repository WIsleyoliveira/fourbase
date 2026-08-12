import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconPlus, IconTrash, IconNotes, IconKanban, IconCheckPlain,
  IconBold, IconItalic, IconUnderline, IconStrikethrough,
  IconList, IconListOrdered, IconQuote,
  IconLink, IconCalendar, IconType,
  IconHeading, IconParagraph,
  IconFolderFilled, IconClose, IconPaperclip, IconBuilding,
} from '../icons.jsx'
import { api } from '../api.js'
import { getPreview } from '../textPreview.js'
import { supabase, NOTE_FILES_BUCKET, storagePathFromUrl } from '../supabase.js'
import NoteAttachments, { extOf, isImageAttachment } from './NoteAttachments.jsx'

const ATTACHMENT_LIMIT_MB = 25
const ATTACHMENT_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv']
const ATTACHMENT_ACCEPT = ATTACHMENT_EXTS.map((e) => `.${e}`).join(',')

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
  notes, onCreate, onSave, onDelete, onSendToKanban, onLinkFolder, onUpdateAttachments, onNavigateToFolder,
  targetNoteId, onConsumeNoteTarget,
}) {
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
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
  const [clients, setClients]         = useState([])
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

  // Cliente dono da pasta — sobe a cadeia de pais até achar um client_id
  // (subpastas herdam o client_id do pai na criação, mas caímos aqui como reforço)
  const clientIdFor = (folder) => {
    let cur = folder
    while (cur) {
      if (cur.client_id) return cur.client_id
      cur = folders.find((f) => f.id === cur.parent_id) || null
    }
    return null
  }

  const clientNameFor = (folder) => {
    const id = clientIdFor(folder)
    return id ? clients.find((c) => c.id === id)?.name || null : null
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

  // Carrega os clientes — só para mostrar de quem é a pasta no seletor "Relacionar"
  useEffect(() => {
    api.getClients().then(setClients).catch(() => {})
  }, [])

  // Consome o alvo de navegação vindo de Documentações (só precisa disparar uma vez, ao montar)
  useEffect(() => {
    if (targetNoteId) onConsumeNoteTarget?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha o lightbox de preview de imagem com ESC
  useEffect(() => {
    if (!previewImage) return
    const handler = (e) => { if (e.key === 'Escape') setPreviewImage(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewImage])

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

  // ── Anexos ───────────────────────────────────────────────────────────────
  const uploadFiles = async (fileList) => {
    if (!active) return
    const files = Array.from(fileList || []).filter((f) => {
      if (!ATTACHMENT_EXTS.includes(extOf(f.name))) return false
      if (f.size > ATTACHMENT_LIMIT_MB * 1024 * 1024) return false
      return true
    })
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const ext = extOf(file.name) || 'bin'
        const path = `notes/${active.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage
          .from(NOTE_FILES_BUCKET)
          .upload(path, file, { cacheControl: '3600', contentType: file.type || 'application/octet-stream' })
        if (error) throw error
        const { data } = supabase.storage.from(NOTE_FILES_BUCKET).getPublicUrl(path)
        uploaded.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file_name: file.name,
          file_url: data.publicUrl,
          file_size: file.size,
          file_type: file.type || '',
          created_at: new Date().toISOString(),
        })
      }
      onUpdateAttachments(active.id, [...(active.attachments || []), ...uploaded])
    } catch (err) {
      alert(err.message || 'Falha ao enviar arquivo')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e) => {
    uploadFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    uploadFiles(e.dataTransfer.files)
  }

  const removeAttachment = (att) => {
    if (!active || !confirm(`Remover "${att.file_name}"?`)) return
    onUpdateAttachments(active.id, (active.attachments || []).filter((a) => a.id !== att.id))
    const path = storagePathFromUrl(att.file_url, NOTE_FILES_BUCKET)
    if (path) supabase.storage.from(NOTE_FILES_BUCKET).remove([path]).catch(() => {})
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
            const noteAttachments = n.attachments || []
            const coverImage = noteAttachments.find(isImageAttachment)
            return (
              <div
                key={n.id}
                className={`note-item${n.id === activeId ? ' active' : ''}`}
                onClick={() => selectNote(n.id)}
              >
                {coverImage && (
                  <div className="note-item-cover">
                    <img src={coverImage.file_url} alt="" />
                  </div>
                )}
                <div className="note-item-main">
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
                {noteAttachments.length > 0 && (
                  <div className="note-item-attachments-badge">
                    <IconPaperclip size={11} />
                    {noteAttachments.length} anexo{noteAttachments.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* ══ Painel de edição ════════════════════════════════════════════════ */}
      {active ? (
        <div
          className={`panel editor-panel${dragActive ? ' drag-active' : ''}`}
          onKeyDown={onKeyDown}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false) }}
          onDrop={handleDrop}
        >
          {dragActive && (
            <div className="editor-dropzone-overlay">
              <IconPaperclip size={22} />
              <span>Solte para anexar à nota</span>
            </div>
          )}

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
                onClick={() => onNavigateToFolder(linkedFolder.id, clientIdFor(linkedFolder))}
              >
                <IconFolderFilled size={13} style={{ color: linkedFolder.color }} />
                <span>{linkedFolder.name}</span>
                {clientNameFor(linkedFolder) && (
                  <small className="note-folder-badge-client">{clientNameFor(linkedFolder)}</small>
                )}
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
                      {relateResults.map((f) => {
                        const clientName = clientNameFor(f)
                        return (
                          <button key={f.id} className="relate-item" onClick={() => linkFolder(f.id)}>
                            <IconFolderFilled size={15} style={{ color: f.color }} />
                            <span className="relate-item-name">{f.name}</span>
                            <span className="relate-item-meta">
                              {f.parent_id && (
                                <small className="relate-item-path">{folderPath(f.parent_id)}</small>
                              )}
                              {clientName ? (
                                <small className="relate-item-client">
                                  <IconBuilding size={10} />
                                  {clientName}
                                </small>
                              ) : (
                                <small className="relate-item-client relate-item-client-none">Sem cliente</small>
                              )}
                            </span>
                          </button>
                        )
                      })}
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

            <ToolDivider />

            {/* Bloco 5: Anexos */}
            <div className="toolbar-group">
              <button
                type="button"
                className="toolbar-attach-btn"
                title="Anexar arquivo"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconPaperclip size={14} />
                Anexar arquivo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                hidden
                onChange={handleFileSelect}
              />
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

          {/* ── Anexos da nota ── */}
          {(uploading || (active.attachments || []).length > 0) && (
            <div className="note-attachments">
              {uploading && (
                <div className="note-attachments-uploading">
                  <span className="note-attachments-spinner" />
                  Enviando arquivo…
                </div>
              )}
              <NoteAttachments
                attachments={active.attachments || []}
                onRemove={removeAttachment}
                onPreviewImage={setPreviewImage}
              />
            </div>
          )}

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

      {previewImage && createPortal(
        <div className="lightbox-backdrop" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="" />
          <button className="lightbox-close" onClick={() => setPreviewImage(null)}>
            <IconClose size={18} />
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
