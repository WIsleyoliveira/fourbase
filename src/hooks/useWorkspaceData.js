import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAuth } from '../api.js'
import { tagColor } from '../colors.js'
import { useToast } from '../toast.jsx'
import { TASK_KEYS } from '../taskCache.js'
import {
  COLUMN_KEYS, buildColumn, readCachedColumns, writeCachedColumns,
} from '../columnCache.js'

// Clientes, etiquetas e colunas do workspace. Mesmo padrão de tasks e notas:
// qualquer tela lê direto do cache, sem receber lista nem callbacks por props.

const sessionUserId = () => getAuth()?.user?.id ?? null
const asList = (data) => (Array.isArray(data) ? data : [])

export const CLIENT_KEYS = { all: ['clients'], mine: (userId) => ['clients', userId] }
export const TAG_KEYS = { all: ['tags'], mine: (userId) => ['tags', userId] }

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
  const { handleError } = useToast()
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
  const { handleError } = useToast()
  const userId = sessionUserId()
  const key = COLUMN_KEYS.mine(userId)

  return {
    // A coluna aparece na hora; se a API recusar, volta ao que era e avisa
    // (antes ficava uma coluna "fantasma" que nunca foi salva).
    addColumn: async (label) => {
      const before = queryClient.getQueryData(key) ?? readCachedColumns(localStorage, userId)
      const column = buildColumn(label, before)
      const next = [...before, column]
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
