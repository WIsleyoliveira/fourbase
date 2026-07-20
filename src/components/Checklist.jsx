import { useState, useMemo } from 'react'
import { IconPlus, IconTrash, IconKanban, IconClose, IconFilter, IconSearch } from '../icons.jsx'

const PRIORITY_CLASS = { Alta: 'p-alta', Média: 'p-media', Baixa: 'p-baixa' }
const PRIORITY_RANK  = { Alta: 0, Média: 1, Baixa: 2 }

const formatDueAt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// Retorna a data LOCAL no formato YYYY-MM-DD a partir de um ISO string
// (getDate/getMonth usam fuso local, evitando off-by-one com UTC)
const isoToLocalDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

// Retorna hoje no formato YYYY-MM-DD (fuso local)
const localToday = () => isoToLocalDate(new Date().toISOString())

// Retorna amanhã no formato YYYY-MM-DD (fuso local)
const localTomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return isoToLocalDate(d.toISOString())
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

// ─── Labels dos filtros de data para exibição no badge ─────────────────────────
const DATE_FILTER_LABELS = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  overdue: 'Vencidas',
  custom: 'Data específica',
}

export default function Checklist({ todos, onAdd, onToggle, onDelete, onSendToKanban }) {
  // ── Estados do formulário de criação ────────────────────────────────────────
  const [text, setText] = useState('')
  const [priority, setPriority] = useState('Média')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  // ── Estados de filtro ────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]       = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')   // 'all' | 'pending' | 'completed'
  const [priorityFilter, setPriorityFilter] = useState('all') // 'all' | 'Alta' | 'Média' | 'Baixa'
  const [dateFilter, setDateFilter]       = useState('')       // '' | 'today' | 'tomorrow' | 'overdue' | 'custom'
  const [customDate, setCustomDate]       = useState('')       // YYYY-MM-DD quando dateFilter === 'custom'
  const [isFilterOpen, setIsFilterOpen]   = useState(false)

  // ── Métricas globais (sempre sobre a lista completa) ────────────────────────
  const done     = todos.filter((t) => t.done).length
  const progress = todos.length ? Math.round((done / todos.length) * 100) : 0

  // ── Filtros ativos ──────────────────────────────────────────────────────────
  const activeFilterCount = [
    searchTerm !== '',
    statusFilter !== 'all',
    priorityFilter !== 'all',
    dateFilter !== '',
  ].filter(Boolean).length
  const hasActiveFilters = activeFilterCount > 0

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setDateFilter('')
    setCustomDate('')
  }

  // ── Lista filtrada e ordenada (useMemo evita recálculo desnecessário) ────────
  const filteredTodos = useMemo(() => {
    const today    = localToday()
    const tomorrow = localTomorrow()
    let list = sortTodos(todos)

    // 1. Busca por texto (case-insensitive)
    if (searchTerm.trim()) {
      const lc = searchTerm.toLowerCase()
      list = list.filter((t) => t.text.toLowerCase().includes(lc))
    }

    // 2. Status
    if (statusFilter === 'pending')   list = list.filter((t) => !t.done)
    if (statusFilter === 'completed') list = list.filter((t) => t.done)

    // 3. Prioridade
    if (priorityFilter !== 'all') list = list.filter((t) => t.priority === priorityFilter)

    // 4. Data
    if (dateFilter === 'today') {
      list = list.filter((t) => t.due_at && isoToLocalDate(t.due_at) === today)
    } else if (dateFilter === 'tomorrow') {
      list = list.filter((t) => t.due_at && isoToLocalDate(t.due_at) === tomorrow)
    } else if (dateFilter === 'overdue') {
      // Vencidas: prazo anterior a hoje E ainda não concluídas
      list = list.filter((t) => t.due_at && isoToLocalDate(t.due_at) < today && !t.done)
    } else if (dateFilter === 'custom' && customDate) {
      list = list.filter((t) => t.due_at && isoToLocalDate(t.due_at) === customDate)
    }

    return list
  }, [todos, searchTerm, statusFilter, priorityFilter, dateFilter, customDate])

  // ── Submit do formulário de criação ────────────────────────────────────────
  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const due_at = date ? new Date(`${date}T${time || '00:00'}`).toISOString() : null
    onAdd(text.trim(), priority, due_at)
    setText('')
    setDate('')
    setTime('')
  }

  return (
    <div className="panel checklist">
      {/* ── Cabeçalho e barra de progresso ────────────────────────────────── */}
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

      {/* ── Formulário de criação ──────────────────────────────────────────── */}
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

      {/* ══ Barra de ativação dos filtros ════════════════════════════════════ */}
      <div className="filter-bar">
        <button
          className={`filter-toggle${isFilterOpen ? ' active' : ''}`}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          aria-expanded={isFilterOpen}
        >
          <IconFilter size={14} />
          Filtrar tarefas
          {activeFilterCount > 0 && (
            <span className="filter-badge">{activeFilterCount}</span>
          )}
        </button>

        {hasActiveFilters && (
          <button className="filter-clear-btn" onClick={clearFilters}>
            <IconClose size={12} />
            Limpar filtros
          </button>
        )}

        {hasActiveFilters && (
          <span className="filter-results-count">
            {filteredTodos.length} de {todos.length} {todos.length === 1 ? 'item' : 'itens'}
          </span>
        )}
      </div>

      {/* ══ Painel expansível de filtros ═════════════════════════════════════ */}
      <div className={`filter-panel${isFilterOpen ? ' filter-panel-open' : ''}`} aria-hidden={!isFilterOpen}>

        {/* Busca por texto */}
        <div className="filter-search">
          <IconSearch size={14} />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Status */}
        <div className="filter-field-group">
          <label className="filter-field-label">Status</label>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="completed">Concluídos</option>
          </select>
        </div>

        {/* Prioridade */}
        <div className="filter-field-group">
          <label className="filter-field-label">Prioridade</label>
          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="Alta">🔴 Alta</option>
            <option value="Média">🟡 Média</option>
            <option value="Baixa">🟢 Baixa</option>
          </select>
        </div>

        {/* Data */}
        <div className="filter-field-group">
          <label className="filter-field-label">Data</label>
          <select
            className="filter-select"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setCustomDate('') }}
          >
            <option value="">Qualquer data</option>
            <option value="today">Hoje</option>
            <option value="tomorrow">Amanhã</option>
            <option value="overdue">Vencidas</option>
            <option value="custom">Selecionar data…</option>
          </select>
        </div>

        {/* Input de data personalizada — aparece apenas quando "custom" está selecionado */}
        {dateFilter === 'custom' && (
          <input
            type="date"
            className="filter-date-input"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            autoFocus
          />
        )}
      </div>

      {/* ══ Lista de itens ════════════════════════════════════════════════════ */}
      <div className="todo-list">
        {/* Lista vazia (sem nenhum item cadastrado) */}
        {todos.length === 0 && (
          <div className="empty-hint">Nenhum item ainda — adicione o primeiro.</div>
        )}

        {/* Lista vazia por causa dos filtros */}
        {todos.length > 0 && filteredTodos.length === 0 && hasActiveFilters && (
          <div className="filter-empty">
            <span className="filter-empty-icon">🔍</span>
            <p>Nenhum item corresponde aos filtros aplicados.</p>
            <button className="filter-clear-btn" onClick={clearFilters}>
              <IconClose size={12} />
              Limpar filtros
            </button>
          </div>
        )}

        {filteredTodos.map((item) => (
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
