import { useState } from 'react'
import { IconClose, IconKanban } from '../icons.jsx'

export default function SendToKanbanModal({ draft, members, currentUser, onCancel, onConfirm }) {
  const [title, setTitle] = useState(draft.title)
  const [description, setDescription] = useState(draft.description || '')
  const [priority, setPriority] = useState('Média')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id || '')
  const isGestor = currentUser?.role === 'gestor'

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onConfirm({
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date: dueDate || null,
      assigned_to: isGestor ? assignedTo : undefined,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <IconKanban size={16} /> Enviar para o Kanban
          </h3>
          <button className="icon-btn" onClick={onCancel}>
            <IconClose size={16} />
          </button>
        </div>
        <form className="kanban-send-form" onSubmit={submit}>
          <label>
            Título
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label>
            Descrição
            <textarea
              rows={4}
              placeholder="Detalhes, contexto, links..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="kanban-send-row">
            <label>
              Prioridade
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
              </select>
            </label>
            <label>
              Prazo
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          {isGestor && (
            <label>
              Responsável
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit">
            <IconKanban size={16} />
            <span>Criar no Kanban</span>
          </button>
        </form>
      </div>
    </div>
  )
}
