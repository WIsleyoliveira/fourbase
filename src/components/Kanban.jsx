import { useState } from 'react'
import {
  IconPlus,
  IconTrash,
  IconArrowLeft,
  IconArrowRight,
  IconCheckPlain,
  IconClose,
} from '../icons.jsx'

const COLUMNS = [
  { key: 'todo', label: 'A Fazer' },
  { key: 'doing', label: 'Em Progresso' },
  { key: 'done', label: 'Concluído' },
]
const ORDER = COLUMNS.map((c) => c.key)
const PRIORITY_CLASS = { Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const PRIORITY_RANK = { Alta: 0, Média: 1, Baixa: 2 }

const formatDate = (iso) => {
  if (!iso) return ''
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const dueState = (due_date) => {
  if (!due_date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  return 'upcoming'
}

const sortTasks = (list) =>
  list.slice().sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    if (rankDiff !== 0) return rankDiff
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })

export default function Kanban({ tasks, members, currentUser, onAdd, onMove, onUpdate, onDelete }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Média')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id || '')
  const [dragId, setDragId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  const [detailTask, setDetailTask] = useState(null)
  const [descDraft, setDescDraft] = useState('')

  const isGestor = currentUser?.role === 'gestor'
  const memberName = (id) => members.find((m) => m.id === id)?.name || 'Sem responsável'

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), priority, dueDate || null, isGestor ? assignedTo : undefined, description.trim())
    setTitle('')
    setDueDate('')
    setDescription('')
  }

  const openDetail = (task) => {
    setDetailTask(task)
    setDescDraft(task.description || '')
  }

  const saveDescription = () => {
    onUpdate(detailTask.id, { description: descDraft })
    setDetailTask({ ...detailTask, description: descDraft })
  }

  const step = (task, direction) => {
    const next = ORDER[ORDER.indexOf(task.column_key) + direction]
    if (next) onMove(task.id, next)
  }

  const drop = (columnKey) => {
    setOverColumn(null)
    if (dragId) onMove(dragId, columnKey)
    setDragId(null)
  }

  const removeTask = (id) => {
    if (!confirm('Excluir esta tarefa?')) return
    onDelete(id)
    setDetailTask(null)
  }

  return (
    <div className="panel">
      <form className="task-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="O que precisa ser feito?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="Baixa">Prioridade: Baixa</option>
          <option value="Média">Prioridade: Média</option>
          <option value="Alta">Prioridade: Alta</option>
        </select>
        <input
          type="date"
          title="Prazo de entrega"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        {isGestor && (
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <textarea
          className="task-form-description"
          placeholder="Descrição (opcional)"
          rows={1}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">
          <IconPlus size={16} />
          <span>Adicionar</span>
        </button>
      </form>
      <div className="kanban">
        {COLUMNS.map((col) => {
          const colTasks = sortTasks(tasks.filter((t) => t.column_key === col.key))
          return (
            <div className={`column column-${col.key}`} key={col.key}>
              <h4>
                <span className="column-title">
                  <span className={`column-dot dot-${col.key}`} />
                  {col.label}
                </span>
                <span className="count">{colTasks.length}</span>
              </h4>
              <div
                className={`dropzone${overColumn === col.key ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOverColumn(col.key)
                }}
                onDragLeave={() => setOverColumn(null)}
                onDrop={() => drop(col.key)}
              >
                {colTasks.length === 0 && <div className="empty-hint">Solte cartões aqui</div>}
                {colTasks.map((task) => {
                  const due = dueState(task.due_date)
                  return (
                    <div
                      className={`card ${PRIORITY_CLASS[task.priority] || 'p-media'}${dragId === task.id ? ' dragging' : ''}`}
                      key={task.id}
                      draggable
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => openDetail(task)}
                    >
                      <div className="card-top">
                        <small className={`priority-tag ${PRIORITY_CLASS[task.priority] || 'p-media'}`}>
                          {task.priority}
                        </small>
                        <button
                          className="icon-btn success"
                          title="Concluir tarefa"
                          disabled={task.column_key === 'done'}
                          onClick={(e) => {
                            e.stopPropagation()
                            onMove(task.id, 'done')
                          }}
                        >
                          <IconCheckPlain size={15} />
                        </button>
                      </div>
                      <h5>{task.title}</h5>
                      {task.description && <p className="card-description">{task.description}</p>}
                      {(task.due_date || task.assigned_to) && (
                        <div className="card-meta">
                          {task.due_date && (
                            <span className={`due-tag due-${due}`}>Prazo: {formatDate(task.due_date)}</span>
                          )}
                          {task.assigned_to && <span className="assignee-tag">{memberName(task.assigned_to)}</span>}
                        </div>
                      )}
                      <div className="card-actions">
                        <button
                          className="icon-btn"
                          title="Voltar coluna"
                          disabled={task.column_key === 'todo'}
                          onClick={(e) => {
                            e.stopPropagation()
                            step(task, -1)
                          }}
                        >
                          <IconArrowLeft size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Avançar coluna"
                          disabled={task.column_key === 'done'}
                          onClick={(e) => {
                            e.stopPropagation()
                            step(task, 1)
                          }}
                        >
                          <IconArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {detailTask && (
        <div className="modal-backdrop" onClick={() => setDetailTask(null)}>
          <div className="modal task-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{detailTask.title}</h3>
              <button className="icon-btn" onClick={() => setDetailTask(null)}>
                <IconClose size={16} />
              </button>
            </div>
            <div className="task-detail-rows">
              <div className="task-detail-row">
                <span>Prioridade</span>
                <strong className={PRIORITY_CLASS[detailTask.priority] || 'p-media'}>
                  {detailTask.priority}
                </strong>
              </div>
              <div className="task-detail-row">
                <span>Criada em</span>
                <strong>{formatDate(detailTask.created_at)}</strong>
              </div>
              <div className="task-detail-row">
                <span>Prazo de entrega</span>
                <strong>{detailTask.due_date ? formatDate(detailTask.due_date) : 'Sem prazo definido'}</strong>
              </div>
              <div className="task-detail-row">
                <span>Responsável</span>
                <strong>{memberName(detailTask.assigned_to)}</strong>
              </div>
              <div className="task-detail-row">
                <span>Status</span>
                <strong>{COLUMNS.find((c) => c.key === detailTask.column_key)?.label}</strong>
              </div>
            </div>
            <div className="task-detail-description">
              <span>Descrição</span>
              <textarea
                rows={4}
                placeholder="Adicione detalhes, contexto ou links..."
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
              />
              {descDraft !== (detailTask.description || '') && (
                <button className="secondary" onClick={saveDescription}>
                  Salvar descrição
                </button>
              )}
            </div>
            <button className="secondary danger-text" onClick={() => removeTask(detailTask.id)}>
              <IconTrash size={15} />
              <span>Excluir tarefa</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
