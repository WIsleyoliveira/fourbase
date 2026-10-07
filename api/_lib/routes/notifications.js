import { Router } from 'express'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'
import { isUuid } from '../validation.js'
import { resolveToday } from '../notificationRules.js'
import { listNotifications, markRead, markAllRead } from '../notifications.js'

const router = Router()
export default router

// ---------- Sino de notificações (sempre só do usuário logado) ----------
// `today` é a data local do navegador; resolveToday descarta valores inválidos
// ou fora de ±1 dia da data do servidor.
router.get('/api/notifications', auth, asyncRoute(async (req, res) => {
  const today = resolveToday(req.query.today)
  res.json(await listNotifications({ userId: req.user.id, workspaceId: workspaceOf(req), today }))
}))

router.post('/api/notifications/read-all', auth, asyncRoute(async (req, res) => {
  await markAllRead({ userId: req.user.id, workspaceId: workspaceOf(req) })
  res.status(204).end()
}))

router.patch('/api/notifications/:id/read', auth, asyncRoute(async (req, res) => {
  // id que não é UUID nunca existe: 404 sem chegar ao banco
  if (!isUuid(req.params.id)) {
    return res.status(404).json({ error: 'Registro não encontrado' })
  }
  const found = await markRead({ userId: req.user.id, workspaceId: workspaceOf(req), id: req.params.id })
  if (!found) return res.status(404).json({ error: 'Registro não encontrado' })
  res.status(204).end()
}))
