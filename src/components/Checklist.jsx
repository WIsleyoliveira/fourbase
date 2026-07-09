import { useState } from 'react'
import { IconPlus, IconTrash } from '../icons.jsx'

export default function Checklist({ todos, onAdd, onToggle, onDelete }) {
  const [text, setText] = useState('')
  const done = todos.filter((t) => t.done).length
  const progress = todos.length ? Math.round((done / todos.length) * 100) : 0

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }

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
        <button type="submit">
          <IconPlus size={16} />
          <span>Adicionar</span>
        </button>
      </form>
      <div className="todo-list">
        {todos.length === 0 && <div className="empty-hint">Nenhum item ainda — adicione o primeiro.</div>}
        {todos.map((item) => (
          <div className={`todo-item${item.done ? ' is-done' : ''}`} key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle(item.id, !item.done)}
              />
              <span className={item.done ? 'done' : ''}>{item.text}</span>
            </label>
            <button className="icon-btn danger" title="Remover item" onClick={() => onDelete(item.id)}>
              <IconTrash size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
