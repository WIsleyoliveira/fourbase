import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import {
  TASK_KEYS, patchTask, removeTask, patchAllTaskLists, snapshotTaskLists,
  restoreTaskLists, addTaskToLists,
} from '../taskCache.js'

// ── Consultas ───────────────────────────────────────────────────────────────

// Tarefas atribuídas ao usuário logado (Kanban, Painel). A chave leva o id do
// usuário para uma sessão nunca enxergar o cache de outra.
export const useMyTasks = (userId, enabled = true) =>
  useQuery({
    queryKey: TASK_KEYS.mine(userId),
    queryFn: api.getTasks,
    enabled: enabled && Boolean(userId),
  })

// Quadro de um cliente: tarefas de TODOS os responsáveis. O polling de 6 s
// (parado com a aba em segundo plano) mostra o que a equipe mexeu sem F5.
export const useClientTasks = (clientId) =>
  useQuery({
    queryKey: TASK_KEYS.byClient(clientId),
    queryFn: () => api.getTasksByClient(clientId),
    enabled: Boolean(clientId),
    refetchInterval: 6000,
  })

// Tarefas de qualquer cliente, para o Calendário juntar às pessoais.
export const useClientLinkedTasks = (enabled) =>
  useQuery({
    queryKey: TASK_KEYS.linked,
    queryFn: api.getClientLinkedTasks,
    enabled,
    refetchInterval: 15000,
  })

// Progresso por cliente na listagem — conta as tarefas da equipe toda.
export const useClientTaskStats = (enabled) =>
  useQuery({
    queryKey: TASK_KEYS.stats,
    queryFn: api.getClientTaskStats,
    enabled,
    refetchInterval: 15000,
  })

// ── Ações ───────────────────────────────────────────────────────────────────

// Criar/mover/atualizar/excluir com as mesmas assinaturas que o App.jsx já
// expunha às telas. Mover, atualizar e excluir são otimistas: a tela muda na
// hora e, se a API falhar, volta ao estado anterior e avisa via `onError`.
export function useTaskActions({ userId, onError }) {
  const queryClient = useQueryClient()

  const refreshStats = () => queryClient.invalidateQueries({ queryKey: TASK_KEYS.stats })

  const optimistic = async (change, request) => {
    await queryClient.cancelQueries({ queryKey: TASK_KEYS.all })
    const snapshot = snapshotTaskLists(queryClient)
    patchAllTaskLists(queryClient, change)
    try {
      await request()
      refreshStats()
    } catch (err) {
      restoreTaskLists(queryClient, snapshot)
      onError(err)
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all })
    }
  }

  // Criação: devolve a tarefa criada, ou undefined se falhou (o erro já foi
  // reportado — quem chama não precisa tratar).
  const created = async (request, options) => {
    try {
      const task = await request()
      addTaskToLists(queryClient, task, { userId, ...options })
      refreshStats()
      return task
    } catch (err) {
      onError(err)
      return undefined
    }
  }

  return {
    // Formulário rápido do Kanban pessoal: a tarefa aparece na hora na lista.
    addTask: (...args) => created(() => api.addTask(...args), { forceMine: true }),
    // Formulário rápido do quadro de um cliente: só entra em "minhas" se for minha.
    addClientTask: (...args) => created(() => api.addTask(...args)),
    // Modal completo de tarefa (Calendário/Kanban) com o objeto inteiro.
    createTask: (fields) => created(() => api.createTask(fields), { forceMine: true }),
    moveTask: (id, column_key) =>
      optimistic((l) => patchTask(l, id, { column_key }), () => api.moveTask(id, column_key)),
    updateTask: (id, updates) =>
      optimistic((l) => patchTask(l, id, updates), () => api.updateTask(id, updates)),
    deleteTask: (id) =>
      optimistic((l) => removeTask(l, id), () => api.deleteTask(id)),
  }
}
