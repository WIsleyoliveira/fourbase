import { useEffect, useState } from 'react'
import { IconKanban, IconNotes, IconFolder, IconArrowRight, IconPlus } from '../icons.jsx'
import TaskDetailModal from './TaskDetailModal.jsx'
import { api } from '../api.js'
import { memberColor } from '../colors.js'

const PRIORITY_CLASS = { Urgente: 'p-urgente', Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const MAX_UPCOMING = 4

// Estado do prazo em relação a hoje — reaproveita a mesma lógica usada no Kanban
const dueState = (due_date) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  return 'upcoming'
}

const dueLabel = (due_date) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return `Atrasada ${Math.abs(diffDays)}d`
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Amanhã'
  return due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function Dashboard({
  tasks, notes, members, clients, currentUser, columns, tags,
  onNavigate, onCreateTask, onUpdateTask, onMoveTask, onDeleteTask, onCreateTag,
}) {
  const [detailTaskId, setDetailTaskId] = useState(null)
  // null = ainda carregando — mantém o widget com o mesmo layout enquanto busca
  const [folderCount, setFolderCount] = useState(null)

  useEffect(() => {
    api.getFolders()
      .then((list) => setFolderCount(list.length))
      .catch(() => setFolderCount(0))
  }, [])

  const counts = {
    todo: tasks.filter((t) => t.column_key === 'todo').length,
    doing: tasks.filter((t) => t.column_key === 'doing').length,
    done: tasks.filter((t) => t.column_key === 'done').length,
  }
  const taskProgress = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0

  const stats = [
    { label: 'A fazer', value: counts.todo, tone: 'info' },
    { label: 'Em progresso', value: counts.doing, tone: 'warn' },
    { label: 'Concluídas', value: counts.done, tone: 'ok' },
    { label: 'Total', value: tasks.length, tone: 'brand' },
  ]

  // Tarefas do usuário atual (a API já filtra por assigned_to), não concluídas, com prazo —
  // ordenadas por vencimento mais próximo primeiro
  const upcomingTasks = tasks
    .filter((t) => t.column_key !== 'done' && t.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, MAX_UPCOMING)

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : null
  const latestNote = notes[0] || null

  // Atalhos/widgets da coluna direita — mesma estrutura visual para todos,
  // cada um mantendo seus próprios dados/contadores dinâmicos no subtítulo
  const sideWidgets = [
    {
      key: 'notas',
      icon: <IconNotes size={18} />,
      title: 'Notas',
      subtitle: latestNote
        ? `${notes.length} nota${notes.length === 1 ? '' : 's'} · última: "${latestNote.title || 'Sem título'}"`
        : 'Nenhuma nota criada ainda',
    },
    {
      key: 'midia',
      icon: <IconFolder size={18} />,
      title: 'Documentações',
      subtitle: folderCount === null
        ? 'Carregando...'
        : `${folderCount} pasta${folderCount === 1 ? '' : 's'} criada${folderCount === 1 ? '' : 's'}`,
    },
    {
      key: 'kanban',
      icon: <IconKanban size={18} />,
      title: 'Kanban',
      subtitle: `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} · ${taskProgress}% concluído`,
    },
  ]

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="stats-grid">
          {stats.map((s) => (
            <div className={`stat-card tone-${s.tone}`} key={s.label}>
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
        <button className="dashboard-create-btn" onClick={onCreateTask}>
          <IconPlus size={16} />
          Criar Tarefa
        </button>
      </div>

      <div className="panel progress-panel">
        <div className="panel-header">
          <div>
            <h3>Progresso geral</h3>
            <span>Andamento das tarefas do quadro</span>
          </div>
          <strong className="progress-number">{taskProgress}%</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${taskProgress}%` }} />
        </div>
      </div>

      {/* Grid principal: prazos (2/3) + atalhos empilhados (1/3) — mesma altura, colunas simétricas */}
      <div className="dashboard-grid">
        <div className="panel upcoming-panel dashboard-grid-main">
          <div className="panel-header">
            <div>
              <h3>Próximos prazos</h3>
              <span>Suas tarefas com vencimento mais próximo</span>
            </div>
          </div>
          <div className="upcoming-list">
            {upcomingTasks.length === 0 && (
              <div className="empty-hint">Nenhuma tarefa com prazo definido no momento.</div>
            )}
            {upcomingTasks.map((t) => (
              <button
                key={t.id}
                className="upcoming-item"
                style={{ borderLeft: `3px solid ${memberColor(t.assigned_to, members)}`, paddingLeft: 10 }}
                onClick={() => setDetailTaskId(t.id)}
              >
                <span className={`priority-tag ${PRIORITY_CLASS[t.priority] || 'p-media'}`}>
                  {t.priority}
                </span>
                <span className="upcoming-item-title">{t.title}</span>
                <span className={`due-tag due-${dueState(t.due_date)}`}>
                  {dueLabel(t.due_date)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside className="dashboard-side">
          {sideWidgets.map((w) => (
            <button className="dashboard-widget" key={w.key} onClick={() => onNavigate(w.key)}>
              <span className="dashboard-widget-left">
                <span className="dashboard-widget-icon">{w.icon}</span>
                <span className="dashboard-widget-text">
                  <strong>{w.title}</strong>
                  <small>{w.subtitle}</small>
                </span>
              </span>
              <IconArrowRight size={15} className="dashboard-widget-arrow" />
            </button>
          ))}
        </aside>
      </div>

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          members={members}
          clients={clients}
          currentUser={currentUser}
          columns={columns}
          tags={tags}
          onCreateTag={onCreateTag}
          onClose={() => setDetailTaskId(null)}
          onUpdate={onUpdateTask}
          onMove={onMoveTask}
          onDelete={onDeleteTask}
        />
      )}
    </div>
  )
}
