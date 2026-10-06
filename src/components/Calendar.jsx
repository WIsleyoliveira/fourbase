import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TaskDetailModal from './TaskDetailModal.jsx'
import { mergeCalendarTasks } from '../taskCache.js'
import { useClientLinkedTasks, useMyTasks, useTaskActions } from '../hooks/useTasks.js'
import { useClients, useColumns, useMembers, useTagActions, useTags } from '../hooks/useWorkspaceData.js'
import LoadingBlock, { anyLoading } from './LoadingBlock.jsx'
import {
  IconArrowLeft,
  IconArrowRight,
  IconPlus,
  IconChevronDown,
  IconFilter,
  IconSearch,
  IconClose,
  IconCheckPlain,
  IconStack,
  IconList,
} from '../icons.jsx'
import Avatar from './Avatar.jsx'
import { memberColor, tagColor } from '../colors.js'
import { layoutWeek, taskTooltip, MAX_LANES } from '../calendarLayout.js'
import { emptyDraft, buildTaskFields } from '../newTaskForm.js'
import MiniCalendar from './MiniCalendar.jsx'
import {
  EMPTY_CAL_FILTERS, toggleCalFilter, countCalFilters, filterCalendarTasks, countOptions,
} from '../calendarFilters.js'

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

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// due_time vem do Postgres como "HH:MM:SS" — só interessa "HH:MM" na UI.
const formatTime = (time) => (time ? time.slice(0, 5) : '')

