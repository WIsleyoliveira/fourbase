import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAuth } from '../api.js'
import { useToast } from '../toast.jsx'
import { NOTICE_VERSION } from '../assistant/notice.js'

// Tela Assistente: chaves de conexão (status) e histórico do que o ChatGPT criou.
// `testing` liga o polling do passo de teste: a tela muda sozinha quando o ChatGPT usar a chave.
const sessionUserId = () => getAuth()?.user?.id ?? null
export const ASSISTANT_KEYS = {
  tokens: (userId) => ['assistant', 'tokens', userId],
  batches: (userId) => ['assistant', 'batches', userId],
}

export function useAssistantTokens({ testing = false } = {}) {
  return useQuery({
    queryKey: ASSISTANT_KEYS.tokens(sessionUserId()),
    queryFn: api.listAssistantTokens,
    staleTime: 0,
    // teste: a cada 4 s; uso diário: a cada 30 s (pausa com a aba escondida)
    refetchInterval: testing ? 4000 : 30000,
    refetchIntervalInBackground: false, // pausa com a aba escondida
  })
}

export function useAssistantBatches() {
  return useQuery({
    queryKey: ASSISTANT_KEYS.batches(sessionUserId()),
    queryFn: () => api.listAssistantBatches(),
    staleTime: 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })
}

export function useAssistantActions() {
  const queryClient = useQueryClient()
  const { showToast, handleError } = useToast()
  const userId = sessionUserId()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.tokens(userId) })
    queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.batches(userId) })
  }

  // Um gesto: autoriza a versão atual do aviso e cria a chave (replaces = desliga a anterior).
  const createKey = useMutation({
    mutationFn: ({ name, replaces } = {}) => api.createAssistantToken({ notice_version: NOTICE_VERSION, name: name || 'ChatGPT', ...(replaces ? { replaces } : {}) }),
    onSuccess: refresh,
  })

  const disconnect = useMutation({
    mutationFn: (id) => api.revokeAssistantToken(id),
    onSuccess: () => { showToast('ChatGPT desconectado.'); refresh() },
    onError: handleError,
  })

  const undo = useMutation({
    mutationFn: ({ batchId, onlyIds }) => api.undoAssistantBatch(batchId, onlyIds),
    onSuccess: () => {
      refresh()
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return { createKey, disconnect, undo, refresh }
}
