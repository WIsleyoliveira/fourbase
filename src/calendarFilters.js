// Filtros do painel lateral do Calendário (caixas de marcar): responsável,
// etiqueta e status. Funções puras, testadas em tests/calendarFilters.test.js.
// Regra igual à do Kanban: dentro de um grupo vale OU, entre grupos vale E;
// nada marcado em um grupo = sem filtro nesse grupo.

export const EMPTY_CAL_FILTERS = Object.freeze({ assignees: [], tags: [], statuses: [] })

export const toggleCalFilter = (filters, group, value) => ({
  ...filters,
  [group]: filters[group].includes(value)
    ? filters[group].filter((v) => v !== value)
    : [...filters[group], value],
})

export const countCalFilters = (filters) =>
  filters.assignees.length + filters.tags.length + filters.statuses.length

export function filterCalendarTasks(tasks, filters) {
  const { assignees, tags, statuses } = filters
  if (!assignees.length && !tags.length && !statuses.length) return tasks
  return tasks.filter((t) => {
    if (assignees.length && !assignees.includes(t.assigned_to)) return false
    if (tags.length && !(t.tags || []).some((name) => tags.includes(name))) return false
    if (statuses.length && !statuses.includes(t.column_key)) return false
    return true
  })
}

// Quantas tarefas existem por opção (ao lado de cada caixa de marcar).
export function countOptions(tasks) {
  const out = { assignees: {}, tags: {}, statuses: {} }
  const bump = (bucket, key) => { if (key) bucket[key] = (bucket[key] || 0) + 1 }
  for (const t of tasks) {
    bump(out.assignees, t.assigned_to)
    bump(out.statuses, t.column_key)
    for (const name of new Set(t.tags || [])) bump(out.tags, name)
  }
  return out
}

// Células do mini-calendário de um mês: semanas completas (domingo a sábado),
// com os dias vizinhos marcados como fora do mês. Chaves 'AAAA-MM-DD'.
export function monthGrid(year, month) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const total = Math.ceil((offset + days) / 7) * 7
  const cells = []
  for (let i = 0; i < total; i++) {
    const d = new Date(year, month, i - offset + 1)
    cells.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    })
  }
  return cells
}
