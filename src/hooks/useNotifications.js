import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAuth } from '../api.js'
import { useToast } from '../toast.jsx'
import { markAllInData, markReadInData } from '../notificationCache.js'
import { localToday } from '../notificationText.js'

// Id de quem está logado, lido da sessão (mesmo padrão de useNotes).
const sessionUserId = () => getAuth()?.user?.id ?? null

const NOTIFICATION_KEYS = {
  mine: (userId) => ['notifications', userId],
}

// Avisos do sino do usuário logado: { items, unread }. Revalida a cada 30 s
// (o TanStack pausa o intervalo com a aba oculta). Erro ao carregar é silencioso:
// fica o último dado. Manda a data local do navegador para os avisos de prazo.
export const useNotifications = () => {
  const userId = sessionUserId()
  return useQuery({
    queryKey: NOTIFICATION_KEYS.mine(userId),
    queryFn: () => api.getNotifications(localToday()),
    enabled: Boolean(userId),
    refetchInterval: 30000,
  })
}

// Marcar lido / marcar todos como lidos. Otimistas: muda o cache na hora; se a
// API falhar, volta ao que era, avisa por toast e revalida.
export function useNotificationActions() {
  const queryClient = useQueryClient()
  const { handleError } = useToast()
  const key = NOTIFICATION_KEYS.mine(sessionUserId())

  const optimistic = async (change, request) => {
    await queryClient.cancelQueries({ queryKey: key })
    const snapshot = queryClient.getQueryData(key)
    // Sem dados ainda (lista não carregou): nada a editar na tela.
    if (snapshot) queryClient.setQueryData(key, change(snapshot, new Date().toISOString()))
    try {
      await request()
      return true
    } catch (err) {
      if (snapshot) queryClient.setQueryData(key, snapshot)
      handleError(err)
      queryClient.invalidateQueries({ queryKey: key })
      return false
    }
  }

  return {
    markRead: (id) =>
      optimistic((data, nowIso) => markReadInData(data, id, nowIso), () => api.markNotificationRead(id)),
    markAllRead: () =>
      optimistic((data, nowIso) => markAllInData(data, nowIso), () => api.markAllNotificationsRead()),
  }
}
