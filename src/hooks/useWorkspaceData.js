import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAuth } from '../api.js'
import { tagColor } from '../colors.js'
import { useToast } from '../toast.jsx'
import { TASK_KEYS, patchAllTaskLists, restoreTaskLists, snapshotTaskLists } from '../taskCache.js'
import {
  COLUMN_KEYS, applyColumnEdit, buildColumn, moveColumn, readCachedColumns, removeColumn, renumberColumns, writeCachedColumns,
} from '../columnCache.js'

// Clientes, etiquetas e colunas do workspace. Mesmo padrão de tasks e notas:
// qualquer tela lê direto do cache, sem receber lista nem callbacks por props.

const sessionUserId = () => getAuth()?.user?.id ?? null
const asList = (data) => (Array.isArray(data) ? data : [])

export const CLIENT_KEYS = { all: ['clients'], mine: (userId) => ['clients', userId] }
export const TAG_KEYS = { all: ['tags'], mine: (userId) => ['tags', userId] }
export const MEMBER_KEYS = { all: ['members'], mine: (userId) => ['members', userId] }

// ── Clientes ────────────────────────────────────────────────────────────────

// Resposta inesperada vira lista vazia (a tabela pode não existir em ambientes
// sem a migração).
export const useClients = () => {
  const userId = sessionUserId()
  return useQuery({
    queryKey: CLIENT_KEYS.mine(userId),
    queryFn: async () => asList(await api.getClients()),
    enabled: Boolean(userId),
  })
}

