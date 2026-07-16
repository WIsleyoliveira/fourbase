import { useEffect, useState } from 'react'
import { api } from '../api.js'

const COLUMN_LABEL = { todo: 'A Fazer', doing: 'Em Progresso', done: 'Concluído' }
const PRIORITY_CLASS = { Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const PRIORITY_RANK = { Alta: 0, Média: 1, Baixa: 2 }

const formatDate = (iso) => {
  if (!iso) return ''
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const SORTERS = {
  priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1),
  due: (a, b) => {
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  },
  created: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  member: (a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''),
}

export default function TeamView({ onError }) {
  const [overview, setOverview] = useState([])
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('priority')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getTeamOverview(), api.getTeamTasks()])
      .then(([o, t]) => {
        setOverview(o)
        setTasks(t)
      })
      .catch(onError)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="loading-wrap">
        <div className="spinner" />
        <p>Carregando dados da equipe...</p>
      </div>
    )
  }

  const filteredTasks = (filter === 'all' ? tasks : tasks.filter((t) => t.assigned_to === filter))
    .slice()
    .sort(SORTERS[sortBy] || SORTERS.priority)
  const totalTasks = tasks.length
  const totalDone = tasks.filter((t) => t.column_key === 'done').length
  const teamProgress = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0

  return (
    <div className="team-view">
      <div className="panel progress-panel">
        <div className="panel-header">
          <div>
            <h3>Progresso da equipe</h3>
            <span>
              {overview.length} membro{overview.length === 1 ? '' : 's'} · {totalTasks} tarefa
              {totalTasks === 1 ? '' : 's'} no total
            </span>
          </div>
          <strong className="progress-number">{teamProgress}%</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${teamProgress}%` }} />
        </div>
      </div>

      <div className="team-grid">
        {overview.map((member) => {
          const progress = member.tasks.total
            ? Math.round((member.tasks.done / member.tasks.total) * 100)
            : 0
          return (
            <div className="panel member-card" key={member.id}>
              <div className="member-head">
                <div className="member-avatar">{member.name.charAt(0).toUpperCase()}</div>
                <div className="member-id">
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
                <span className={`role-badge ${member.role}`}>
                  {member.role === 'gestor' ? 'Gestor' : 'Funcionário'}
                </span>
              </div>
              <div className="member-stats">
                <div className="member-stat">
                  <strong>{member.tasks.todo}</strong>
                  <small>A fazer</small>
                </div>
                <div className="member-stat">
                  <strong>{member.tasks.doing}</strong>
                  <small>Fazendo</small>
                </div>
                <div className="member-stat">
                  <strong>{member.tasks.done}</strong>
                  <small>Feitas</small>
                </div>
                <div className="member-stat">
                  <strong>
                    {member.todos.done}/{member.todos.total}
                  </strong>
                  <small>Checklist</small>
                </div>
                <div className="member-stat">
                  <strong>{member.notes}</strong>
                  <small>Notas</small>
                </div>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <small className="member-progress-label">{progress}% das tarefas concluídas</small>
            </div>
          )
        })}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Todas as tarefas</h3>
            <span>
              {filteredTasks.length} tarefa{filteredTasks.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="team-controls">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todos os membros</option>
              {overview.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="priority">Ordenar: Prioridade</option>
              <option value="due">Ordenar: Prazo</option>
              <option value="created">Ordenar: Data de criação</option>
              <option value="member">Ordenar: Membro</option>
            </select>
          </div>
        </div>
        <div className="team-tasks">
          {filteredTasks.length === 0 && (
            <div className="empty-hint">Nenhuma tarefa para este filtro.</div>
          )}
          {filteredTasks.map((task) => (
            <div className="team-task-row" key={task.id}>
              <span className={`priority-tag ${PRIORITY_CLASS[task.priority] || 'p-media'}`}>
                {task.priority}
              </span>
              <div className="team-task-body">
                <strong>{task.title}</strong>
                <small>
                  {task.owner_name} · criada em {formatDate(task.created_at)}
                  {task.due_date ? ` · prazo ${formatDate(task.due_date)}` : ''}
                </small>
              </div>
              <span className={`state-badge state-${task.column_key}`}>
                {COLUMN_LABEL[task.column_key]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
