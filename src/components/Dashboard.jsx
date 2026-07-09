import { IconKanban, IconNotes, IconMedia, IconCheck, IconArrowRight } from '../icons.jsx'

export default function Dashboard({ tasks, todos, notes, media, onNavigate }) {
  const counts = {
    todo: tasks.filter((t) => t.column_key === 'todo').length,
    doing: tasks.filter((t) => t.column_key === 'doing').length,
    done: tasks.filter((t) => t.column_key === 'done').length,
  }
  const todosDone = todos.filter((t) => t.done).length
  const taskProgress = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0
  const todoProgress = todos.length ? Math.round((todosDone / todos.length) * 100) : 0
  const mediaCount = (media.image ? 1 : 0) + (media.video ? 1 : 0)

  const stats = [
    { label: 'A fazer', value: counts.todo, tone: 'info' },
    { label: 'Em progresso', value: counts.doing, tone: 'warn' },
    { label: 'Concluídas', value: counts.done, tone: 'ok' },
    { label: 'Checklist', value: `${todosDone}/${todos.length}`, tone: 'brand' },
  ]

  const shortcuts = [
    {
      key: 'kanban',
      icon: <IconKanban size={22} />,
      title: 'Kanban',
      desc: `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} no quadro · ${taskProgress}% concluído`,
    },
    {
      key: 'notas',
      icon: <IconNotes size={22} />,
      title: 'Notas',
      desc: notes.length
        ? `${notes.length} nota${notes.length === 1 ? '' : 's'} · última: "${notes[0].title}"`
        : 'Nenhuma nota criada ainda',
    },
    {
      key: 'midia',
      icon: <IconMedia size={22} />,
      title: 'Mídia',
      desc: mediaCount ? `${mediaCount} anexo${mediaCount === 1 ? '' : 's'} salvos` : 'Nenhum anexo ainda',
    },
    {
      key: 'checklist',
      icon: <IconCheck size={22} />,
      title: 'Checklist',
      desc: todos.length ? `${todoProgress}% dos itens concluídos` : 'Nenhum item ainda',
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

      <div className="shortcut-grid">
        {shortcuts.map((s) => (
          <button className="shortcut-card" key={s.key} onClick={() => onNavigate(s.key)}>
            <span className="shortcut-icon">{s.icon}</span>
            <span className="shortcut-body">
              <strong>{s.title}</strong>
              <small>{s.desc}</small>
            </span>
            <span className="shortcut-arrow">
              <IconArrowRight size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
