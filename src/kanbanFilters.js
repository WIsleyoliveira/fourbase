// Filtros, busca, ordenação e resumo do Kanban. Funções puras (sem React e sem
// rede): tudo roda no navegador sobre as tarefas já carregadas. Testado em
// tests/kanbanFilters.test.js.
//
// Regra dos filtros: dentro de um mesmo grupo vale OU (ex.: prioridade Alta OU
// Urgente); entre grupos vale E (ex.: ... E responsável Ana). A busca exige que
// TODAS as palavras apareçam (título, descrição ou etiquetas).

export const PRIORITIES = ['Urgente', 'Alta', 'Média', 'Baixa']
const PRIORITY_RANK = { Urgente: 0, Alta: 1, Média: 2, Baixa: 3 }

export const NO_CLIENT = '__none__'

export const DUE_BUCKETS = [
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'today', label: 'Vencem hoje' },
  { value: 'week', label: 'Próximos 7 dias' },
  { value: 'later', label: 'Mais adiante' },
  { value: 'none', label: 'Sem prazo' },
]

export const SORT_OPTIONS = [
  { value: 'priority', label: 'Prioridade' },
  { value: 'due', label: 'Prazo' },
  { value: 'recent', label: 'Mais recentes' },
  { value: 'title', label: 'A–Z' },
]

export const GROUPS = ['assignees', 'mentioned', 'tags', 'priorities', 'due', 'clients']

export const GROUP_LABELS = {
  assignees: 'Responsável',
  mentioned: 'Mencionado',
  tags: 'Etiqueta',
  priorities: 'Prioridade',
  due: 'Prazo',
  clients: 'Cliente',
}

export const EMPTY_FILTERS = Object.freeze({
  search: '',
  assignees: [],
  mentioned: [],
  tags: [],
  priorities: [],
  due: [],
  clients: [],
})

// ── datas (strings AAAA-MM-DD; contas em UTC para não depender do fuso) ───────
const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

// 'none' sem prazo · 'overdue' último dia já passou · 'today' hoje está entre o
// início e o fim · 'week' começa em 1–7 dias · 'later' depois disso.
// 'past' = concluída com prazo vencido: não é "atrasada" (não aparece em nenhum filtro).
export function dueBucket(task, today) {
  if (!task.due_date) return 'none'
  const now = dayNumber(today)
  const start = dayNumber(task.due_date)
  const end = dayNumber(task.due_date_end || task.due_date)
  if (end < now) return task.column_key === 'done' ? 'past' : 'overdue'
  if (start <= now) return 'today'
  if (start - now <= 7) return 'week'
  return 'later'
}

// ── busca ────────────────────────────────────────────────────────────────────
const normalize = (text) =>
  String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const searchWords = (search) => normalize(search).split(/\s+/).filter(Boolean)

const haystack = (task) => normalize([task.title, task.description, ...(task.tags || [])].join(' '))

// ── filtragem ────────────────────────────────────────────────────────────────
const clientValue = (task) => task.client_id || NO_CLIENT

function matchesGroup(selected, values) {
  return selected.length === 0 || values.some((v) => selected.includes(v))
}

export function matchesFilters(task, filters, today) {
  const words = searchWords(filters.search)
  if (words.length > 0) {
    const text = haystack(task)
    if (!words.every((w) => text.includes(w))) return false
  }
  return (
    matchesGroup(filters.assignees, [task.assigned_to]) &&
    matchesGroup(filters.mentioned, task.mentioned_users || []) &&
    matchesGroup(filters.tags, task.tags || []) &&
    matchesGroup(filters.priorities, [task.priority || 'Média']) &&
    matchesGroup(filters.due, [dueBucket(task, today)]) &&
    matchesGroup(filters.clients, [clientValue(task)])
  )
}

export const filterTasks = (tasks, filters, today) =>
  tasks.filter((t) => matchesFilters(t, filters, today))

export const setSearch = (filters, search) => ({ ...filters, search })

// Liga/desliga um valor de um grupo, sem alterar o objeto recebido.
export function toggleFilterValue(filters, group, value) {
  const current = filters[group]
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return { ...filters, [group]: next }
}

export const hasActiveFilters = (filters) => countActiveFilters(filters) > 0

// Quantos filtros estão ligados (busca conta como 1, cada valor marcado conta 1).
export function countActiveFilters(filters) {
  const search = searchWords(filters.search).length > 0 ? 1 : 0
  return search + GROUPS.reduce((sum, g) => sum + filters[g].length, 0)
}

