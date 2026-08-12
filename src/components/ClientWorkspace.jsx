import { useMemo, useState } from 'react'
import { IconArrowLeft, IconBuilding, IconUser, IconPhone, IconMail, IconKanban, IconFolder } from '../icons.jsx'
import Kanban from './Kanban.jsx'
import DocumentsView from './DocumentsView.jsx'
import { assigneeColor } from '../colors.js'

const TABS = [
  { key: 'kanban', label: 'Kanban', icon: IconKanban },
  { key: 'docs',   label: 'Documentações', icon: IconFolder },
]

// Workspace de um cliente: cabeçalho com dados + métricas, Kanban filtrado
// estritamente pelas tarefas daquele client_id e as documentações do cliente.
// A aba ativa pode ser controlada de fora (ex.: App.jsx abre direto em "docs"
// ao navegar de uma pasta vinculada a este cliente); sem controle externo,
// mantém estado próprio começando pelo Kanban.
export default function ClientWorkspace({
  client, tasks, members, currentUser, columns, tags,
  onBack, onAdd, onMove, onUpdate, onDelete, onAddColumn, onCreateTag,
  onError, onOpenNote, onUnlinkNote,
  tab: controlledTab, onTabChange, targetFolderId, onConsumeTarget,
}) {
  const [internalTab, setInternalTab] = useState('kanban')
  const tab = controlledTab ?? internalTab
  const setTab = onTabChange ?? setInternalTab
  // Métricas rápidas do quadro — memoizadas junto com as tarefas do cliente
  const metrics = useMemo(() => {
    const m = { todo: 0, doing: 0, done: 0, total: tasks.length }
    for (const t of tasks) {
      if (t.column_key === 'done') m.done += 1
      else if (t.column_key === 'todo') m.todo += 1
      else m.doing += 1
    }
    m.progress = m.total ? Math.round((m.done / m.total) * 100) : 0
    return m
  }, [tasks])

  const color = assigneeColor(client.id, client.color)

  // Toda tarefa criada neste quadro nasce vinculada ao cliente ativo
  const handleAdd = (title, priority, due_date, assigned_to, description, _clientId, tags) =>
    onAdd(title, priority, due_date, assigned_to, description, client.id, tags)

  return (
    <div className="client-workspace">
      <button className="client-back-btn" onClick={onBack}>
        <IconArrowLeft size={15} />
        Voltar para todos os clientes
      </button>

      <div className="panel client-ws-header">
        <div className="client-ws-id">
          <div className="client-ws-icon" style={{ background: `${color}1f`, color }}>
            <IconBuilding size={24} />
          </div>
          <div className="client-ws-titles">
            <h3>{client.name || 'Cliente sem nome'}</h3>
            <div className="client-ws-meta">
              {client.cnpj && <span className="client-card-badge">CNPJ: {client.cnpj}</span>}
              {client.address && <span className="client-ws-address">{client.address}</span>}
            </div>
            {(client.contact_name || client.phone || client.email) && (
              <div className="client-card-contacts client-ws-contacts">
                {client.contact_name && <span><IconUser size={13} />{client.contact_name}</span>}
                {client.phone && <span><IconPhone size={13} />{client.phone}</span>}
                {client.email && (
                  <a href={`mailto:${client.email}`}><IconMail size={13} />{client.email}</a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="client-ws-metrics">
          <div className="client-ws-metric">
            <strong>{metrics.todo}</strong>
            <small>A fazer</small>
          </div>
          <div className="client-ws-metric">
            <strong>{metrics.doing}</strong>
            <small>Em progresso</small>
          </div>
          <div className="client-ws-metric">
            <strong>{metrics.done}</strong>
            <small>Concluídas</small>
          </div>
          <div className="client-ws-metric is-progress">
            <strong>{metrics.progress}%</strong>
            <small>Progresso</small>
          </div>
        </div>
      </div>

      <div className="client-ws-tabs">
        {TABS.map((t) => {
          const Ico = t.icon
          return (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              <Ico size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'kanban' ? (
        <Kanban
          tasks={tasks}
          members={members}
          clients={[client]}
          currentUser={currentUser}
          columns={columns}
          tags={tags}
          onAdd={handleAdd}
          onMove={onMove}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddColumn={onAddColumn}
          onCreateTag={onCreateTag}
        />
      ) : (
        /* Documentações no escopo deste cliente — a chave força remontagem ao
           trocar de cliente, recarregando as pastas do novo escopo */
        <DocumentsView
          key={client.id}
          clientId={client.id}
          clients={[client]}
          onError={onError}
          targetFolderId={targetFolderId}
          onConsumeTarget={onConsumeTarget}
          onOpenNote={onOpenNote}
          onUnlinkNote={onUnlinkNote}
        />
      )}
    </div>
  )
}
