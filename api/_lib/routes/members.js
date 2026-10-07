import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'

const router = Router()
export default router

// ---------- Membros (para o seletor de responsável) ----------
router.get('/api/members', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_users')
    .select('id, name, color, avatar_url')
    .eq('workspace_id', workspaceOf(req))
    .order('name')
  if (error) throw error
  res.json(data)
}))

// Criação direta de membro (com senha definida pelo gestor) foi substituída
// pelo fluxo de convite: quem define a senha é a própria pessoa convidada.
router.post('/api/members', auth, gestorOnly, (req, res) =>
  res.status(410).json({
    error: 'Membros agora entram por convite. Use "Adicionar funcionário" para gerar o link de ativação.',
  }),
)

router.delete('/api/members/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { id } = req.params
  const workspaceId = workspaceOf(req)

  // Impede auto-exclusão
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Você não pode remover sua própria conta' })
  }

  // Verifica existência DENTRO do workspace e protege gestores — um id de outra
  // empresa cai no 404 abaixo, como qualquer id inexistente.
  const { data: target, error: fetchErr } = await supabase
    .from('fourbase_users')
    .select('role')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (target.role === 'gestor') {
    return res.status(403).json({ error: 'Não é possível remover um Gestor' })
  }

  // Reatribui tarefas ao gestor que está realizando a ação (evita órfãos)
  const { error: taskAssignErr } = await supabase
    .from('fourbase_tasks')
    .update({ assigned_to: req.user.id })
    .eq('workspace_id', workspaceId)
    .eq('assigned_to', id)
  if (taskAssignErr) throw taskAssignErr

  const { error: taskUserErr } = await supabase
    .from('fourbase_tasks')
    .update({ user_id: req.user.id })
    .eq('workspace_id', workspaceId)
    .eq('user_id', id)
  if (taskUserErr) throw taskUserErr

  const { error: deleteErr } = await supabase
    .from('fourbase_users')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
  if (deleteErr) throw deleteErr

  res.status(204).end()
}))

