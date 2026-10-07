import { useState } from 'react'
import { createPortal } from 'react-dom'
import Onboarding from './Onboarding.jsx'
import { IconKanban, IconNotes, IconFolder, IconArrowRight, IconPlus, IconCheckPlain, IconCalendar } from '../icons.jsx'
import Avatar from './Avatar.jsx'
import QuickNoteModal from './QuickNoteModal.jsx'
import { DONUT_RADIUS, donutSegments, todayAgenda } from '../dashboardData.js'
import { localToday } from '../notificationText.js'
import TaskDetailModal from './TaskDetailModal.jsx'
import { useMyTasks, useTaskActions } from '../hooks/useTasks.js'
import { useFolders } from '../hooks/useFolders.js'
import { useNotes } from '../hooks/useNotes.js'
import { useClients, useColumns, useMembers, useTagActions, useTags } from '../hooks/useWorkspaceData.js'
import LoadingBlock, { anyLoading } from './LoadingBlock.jsx'
import { memberColor } from '../colors.js'

const PRIORITY_CLASS = { Urgente: 'p-urgente', Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const MAX_UPCOMING = 5

// Estado do prazo em relação a hoje — reaproveita a mesma lógica usada no Kanban.
// due_date_end (tarefa de vários dias) é o que decide "atrasada", não o início.
const dueState = (due_date, due_date_end) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date_end || due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  return 'upcoming'
}

// due_time vem do Postgres como "HH:MM:SS" — só interessa "HH:MM" na UI.
const formatTime = (time) => (time ? time.slice(0, 5) : '')

