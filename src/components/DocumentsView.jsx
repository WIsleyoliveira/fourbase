import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconFolderFilled,
  IconFolder,
  IconChevronRight,
  IconMoreHorizontal,
  IconPlus,
  IconTrash,
  IconMedia,
  IconPlay,
  IconNotes,
  IconCheckPlain,
  IconClose,
} from '../icons.jsx'
import { getPreview } from '../textPreview.js'
import { supabase, CLIENT_MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'
import { api } from '../api.js'

const LIMIT_MB = 25

const FOLDER_COLORS = [
  { name: 'Teal',     value: '#14b8c4' },
  { name: 'Verde',    value: '#2ec27e' },
  { name: 'Laranja',  value: '#f2a93b' },
  { name: 'Vermelho', value: '#e85d75' },
  { name: 'Azul',     value: '#4f8ff7' },
  { name: 'Roxo',     value: '#a855f7' },
  { name: 'Escuro',   value: '#1f2937' },
]

const KIND_ICON  = { image: IconMedia, video: IconPlay, document: IconNotes }
const KIND_LABEL = { image: 'Imagem', video: 'Vídeo', document: 'Documento' }

const kindFromFile = (f) =>
  f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'document'

// Retorna filhos diretos de parentId, ordenados por nome
const childrenOf = (folders, parentId) =>
  folders
    .filter((f) => (f.parent_id || null) === (parentId || null))
    .sort((a, b) => a.name.localeCompare(b.name))

// Retorna IDs de todos os descendentes de um nó (busca em largura)
function allDescendantIds(folders, rootId) {
  const result = new Set()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()
    folders.filter((f) => f.parent_id === id).forEach((f) => {
      result.add(f.id)
      queue.push(f.id)
    })
  }
  return result
}

// Context partilhado por toda a árvore (evita prop-drilling em nós recursivos)
const FolderCtx = createContext(null)

// ── Palheta de cores ────────────────────────────────────────────────────────
function ColorSwatches({ value, onChange }) {
  return (
    <div className="folder-color-swatches">
      {FOLDER_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`folder-swatch${value === c.value ? ' selected' : ''}`}
          style={{ background: c.value }}
          title={c.name}
          onClick={() => onChange(c.value)}
        >
          {value === c.value && <IconCheckPlain size={11} />}
        </button>
      ))}
    </div>
  )
}

