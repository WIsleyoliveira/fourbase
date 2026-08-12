import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  IconBuilding,
  IconChevronDown,
  IconCalendar,
  IconFilePdf,
  IconPresentation,
  IconSheet,
  IconFileText,
  IconStack,
  IconSearch,
  IconLayoutGrid,
  IconList,
} from '../icons.jsx'
import { getPreview } from '../textPreview.js'
import { supabase, CLIENT_MEDIA_BUCKET, storagePathFromUrl } from '../supabase.js'
import { api } from '../api.js'
import { assigneeColor } from '../colors.js'

// Grupo das pastas sem cliente vinculado (legado / criadas antes da migração)
const NO_CLIENT = '__none__'

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

// ── Filtros da galeria ──────────────────────────────────────────────────────
const FILE_TYPES = [
  { key: 'all',    label: 'Todos os tipos',      short: 'Todos',         icon: IconStack,        exts: null },
  { key: 'pdf',    label: 'Documentos PDF',      short: 'PDF',           icon: IconFilePdf,      exts: ['pdf'] },
  { key: 'slides', label: 'Apresentações',       short: 'Apresentações', icon: IconPresentation, exts: ['pptx', 'ppt'] },
  { key: 'text',   label: 'Documentos de Texto', short: 'Texto',         icon: IconFileText,     exts: ['docx', 'doc', 'txt'] },
  { key: 'sheets', label: 'Planilhas',           short: 'Planilhas',     icon: IconSheet,        exts: ['xlsx', 'csv'] },
  { key: 'images', label: 'Imagens',             short: 'Imagens',       icon: IconMedia,        exts: ['png', 'jpg', 'jpeg', 'webp'] },
]

const DATE_RANGES = [
  { key: 'all',    label: 'Todas as datas',  short: 'Todas as datas' },
  { key: '7d',     label: 'Últimos 7 dias',  short: 'Últimos 7 dias' },
  { key: '30d',    label: 'Últimos 30 dias', short: 'Últimos 30 dias' },
  { key: 'month',  label: 'Este mês',        short: 'Este mês' },
  { key: 'custom', label: 'Personalizado',   short: 'Período personalizado' },
]

