import { useEffect, useMemo, useRef, useState } from 'react'
import TaskDetailModal from './TaskDetailModal.jsx'
import {
  IconArrowLeft,
  IconArrowRight,
  IconPlus,
  IconChevronDown,
  IconFilter,
  IconUser,
  IconSearch,
  IconClose,
  IconCheckPlain,
} from '../icons.jsx'
import { assigneeColor, memberColor, tagColor } from '../colors.js'

const WEEKDAYS_FULL = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
]
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const PRIORITY_CLASS = { Urgente: 'p-urgente', Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }

const toKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const getInitials = (name = '') =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Duração da transição de largura do popover (ver .daydetail-popover em styles.css) —
// o desmonte do painel de detalhes é adiado até o fim da transição para não interrompê-la.
const COLLAPSE_MS = 280

export default function Calendar({ tasks, members, currentUser, columns, tags = [], onAdd, onUpdate, onMove, onDelete, onCreateTag }) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(today)
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [collapsing, setCollapsing] = useState(false)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [detailTask, setDetailTask] = useState(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState(() => new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')

  const viewMenuRef = useRef(null)
  const assigneeMenuRef = useRef(null)
  const tagMenuRef = useRef(null)
  const collapseTimerRef = useRef(null)

  // Recolhe o painel de detalhes com animação: a largura do popover começa a encolher
  // imediatamente, e o painel só é desmontado depois que a transição termina
  const collapseDetailPanel = () => {
    if (!selectedTaskId || collapsing) return
    setCollapsing(true)
    collapseTimerRef.current = setTimeout(() => {
      setSelectedTaskId(null)
      setCollapsing(false)
    }, COLLAPSE_MS)
  }

  // Limpa qualquer timer de colapso pendente ao desmontar o componente
  useEffect(() => () => clearTimeout(collapseTimerRef.current), [])

  // Fecha os menus (visualização / responsável) ao clicar fora ou pressionar ESC
  useEffect(() => {
    const handleClick = (e) => {
      if (viewMenuOpen && viewMenuRef.current && !viewMenuRef.current.contains(e.target)) {
        setViewMenuOpen(false)
      }
      if (assigneeMenuOpen && assigneeMenuRef.current && !assigneeMenuRef.current.contains(e.target)) {
        setAssigneeMenuOpen(false)
      }
      if (tagMenuOpen && tagMenuRef.current && !tagMenuRef.current.contains(e.target)) {
        setTagMenuOpen(false)
      }
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setViewMenuOpen(false)
        setAssigneeMenuOpen(false)
        setTagMenuOpen(false)
        // Primeiro ESC recolhe o painel de detalhes; segundo ESC fecha o popover do dia
        if (selectedTaskId) {
          collapseDetailPanel()
        } else {
          setIsDayDetailOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [viewMenuOpen, assigneeMenuOpen, tagMenuOpen, selectedTaskId, collapsing])

  const toggleTagFilter = (name) => {
    setTagFilter((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (assigneeFilter !== 'all' && t.assigned_to !== assigneeFilter) return false
      if (tagFilter.size > 0 && !(t.tags || []).some((name) => tagFilter.has(name))) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, search, assigneeFilter, tagFilter])

  const tasksByDay = useMemo(() => {
    const map = {}
    filteredTasks.forEach((t) => {
      if (!t.due_date) return
      map[t.due_date] = map[t.due_date] || []
      map[t.due_date].push(t)
    })
    return map
  }, [filteredTasks])

  // Tarefas do dia selecionado no popover — memoizado, reage a mudanças de data ou da lista de tarefas
  const tasksForSelectedDate = useMemo(() => {
    if (!selectedDate) return []
    return (tasksByDay[toKey(selectedDate)] || []).slice().sort((a, b) => a.title.localeCompare(b.title))
  }, [selectedDate, tasksByDay])

  const unscheduled = useMemo(
    () => filteredTasks.filter((t) => !t.due_date).sort((a, b) => a.title.localeCompare(b.title)),
    [filteredTasks],
  )
  const overdue = useMemo(() => {
    const todayKey = toKey(today)
    return filteredTasks
      .filter((t) => t.due_date && t.due_date < todayKey && t.column_key !== 'done')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [filteredTasks, today])

  const grid = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7
    const cells = []
    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, i - startOffset + 1)
      cells.push({ date, inMonth: date.getMonth() === month })
    }
    return cells
  }, [cursor])

  const changeMonth = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  const openDayDetail = (date) => {
    clearTimeout(collapseTimerRef.current)
    setSelectedDate(date)
    setQuickAddTitle('')
    setSelectedTaskId(null)
    setCollapsing(false)
    setIsDayDetailOpen(true)
  }
  const closeDayDetail = () => {
    clearTimeout(collapseTimerRef.current)
    setIsDayDetailOpen(false)
    setQuickAddTitle('')
    setSelectedTaskId(null)
    setCollapsing(false)
  }

  const submitQuickAdd = (e) => {
    e.preventDefault()
    const title = quickAddTitle.trim()
    if (!title || !selectedDate) return
    onAdd(title, 'Média', toKey(selectedDate))
    setQuickAddTitle('')
  }

  const toggleComplete = (task) => {
    onMove(task.id, task.column_key === 'done' ? 'todo' : 'done')
  }

  const openDetail = (e, task) => {
    e.stopPropagation()
    setDetailTask(task)
  }

  const dragTask = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId)
  }

  const dropOnDay = (e, date) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id && onUpdate) onUpdate(id, { due_date: toKey(date) })
  }

  const dayDetailLabel = selectedDate
    ? capitalize(selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))
    : ''

  // Tarefa aberta no painel de detalhes embutido (split view) — busca na lista completa
  // para não sumir do painel caso o usuário altere o prazo dela para outro dia
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null

  return (
    <div className="calview">
      <div className="calview-main">
        <header className="calview-toolbar">
          <div className="calview-toolbar-left">
            <button className="calview-today-btn" onClick={goToday}>Hoje</button>
            <div className="calview-view-select" ref={viewMenuRef}>
              <button className="calview-ghost-btn" onClick={() => setViewMenuOpen((v) => !v)}>
                Mês
                <IconChevronDown size={14} />
              </button>
              {viewMenuOpen && (
                <div className="calview-view-menu">
                  <button className="active" onClick={() => setViewMenuOpen(false)}>Mês</button>
                </div>
              )}
            </div>
            <div className="calview-nav-arrows">
              <button className="icon-btn" onClick={() => changeMonth(-1)} title="Mês anterior">
                <IconArrowLeft size={16} />
              </button>
              <button className="icon-btn" onClick={() => changeMonth(1)} title="Próximo mês">
                <IconArrowRight size={16} />
              </button>
            </div>
            <h2 className="calview-title">
              {MONTHS[cursor.getMonth()].toLowerCase()} {cursor.getFullYear()}
            </h2>
          </div>
          <div className="calview-toolbar-right">
            <div className="calview-view-select" ref={tagMenuRef}>
              <button
                className={`calview-ghost-btn${tagFilter.size > 0 ? ' active' : ''}`}
                onClick={() => setTagMenuOpen((v) => !v)}
              >
                <IconFilter size={14} />
                {tagFilter.size === 0 ? 'Etiquetas' : `Etiquetas (${tagFilter.size})`}
                <IconChevronDown size={14} />
              </button>
              {tagMenuOpen && (
                <div className="calview-view-menu calview-assignee-menu calview-tag-menu">
                  {tags.length === 0 && (
                    <p className="calview-tag-menu-empty">Nenhuma etiqueta cadastrada.</p>
                  )}
                  {tags.map((t) => {
                    const active = tagFilter.has(t.name)
                    return (
                      <button
                        key={t.id}
                        className={active ? 'active' : ''}
                        onClick={() => toggleTagFilter(t.name)}
                      >
                        <span className="calview-tag-menu-dot" style={{ background: t.color }} />
                        {t.name}
                        {active && <IconCheckPlain size={12} style={{ marginLeft: 'auto' }} />}
                      </button>
                    )
                  })}
                  {tagFilter.size > 0 && (
                    <button className="calview-tag-menu-clear" onClick={() => setTagFilter(new Set())}>
                      Limpar filtro
                    </button>
                  )}
                </div>
              )}
            </div>
            <button className="calview-ghost-btn">Fechado</button>
            <div className="calview-view-select" ref={assigneeMenuRef}>
              <button
                className={`calview-ghost-btn${assigneeFilter !== 'all' ? ' active' : ''}`}
                onClick={() => setAssigneeMenuOpen((v) => !v)}
              >
                <IconUser size={14} />
                {assigneeFilter === 'all'
                  ? 'Responsável'
                  : members.find((m) => m.id === assigneeFilter)?.name || 'Responsável'}
                <IconChevronDown size={14} />
              </button>
              {assigneeMenuOpen && (
                <div className="calview-view-menu calview-assignee-menu">
                  <button
                    className={assigneeFilter === 'all' ? 'active' : ''}
                    onClick={() => { setAssigneeFilter('all'); setAssigneeMenuOpen(false) }}
                  >
                    Todos
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      className={assigneeFilter === m.id ? 'active' : ''}
                      onClick={() => { setAssigneeFilter(m.id); setAssigneeMenuOpen(false) }}
                    >
                      <span className="member-avatar sm" style={{ background: assigneeColor(m.id, m.color) }}>{getInitials(m.name)}</span>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="member-avatar calview-avatar" style={{ background: memberColor(currentUser?.id, members) }} title={currentUser?.name}>
              {getInitials(currentUser?.name)}
            </div>
            {searchOpen ? (
              <input
                className="calview-search-input"
                autoFocus
                placeholder="Pesquisar tarefas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
              />
            ) : (
              <button className="icon-btn" title="Pesquisar" onClick={() => setSearchOpen(true)}>
                <IconSearch size={15} />
              </button>
            )}
            <button className="calview-ghost-btn">Personalizar</button>
            <div className="calview-add-split">
              <button className="calview-add-btn" onClick={() => openDayDetail(selectedDate || today)}>
                <IconPlus size={14} />
                Add Tarefa
              </button>
              <button
                className="calview-add-caret"
                onClick={() => openDayDetail(selectedDate || today)}
                title="Nova tarefa"
              >
                <IconChevronDown size={13} />
              </button>
            </div>
          </div>
        </header>

        <div className="calview-weekdays">
          {WEEKDAYS_FULL.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className="calview-grid">
          {grid.map(({ date, inMonth }, i) => {
            const dayTasks = tasksByDay[toKey(date)] || []
            const isToday = isSameDay(date, today)
            const isSelected = selectedDate && isSameDay(date, selectedDate)
            return (
              <div
                key={i}
                className={`calview-cell${inMonth ? '' : ' out-month'}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                onClick={() => openDayDetail(date)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropOnDay(e, date)}
              >
                <div className="calview-cell-top">
                  <button className="calview-cell-add" tabIndex={-1} title="Ver tarefas do dia">
                    <IconPlus size={12} />
                  </button>
                  <span className="calview-day-number">{date.getDate()}</span>
                </div>
                <div className="calview-cell-tasks">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      className="calview-task-badge"
                      style={{ background: `${memberColor(t.assigned_to, members)}22` }}
                      onClick={(e) => openDetail(e, t)}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); dragTask(e, t.id) }}
                    >
                      <span className="calview-task-dot" style={{ background: memberColor(t.assigned_to, members) }} />
                      <span className="calview-task-title">{t.title}</span>
                      {t.tags?.length > 0 && (
                        <span className="calview-task-tags">
                          {t.tags.slice(0, 3).map((name) => (
                            <span key={name} className="calview-task-tag-dot" style={{ background: tagColor(name, tags) }} title={name} />
                          ))}
                        </span>
                      )}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="calview-more">+{dayTasks.length - 3} mais</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <aside className={`calview-side${sideOpen ? ' open' : ''}`}>
        <button className="calview-side-tab" onClick={() => setSideOpen((v) => !v)}>
          <span className="calview-side-tab-label">
            <span className="calview-side-count">{unscheduled.length}</span> Não agendado
          </span>
          <span className="calview-side-tab-label">
            <span className="calview-side-count over">{overdue.length}</span> Em atraso
          </span>
        </button>
        {sideOpen && (
          <div className="calview-side-panel">
            <div className="calview-side-panel-header">
              <h4>Tarefas do calendário</h4>
              <button className="icon-btn" onClick={() => setSideOpen(false)}>
                <IconClose size={14} />
              </button>
            </div>
            <div className="calview-side-group">
              <h5>Não agendado ({unscheduled.length})</h5>
              {unscheduled.length === 0 && <p className="calview-side-empty">Nenhuma tarefa sem prazo.</p>}
              {unscheduled.map((t) => (
                <div
                  key={t.id}
                  className="calview-side-task"
                  draggable
                  onDragStart={(e) => dragTask(e, t.id)}
                  onClick={() => setDetailTask(t)}
                >
                  <span className="calview-task-dot" style={{ background: memberColor(t.assigned_to, members) }} />
                  <span>{t.title}</span>
                </div>
              ))}
            </div>
            <div className="calview-side-group">
              <h5>Em atraso ({overdue.length})</h5>
              {overdue.length === 0 && <p className="calview-side-empty">Nenhuma tarefa atrasada.</p>}
              {overdue.map((t) => (
                <div
                  key={t.id}
                  className="calview-side-task overdue"
                  draggable
                  onDragStart={(e) => dragTask(e, t.id)}
                  onClick={() => setDetailTask(t)}
                >
                  <span className="calview-task-dot" style={{ background: memberColor(t.assigned_to, members) }} />
                  <span>{t.title}</span>
                </div>
              ))}
            </div>
            <p className="calview-side-hint">Arraste uma tarefa para um dia do calendário para definir o prazo.</p>
          </div>
        )}
      </aside>

      {isDayDetailOpen && selectedDate && (
        <div className="modal-backdrop daydetail-backdrop" onClick={closeDayDetail}>
          <div
            className={`daydetail-popover${selectedTask && !collapsing ? ' expanded' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="daydetail-list-col">
              <div className="daydetail-header">
                <h3>{dayDetailLabel}</h3>
                <button className="icon-btn" onClick={closeDayDetail} title="Fechar">
                  <IconClose size={15} />
                </button>
              </div>

              <div className="daydetail-list">
                {tasksForSelectedDate.length === 0 ? (
                  <p className="daydetail-empty">Nenhuma tarefa agendada para este dia.</p>
                ) : (
                  tasksForSelectedDate.map((t) => {
                    const done = t.column_key === 'done'
                    const assignee = members.find((m) => m.id === t.assigned_to)
                    return (
                      <div
                        className={`daydetail-item${selectedTaskId === t.id ? ' active' : ''}`}
                        key={t.id}
                      >
                        <div className="daydetail-item-row">
                          <button
                            className={`daydetail-checkbox${done ? ' checked' : ''}`}
                            onClick={() => toggleComplete(t)}
                            title={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
                          >
                            {done && <IconCheckPlain size={11} />}
                          </button>
                          <button
                            className={`daydetail-item-title${done ? ' done' : ''}`}
                            onClick={() => { clearTimeout(collapseTimerRef.current); setCollapsing(false); setSelectedTaskId(t.id) }}
                          >
                            {t.title}
                          </button>
                          <span className={`priority-tag ${PRIORITY_CLASS[t.priority] || 'p-media'}`}>
                            {t.priority}
                          </span>
                          <div
                            className={`member-avatar sm${assignee ? '' : ' empty'}`}
                            style={assignee ? { background: assigneeColor(assignee.id, assignee.color) } : undefined}
                            title={assignee?.name || 'Sem responsável'}
                          >
                            {assignee ? getInitials(assignee.name) : '—'}
                          </div>
                        </div>
                        {t.tags?.length > 0 && (
                          <div className="daydetail-item-tags">
                            {t.tags.map((name) => {
                              const color = tagColor(name, tags)
                              return (
                                <span key={name} className="card-tag-pill" style={{ background: `${color}1f`, color }}>
                                  {name}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              <form className="daydetail-quickadd" onSubmit={submitQuickAdd}>
                <IconPlus size={13} />
                <input
                  type="text"
                  placeholder="+ Adicionar tarefa rápida..."
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                />
              </form>
            </div>

            {selectedTask && (
              <div className="daydetail-detail-col">
                <TaskDetailModal
                  key={selectedTask.id}
                  embedded
                  task={selectedTask}
                  members={members}
                  currentUser={currentUser}
                  columns={columns}
                  tags={tags}
                  onCreateTag={onCreateTag}
                  onClose={collapseDetailPanel}
                  onUpdate={onUpdate}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          members={members}
          currentUser={currentUser}
          columns={columns}
          tags={tags}
          onCreateTag={onCreateTag}
          onClose={() => setDetailTask(null)}
          onUpdate={onUpdate}
          onMove={onMove}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}