// Criar/editar/excluir. Criar e editar esperam o servidor e repassam o erro
// (os modais mostram a mensagem); excluir some da lista na hora, com rollback.
export function useClientActions() {
  const queryClient = useQueryClient()
  const { showToast, handleError } = useToast()
  const key = CLIENT_KEYS.mine(sessionUserId())
  const edit = (fn) => queryClient.setQueryData(key, (old) => (Array.isArray(old) ? fn(old) : old))

  return {
    createClient: async (client) => {
      try {
        const created = await api.createClient(client)
        edit((list) => [created, ...list])
        showToast('Cliente cadastrado.')
        return created
      } catch (err) { handleError(err); throw err }
    },

    updateClient: async (id, updates) => {
      try {
        const updated = await api.updateClient(id, updates)
        edit((list) => list.map((c) => (c.id === id ? updated : c)))
        showToast('Cliente atualizado.')
        return updated
      } catch (err) { handleError(err); throw err }
    },

    // mode: 'archive' mantém as pastas de documentação (desvinculadas) |
    //       'cascade' exclui as pastas do cliente
    deleteClient: async (id, mode = 'archive') => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData(key)
      edit((list) => list.filter((c) => c.id !== id))
      try {
        await api.deleteClient(id, mode)
        showToast(mode === 'cascade' ? 'Cliente e pastas excluídos.' : 'Cliente excluído; pastas arquivadas.')
        // No banco as tarefas do cliente ficam sem cliente (on delete set null) e as
        // pastas mudam de dono ou somem — as listas em cache já estão desatualizadas.
        queryClient.invalidateQueries({ queryKey: TASK_KEYS.all })
        queryClient.invalidateQueries({ queryKey: ['folders'] })
      } catch (err) {
        queryClient.setQueryData(key, snapshot)
        handleError(err)
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  }
}

// ── Membros ─────────────────────────────────────────────────────────────────

// Membros do workspace (id, nome, cor, avatar) — alimentam avatares, cores e os
// seletores de responsável em Kanban, Calendário, Painel e Relatórios.
export const useMembers = () => {
  const userId = sessionUserId()
  return useQuery({
    queryKey: MEMBER_KEYS.mine(userId),
    queryFn: async () => asList(await api.getMembers()),
    enabled: Boolean(userId),
  })
}

// Perfil salvo: reflete nome/cor/avatar do próprio usuário na lista de membros
// (que alimenta avatares e cores em Kanban, Calendário etc.) sem refazer a busca.
export function patchMemberInCache(queryClient, updated) {
  queryClient.setQueryData(MEMBER_KEYS.mine(updated.id), (old) =>
    Array.isArray(old)
      ? old.map((m) => (m.id === updated.id
        ? { ...m, name: updated.name, color: updated.color, avatar_url: updated.avatar_url }
        : m))
      : old)
}

// Gestor convida uma pessoa: devolve { invitation, activation_url } para o modal
// exibir o link. A pessoa só vira membro depois de ativar a conta, então a lista
// de membros não muda aqui. O erro é repassado para o modal mostrar a mensagem.
export function useMemberActions() {
  const { showToast } = useToast()
  return {
    inviteMember: async (invite) => {
      const result = await api.inviteMember(invite)
      showToast('Convite criado.')
      return result
    },
  }
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

export const useTags = () => {
  const userId = sessionUserId()
  return useQuery({
    queryKey: TAG_KEYS.mine(userId),
    queryFn: async () => asList(await api.getTags()),
    enabled: Boolean(userId),
  })
}

export function useTagActions() {
  const queryClient = useQueryClient()
  const { handleError, showToast } = useToast()
  const key = TAG_KEYS.mine(sessionUserId())

  return {
    // Se o nome já existir, a API devolve a etiqueta existente em vez de duplicar.
    createTag: async (name) => {
      const trimmed = name.trim()
      try {
        const tag = await api.createTag(trimmed, tagColor(trimmed, queryClient.getQueryData(key) ?? []))
        if (Array.isArray(queryClient.getQueryData(key))) {
          queryClient.setQueryData(key, (old) => (old.some((t) => t.id === tag.id) ? old : [...old, tag]))
        } else {
          // lista ainda não carregou: busca já com a etiqueta nova
          queryClient.invalidateQueries({ queryKey: key })
        }
        return tag
      } catch (err) { handleError(err); throw err }
    },

    // Exclui a etiqueta (só gestor). Some na hora da lista e de todas as tarefas em
    // cache (as tarefas guardam o NOME); se a API recusar, tudo volta ao que era.
    deleteTag: async (tag) => {
      await queryClient.cancelQueries({ queryKey: TASK_KEYS.all })
      const tagsBefore = queryClient.getQueryData(key)
      const tasksBefore = snapshotTaskLists(queryClient)
      queryClient.setQueryData(key, (old) => (Array.isArray(old) ? old.filter((t) => t.id !== tag.id) : old))
      patchAllTaskLists(queryClient, (list) => list.map((task) => (
        task.tags?.includes(tag.name) ? { ...task, tags: task.tags.filter((n) => n !== tag.name) } : task
      )))
      try {
        await api.deleteTag(tag.id)
        showToast(`Etiqueta “${tag.name}” excluída.`)
        return true
      } catch (err) {
        queryClient.setQueryData(key, tagsBefore)
        restoreTaskLists(queryClient, tasksBefore)
        handleError(err)
        queryClient.invalidateQueries({ queryKey: key })
        return false
      }
    },
  }
}

// ── Colunas do Kanban ───────────────────────────────────────────────────────

// Pinta na hora com a última lista conhecida (localStorage) ou o padrão, e
// revalida na montagem. Falha ou lista vazia da API mantém a lista local.
export const useColumns = () => {
  const userId = sessionUserId()
  return useQuery({
    queryKey: COLUMN_KEYS.mine(userId),
    queryFn: async () => {
      try {
        const cols = await api.getColumns()
        if (Array.isArray(cols) && cols.length > 0) {
          writeCachedColumns(localStorage, userId, cols)
          return cols
        }
      } catch { /* sem rede ou tabela ainda não criada — cai no local */ }
      return readCachedColumns(localStorage, userId)
    },
    initialData: () => readCachedColumns(localStorage, userId),
    initialDataUpdatedAt: 0, // dado inicial já nasce velho: busca ao montar
    enabled: Boolean(userId),
  })
}

export function useColumnActions() {
  const queryClient = useQueryClient()
  const { handleError, showToast } = useToast()
  const userId = sessionUserId()
  const key = COLUMN_KEYS.mine(userId)

  return {
    // Move a coluna uma casa (delta -1 esquerda, +1 direita); volta ao que era se a API recusar.
    moveColumn: async (columnKey, delta) => {
      const before = queryClient.getQueryData(key) ?? readCachedColumns(localStorage, userId)
      const next = moveColumn(before, columnKey, delta)
      if (next === before) return false
      queryClient.setQueryData(key, next)
      writeCachedColumns(localStorage, userId, next)
      try {
        await api.reorderColumns(next.filter((c) => c.key !== 'done').map((c) => c.key))
        return true
      } catch (err) {
        queryClient.setQueryData(key, before)
        writeCachedColumns(localStorage, userId, before)
        handleError(err)
        return false
      }
    },

    // Exclui a coluna e manda as tarefas dela para `moveTo`. A coluna some e os cartões
    // aparecem na outra na hora; se a API recusar, tudo volta. Devolve true/false.
    deleteColumn: async (columnKey, moveTo) => {
      await queryClient.cancelQueries({ queryKey: TASK_KEYS.all })
      const before = queryClient.getQueryData(key) ?? readCachedColumns(localStorage, userId)
      const tasksBefore = snapshotTaskLists(queryClient)
      const next = removeColumn(before, columnKey)
      queryClient.setQueryData(key, next)
      writeCachedColumns(localStorage, userId, next)
      patchAllTaskLists(queryClient, (list) => list.map((t) => (t.column_key === columnKey ? { ...t, column_key: moveTo } : t)))
      try {
        const result = await api.deleteColumn(columnKey, moveTo)
        const moved = result?.moved ?? 0
        const label = before.find((c) => c.key === columnKey)?.label ?? ''
        const dest = before.find((c) => c.key === moveTo)?.label ?? ''
        showToast(moved > 0
          ? `Coluna “${label}” excluída. ${moved} tarefa${moved === 1 ? '' : 's'} movida${moved === 1 ? '' : 's'} para “${dest}”.`
          : `Coluna “${label}” excluída.`)
        // tarefas de outras pessoas também mudaram de coluna: confere no servidor
        queryClient.invalidateQueries({ queryKey: TASK_KEYS.all })
        return true
      } catch (err) {
        queryClient.setQueryData(key, before)
        writeCachedColumns(localStorage, userId, before)
        restoreTaskLists(queryClient, tasksBefore)
        handleError(err)
        return false
      }
    },

    // Troca nome/cor de uma coluna: muda na hora e volta ao que era se a API recusar.
    // Devolve true/false para quem chamou saber se pode fechar o editor.
    updateColumn: async (columnKey, changes) => {
      const before = queryClient.getQueryData(key) ?? readCachedColumns(localStorage, userId)
      const next = applyColumnEdit(before, columnKey, changes)
      queryClient.setQueryData(key, next)
      writeCachedColumns(localStorage, userId, next)
      try {
        await api.updateColumn(columnKey, changes)
        showToast('Coluna atualizada.')
        return true
      } catch (err) {
        queryClient.setQueryData(key, before)
        writeCachedColumns(localStorage, userId, before)
        handleError(err)
        return false
      }
    },

    // A coluna aparece na hora; se a API recusar, volta ao que era e avisa
    // (antes ficava uma coluna "fantasma" que nunca foi salva).
    addColumn: async (label) => {
      const before = queryClient.getQueryData(key) ?? readCachedColumns(localStorage, userId)
      const column = buildColumn(label, before)
      // entra antes de "Concluído" (as posições são renumeradas)
      const next = renumberColumns([...before.filter((c) => c.key !== 'done'), column, ...before.filter((c) => c.key === 'done')])
      queryClient.setQueryData(key, next)
      writeCachedColumns(localStorage, userId, next)
      try {
        await api.createColumn(column.label, column.key, column.position, column.color)
      } catch (err) {
        queryClient.setQueryData(key, before)
        writeCachedColumns(localStorage, userId, before)
        handleError(err)
      }
    },
  }
}