const dueLabel = (due_date, due_date_end, due_time) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${due_date_end || due_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  const timeSuffix = due_time ? ` · ${formatTime(due_time)}` : ''
  if (diffDays < 0) return `Atrasada ${Math.abs(diffDays)}d`
  if (diffDays === 0) return `Hoje${timeSuffix}`
  if (diffDays === 1) return `Amanhã${timeSuffix}`
  const label = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return (due_date_end ? `${new Date(`${due_date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${label}` : label) + timeSuffix
}

const EMPTY = []

const DONUT_LEGEND = [
  { key: 'todo', label: 'A fazer' },
  { key: 'doing', label: 'Em progresso' },
  { key: 'done', label: 'Concluídas' },
]

// Rosca de progresso: proporção entre A fazer / Em progresso / Concluídas, com o
// percentual concluído no centro. Sem tarefas, só o anel vazio.
function ProgressDonut({ counts, total, progress }) {
  const segments = donutSegments(counts)
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" className="donut-svg" role="img" aria-label={`${progress}% das tarefas concluídas`}>
        <circle className="donut-ring" cx="60" cy="60" r={DONUT_RADIUS} />
        {segments.map((seg) => (
          <circle
            key={seg.key}
            className={`donut-seg donut-seg-${seg.key}`}
            cx="60"
            cy="60"
            r={DONUT_RADIUS}
            strokeDasharray={`${seg.length} ${seg.circumference - seg.length}`}
            strokeDashoffset={seg.offset}
          />
        ))}
      </svg>
      <div className="donut-center">
        <strong>{progress}%</strong>
        <small>{total ? 'concluído' : 'sem tarefas'}</small>
      </div>
    </div>
  )
}

function DashboardView({
  currentUser,
  onNavigate, onCreateTask,
}) {
  const members = useMembers().data ?? EMPTY
  const clients = useClients().data ?? EMPTY
  const columns = useColumns().data
  const tags = useTags().data ?? EMPTY
  const { createTag: onCreateTag } = useTagActions()
  const [detailTaskId, setDetailTaskId] = useState(null)
  const [quickNoteOpen, setQuickNoteOpen] = useState(false)
  const tasks = useMyTasks(currentUser.id).data ?? EMPTY
  const { updateTask: onUpdateTask, moveTask: onMoveTask, deleteTask: onDeleteTask } =
    useTaskActions({ userId: currentUser.id })
  const notesQuery = useNotes()
  const notes = notesQuery.data ?? EMPTY
  // null = ainda carregando — mantém o widget com o mesmo layout enquanto busca
  const folders = useFolders()
  const folderCount = folders.data ? folders.data.length : folders.isError ? 0 : null

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

  const todayKey = localToday()
  const agenda = todayAgenda(tasks, todayKey)
  const completeTask = (task) => onMoveTask(task.id, 'done')
  const assigneeOf = (task) => members.find((m) => m.id === task.assigned_to)

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : null
  const latestNote = notes[0] || null

  // Atalhos/widgets da coluna direita — mesma estrutura visual para todos,
  // cada um mantendo seus próprios dados/contadores dinâmicos no subtítulo
  const sideWidgets = [
    {
      key: 'notas',
      icon: <IconNotes size={18} />,
      title: 'Notas',
      action: { label: 'Nova nota rápida', run: () => setQuickNoteOpen(true) },
      subtitle: notesQuery.isLoading
        ? 'Carregando...'
        : latestNote
        ? `${notes.length} nota${notes.length === 1 ? '' : 's'} · última: "${latestNote.title || 'Sem título'}"`
        : 'Nenhuma nota criada ainda',
    },
    {
      // Documentações agora vive dentro do Espaço de cada cliente — o widget
      // leva para a listagem de Clientes, ponto de entrada da documentação.
      key: 'clientes',
      icon: <IconFolder size={18} />,
      title: 'Documentações',
      subtitle: folderCount === null
        ? 'Carregando...'
        : `${folderCount} pasta${folderCount === 1 ? '' : 's'} · por cliente`,
    },
    {
      key: 'kanban',
      icon: <IconKanban size={18} />,
      title: 'Kanban',
      action: { label: 'Criar tarefa', run: onCreateTask },
      subtitle: `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} · ${taskProgress}% concluído`,
    },
  ]

  return (
    <div className="dashboard">
      <div className="stats-grid">
        {stats.map((s) => (
          <div className={`stat-card tone-${s.tone}`} key={s.label}>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Duas colunas equilibradas: prazos + agenda de hoje | progresso + atalhos */}
      <div className="dashboard-grid">
        <div className="dashboard-col">
          <div className="panel upcoming-panel">
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
              {upcomingTasks.map((t) => {
                const state = dueState(t.due_date, t.due_date_end)
                const assignee = assigneeOf(t)
                return (
                  <div
                    key={t.id}
                    className={`upcoming-item${state === 'overdue' ? ' is-overdue' : ''}`}
                    style={{ '--owner': memberColor(t.assigned_to, members) }}
                  >
                    <button
                      type="button"
                      className="upcoming-check"
                      onClick={() => completeTask(t)}
                      title="Concluir tarefa"
                      aria-label={`Concluir a tarefa ${t.title}`}
                    >
                      <IconCheckPlain size={11} />
                    </button>
                    <button type="button" className="upcoming-main" onClick={() => setDetailTaskId(t.id)}>
                      <span className={`priority-tag ${PRIORITY_CLASS[t.priority] || 'p-media'}`}>
                        {t.priority}
                      </span>
                      <span className="upcoming-item-title">{t.title}</span>
                      <span className={`due-tag due-${state}`}>
                        {dueLabel(t.due_date, t.due_date_end, t.due_time)}
                      </span>
                      {assignee && (
                        <Avatar id={assignee.id} name={assignee.name} list={members} className="member-avatar sm" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            <button type="button" className="panel-link" onClick={() => onNavigate('calendario')}>
              Ver todos no Calendário <IconArrowRight size={13} />
            </button>
          </div>

          <div className="panel today-panel">
            <div className="panel-header">
              <div>
                <h3>Agenda de hoje</h3>
                <span>
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <span className="today-count">{agenda.length}</span>
            </div>
            <div className="upcoming-list">
              {agenda.length === 0 && (
                <div className="empty-hint">Nada marcado para hoje. Aproveite para adiantar o que vem aí.</div>
              )}
              {agenda.map((t) => {
                const assignee = assigneeOf(t)
                return (
                  <button
                    type="button"
                    key={t.id}
                    className="today-item"
                    style={{ '--owner': memberColor(t.assigned_to, members) }}
                    onClick={() => setDetailTaskId(t.id)}
                  >
                    <span className="today-time">
                      {t.due_time ? formatTime(t.due_time) : 'Dia todo'}
                    </span>
                    <span className="upcoming-item-title">{t.title}</span>
                    {assignee && (
                      <Avatar id={assignee.id} name={assignee.name} list={members} className="member-avatar sm" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="dashboard-col">
          <div className="panel donut-panel">
            <div className="panel-header">
              <div>
                <h3>Progresso geral</h3>
                <span>Andamento das tarefas do quadro</span>
              </div>
            </div>
            <div className="donut-body">
              <ProgressDonut counts={counts} total={tasks.length} progress={taskProgress} />
              <ul className="donut-legend">
                {DONUT_LEGEND.map((item) => (
                  <li key={item.key}>
                    <span className={`donut-dot donut-seg-${item.key}`} />
                    <span className="donut-legend-label">{item.label}</span>
                    <strong>{counts[item.key]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="dashboard-side">
            {sideWidgets.map((w) => (
              <div className="dashboard-widget" key={w.key}>
                <button type="button" className="dashboard-widget-main" onClick={() => onNavigate(w.key)}>
                  <span className="dashboard-widget-left">
                    <span className="dashboard-widget-icon">{w.icon}</span>
                    <span className="dashboard-widget-text">
                      <strong>{w.title}</strong>
                      <small>{w.subtitle}</small>
                    </span>
                  </span>
                  <IconArrowRight size={15} className="dashboard-widget-arrow" />
                </button>
                {w.action && (
                  <button
                    type="button"
                    className="dashboard-widget-add"
                    title={w.action.label}
                    aria-label={w.action.label}
                    onClick={w.action.run}
                  >
                    <IconPlus size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {quickNoteOpen && <QuickNoteModal onClose={() => setQuickNoteOpen(false)} />}

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

// Spinner só na primeira carga de tarefas e membros; depois a tela fica de pé.
// O onboarding do primeiro acesso aparece por cima do Painel, já carregado. Vai num
// portal porque é um overlay fixo e a tela tem animação com transform.
export default function Dashboard({ onCompleteOnboarding, ...props }) {
  if (anyLoading(useMyTasks(props.currentUser.id), useMembers())) return <LoadingBlock text="Carregando painel..." />
  return (
    <>
      <DashboardView {...props} />
      {!props.currentUser.has_completed_onboarding && createPortal(
        <Onboarding onFinish={onCompleteOnboarding} onSkip={onCompleteOnboarding} />,
        document.body,
      )}
    </>
  )
}
