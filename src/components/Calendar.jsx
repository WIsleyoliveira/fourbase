import { useMemo, useState } from 'react'
import { IconArrowLeft, IconArrowRight, IconPlus } from '../icons.jsx'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const PRIORITY_CLASS = { Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const COLUMN_LABEL = { todo: 'A Fazer', doing: 'Em Progresso', done: 'Concluído' }

const toKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function Calendar({ tasks, members, currentUser, onAdd }) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('Média')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id || '')

  const isGestor = currentUser?.role === 'gestor'
  const memberName = (id) => members.find((m) => m.id === id)?.name || 'Sem responsável'

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), priority, toKey(selected), isGestor ? assignedTo : undefined)
    setTitle('')
  }

  const tasksByDay = useMemo(() => {
    const map = {}
    tasks.forEach((t) => {
      if (!t.due_date) return
      map[t.due_date] = map[t.due_date] || []
      map[t.due_date].push(t)
    })
    return map
  }, [tasks])

  const grid = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const changeMonth = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelected(today)
  }

  const selectedTasks = (tasksByDay[toKey(selected)] || []).slice().sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="calendar-layout">
      <div className="panel calendar-panel">
        <div className="calendar-header">
          <h3>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h3>
          <div className="calendar-nav">
            <button className="icon-btn" onClick={() => changeMonth(-1)}>
              <IconArrowLeft size={16} />
            </button>
            <button className="secondary" onClick={goToday}>
              Hoje
            </button>
            <button className="icon-btn" onClick={() => changeMonth(1)}>
              <IconArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="calendar-weekdays">
          {WEEKDAYS.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {grid.map((date, i) => {
            if (!date) return <div className="calendar-cell empty" key={i} />
            const dayTasks = tasksByDay[toKey(date)] || []
            const isToday = isSameDay(date, today)
            const isSelected = isSameDay(date, selected)
            return (
              <button
                key={i}
                className={`calendar-cell${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                onClick={() => setSelected(date)}
              >
                <span className="calendar-day-number">{date.getDate()}</span>
                {dayTasks.length > 0 && (
                  <span className="calendar-dots">
                    {dayTasks.slice(0, 3).map((t, idx) => (
                      <span key={idx} className={`calendar-dot ${PRIORITY_CLASS[t.priority] || 'p-media'}`} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="panel calendar-agenda">
        <div className="panel-header">
          <div>
            <h3>
              {selected.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </h3>
            <span>
              {selectedTasks.length} tarefa{selectedTasks.length === 1 ? '' : 's'} com prazo neste dia
            </span>
          </div>
        </div>
        <form className="agenda-add-form" onSubmit={submit}>
          <input
            type="text"
            placeholder="Nova tarefa para este dia..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="Baixa">Baixa</option>
            <option value="Média">Média</option>
            <option value="Alta">Alta</option>
          </select>
          {isGestor && (
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button type="submit">
            <IconPlus size={16} />
            <span>Adicionar</span>
          </button>
        </form>
        <div className="agenda-list">
          {selectedTasks.length === 0 && (
            <div className="empty-hint">Nenhuma tarefa com prazo para este dia.</div>
          )}
          {selectedTasks.map((t) => (
            <div className="agenda-item" key={t.id}>
              <span className={`priority-tag ${PRIORITY_CLASS[t.priority] || 'p-media'}`}>{t.priority}</span>
              <div className="agenda-item-body">
                <strong>{t.title}</strong>
                <small>{memberName(t.assigned_to)}</small>
              </div>
              <span className={`state-badge state-${t.column_key}`}>{COLUMN_LABEL[t.column_key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
