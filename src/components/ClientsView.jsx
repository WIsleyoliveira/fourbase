import { useState, useEffect, useRef, useMemo } from 'react'
import {
  IconSearch, IconBuilding, IconMoreHorizontal, IconTrash, IconClose,
  IconUser, IconPhone, IconMail, IconLayoutGrid, IconList, IconTable,
} from '../icons.jsx'
import ClientModal from './ClientModal.jsx'
import { assigneeColor } from '../colors.js'

const VIEW_MODES = [
  { key: 'grid',  icon: IconLayoutGrid, label: 'Catálogo' },
  { key: 'list',  icon: IconList,       label: 'Lista' },
  { key: 'table', icon: IconTable,      label: 'Tabela' },
]

// A view desmonta ao trocar de aba, então a forma de exibição escolhida fica
// no localStorage para sobreviver à ida e volta (mesmo padrão de fb_sidebar_open).
const MODE_LS_KEY = 'fb_clients_view_mode'

const storedMode = () => {
  const saved = localStorage.getItem(MODE_LS_KEY)
  return VIEW_MODES.some((m) => m.key === saved) ? saved : 'grid'
}

const initials = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Menu de ações (Editar / Excluir)
function CardMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="client-card-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" title="Ações" onClick={() => setOpen((v) => !v)}>
        <IconMoreHorizontal size={16} />
      </button>
      {open && (
        <div className="client-card-menu-pop">
          <button onClick={() => { setOpen(false); onEdit() }}>Editar</button>
          <button className="danger" onClick={() => { setOpen(false); onDelete() }}>Excluir</button>
        </div>
      )}
    </div>
  )
}