const extOf = (name = '') => {
  const parts = String(name).split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

const formatDate = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Casa o documento com a categoria escolhida — pela extensão do nome e,
// quando o arquivo não tem extensão, pelo "kind" registrado no upload
function matchesType(doc, typeKey) {
  if (typeKey === 'all') return true
  const def = FILE_TYPES.find((t) => t.key === typeKey)
  if (!def?.exts) return true
  const ext = extOf(doc.name)
  if (ext) return def.exts.includes(ext)
  if (typeKey === 'images') return doc.kind === 'image'
  return false
}

// Início do intervalo para as opções rápidas (null = sem limite inferior)
function rangeStart(key) {
  const now = new Date()
  if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  const days = key === '7d' ? 7 : key === '30d' ? 30 : null
  if (days === null) return null
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

function matchesDate(stamp, key, from, to) {
  if (key === 'all') return true
  if (!stamp) return false
  const t = new Date(stamp)
  if (Number.isNaN(t.getTime())) return false
  if (key === 'custom') {
    if (from && t < new Date(`${from}T00:00:00`)) return false
    if (to && t > new Date(`${to}T23:59:59`)) return false
    return true
  }
  const start = rangeStart(key)
  return !start || t >= start
}

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

// ── Dropdown de filtro com ícones por opção ─────────────────────────────────
function FilterDropdown({ value, options, onChange, triggerIcon: TriggerIcon, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = options.find((o) => o.key === value) || options[0]
  const CurrentIcon = TriggerIcon || current.icon

  return (
    <div className="docs-filter" ref={ref}>
      <button
        type="button"
        className={`docs-filter-trigger${value !== 'all' ? ' is-active' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {CurrentIcon && <CurrentIcon size={14} />}
        <span>{current.label}</span>
        <IconChevronDown size={13} />
      </button>
      {open && (
        <div className="docs-filter-menu">
          {options.map((o) => {
            const Ico = o.icon
            return (
              <button
                key={o.key}
                type="button"
                className={o.key === value ? 'active' : ''}
                onClick={() => { onChange(o.key); setOpen(false) }}
              >
                {Ico ? <Ico size={14} /> : <span className="docs-filter-dot" />}
                <span>{o.label}</span>
                {o.key === value && <IconCheckPlain size={12} />}
              </button>
            )
          })}
        </div>
      )}
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
// `lockedClientId` — quando definido (ex: dentro do Espaço do Cliente), o seletor
// de cliente é omitido e a pasta nasce vinculada àquele cliente.
function CreateFolderModal({ onClose, onSubmit, clients = [], lockedClientId = null }) {
  const [name, setName]   = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0].value)
  const [clientId, setClientId] = useState(lockedClientId || clients[0]?.id || '')
  const [loading, setLoading] = useState(false)

  const showClientPicker = !lockedClientId && clients.length > 0

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
      await onSubmit(name.trim(), color, lockedClientId || clientId || null)
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
          {showClientPicker && (
            <label>
              Cliente
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={loading}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || 'Cliente sem nome'}</option>
                ))}
                <option value="">Sem cliente</option>
              </select>
            </label>
          )}
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
function RemoveDocConfirmModal({ doc, onCancel, onConfirm, removing }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !removing) onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, removing])

  return (
    <div className="modal-backdrop" onClick={() => !removing && onCancel()}>
      <div className="modal remove-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="remove-confirm-header">
          <div className="remove-confirm-icon">
            <IconTrash size={20} />
          </div>
          <button className="icon-btn" title="Fechar" onClick={onCancel} disabled={removing}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="remove-confirm-body">
          <h3>Remover documento</h3>
          <p>
            Tem certeza que deseja remover <strong>{doc.name || 'este documento'}</strong>?{' '}
            Esta ação não poderá ser desfeita.
          </p>
        </div>
        <div className="remove-confirm-actions">
          <button className="secondary" onClick={onCancel} disabled={removing}>
            Cancelar
          </button>
          <button className="remove-confirm-btn" onClick={onConfirm} disabled={removing}>
            {removing ? (
              <>
                <span className="remove-spinner" />
                Removendo…
              </>
            ) : (
              <>
                <IconTrash size={14} />
                Sim, remover
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

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
// `clients`  — lista de clientes para agrupar a árvore
// `clientId` — quando definido, o painel opera no escopo de um único cliente
//              (usado pela aba "Documentos" dentro do Espaço do Cliente)
export default function DocumentsView({
  onError, targetFolderId, onConsumeTarget, onOpenNote, onUnlinkNote,
  clients = [], clientId = null,
}) {
  const [folders, setFolders]           = useState([])
  // Clientes expandidos na árvore (no modo escopo não é usado)
  const [expandedClients, setExpandedClients] = useState(() => new Set())
  const [notes, setNotes]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')

  // ── Filtros da galeria (aplicados em memória, sem novas requisições) ──
  const [fileTypeFilter, setFileTypeFilter] = useState('all')
  const [dateFilter, setDateFilter]         = useState('all')
  const [customFrom, setCustomFrom]         = useState('')
  const [customTo, setCustomTo]             = useState('')
  const [docSearch, setDocSearch]           = useState('')
  // Alterna a galeria entre cartões (grid) e lista compacta com data de criação
  const [viewMode, setViewMode]             = useState('grid')

  const [expandedIds, setExpandedIds]   = useState(() => new Set())
  const [docsByFolder, setDocsByFolder] = useState({})
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [selectedDocId, setSelectedDocId]       = useState(null)
  const [lightboxImage, setLightboxImage]       = useState(null)
  const [docToRemove, setDocToRemove]           = useState(null) // { folderId, doc } aguardando confirmação
  const [removingDoc, setRemovingDoc]           = useState(false)

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
      .then((all) => {
        // No modo escopo, trabalha apenas com as pastas do cliente ativo
        const list = clientId ? all.filter((f) => f.client_id === clientId) : all
        setFolders(list)
        // Se chegamos aqui vindos de uma nota relacionada, abre direto naquela pasta
        // (expandindo toda a cadeia de pastas-pai para que ela fique visível na árvore)
        const target = list.find((f) => f.id === targetFolderId)
        if (target) {
          setSelectedFolderId(targetFolderId)
          setSelectedDocId(null)
          setExpandedIds(new Set([targetFolderId, ...ancestorIds(list, targetFolderId)]))
          setExpandedClients(new Set([target.client_id || NO_CLIENT]))
          onConsumeTarget?.()
          return
        }
        const roots = childrenOf(list, null)
        if (roots.length) {
          setSelectedFolderId(roots[0].id)
          setExpandedIds(new Set([roots[0].id]))
          setExpandedClients(new Set([roots[0].client_id || NO_CLIENT]))
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
  const createFolder = async (name, color, parentId = null, ownerClientId = null) => {
    // No modo escopo a pasta sempre pertence ao cliente ativo
    const wantedClientId = clientId || ownerClientId
    const folder = await api.createFolder(name, color, parentId, wantedClientId)

    setFolders((prev) => [...prev, folder])
    // Garante que o grupo do cliente esteja aberto para a nova pasta aparecer
    if (folder.client_id) {
      setExpandedClients((prev) => new Set(prev).add(folder.client_id))
    } else {
      setExpandedClients((prev) => new Set(prev).add(NO_CLIENT))
    }
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

  // Expande/recolhe o grupo de um cliente no nível raiz da árvore
  const toggleClient = (id) => {
    setExpandedClients((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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

  // Abre o modal de confirmação em vez de depender do confirm() nativo do
  // navegador — browsers suprimem/auto-rejeitam diálogos nativos repetidos
  // (ex.: após "Impedir que esta página crie caixas de diálogo adicionais"),
  // fazendo a remoção parecer que "não faz nada" ao clicar.
  const removeDoc = (folderId, doc) => setDocToRemove({ folderId, doc })

  const confirmRemoveDoc = async () => {
    if (!docToRemove) return
    const { folderId, doc } = docToRemove
    setRemovingDoc(true)
    try {
      await api.deleteFolderDocument(folderId, doc.id)
      setDocsByFolder((prev) => ({
        ...prev,
        [folderId]: (prev[folderId] || []).filter((d) => d.id !== doc.id),
      }))
      if (selectedDocId === doc.id) setSelectedDocId(null)
      const path = storagePathFromUrl(doc.url, CLIENT_MEDIA_BUCKET)
      if (path) supabase.storage.from(CLIENT_MEDIA_BUCKET).remove([path]).catch(() => {})
      setDocToRemove(null)
    } catch (err) {
      onError(err)
    } finally {
      setRemovingDoc(false)
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

  // ── Filtragem da galeria ──────────────────────────────────────────────────
  // Roda sobre os documentos já carregados em memória — trocar de filtro não
  // dispara nenhuma chamada à API.
  const docTerm = docSearch.trim().toLowerCase()

  const visibleDocs = useMemo(() => {
    const list = selectedFolderId ? (docsByFolder[selectedFolderId] || []) : []
    return list.filter((d) => {
      if (!matchesType(d, fileTypeFilter)) return false
      if (!matchesDate(d.created_at, dateFilter, customFrom, customTo)) return false
      if (!docTerm) return true
      const label = `${d.name || ''} ${KIND_LABEL[d.kind] || ''}`.toLowerCase()
      return label.includes(docTerm)
    })
  }, [docsByFolder, selectedFolderId, fileTypeFilter, dateFilter, customFrom, customTo, docTerm])

  const visibleNotes = useMemo(() => {
    // Notas não são arquivos — saem da listagem quando há filtro de tipo ativo
    if (fileTypeFilter !== 'all') return []
    const list = selectedFolderId ? notes.filter((n) => n.folder_id === selectedFolderId) : []
    return list.filter((n) => {
      if (!matchesDate(n.updated_at || n.created_at, dateFilter, customFrom, customTo)) return false
      if (!docTerm) return true
      return (n.title || 'Sem título').toLowerCase().includes(docTerm)
    })
  }, [notes, selectedFolderId, fileTypeFilter, dateFilter, customFrom, customTo, docTerm])

  const hasActiveFilters = fileTypeFilter !== 'all' || dateFilter !== 'all' || docTerm !== ''

  const clearFilters = () => {
    setFileTypeFilter('all')
    setDateFilter('all')
    setCustomFrom('')
    setCustomTo('')
    setDocSearch('')
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

  // Nível raiz da árvore: um grupo por cliente + grupo das pastas sem vínculo
  const clientGroups = [
    ...clients.map((c) => ({
      id: c.id,
      name: c.name || 'Cliente sem nome',
      color: assigneeColor(c.id, c.color),
      roots: rootFolders.filter((f) => f.client_id === c.id),
    })),
  ]
  const orphanRoots = rootFolders.filter((f) => !f.client_id)
  if (orphanRoots.length) {
    clientGroups.push({ id: NO_CLIENT, name: 'Sem cliente', color: '#94a3b8', roots: orphanRoots })
  }

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
            ) : clientId ? (
              /* ── Escopo de um único cliente (Espaço do Cliente) ── */
              rootFolders.length === 0 ? (
                <div className="empty-hint">
                  Nenhuma pasta para este cliente ainda — crie a primeira em "Nova Pasta".
                </div>
              ) : (
                rootFolders.map((f) => <FolderNode key={f.id} folder={f} />)
              )
            ) : clientGroups.length === 0 ? (
              <div className="empty-hint">
                Nenhum cliente cadastrado ainda. Cadastre um cliente para organizar as documentações.
              </div>
            ) : (
              /* ── Árvore agrupada por cliente ── */
              clientGroups.map((g) => {
                const isOpen = expandedClients.has(g.id)
                return (
                  <div className="client-group" key={g.id}>
                    <div className="client-group-row" onClick={() => toggleClient(g.id)}>
                      <button className="folder-chevron" onClick={(e) => { e.stopPropagation(); toggleClient(g.id) }}>
                        <IconChevronRight
                          size={13}
                          style={{
                            transform: isOpen ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s ease',
                          }}
                        />
                      </button>
                      <span className="client-group-avatar" style={{ background: g.color }}>
                        <IconBuilding size={12} />
                      </span>
                      <span className="folder-name">{g.name}</span>
                      <small className="client-group-count">{g.roots.length}</small>
                    </div>
                    {isOpen && (
                      <div className="client-group-children">
                        {g.roots.length === 0 ? (
                          <div className="folder-child-empty">Nenhuma pasta para este cliente</div>
                        ) : (
                          g.roots.map((f) => <FolderNode key={f.id} folder={f} />)
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </FolderCtx.Provider>
      </aside>

      {isCreateModalOpen && (
        <CreateFolderModal
          clients={clients}
          lockedClientId={clientId}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={(name, color, ownerClientId) => createFolder(name, color, null, ownerClientId)}
        />
      )}

      {docToRemove && (
        <RemoveDocConfirmModal
          doc={docToRemove.doc}
          removing={removingDoc}
          onCancel={() => { if (!removingDoc) setDocToRemove(null) }}
          onConfirm={confirmRemoveDoc}
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
          {/* ── Barra de filtros ── */}
          <div className="docs-filter-bar">
            <div className="docs-search">
              <IconSearch size={14} />
              <input
                type="text"
                placeholder="Buscar documento por nome..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
              />
              {docSearch && (
                <button type="button" title="Limpar busca" onClick={() => setDocSearch('')}>
                  <IconClose size={12} />
                </button>
              )}
            </div>

            <FilterDropdown
              value={fileTypeFilter}
              options={FILE_TYPES}
              onChange={setFileTypeFilter}
              ariaLabel="Filtrar por tipo de documento"
            />
            <FilterDropdown
              value={dateFilter}
              options={DATE_RANGES}
              onChange={setDateFilter}
              triggerIcon={IconCalendar}
              ariaLabel="Filtrar por data"
            />

            {dateFilter === 'custom' && (
              <div className="docs-filter-range">
                <label>
                  De
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label>
                  Até
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </div>
            )}

            {hasActiveFilters && (
              <button type="button" className="docs-filter-clear" onClick={clearFilters}>
                <IconClose size={12} />
                Limpar filtros
              </button>
            )}

            <span className="docs-filter-count">
              {visibleDocs.length + visibleNotes.length} de {selectedFolderDocs.length + selectedFolderNotes.length}
            </span>

            <div className="docs-view-toggle" role="group" aria-label="Alternar visualização">
              <button
                type="button"
                className={viewMode === 'grid' ? 'active' : ''}
                title="Visualização em grade"
                onClick={() => setViewMode('grid')}
              >
                <IconLayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                title="Visualização em lista"
                onClick={() => setViewMode('list')}
              >
                <IconList size={15} />
              </button>
            </div>
          </div>

          {/* ── Badges dos filtros ativos ── */}
          {hasActiveFilters && (
            <div className="docs-filter-badges">
              {docTerm && (
                <span className="docs-filter-badge">
                  Nome: “{docSearch.trim()}”
                  <button type="button" title="Limpar busca por nome" onClick={() => setDocSearch('')}>
                    <IconClose size={11} />
                  </button>
                </span>
              )}
              {fileTypeFilter !== 'all' && (
                <span className="docs-filter-badge">
                  {FILE_TYPES.find((t) => t.key === fileTypeFilter)?.short}
                  <button type="button" title="Remover filtro de tipo" onClick={() => setFileTypeFilter('all')}>
                    <IconClose size={11} />
                  </button>
                </span>
              )}
              {dateFilter !== 'all' && (
                <span className="docs-filter-badge">
                  {dateFilter === 'custom' && (customFrom || customTo)
                    ? `${customFrom || '…'} → ${customTo || '…'}`
                    : DATE_RANGES.find((d) => d.key === dateFilter)?.short}
                  <button
                    type="button"
                    title="Remover filtro de data"
                    onClick={() => { setDateFilter('all'); setCustomFrom(''); setCustomTo('') }}
                  >
                    <IconClose size={11} />
                  </button>
                </span>
              )}
            </div>
          )}

          <div className={viewMode === 'list' ? 'gallery-list' : 'gallery-grid'}>
            {selectedFolderDocs.length === 0 && selectedFolderNotes.length === 0 ? (
              <div className="empty-hint">
                Nenhum documento nesta pasta ainda — envie o primeiro arquivo.
              </div>
            ) : visibleDocs.length === 0 && visibleNotes.length === 0 ? (
              <div className="docs-filter-empty">
                <div className="docs-filter-empty-icon"><IconStack size={26} /></div>
                <strong>Nenhum documento encontrado</strong>
                <p>
                  Nenhum documento encontrado para os filtros selecionados.
                  Tente alterar a busca ou limpar os filtros.
                </p>
                <button type="button" onClick={clearFilters}>
                  <IconClose size={13} />
                  Limpar filtros
                </button>
              </div>
            ) : null}
            {visibleNotes.map((n) => (
              <div className="gallery-item gallery-item-note" key={`note-${n.id}`}>
                <button className="gallery-doc" onClick={() => onOpenNote(n.id)} title="Abrir nota">
                  <IconNotes size={26} />
                  <span>{n.title || 'Sem título'}</span>
                  <small className="gallery-note-preview">{getPreview(n.content, 44)}</small>
                </button>
                <span className="gallery-note-tag">Nota</span>
                <span className="gallery-item-date">{formatDate(n.updated_at || n.created_at)}</span>
                <button
                  className="icon-btn danger gallery-remove"
                  title="Remover relação com esta pasta"
                  onClick={() => unlinkNote(n.id)}
                >
                  <IconClose size={14} />
                </button>
              </div>
            ))}
            {visibleDocs.map((item) => (
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
                <span className="gallery-item-date">{formatDate(item.created_at)}</span>
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
