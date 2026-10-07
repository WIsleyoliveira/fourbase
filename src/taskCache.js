// Cache de tarefas no TanStack Query.
//
// A mesma tarefa pode aparecer em várias listas ao mesmo tempo — minhas
// tarefas (Kanban/Painel), tarefas de um cliente, tarefas de cliente do
// Calendário. Em vez de cada mutação atualizar cada lista na mão, os helpers
// abaixo aplicam a mudança em TODAS as listas do cache de uma vez.
//
// Testado em tests/taskCache.test.js (sem React: só @tanstack/query-core).

export const TASK_KEYS = {
  all: ['tasks'],
  mine: (userId) => ['tasks', 'mine', userId],
  byClient: (clientId) => ['tasks', 'by-client', clientId],
  linked: ['tasks', 'client-linked'],
  // Agregado por cliente (objeto, não lista) — não entra nos patches de lista.
  stats: ['tasks', 'client-stats'],
}

// Listas de tarefas = tudo sob ['tasks'] exceto o agregado de progresso.
const isTaskList = (query) => query.queryKey[1] !== 'client-stats'
const TASK_LISTS = { queryKey: TASK_KEYS.all, predicate: isTaskList }

export const patchTask = (list, id, updates) =>
  list.map((t) => (t.id === id ? { ...t, ...updates } : t))

export const removeTask = (list, id) => list.filter((t) => t.id !== id)

// Aplica `fn(lista)` a toda lista de tarefas que já esteja no cache.
export function patchAllTaskLists(queryClient, fn) {
  queryClient.setQueriesData(TASK_LISTS, (old) => (Array.isArray(old) ? fn(old) : old))
}

// Foto das listas antes de uma mudança otimista, para desfazer se a API falhar.
export const snapshotTaskLists = (queryClient) => queryClient.getQueriesData(TASK_LISTS)

export function restoreTaskLists(queryClient, snapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
}

// Tarefa recém-criada entra nas listas a que pertence — só nas que já foram
// carregadas (as outras buscam do servidor ao abrir, já com a tarefa).
//   - lista do cliente da tarefa, se ela tem client_id e essa lista está no cache
//   - lista de tarefas de cliente do Calendário, se tem client_id
//   - minhas tarefas, se eu sou o responsável ou se `forceMine` (criação feita a
//     partir do meu Kanban/Calendário, que sempre mostrou a tarefa na hora)
export function addTaskToLists(queryClient, task, { userId, forceMine = false } = {}) {
  const append = (key) =>
    queryClient.setQueryData(key, (old) => (Array.isArray(old) && !old.some((t) => t.id === task.id) ? [...old, task] : old))

  if (task.client_id) {
    append(TASK_KEYS.byClient(task.client_id))
    append(TASK_KEYS.linked)
  }
  if (forceMine || task.assigned_to === userId) append(TASK_KEYS.mine(userId))
}

// Tarefas pessoais + de cliente (Calendário), sem duplicar a que está nas duas.
export function mergeCalendarTasks(mine, linked) {
  const merged = new Map(mine.map((t) => [t.id, t]))
  for (const t of linked) merged.set(t.id, { ...merged.get(t.id), ...t })
  return Array.from(merged.values())
}