// ── Nó recursivo da árvore ──────────────────────────────────────────────────
function FolderNode({ folder }) {
  const ctx = useContext(FolderCtx)
  const {
    folders, notes, selectedFolderId, selectedDocId,
    expandedIds, docsByFolder,
    menuFolderId, colorPickerFolderId,
    renamingId, renameDraft,
    addingSubTo, newSubName, newSubColor,
    menuRef,
    onSelect, onToggle, onOpenUpload,
    onMenuOpen, onMenuClose, onColorPickerOpen,
    onRenameStart, onRenameDraftChange, onRenameSave, onRenameCancel,
    onChangeColor, onRemove,
    onDocSelect, onOpenNote,
    onStartAddSub, onNewSubNameChange, onNewSubColorChange, onSubmitSub, onCancelSub,
  } = ctx

  const isExpanded   = expandedIds.has(folder.id)
  const isActive     = folder.id === selectedFolderId && !selectedDocId
  const docs         = docsByFolder[folder.id] || []
  const folderNotes  = notes.filter((n) => n.folder_id === folder.id)
  const isRenaming   = renamingId === folder.id
  const isMenuOpen   = menuFolderId === folder.id
  const isAddingSub  = addingSubTo === folder.id
  const childFolders = childrenOf(folders, folder.id)
  const hasContent   = childFolders.length > 0 || docs.length > 0 || folderNotes.length > 0

  return (
    <div className="folder-branch">
      {/* ── Linha da pasta ── */}
      <div
        className={`folder-row${isActive ? ' active' : ''}`}
        onClick={() => onSelect(folder.id)}
      >
        <button
          className="folder-chevron"
          onClick={(e) => onToggle(folder.id, e)}
          style={{ visibility: hasContent || isAddingSub ? 'visible' : 'hidden' }}
        >
          <IconChevronRight
            size={13}
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>

        <IconFolderFilled size={17} style={{ color: folder.color || '#14b8c4' }} />

        {isRenaming ? (
          <input
            className="folder-rename-input"
            autoFocus
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => onRenameSave(folder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSave(folder.id)
              if (e.key === 'Escape') onRenameCancel()
            }}
          />
        ) : (
          <span className="folder-name">{folder.name}</span>
        )}

        <span className="folder-row-actions">
          <button
            className="icon-btn"
            title="Adicionar documento"
            onClick={(e) => { e.stopPropagation(); onOpenUpload(folder.id) }}
          >
            <IconPlus size={13} />
          </button>
          <button
            className="icon-btn"
            title="Mais opções"
            onClick={(e) => {
              e.stopPropagation()
              isMenuOpen ? onMenuClose() : onMenuOpen(folder.id)
            }}
          >
            <IconMoreHorizontal size={14} />
          </button>
        </span>

        {/* Menu contextual */}
        {isMenuOpen && (
          <div className="folder-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            {colorPickerFolderId === folder.id ? (
              <div className="folder-menu-colors">
                <ColorSwatches
                  value={folder.color}
                  onChange={(color) => onChangeColor(folder.id, color)}
                />
              </div>
            ) : (
              <>
                <button
                  onClick={() => { onRenameStart(folder.id, folder.name); onMenuClose() }}
                >
                  Renomear
                </button>
                <button onClick={() => onColorPickerOpen(folder.id)}>
                  Mudar cor
                </button>
                <button onClick={() => { onStartAddSub(folder.id); onMenuClose() }}>
                  <IconFolder size={13} />
                  Criar subpasta
                </button>
                <button
                  className="danger-text"
                  onClick={() => { onMenuClose(); onRemove(folder.id) }}
                >
                  Excluir
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Conteúdo expandido ── */}
      {(isExpanded || isAddingSub) && (
        <div className="folder-children">

          {/* Formulário inline para nova subpasta */}
          {isAddingSub && (
            <div className="folder-addsub-form">
              <div className="folder-addsub-row">
                <IconFolder size={14} style={{ color: newSubColor, flexShrink: 0 }} />
                <input
                  autoFocus
                  type="text"
                  className="folder-rename-input"
                  placeholder="Nome da subpasta..."
                  value={newSubName}
                  onChange={(e) => onNewSubNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  onSubmitSub(folder.id)
                    if (e.key === 'Escape') onCancelSub()
                  }}
                />
                <button
                  className="icon-btn"
                  title="Criar subpasta"
                  disabled={!newSubName.trim()}
                  onClick={() => onSubmitSub(folder.id)}
                >
                  <IconCheckPlain size={12} />
                </button>
                <button className="icon-btn" title="Cancelar (Esc)" onClick={onCancelSub}>
                  <IconClose size={12} />
                </button>
              </div>
              <div className="folder-addsub-colors">
                <ColorSwatches value={newSubColor} onChange={onNewSubColorChange} />
              </div>
            </div>
          )}

          {/* Subpastas recursivas */}
          {childFolders.map((child) => (
            <FolderNode key={child.id} folder={child} />
          ))}

          {/* Documentos desta pasta */}
          {docs.map((d) => {
            const KindIcon = KIND_ICON[d.kind] || IconNotes
            return (
              <div
                key={d.id}
                className={`folder-child-item${selectedDocId === d.id ? ' active' : ''}`}
                onClick={() => onDocSelect(folder.id, d.id)}
              >
                <KindIcon size={13} />
                <span>{d.name || KIND_LABEL[d.kind]}</span>
              </div>
            )
          })}

          {/* Notas relacionadas a esta pasta */}
          {folderNotes.map((n) => (
            <div
              key={`note-${n.id}`}
              className="folder-child-item folder-child-note"
              onClick={() => onOpenNote(n.id)}
              title="Abrir nota"
            >
              <IconNotes size={13} />
              <span>{n.title || 'Sem título'}</span>
              <small className="folder-child-note-tag">Nota</small>
            </div>
          ))}

          {/* Vazio */}
          {!isAddingSub && childFolders.length === 0 && docs.length === 0 && folderNotes.length === 0 && (
            <div className="folder-child-empty">Pasta vazia</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal de criação de pasta ────────────────────────────────────────────────
function CreateFolderModal({ onClose, onSubmit }) {
  const [name, setName]   = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0].value)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || loading) return
    setLoading(true)
    try {
      await onSubmit(name.trim(), color)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Criar Nova Pasta</h3>
          <button className="icon-btn" title="Fechar" onClick={onClose}>
            <IconClose size={16} />
          </button>
        </div>
        <form className="create-folder-form" onSubmit={submit}>
          <label>
            Nome da pasta
            <input
              type="text"
              autoFocus
              placeholder="Ex: Contratos, Financeiro..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Cor da pasta
            <ColorSwatches value={color} onChange={setColor} />
          </label>
          <div className="create-folder-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Criando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Retorna os IDs de todos os ancestrais (pai, avô, ...) de uma pasta
function ancestorIds(folders, id) {
  const result = []
  let cur = folders.find((f) => f.id === id)
  while (cur && cur.parent_id) {
    result.push(cur.parent_id)
    cur = folders.find((f) => f.id === cur.parent_id)
  }
  return result
}

// ── Componente principal ────────────────────────────────────────────────────
export default function DocumentsView({ onError, targetFolderId, onConsumeTarget, onOpenNote, onUnlinkNote }) {
  const [folders, setFolders]           = useState([])
  const [notes, setNotes]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')

  const [expandedIds, setExpandedIds]   = useState(() => new Set())
  const [docsByFolder, setDocsByFolder] = useState({})
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [selectedDocId, setSelectedDocId]       = useState(null)
  const [lightboxImage, setLightboxImage]       = useState(null)

  const [menuFolderId, setMenuFolderId]               = useState(null)
  const [colorPickerFolderId, setColorPickerFolderId] = useState(null)
  const [renamingId, setRenamingId]                   = useState(null)
  const [renameDraft, setRenameDraft]                 = useState('')

  // Estado do formulário de subpasta inline
  const [addingSubTo, setAddingSubTo]   = useState(null)
  const [newSubName, setNewSubName]     = useState('')
  const [newSubColor, setNewSubColor]   = useState(FOLDER_COLORS[0].value)

  const [uploading, setUploading]       = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const uploadTargetRef = useRef(null)
  const inputRef        = useRef(null)
  const menuRef         = useRef(null)

  // ── Carregamento inicial ─────────────────────────────────────────────────
  useEffect(() => {
    api.getNotes().then(setNotes).catch(() => {})
    api.getFolders()
      .then((list) => {
        setFolders(list)
        // Se chegamos aqui vindos de uma nota relacionada, abre direto naquela pasta
        // (expandindo toda a cadeia de pastas-pai para que ela fique visível na árvore)
        if (targetFolderId && list.some((f) => f.id === targetFolderId)) {
          setSelectedFolderId(targetFolderId)
          setSelectedDocId(null)
          setExpandedIds(new Set([targetFolderId, ...ancestorIds(list, targetFolderId)]))
          onConsumeTarget?.()
          return
        }
        const roots = childrenOf(list, null)
        if (roots.length) {
          setSelectedFolderId(roots[0].id)
          setExpandedIds(new Set([roots[0].id]))
        }
      })
      .catch(onError)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha menu ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (menuFolderId && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuFolderId(null)
        setColorPickerFolderId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuFolderId])

  // Fecha o lightbox de imagem com ESC
  useEffect(() => {
    if (!lightboxImage) return
    const handler = (e) => { if (e.key === 'Escape') setLightboxImage(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightboxImage])

  // ── Documentos ───────────────────────────────────────────────────────────
  const ensureDocsLoaded = (folderId) => {
    if (docsByFolder[folderId] !== undefined) return
    api.getFolderDocuments(folderId)
      .then((docs) => setDocsByFolder((prev) => ({ ...prev, [folderId]: docs })))
      .catch(onError)
  }

  useEffect(() => {
    if (selectedFolderId) ensureDocsLoaded(selectedFolderId)
  }, [selectedFolderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD de pastas ────────────────────────────────────────────────────────
  const createFolder = async (name, color, parentId = null) => {
    const folder = await api.createFolder(name, color, parentId)
    setFolders((prev) => [...prev, folder])
    setSelectedFolderId(folder.id)
    setSelectedDocId(null)
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.add(folder.id)
      if (parentId) next.add(parentId) // garante que o pai está expandido
      return next
    })
    return folder
  }

  const removeFolder = async (id) => {
    if (!confirm('Excluir esta pasta, todas as subpastas e documentos dentro delas?')) return
    try {
      await api.deleteFolder(id)
      const descendants = allDescendantIds(folders, id)
      descendants.add(id)
      setFolders((prev) => prev.filter((f) => !descendants.has(f.id)))
      setDocsByFolder((prev) => {
        const next = { ...prev }
        descendants.forEach((fid) => delete next[fid])
        return next
      })
      if (descendants.has(selectedFolderId)) {
        setSelectedFolderId(null)
        setSelectedDocId(null)
      }
    } catch (err) {
      onError(err)
    }
  }

  const saveRename = async (id) => {
    const trimmed = renameDraft.trim()
    setRenamingId(null)
    if (!trimmed) return
    try {
      const updated = await api.updateFolder(id, { name: trimmed })
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
    } catch (err) {
      onError(err)
    }
  }

  const changeColor = async (id, color) => {
    setColorPickerFolderId(null)
    setMenuFolderId(null)
    try {
      const updated = await api.updateFolder(id, { color })
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
    } catch (err) {
      onError(err)
    }
  }

  // ── Interação com a árvore ────────────────────────────────────────────────
  const toggleExpanded = (id, e) => {
    e.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    ensureDocsLoaded(id)
  }

  const selectFolder = (id) => {
    setSelectedFolderId(id)
    setSelectedDocId(null)
    setExpandedIds((prev) => new Set(prev).add(id))
    ensureDocsLoaded(id)
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const openUpload = (folderId, e) => {
    e?.stopPropagation()
    uploadTargetRef.current = folderId
    inputRef.current?.click()
  }

  const handleUpload = async (event) => {
    const files    = Array.from(event.target.files || [])
    event.target.value = ''
    const folderId = uploadTargetRef.current
    if (!files.length || !folderId) return
    setUploading(true)
    try {
      for (const file of files) {
        if (file.size > LIMIT_MB * 1024 * 1024) {
          onError(new Error(`"${file.name}" é maior que ${LIMIT_MB}MB.`))
          continue
        }
        const kind = kindFromFile(file)
        const ext  = file.name.split('.').pop() || 'bin'
        const path = `${folderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage
          .from(CLIENT_MEDIA_BUCKET)
          .upload(path, file, { cacheControl: '3600', contentType: file.type })
        if (error) throw error
        const { data } = supabase.storage.from(CLIENT_MEDIA_BUCKET).getPublicUrl(path)
        const saved = await api.addFolderDocument(folderId, kind, data.publicUrl, file.name)
        setDocsByFolder((prev) => ({ ...prev, [folderId]: [saved, ...(prev[folderId] || [])] }))
      }
    } catch (err) {
      onError(err)
    } finally {
      setUploading(false)
    }
  }

  // Atualiza a cópia local de notas otimisticamente — este componente busca as notas
  // uma vez ao montar e não escuta as mudanças feitas em App.jsx, então precisa refletir
  // a alteração aqui também para a nota sumir imediatamente da árvore/galeria
  const unlinkNote = (noteId) => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, folder_id: null } : n)))
    onUnlinkNote(noteId)
  }

  const removeDoc = async (folderId, doc) => {
    if (!confirm('Remover este documento?')) return
    try {
      await api.deleteFolderDocument(folderId, doc.id)
      setDocsByFolder((prev) => ({
        ...prev,
        [folderId]: (prev[folderId] || []).filter((d) => d.id !== doc.id),
      }))
      if (selectedDocId === doc.id) setSelectedDocId(null)
      const path = storagePathFromUrl(doc.url, CLIENT_MEDIA_BUCKET)
      if (path) supabase.storage.from(CLIENT_MEDIA_BUCKET).remove([path]).catch(() => {})
    } catch (err) {
      onError(err)
    }
  }

  // ── Subpasta inline ───────────────────────────────────────────────────────
  const onStartAddSub = (parentId) => {
    setAddingSubTo(parentId)
    setNewSubName('')
    setNewSubColor(FOLDER_COLORS[0].value)
    setExpandedIds((prev) => new Set(prev).add(parentId))
    ensureDocsLoaded(parentId)
  }

  const onSubmitSub = async (parentId) => {
    if (!newSubName.trim()) { setAddingSubTo(null); return }
    try {
      await createFolder(newSubName.trim(), newSubColor, parentId)
    } catch (err) {
      onError(err)
    } finally {
      setAddingSubTo(null)
      setNewSubName('')
    }
  }

  // ── Breadcrumb path para a pasta selecionada ──────────────────────────────
  const getFolderPath = (id) => {
    const parts = []
    let cur = folders.find((f) => f.id === id)
    while (cur) {
      parts.unshift(cur.name)
      cur = folders.find((f) => f.id === cur.parent_id) || null
    }
    return parts.join(' › ')
  }

  // ── Renderização ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        <p>Carregando pastas...</p>
      </div>
    )
  }

  const rootFolders        = childrenOf(folders, null)
  const selectedFolder     = folders.find((f) => f.id === selectedFolderId) || null
  const selectedFolderDocs = selectedFolderId ? (docsByFolder[selectedFolderId] || []) : []
  const selectedDoc        = selectedDocId
    ? selectedFolderDocs.find((d) => d.id === selectedDocId)
    : null

  // Modo de busca: lista plana com path
  const searchTerm    = search.trim().toLowerCase()
  const searchResults = searchTerm
    ? folders.filter((f) => f.name.toLowerCase().includes(searchTerm))
    : null

  const selectedFolderNotes = selectedFolderId ? notes.filter((n) => n.folder_id === selectedFolderId) : []

  // Valor do contexto partilhado por todos os FolderNode
  const ctxValue = {
    folders, notes, selectedFolderId, selectedDocId,
    expandedIds, docsByFolder,
    menuFolderId, colorPickerFolderId,
    renamingId, renameDraft,
    addingSubTo, newSubName, newSubColor,
    menuRef,
    onSelect: selectFolder,
    onToggle: toggleExpanded,
    onOpenUpload: openUpload,
    onMenuOpen:  (id) => { setMenuFolderId(id); setColorPickerFolderId(null) },
    onMenuClose: ()   => { setMenuFolderId(null); setColorPickerFolderId(null) },
    onColorPickerOpen: (id) => setColorPickerFolderId(id),
    onRenameStart:      (id, name) => { setRenamingId(id); setRenameDraft(name) },
    onRenameDraftChange: (v) => setRenameDraft(v),
    onRenameSave:  saveRename,
    onRenameCancel: ()   => setRenamingId(null),
    onChangeColor: changeColor,
    onRemove:      removeFolder,
    onDocSelect:   (fid, did) => { setSelectedFolderId(fid); setSelectedDocId(did) },
    onOpenNote,
    onStartAddSub,
    onNewSubNameChange:  (v) => setNewSubName(v),
    onNewSubColorChange: (v) => setNewSubColor(v),
    onSubmitSub,
    onCancelSub: () => { setAddingSubTo(null); setNewSubName('') },
  }

  return (
    <div className="media-layout">
      {/* ══ Painel esquerdo: árvore de pastas ══════════════════════════════ */}
      <aside className="panel folder-tree-panel">
        <div className="notes-list-header">
          <h3>Documentações</h3>
        </div>

        <button className="folder-create-btn" onClick={() => setIsCreateModalOpen(true)}>
          <IconPlus size={15} />
          Nova Pasta
        </button>

        <input
          type="text"
          placeholder="Buscar pasta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <FolderCtx.Provider value={ctxValue}>
          <div className="folder-tree">

            {/* ── Modo de busca: lista plana ── */}
            {searchResults !== null ? (
              searchResults.length === 0 ? (
                <div className="empty-hint">Nenhuma pasta encontrada.</div>
              ) : (
                searchResults.map((f) => (
                  <div
                    key={f.id}
                    className={`folder-row${f.id === selectedFolderId ? ' active' : ''}`}
                    onClick={() => selectFolder(f.id)}
                  >
                    <button className="folder-chevron" style={{ visibility: 'hidden' }}>
                      <IconChevronRight size={13} />
                    </button>
                    <IconFolderFilled size={17} style={{ color: f.color }} />
                    <span className="folder-name">{f.name}</span>
                    {f.parent_id && (
                      <small className="folder-search-path">
                        {getFolderPath(f.parent_id)}
                      </small>
                    )}
                  </div>
                ))
              )
            ) : (
              /* ── Modo de árvore hierárquica ── */
              rootFolders.length === 0 ? (
                <div className="empty-hint">Nenhuma pasta criada ainda.</div>
              ) : (
                rootFolders.map((f) => <FolderNode key={f.id} folder={f} />)
              )
            )}
          </div>
        </FolderCtx.Provider>
      </aside>

      {isCreateModalOpen && (
        <CreateFolderModal
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={(name, color) => createFolder(name, color, null)}
        />
      )}

      {/* Input de upload oculto */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        hidden
        onChange={handleUpload}
      />

      {/* ══ Painel direito ══════════════════════════════════════════════════ */}
      {selectedDoc ? (
        /* Detalhe do documento */
        <div className="panel docs-detail">
          <div className="panel-header">
            <div>
              <h3>{selectedDoc.name || KIND_LABEL[selectedDoc.kind]}</h3>
              <span className="folder-breadcrumb">
                {KIND_LABEL[selectedDoc.kind]} · {getFolderPath(selectedFolderId)}
              </span>
            </div>
            <button className="icon-btn" title="Fechar" onClick={() => setSelectedDocId(null)}>
              <IconClose size={16} />
            </button>
          </div>
          <div className="docs-detail-preview">
            {selectedDoc.kind === 'image' && (
              <img
                src={selectedDoc.url}
                alt={selectedDoc.name || 'Imagem'}
                className="img-zoomable"
                onClick={() => setLightboxImage(selectedDoc)}
              />
            )}
            {selectedDoc.kind === 'video' && <video src={selectedDoc.url} controls />}
            {selectedDoc.kind === 'document' && (
              <a href={selectedDoc.url} target="_blank" rel="noreferrer" className="gallery-doc">
                <IconNotes size={34} />
                <span>{selectedDoc.name || 'Abrir documento'}</span>
              </a>
            )}
          </div>
          <div className="tdv2-footer">
            <button
              className="secondary danger-text"
              onClick={() => removeDoc(selectedFolder.id, selectedDoc)}
            >
              <IconTrash size={14} />
              Remover documento
            </button>
          </div>
        </div>
      ) : selectedFolder ? (
        /* Galeria da pasta selecionada */
        <div className="panel docs-gallery">
          <div className="panel-header">
            <div>
              <h3>
                <span className="folder-dot" style={{ background: selectedFolder.color }} />
                {selectedFolder.name}
              </h3>
              <span className="folder-breadcrumb">
                {getFolderPath(selectedFolderId)}
              </span>
            </div>
            <button disabled={uploading} onClick={() => openUpload(selectedFolder.id)}>
              {uploading ? 'Enviando...' : 'Adicionar documento'}
            </button>
          </div>
          <div className="gallery-grid">
            {selectedFolderDocs.length === 0 && selectedFolderNotes.length === 0 && (
              <div className="empty-hint">
                Nenhum documento nesta pasta ainda — envie o primeiro arquivo.
              </div>
            )}
            {selectedFolderNotes.map((n) => (
              <div className="gallery-item gallery-item-note" key={`note-${n.id}`}>
                <button className="gallery-doc" onClick={() => onOpenNote(n.id)} title="Abrir nota">
                  <IconNotes size={26} />
                  <span>{n.title || 'Sem título'}</span>
                  <small className="gallery-note-preview">{getPreview(n.content, 44)}</small>
                </button>
                <span className="gallery-note-tag">Nota</span>
                <button
                  className="icon-btn danger gallery-remove"
                  title="Remover relação com esta pasta"
                  onClick={() => unlinkNote(n.id)}
                >
                  <IconClose size={14} />
                </button>
              </div>
            ))}
            {selectedFolderDocs.map((item) => (
              <div className="gallery-item" key={item.id}>
                {item.kind === 'image' && (
                  <img
                    src={item.url}
                    alt={item.name || 'Imagem'}
                    className="img-zoomable"
                    onClick={() => setLightboxImage(item)}
                  />
                )}
                {item.kind === 'video' && <video src={item.url} controls />}
                {item.kind === 'document' && (
                  <a
                    className="gallery-doc"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconNotes size={26} />
                    <span>{item.name || 'Documento'}</span>
                  </a>
                )}
                <button
                  className="icon-btn danger gallery-remove"
                  title="Remover"
                  onClick={() => removeDoc(selectedFolder.id, item)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Estado vazio */
        <div className="panel editor-empty">
          <IconFolderFilled size={34} style={{ color: 'var(--border)' }} />
          <strong>Nenhuma pasta selecionada</strong>
          <p>Selecione uma pasta na lista à esquerda para visualizar seu conteúdo ou crie uma nova.</p>
        </div>
      )}

      {/* ══ Lightbox: imagem em tela cheia ══════════════════════════════════ */}
      {/* Renderizado via portal direto no <body> — uma seção ancestral (.view) usa
          `transform` na animação de entrada, o que quebraria `position: fixed` se
          o overlay ficasse aninhado dentro dela. */}
      {lightboxImage && createPortal(
        <div className="lightbox-backdrop" onClick={() => setLightboxImage(null)}>
          <button
            className="lightbox-close"
            title="Fechar (Esc)"
            onClick={() => setLightboxImage(null)}
          >
            <IconClose size={20} />
          </button>
          {lightboxImage.name && <span className="lightbox-caption">{lightboxImage.name}</span>}
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name || 'Imagem'}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}