const formatDay = (key) => {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

// Duração da transição de largura do popover (ver .daydetail-popover em styles.css) —
// o desmonte do painel de detalhes é adiado até o fim da transição para não interrompê-la.
const COLLAPSE_MS = 280

const EMPTY = []

function CalendarView({ currentUser }) {
  const members = useMembers().data ?? EMPTY
  const clients = useClients().data ?? EMPTY
  const columns = useColumns().data
  const tags = useTags().data ?? EMPTY
  const { createTag: onCreateTag } = useTagActions()
  // Tarefas pessoais + tarefas de cliente de toda a equipe (sem duplicar a que está
  // nas duas). Lê direto do cache; a lista de clientes revalida a cada 15 s e ao
  // voltar o foco da aba, para mostrar o que a equipe agenda sem F5.
  const myTasks = useMyTasks(currentUser.id).data ?? EMPTY
  const linkedTasks = useClientLinkedTasks(true).data ?? EMPTY
  const tasks = useMemo(() => mergeCalendarTasks(myTasks, linkedTasks), [myTasks, linkedTasks])
  const { createTask: onCreate, updateTask: onUpdate, moveTask: onMove, deleteTask: onDelete } =
    useTaskActions({ userId: currentUser.id })
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(today)
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [collapsing, setCollapsing] = useState(false)
  const [detailTask, setDetailTask] = useState(null)
  // Rascunho de nova tarefa: abre o mesmo modal de especificações, já com a data
  const [draftTask, setDraftTask] = useState(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState('overdue')
  // Criação rápida ao clicar num dia: popover com só o título (a data já vem do dia)
  const [quick, setQuick] = useState(null) // { date, left, top }
  const [quickTitle, setQuickTitle] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const quickRef = useRef(null)
  const drawerRef = useRef(null)
  const leftRef = useRef(null)

  // Em telas estreitas (≤900px) os painéis ficam empilhados acima/abaixo da grade:
  // ao abrir um, a página rola até ele para a pessoa não achar que nada aconteceu.
  const scrollTarget = useRef(null)
  const scrollToPanel = (ref) => {
    if (window.innerWidth <= 900) scrollTarget.current = ref
  }
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  // Painel lateral esquerdo (mini-calendário + filtros): lembrado entre visitas
  const [leftOpen, setLeftOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('fb_cal_left')
      if (saved !== null) return saved === '1'
    } catch { /* armazenamento indisponível */ }
    return typeof window !== 'undefined' && window.innerWidth >= 1100
  })
  const toggleLeft = () => setLeftOpen((v) => {
    try { localStorage.setItem('fb_cal_left', v ? '0' : '1') } catch { /* ignora */ }
    return !v
  })
  const [filters, setFilters] = useState(EMPTY_CAL_FILTERS)
  // depois de o painel entrar na tela (o efeito roda com o DOM já atualizado)
  useEffect(() => {
    const ref = scrollTarget.current
    scrollTarget.current = null
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sideOpen, leftOpen])
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Arrastando uma tarefa: as faixas deixam de captar o mouse para o dia embaixo receber o drop
  const [dragging, setDragging] = useState(false)

  const viewMenuRef = useRef(null)
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

  // Fecha os menus e popovers ao clicar fora ou pressionar ESC
  useEffect(() => {
    const handleClick = (e) => {
      if (viewMenuOpen && viewMenuRef.current && !viewMenuRef.current.contains(e.target)) {
        setViewMenuOpen(false)
      }
      if (quick && quickRef.current && !quickRef.current.contains(e.target)) setQuick(null)
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setViewMenuOpen(false)
        if (quick) { setQuick(null); return }
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
  }, [viewMenuOpen, selectedTaskId, collapsing, quick])

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byFilters = filterCalendarTasks(tasks, filters)
    return q ? byFilters.filter((t) => t.title.toLowerCase().includes(q)) : byFilters
  }, [tasks, search, filters])
  const optionCounts = useMemo(() => countOptions(tasks), [tasks])
  const activeFilterCount = countCalFilters(filters)

  // Tarefas de vários dias aparecem em toda data do intervalo [due_date,
  // due_date_end] — não só no dia de início. Iterar por string 'YYYY-MM-DD'
  // (em vez de objetos Date) evita qualquer pegadinha de fuso horário aqui.
  const MAX_SPAN_DAYS = 366 // limite de sanidade — evita travar em caso de data absurda
  const datesBetween = (start, end) => {
    if (!end || end <= start) return [start]
    const dates = []
    let cur = start
    for (let i = 0; i < MAX_SPAN_DAYS && cur <= end; i++) {
      dates.push(cur)
      const [y, m, d] = cur.split('-').map(Number)
      cur = toKey(new Date(y, m - 1, d + 1))
    }
    return dates
  }

  const tasksByDay = useMemo(() => {
    const map = {}
    filteredTasks.forEach((t) => {
      if (!t.due_date) return
      for (const key of datesBetween(t.due_date, t.due_date_end)) {
        map[key] = map[key] || []
        map[key].push(t)
      }
    })
    return map
  }, [filteredTasks])

  const busyDays = useMemo(() => new Set(Object.keys(tasksByDay)), [tasksByDay])

  // Salta o calendário para um dia escolhido no mini-calendário
  const jumpToDate = (date) => {
    setCursor(new Date(date.getFullYear(), date.getMonth(), 1))
    setSelectedDate(date)
  }

  // Tarefas do dia selecionado no popover — memoizado, reage a mudanças de data ou da lista de tarefas
  const tasksForSelectedDate = useMemo(() => {
    if (!selectedDate) return []
    // Com horário definido vem primeiro, ordenado por hora; sem horário
    // fica depois, ordenado por título.
    return (tasksByDay[toKey(selectedDate)] || []).slice().sort((a, b) => {
      if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
      if (a.due_time) return -1
      if (b.due_time) return 1
      return a.title.localeCompare(b.title)
    })
  }, [selectedDate, tasksByDay])

  const unscheduled = useMemo(
    () => filteredTasks.filter((t) => !t.due_date).sort((a, b) => a.title.localeCompare(b.title)),
    [filteredTasks],
  )
  const overdue = useMemo(() => {
    const todayKey = toKey(today)
    // Uma tarefa de vários dias só está atrasada depois do último dia dela.
    return filteredTasks
      .filter((t) => t.due_date && (t.due_date_end || t.due_date) < todayKey && t.column_key !== 'done')
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

  // Semanas da grade com as faixas já posicionadas (vários dias = uma barra só)
  const weeks = useMemo(() => {
    const rows = []
    for (let i = 0; i < grid.length; i += 7) {
      const cells = grid.slice(i, i + 7)
      rows.push({ cells, ...layoutWeek(cells.map((c) => toKey(c.date)), filteredTasks) })
    }
    return rows
  }, [grid, filteredTasks])

  const changeMonth = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  const openDayDetail = (date) => {
    clearTimeout(collapseTimerRef.current)
    setSelectedDate(date)
    setSelectedTaskId(null)
    setCollapsing(false)
    setIsDayDetailOpen(true)
  }
  const closeDayDetail = () => {
    clearTimeout(collapseTimerRef.current)
    setIsDayDetailOpen(false)
    setSelectedTaskId(null)
    setCollapsing(false)
  }

  // Abre o modal completo de especificações já com a data pré-preenchida
  const openNewTask = (date, title = '') => {
    const target = date || selectedDate || today
    setSelectedDate(target)
    setDraftTask({
      title,
      description: '',
      priority: 'Média',
      due_date: toKey(target),
      column_key: columns?.[0]?.key || 'todo',
      assigned_to: currentUser?.id || null,
      client_id: null,
      tags: [],
      attachments: [],
    })
  }

  // Clique num dia: abre o popover de criação rápida ao lado da célula clicada
  const openQuick = (e, date) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = 288
    setSelectedDate(date)
    setQuickTitle('')
    setQuick({
      date,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.top + 34, window.innerHeight - 170)),
    })
  }
  const submitQuick = async (e) => {
    e.preventDefault()
    const title = quickTitle.trim()
    if (!title || quickSaving) return
    setQuickSaving(true)
    try {
      const draft = { ...emptyDraft({ assignedTo: currentUser?.id || '', columnKey: columns?.[0]?.key || 'todo' }), title, dueDate: toKey(quick.date) }
      const task = await onCreate(buildTaskFields(draft, { isGestor: currentUser?.role === 'gestor' }))
      if (task) setQuick(null)
    } finally {
      setQuickSaving(false)
    }
  }

  const toggleComplete = (task) => {
    onMove(task.id, task.column_key === 'done' ? 'todo' : 'done')
  }

  const openDetail = (e, task) => {
    e.stopPropagation()
    setDetailTask(task)
  }

  const dragTask = (e, taskId) => {
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', taskId)
    // adiado: mudar o alvo no mesmo instante do dragstart cancelaria o arraste no Chrome
    setTimeout(() => setDragging(true), 0)
  }

  // Muda o início da tarefa para `date`. Tarefa de vários dias preserva a duração —
  // desloca o intervalo inteiro, em vez de deixar due_date_end órfã (e antes de
  // due_date, o que o backend rejeitaria).
  const reschedule = (task, date) => {
    if (!task || !onUpdate) return
    const newStart = toKey(date)
    if (task.due_date_end && task.due_date) {
      const spanDays = Math.round(
        (new Date(`${task.due_date_end}T00:00:00`) - new Date(`${task.due_date}T00:00:00`)) / 86400000,
      )
      const newEnd = toKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + spanDays))
      onUpdate(task.id, { due_date: newStart, due_date_end: newEnd })
    } else {
      onUpdate(task.id, { due_date: newStart })
    }
  }

  const dropOnDay = (e, date) => {
    e.preventDefault()
    setDragging(false)
    const id = e.dataTransfer.getData('text/plain')
    if (id) reschedule(tasks.find((t) => t.id === id), date)
  }

  const dayDetailLabel = selectedDate
    ? capitalize(selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))
    : ''

  // Tarefa aberta no painel de detalhes embutido (split view) — busca na lista completa
  // para não sumir do painel caso o usuário altere o prazo dela para outro dia
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null

  return (
    <div className="calview">
      {leftOpen && (
        <aside className="calview-left" ref={leftRef} aria-label="Mini-calendário e filtros">
          <MiniCalendar
            month={cursor}
            selectedDate={selectedDate}
            today={today}
            busyDays={busyDays}
            onPick={jumpToDate}
          />
          <div className="calfilters">
            <div className="calfilters-head">
              <h4>Filtros</h4>
              {activeFilterCount > 0 && (
                <button type="button" className="calfilters-clear" onClick={() => setFilters(EMPTY_CAL_FILTERS)}>
                  Limpar
                </button>
              )}
            </div>
            <fieldset className="calfilters-group">
              <legend>Status</legend>
              {columns.map((c) => (
                <label key={c.key} className="calfilters-option">
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(c.key)}
                    onChange={() => setFilters((f) => toggleCalFilter(f, 'statuses', c.key))}
                  />
                  <span className="calfilters-dot" style={{ background: c.color }} />
                  <span className="calfilters-label">{c.label}</span>
                  <span className="calfilters-count">{optionCounts.statuses[c.key] || 0}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="calfilters-group">
              <legend>Responsável</legend>
              {members.map((m) => (
                <label key={m.id} className="calfilters-option">
                  <input
                    type="checkbox"
                    checked={filters.assignees.includes(m.id)}
                    onChange={() => setFilters((f) => toggleCalFilter(f, 'assignees', m.id))}
                  />
                  <span className="calfilters-dot" style={{ background: memberColor(m.id, members) }} />
                  <span className="calfilters-label">{m.name}</span>
                  <span className="calfilters-count">{optionCounts.assignees[m.id] || 0}</span>
                </label>
              ))}
            </fieldset>
            {tags.length > 0 && (
              <fieldset className="calfilters-group">
                <legend>Etiquetas</legend>
                {tags.map((t) => (
                  <label key={t.id} className="calfilters-option">
                    <input
                      type="checkbox"
                      checked={filters.tags.includes(t.name)}
                      onChange={() => setFilters((f) => toggleCalFilter(f, 'tags', t.name))}
                    />
                    <span className="calfilters-dot" style={{ background: t.color }} />
                    <span className="calfilters-label">{t.name}</span>
                    <span className="calfilters-count">{optionCounts.tags[t.name] || 0}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </aside>
      )}
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
            <button
              className={`calview-ghost-btn calview-filters-btn${leftOpen ? ' active' : ''}`}
              aria-expanded={leftOpen}
              onClick={() => { if (!leftOpen) scrollToPanel(leftRef); toggleLeft() }}
              title="Mini-calendário e filtros"
            >
              <IconFilter size={14} />
              Filtros
              {activeFilterCount > 0 && <span className="calview-side-count">{activeFilterCount}</span>}
            </button>
            <button
              className={`calview-ghost-btn calview-pending-btn${sideOpen ? ' active' : ''}`}
              aria-expanded={sideOpen}
              onClick={() => { if (!sideOpen) scrollToPanel(drawerRef); setSideOpen((v) => !v) }}
              title="Tarefas em atraso e sem data"
            >
              <IconList size={14} />
              Pendências
              {overdue.length > 0 && <span className="calview-side-count over">{overdue.length}</span>}
              {unscheduled.length > 0 && <span className="calview-side-count">{unscheduled.length}</span>}
            </button>
            <Avatar
              id={currentUser?.id}
              name={currentUser?.name}
              list={members}
              className="member-avatar calview-avatar"
            />
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
              <button className="calview-add-btn" onClick={() => openNewTask(selectedDate || today)}>
                <IconPlus size={14} />
                Add Tarefa
              </button>
              <button
                className="calview-add-caret"
                onClick={() => openDayDetail(selectedDate || today)}
                title="Ver tarefas do dia"
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

        <div className={`calview-grid${dragging ? ' is-dragging' : ''}`}>
          {weeks.map(({ cells, segments, hidden }, w) => (
            <div className="calview-week" key={w}>
              <div className="calview-week-cells">
                {cells.map(({ date, inMonth }) => {
                  const isToday = isSameDay(date, today)
                  const isSelected = selectedDate && isSameDay(date, selectedDate)
                  return (
                    <div
                      key={toKey(date)}
                      className={`calview-cell${inMonth ? '' : ' out-month'}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                      onClick={(e) => openQuick(e, date)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => dropOnDay(e, date)}
                    >
                      <div className="calview-cell-top">
                        <button
                          className="calview-cell-add"
                          title="Ver tarefas do dia"
                          onClick={(e) => { e.stopPropagation(); openDayDetail(date) }}
                        >
                          <IconStack size={12} />
                        </button>
                        <span className="calview-day-number">{date.getDate()}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="calview-week-events">
                {segments.map(({ task: t, col, span, lane, startsHere, endsHere }) => {
                  const color = memberColor(t.assigned_to, members)
                  const timed = Boolean(t.due_time) && span === 1
                  const done = t.column_key === 'done'
                  const assignee = members.find((m) => m.id === t.assigned_to)
                  return (
                    <button
                      key={t.id}
                      className={`calview-task-badge${timed ? ' timed' : ''}${done ? ' done' : ''}${startsHere ? '' : ' cont-left'}${endsHere ? '' : ' cont-right'}`}
                      style={{
                        gridColumn: `${col + 1} / span ${span}`,
                        gridRow: lane + 1,
                        '--owner': color,
                      }}
                      title={taskTooltip(t, assignee?.name, formatDay)}
                      onClick={(e) => openDetail(e, t)}
                      draggable
                      onDragStart={(e) => dragTask(e, t.id)}
                      onDragEnd={() => setDragging(false)}
                    >
                      {timed && <span className="calview-task-dot" />}
                      {t.due_time && startsHere && (
                        <span className="calview-task-time">{formatTime(t.due_time)}</span>
                      )}
                      <span className="calview-task-title">{t.title}</span>
                      {t.tags?.length > 0 && (
                        <span className="calview-task-tags">
                          {t.tags.slice(0, 3).map((name) => (
                            <span key={name} className="calview-task-tag-dot" style={{ background: tagColor(name, tags) }} title={name} />
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
                {hidden.map((count, col) => count > 0 && (
                  <button
                    key={`more-${col}`}
                    className="calview-more"
                    style={{ gridColumn: col + 1, gridRow: MAX_LANES + 1 }}
                    title="Ver todas as tarefas do dia"
                    onClick={(e) => { e.stopPropagation(); openDayDetail(cells[col].date) }}
                  >
                    +{count} mais
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {sideOpen && (
        <aside className="calview-drawer" ref={drawerRef} aria-label="Tarefas em atraso e sem data">
          <div className="calview-drawer-header">
            <h4>Pendências</h4>
            <button className="icon-btn" onClick={() => setSideOpen(false)} title="Fechar">
              <IconClose size={14} />
            </button>
          </div>
          <div className="calview-drawer-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={drawerTab === 'overdue'}
              className={drawerTab === 'overdue' ? 'active' : ''}
              onClick={() => setDrawerTab('overdue')}
            >
              Em atraso <span className="calview-side-count over">{overdue.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={drawerTab === 'unscheduled'}
              className={drawerTab === 'unscheduled' ? 'active' : ''}
              onClick={() => setDrawerTab('unscheduled')}
            >
              Sem data <span className="calview-side-count">{unscheduled.length}</span>
            </button>
          </div>
          <div className="calview-drawer-list">
            {(drawerTab === 'overdue' ? overdue : unscheduled).length === 0 && (
              <p className="calview-side-empty">
                {drawerTab === 'overdue' ? 'Nenhuma tarefa atrasada.' : 'Nenhuma tarefa sem prazo.'}
              </p>
            )}
            {(drawerTab === 'overdue' ? overdue : unscheduled).map((t) => (
              <div
                key={t.id}
                className={`calview-side-task${drawerTab === 'overdue' ? ' overdue' : ''}`}
                draggable
                onDragStart={(e) => dragTask(e, t.id)}
                onDragEnd={() => setDragging(false)}
                onClick={() => setDetailTask(t)}
                title={taskTooltip(t, members.find((m) => m.id === t.assigned_to)?.name, formatDay)}
              >
                <span className="calview-task-dot" style={{ background: memberColor(t.assigned_to, members) }} />
                <span className="calview-side-task-main">
                  <span className="calview-side-task-title">{t.title}</span>
                  {t.due_date && (
                    <span className="calview-side-task-meta">Venceu em {formatDay(t.due_date_end || t.due_date).slice(0, 5)}</span>
                  )}
                </span>
                <button
                  className="calview-side-task-today"
                  title={drawerTab === 'overdue' ? 'Reagendar para hoje' : 'Agendar para hoje'}
                  onClick={(e) => { e.stopPropagation(); reschedule(t, today) }}
                >
                  Hoje
                </button>
              </div>
            ))}
          </div>
          <p className="calview-side-hint">Arraste uma tarefa para um dia do calendário para definir o prazo.</p>
        </aside>
      )}

      {quick && createPortal(
        <form
          className="calquick"
          ref={quickRef}
          style={{ left: quick.left, top: quick.top }}
          onSubmit={submitQuick}
        >
          <div className="calquick-date">
            {capitalize(quick.date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}
          </div>
          <input
            className="calquick-input"
            autoFocus
            placeholder="Título da tarefa"
            aria-label="Título da nova tarefa"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
          />
          <div className="calquick-actions">
            <button
              type="button"
              className="calquick-more"
              onClick={() => { const d = quick.date; const t = quickTitle.trim(); setQuick(null); openNewTask(d, t) }}
            >
              Mais opções
            </button>
            <button type="submit" className="calquick-save" disabled={!quickTitle.trim() || quickSaving}>
              {quickSaving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>,
        document.body,
      )}

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
                          {t.due_time && (
                            <span className="daydetail-item-time">
                              {formatTime(t.due_time)}
                              {t.due_time_end && `–${formatTime(t.due_time_end)}`}
                            </span>
                          )}
                          <button
                            className={`daydetail-item-title${done ? ' done' : ''}`}
                            onClick={() => { clearTimeout(collapseTimerRef.current); setCollapsing(false); setSelectedTaskId(t.id) }}
                          >
                            {t.title}
                          </button>
                          <span className={`priority-tag ${PRIORITY_CLASS[t.priority] || 'p-media'}`}>
                            {t.priority}
                          </span>
                          {assignee ? (
                            <Avatar
                              id={assignee.id}
                              name={assignee.name}
                              list={members}
                              className="member-avatar sm"
                            />
                          ) : (
                            <div className="member-avatar sm empty" title="Sem responsável">—</div>
                          )}
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

              <button
                type="button"
                className="daydetail-quickadd"
                onClick={() => { closeDayDetail(); openNewTask(selectedDate) }}
              >
                <IconPlus size={13} />
                Nova tarefa neste dia
              </button>
            </div>

            {selectedTask && (
              <div className="daydetail-detail-col">
                <TaskDetailModal
                  key={selectedTask.id}
                  embedded
                  task={selectedTask}
                  members={members}
                  clients={clients}
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
          clients={clients}
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

      {/* Criação: mesmo modal de especificações, em modo rascunho */}
      {draftTask && (
        <TaskDetailModal
          task={draftTask}
          members={members}
          clients={clients}
          currentUser={currentUser}
          columns={columns}
          tags={tags}
          onCreateTag={onCreateTag}
          onClose={() => setDraftTask(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onMove={onMove}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

// Spinner só na primeira carga de tarefas e membros; depois a tela fica de pé.
export default function Calendar({ currentUser }) {
  if (anyLoading(useMyTasks(currentUser.id), useMembers())) return <LoadingBlock text="Carregando calendário..." />
  return <CalendarView currentUser={currentUser} />
}
