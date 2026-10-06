import { useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronDown, IconClose, IconFilter, IconSearch } from '../icons.jsx'
import Avatar from './Avatar.jsx'
import {
  GROUP_LABELS, SORT_OPTIONS, activeChips, buildFacets, countActiveFilters, EMPTY_FILTERS,
  hasActiveFilters, setSearch, summarize, toggleFilterValue,
} from '../kanbanFilters.js'

const EMPTY = []

// Menu de seleção múltipla de um filtro. Itens são <input type="checkbox"> de
// verdade (teclado e leitor de tela de graça); Esc e clique fora fecham.
function FilterMenu({ label, options, selected, onToggle, onClear, members }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="kb-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`kb-menu-btn${selected.length > 0 ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        {selected.length > 0 && <span className="kb-badge">{selected.length}</span>}
        <IconChevronDown size={13} />
      </button>

      {open && (
        <div className="kb-menu-pop" role="group" aria-label={label}>
          <ul className="kb-opt-list">
            {options.map((o) => (
              <li key={o.value}>
                <label className={`kb-opt${o.count === 0 ? ' zero' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => onToggle(o.value)}
                  />
                  {members && <Avatar id={o.value} name={o.label} list={members} className="kb-avatar" />}
                  {o.color && <span className="kb-dot" style={{ background: o.color }} />}
                  <span className="kb-opt-label">{o.label}</span>
                  <span className="kb-opt-count">{o.count}</span>
                </label>
              </li>
            ))}
          </ul>
          {selected.length > 0 && (
            <button type="button" className="kb-menu-clear" onClick={onClear}>
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Busca, filtros, ordenação e resumo do Kanban. Estado de filtros e ordem são do
// Kanban (para ele filtrar as colunas); aqui só se desenha e se pede mudança.
export default function KanbanFilterBar({
  tasks, shownTasks, members = EMPTY, clients = EMPTY, tags = EMPTY, currentUser, today,
  filters, onFiltersChange, sort, onSortChange,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const facets = useMemo(
    () => buildFacets(tasks, { members, clients, tags }, filters, today),
    [tasks, members, clients, tags, filters, today],
  )
  const summary = useMemo(() => summarize(tasks, shownTasks, today), [tasks, shownTasks, today])
  const chips = useMemo(() => activeChips(filters, facets), [filters, facets])
  const active = hasActiveFilters(filters)
  const activeCount = countActiveFilters(filters)

  const toggle = (group, value) => onFiltersChange(toggleFilterValue(filters, group, value))
  const clearGroup = (group) => onFiltersChange({ ...filters, [group]: [] })
  const removeChip = (chip) =>
    onFiltersChange(chip.group === 'search' ? setSearch(filters, '') : toggleFilterValue(filters, chip.group, chip.value))

  // Atalhos: ligam/desligam o mesmo filtro dos menus (não são um estado à parte).
  const me = currentUser?.id
  const mine = facets.assignees.visible && me
    ? facets.assignees.options.find((o) => o.value === me)?.count ?? 0
    : 0
  const quick = [
    { key: 'overdue', label: 'Atrasadas', count: summary.overdue, pressed: filters.due.includes('overdue'),
      onClick: () => toggle('due', 'overdue'), tone: 'danger' },
    { key: 'today', label: 'Vencem hoje', count: summary.dueToday, pressed: filters.due.includes('today'),
      onClick: () => toggle('due', 'today'), tone: 'warn' },
    { key: 'mine', label: 'Minhas', count: mine, pressed: Boolean(me) && filters.assignees.includes(me),
      onClick: () => toggle('assignees', me), tone: 'info' },
  ].filter((q) => q.count > 0 || q.pressed)

  const countText = active
    ? <>Mostrando <strong>{summary.shown}</strong> de <strong>{summary.total}</strong> {summary.total === 1 ? 'tarefa' : 'tarefas'}</>
    : <><strong>{summary.total}</strong> {summary.total === 1 ? 'tarefa' : 'tarefas'}</>

  const menus = [
    ['assignees', members],
    ['mentioned', members],
    ['tags', null],
    ['priorities', null],
    ['due', null],
    ['clients', null],
  ].filter(([group]) => facets[group].visible)

  return (
    <section className="kb-filters" aria-label="Busca e filtros do quadro">
      <div className="kb-row">
        <div className="kb-search">
          <IconSearch size={15} />
          <input
            type="text"
            aria-label="Buscar tarefas"
            placeholder="Buscar por título, descrição ou etiqueta…"
            value={filters.search}
            onChange={(e) => onFiltersChange(setSearch(filters, e.target.value))}
          />
          {filters.search && (
            <button
              type="button"
              className="kb-search-clear"
              aria-label="Limpar busca"
              onClick={() => onFiltersChange(setSearch(filters, ''))}
            >
              <IconClose size={12} />
            </button>
          )}
        </div>

        <button
          type="button"
          className="kb-toggle"
          aria-expanded={mobileOpen}
          aria-controls="kb-facets"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <IconFilter size={14} />
          <span>Filtros</span>
          {activeCount > 0 && <span className="kb-badge">{activeCount}</span>}
        </button>

        <div className={`kb-facets${mobileOpen ? ' open' : ''}`} id="kb-facets">
          {menus.map(([group, withMembers]) => (
            <FilterMenu
              key={group}
              label={GROUP_LABELS[group]}
              options={facets[group].options}
              selected={filters[group]}
              members={withMembers}
              onToggle={(value) => toggle(group, value)}
              onClear={() => clearGroup(group)}
            />
          ))}
          <label className="kb-sort">
            <span>Ordenar</span>
            <select value={sort} onChange={(e) => onSortChange(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="kb-summary">
        <p className="kb-count" role="status" aria-live="polite">{countText}</p>

        {quick.length > 0 && (
          <div className="kb-quick" role="group" aria-label="Atalhos">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                className={`kb-quick-btn ${q.tone}${q.pressed ? ' pressed' : ''}`}
                aria-pressed={q.pressed}
                onClick={q.onClick}
              >
                {q.label}
                <span className="kb-quick-count">{q.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="kb-chips" aria-label="Filtros ativos">
          {chips.map((chip) => (
            <button
              key={`${chip.group}:${chip.value}`}
              type="button"
              className="kb-chip"
              aria-label={`Remover filtro ${chip.label}`}
              onClick={() => removeChip(chip)}
            >
              {chip.color && <span className="kb-dot" style={{ background: chip.color }} />}
              {chip.label}
              <IconClose size={11} />
            </button>
          ))}
          <button type="button" className="kb-clear-all" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
            Limpar filtros
          </button>
        </div>
      )}
    </section>
  )
}