// Modal de confirmação de exclusão — pergunta o destino das pastas de documentação
function DeleteConfirm({ client, onCancel, onConfirm, removing }) {
  const [mode, setMode] = useState('archive')

  return (
    <div className="modal-backdrop" onClick={() => !removing && onCancel()}>
      <div className="modal remove-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="remove-confirm-header">
          <div className="remove-confirm-icon"><IconTrash size={20} /></div>
          <button className="icon-btn" title="Fechar" onClick={onCancel} disabled={removing}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="remove-confirm-body">
          <h3>Excluir cliente</h3>
          <p>
            Tem certeza que deseja excluir{' '}
            <strong>{client.name || 'este cliente'}</strong>? Esta ação não poderá ser desfeita.
          </p>

          <div className="delete-mode-options">
            <span className="delete-mode-legend">O que fazer com as documentações deste cliente?</span>
            <label className={`delete-mode-option${mode === 'archive' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="folders-mode"
                value="archive"
                checked={mode === 'archive'}
                onChange={() => setMode('archive')}
                disabled={removing}
              />
              <span>
                <strong>Arquivar pastas</strong>
                <small>Mantém as pastas e arquivos, apenas desvincula do cliente.</small>
              </span>
            </label>
            <label className={`delete-mode-option${mode === 'cascade' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="folders-mode"
                value="cascade"
                checked={mode === 'cascade'}
                onChange={() => setMode('cascade')}
                disabled={removing}
              />
              <span>
                <strong>Excluir em cascata</strong>
                <small>Remove também todas as pastas e documentos do cliente.</small>
              </span>
            </label>
          </div>
        </div>
        <div className="remove-confirm-actions">
          <button className="secondary" onClick={onCancel} disabled={removing}>Cancelar</button>
          <button className="remove-confirm-btn" onClick={() => onConfirm(mode)} disabled={removing}>
            {removing ? <><span className="remove-spinner" />Excluindo…</> : <><IconTrash size={14} />Sim, excluir</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// Barra de progresso das demandas do cliente
function ClientProgress({ stats }) {
  return (
    <div className="client-progress">
      <div className="client-progress-top">
        <span>{stats.total ? `${stats.done}/${stats.total} concluídas` : 'Sem demandas'}</span>
        <strong>{stats.progress}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${stats.progress}%` }} />
      </div>
    </div>
  )
}

export default function ClientsView({ clients, taskStats = {}, onUpdate, onDelete, onOpenClient }) {
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState(storedMode)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [removing, setRemoving] = useState(false)

  // As métricas por cliente vêm agregadas do servidor (`/api/tasks/client-stats`)
  // porque precisam contar as tarefas de toda a equipe — a lista local de
  // tarefas do usuário logado só enxerga o que está atribuído a ele.
  const EMPTY_STATS = { total: 0, todo: 0, doing: 0, done: 0, active: 0, progress: 0, lastActivity: null }
  const statsFor = (id) => taskStats[id] || EMPTY_STATS

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      (c.name || '').toLowerCase().includes(q) || (c.cnpj || '').toLowerCase().includes(q))
  }, [clients, search])

  const handleSaveEdit = async (updates) => {
    await onUpdate(editing.id, updates)
    setEditing(null)
  }

  const handleConfirmDelete = async (mode) => {
    setRemoving(true)
    try {
      await onDelete(confirm.id, mode)
      setConfirm(null)
    } finally {
      setRemoving(false)
    }
  }

  // ── Modo Catálogo ──────────────────────────────────────────────────────────
  const renderGrid = () => (
    <div className="clients-grid">
      {filtered.map((c) => {
        const stats = statsFor(c.id)
        return (
          <div className="client-card is-clickable" key={c.id} onClick={() => onOpenClient(c.id)}>
            <div className="client-card-head">
              <div className="client-card-icon" style={{ background: `${assigneeColor(c.id, c.color)}1f`, color: assigneeColor(c.id, c.color) }}>
                <IconBuilding size={20} />
              </div>
              <CardMenu onEdit={() => setEditing(c)} onDelete={() => setConfirm(c)} />
            </div>
            <h4 className="client-card-name">{c.name || 'Cliente sem nome'}</h4>
            {c.cnpj && <span className="client-card-badge">CNPJ: {c.cnpj}</span>}
            {c.address && <p className="client-card-address">{c.address}</p>}

            <ClientProgress stats={stats} />
            <div className="client-card-metrics">
              <span><strong>{stats.active}</strong> ativa{stats.active === 1 ? '' : 's'}</span>
              <span><strong>{stats.total}</strong> no total</span>
            </div>

            {(c.contact_name || c.phone || c.email) && (
              <div className="client-card-contacts">
                {c.contact_name && <span><IconUser size={13} />{c.contact_name}</span>}
                {c.phone && <span><IconPhone size={13} />{c.phone}</span>}
                {c.email && (
                  <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>
                    <IconMail size={13} />{c.email}
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ── Modo Lista ─────────────────────────────────────────────────────────────
  const renderList = () => (
    <div className="clients-list">
      {filtered.map((c) => {
        const stats = statsFor(c.id)
        return (
          <div className="client-row" key={c.id} onClick={() => onOpenClient(c.id)}>
            <div className="client-row-avatar" style={{ background: assigneeColor(c.id, c.color) }}>
              {initials(c.name)}
            </div>
            <div className="client-row-id">
              <strong>{c.name || 'Cliente sem nome'}</strong>
              <small>{c.cnpj ? `CNPJ: ${c.cnpj}` : 'Sem CNPJ'}</small>
            </div>
            <span className="client-row-tasks">
              {stats.total} tarefa{stats.total === 1 ? '' : 's'}
            </span>
            <span className={`client-status-badge${stats.active > 0 ? ' is-active' : ''}`}>
              {stats.total === 0 ? 'Sem demandas' : stats.active > 0 ? `${stats.active} em aberto` : 'Tudo concluído'}
            </span>
            <CardMenu onEdit={() => setEditing(c)} onDelete={() => setConfirm(c)} />
          </div>
        )
      })}
    </div>
  )

  // ── Modo Tabela ────────────────────────────────────────────────────────────
  const renderTable = () => (
    <div className="clients-table-wrap">
      <table className="clients-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>CNPJ</th>
            <th>Endereço</th>
            <th>Tarefas pendentes</th>
            <th>Última atividade</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => {
            const stats = statsFor(c.id)
            return (
              <tr key={c.id} onClick={() => onOpenClient(c.id)}>
                <td>
                  <div className="clients-table-client">
                    <span className="client-row-avatar sm" style={{ background: assigneeColor(c.id, c.color) }}>
                      {initials(c.name)}
                    </span>
                    <strong>{c.name || 'Cliente sem nome'}</strong>
                  </div>
                </td>
                <td>{c.cnpj || '—'}</td>
                <td className="clients-table-address">{c.address || '—'}</td>
                <td>
                  <span className={`client-status-badge${stats.active > 0 ? ' is-active' : ''}`}>
                    {stats.active}
                  </span>
                </td>
                <td>{formatDate(stats.lastActivity)}</td>
                <td>
                  <CardMenu onEdit={() => setEditing(c)} onDelete={() => setConfirm(c)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="clients-view">
      <div className="clients-toolbar">
        <div className="clients-searchbar">
          <IconSearch size={16} />
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="clients-view-switch">
          {VIEW_MODES.map((m) => {
            const Ico = m.icon
            return (
              <button
                key={m.key}
                className={mode === m.key ? 'active' : ''}
                title={m.label}
                aria-label={m.label}
                aria-pressed={mode === m.key}
                onClick={() => {
                  setMode(m.key)
                  localStorage.setItem(MODE_LS_KEY, m.key)
                }}
              >
                <Ico size={16} />
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-hint">
          {clients.length === 0
            ? 'Nenhum cliente cadastrado ainda. Use a aba Cadastro para adicionar.'
            : 'Nenhum cliente encontrado para esta busca.'}
        </div>
      ) : mode === 'grid' ? renderGrid() : mode === 'list' ? renderList() : renderTable()}

      {editing && (
        <ClientModal client={editing} onCancel={() => setEditing(null)} onSave={handleSaveEdit} />
      )}
      {confirm && (
        <DeleteConfirm
          client={confirm}
          removing={removing}
          onCancel={() => { if (!removing) setConfirm(null) }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
