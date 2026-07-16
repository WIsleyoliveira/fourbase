import { useState } from 'react'
import { IconPlus, IconTrash, IconKanban } from '../icons.jsx'

const PRIORITY_CLASS = { Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const PRIORITY_RANK = { Alta: 0, Média: 1, Baixa: 2 }

const formatDueAt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

const sortTodos = (list) =>
  list.slice().sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    if (rankDiff !== 0) return rankDiff
    if (a.due_at && b.due_at) return new Date(a.due_at) - new Date(b.due_at)
    if (a.due_at) return -1
    if (b.due_at) return 1
    return 0
  })

export default function Checklist({ todos, onAdd, onToggle, onDelete, onSendToKanban }) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState('Média')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const done = todos.filter((t) => t.done).length
  const progress = todos.length ? Math.round((done / todos.length) * 100) : 0

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const due_at = date ? new Date(`${date}T${time || '00:00'}`).toISOString() : null
    onAdd(text.trim(), priority, due_at)
    setText('')
    setDate('')
    setTime('')
  }

  const sorted = sortTodos(todos)

  return (
    <div className="panel checklist">
      <div className="panel-header">
        <div>
          <h3>Itens do dia</h3>
          <span>
            {done} de {todos.length} concluído{done === 1 ? '' : 's'}
          </span>
        </div>
        <strong className="progress-number">{progress}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <form className="checklist-row" onSubmit={submit}>
        <input
          type="text"
          placeholder="Adicionar item da checklist"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="Baixa">Prioridade: Baixa</option>
          <option value="Média">Prioridade: Média</option>
          <option value="Alta">Prioridade: Alta</option>
        </select>
        <input type="date" title="Data" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" title="Hora" value={time} onChange={(e) => setTime(e.target.value)} />
        <button type="submit">
          <IconPlus size={16} />
          <span>Adicionar</span>
        </button>
      </form>
      <div className="todo-list">
        {todos.length === 0 && <div className="empty-hint">Nenhum item ainda — adicione o primeiro.</div>}
        {sorted.map((item) => (
          <div className={`todo-item${item.done ? ' is-done' : ''}`} key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle(item.id, !item.done)}
              />
              <span className={item.done ? 'done' : ''}>{item.text}</span>
            </label>
            <div className="todo-item-meta">
              <small className={`priority-tag ${PRIORITY_CLASS[item.priority] || 'p-media'}`}>
                {item.priority || 'Média'}
              </small>
              {item.due_at && <small className="due-tag">{formatDueAt(item.due_at)}</small>}
              <button
                className="icon-btn"
                title="Enviar para o Kanban"
                onClick={() => onSendToKanban(item.text)}
              >
                <IconKanban size={15} />
              </button>
              <button className="icon-btn danger" title="Remover item" onClick={() => onDelete(item.id)}>
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
