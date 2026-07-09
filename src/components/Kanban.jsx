import { useState } from 'react'
import { IconPlus, IconTrash, IconArrowLeft, IconArrowRight } from '../icons.jsx'

const COLUMNS = [
  { key: 'todo', label: 'A Fazer' },
  { key: 'doing', label: 'Em Progresso' },
  { key: 'done', label: 'Concluído' },
]
const ORDER = COLUMNS.map((c) => c.key)
const PRIORITY_CLASS = { Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }

export default function Kanban({ tasks, onAdd, onMove, onDelete }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('Média')
  const [dragId, setDragId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), priority)
    setTitle('')
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
        <button type="submit">
          <IconPlus size={16} />
          <span>Adicionar</span>
        </button>
      </form>
      <div className="kanban">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.column_key === col.key)
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
                {colTasks.map((task) => (
                  <div
                    className={`card ${PRIORITY_CLASS[task.priority] || 'p-media'}${dragId === task.id ? ' dragging' : ''}`}
                    key={task.id}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="card-top">
                      <small className={`priority-tag ${PRIORITY_CLASS[task.priority] || 'p-media'}`}>
                        {task.priority}
                      </small>
                      <button
                        className="icon-btn danger"
                        title="Excluir tarefa"
                        onClick={() => onDelete(task.id)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                    <h5>{task.title}</h5>
                    <div className="card-actions">
                      <button
                        className="icon-btn"
                        title="Voltar coluna"
                        disabled={task.column_key === 'todo'}
                        onClick={() => step(task, -1)}
                      >
                        <IconArrowLeft size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Avançar coluna"
                        disabled={task.column_key === 'done'}
                        onClick={() => step(task, 1)}
                      >
                        <IconArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