// ── ordenação ────────────────────────────────────────────────────────────────
const priorityRank = (t) => PRIORITY_RANK[t.priority] ?? 2
const byTitle = (a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' })

// Prioridade (padrão): urgente primeiro; empate pelo prazo mais próximo; sem prazo por último.
const byPriority = (a, b) => {
  const rank = priorityRank(a) - priorityRank(b)
  if (rank !== 0) return rank
  if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

const SORTERS = {
  priority: byPriority,
  due: (a, b) => {
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
    if (a.due_date && !b.due_date) return -1
    if (!a.due_date && b.due_date) return 1
    return priorityRank(a) - priorityRank(b) || byTitle(a, b)
  },
  recent: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
  title: byTitle,
}

export const sortTasks = (list, sortKey) => list.slice().sort(SORTERS[sortKey] || byPriority)

// ── facetas: as opções de cada filtro saem das tarefas que existem ───────────
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1)
const byCountThenLabel = (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })

// `visible` esconde filtros sem escolha real (ex.: Responsável com uma pessoa só no
// Kanban pessoal), mas nunca esconde um grupo que já tem valor marcado.
export function buildFacets(tasks, { members = [], clients = [], tags = [] }, filters, today) {
  const nameOf = (list, id, fallback) => list.find((x) => x.id === id)?.name || fallback

  const count = (pick) => {
    const map = new Map()
    for (const t of tasks) for (const v of pick(t)) bump(map, v)
    return map
  }
  const asOptions = (map, label) =>
    [...map].map(([value, n]) => ({ value, label: label(value), count: n }))

  const assignees = asOptions(count((t) => (t.assigned_to ? [t.assigned_to] : [])),
    (id) => nameOf(members, id, 'Sem nome')).sort(byCountThenLabel)
  const mentioned = asOptions(count((t) => t.mentioned_users || []),
    (id) => nameOf(members, id, 'Sem nome')).sort(byCountThenLabel)
  const tagOptions = asOptions(count((t) => t.tags || []), (name) => name)
    .map((o) => ({ ...o, color: tags.find((x) => x.name === o.value)?.color }))
    .sort(byCountThenLabel)
  const clientCounts = count((t) => [clientValue(t)])
  const clientOptions = asOptions(clientCounts,
    (id) => (id === NO_CLIENT ? 'Sem cliente' : nameOf(clients, id, 'Cliente sem nome')))
    .sort((a, b) => (a.value === NO_CLIENT) - (b.value === NO_CLIENT) || byCountThenLabel(a, b))

  const priorityCounts = count((t) => [t.priority || 'Média'])
  const dueCounts = count((t) => [dueBucket(t, today)])

  const facet = (options, selected, min) => ({
    options,
    visible: options.length >= min || selected.length > 0,
  })
  return {
    assignees: facet(assignees, filters.assignees, 2),
    mentioned: facet(mentioned, filters.mentioned, 1),
    tags: facet(tagOptions, filters.tags, 1),
    priorities: {
      visible: true,
      options: PRIORITIES.map((p) => ({ value: p, label: p, count: priorityCounts.get(p) || 0 })),
    },
    due: {
      visible: true,
      options: DUE_BUCKETS.map((b) => ({ ...b, count: dueCounts.get(b.value) || 0 })),
    },
    clients: facet(clientOptions, filters.clients, 2),
  }
}

// ── chips dos filtros ativos e resumo ────────────────────────────────────────
export function activeChips(filters, facets) {
  const chips = []
  if (searchWords(filters.search).length > 0) {
    chips.push({ group: 'search', value: filters.search.trim(), label: `Busca: “${filters.search.trim()}”` })
  }
  for (const group of GROUPS) {
    for (const value of filters[group]) {
      const option = facets[group]?.options.find((o) => o.value === value)
      chips.push({ group, value, label: `${GROUP_LABELS[group]}: ${option?.label ?? value}`, color: option?.color })
    }
  }
  return chips
}

export function summarize(tasks, shown, today) {
  let overdue = 0
  let dueToday = 0
  for (const t of tasks) {
    const bucket = dueBucket(t, today)
    if (bucket === 'overdue') overdue += 1
    else if (bucket === 'today') dueToday += 1
  }
  return { total: tasks.length, shown: shown.length, overdue, dueToday }
}
