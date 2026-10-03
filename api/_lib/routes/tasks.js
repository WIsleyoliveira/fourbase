import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'
import { inWorkspace, validMemberIds } from '../validation.js'

const router = Router()
export default router

// ---------- Tarefas (atribuídas ao usuário logado) ----------
router.get('/api/tasks', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .eq('assigned_to', req.user.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

// Todas as tarefas de um cliente, independente de quem é o responsável —
// usada pela aba Relatórios, que precisa exibir a atividade do cliente como
// um todo (mesma regra de visibilidade já aplicada a fourbase_report_activities).
router.get('/api/tasks/by-client/:clientId', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .eq('client_id', req.params.clientId)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

// Todas as tarefas vinculadas a QUALQUER cliente, de qualquer responsável —
// usada pelo Calendário para juntar às tarefas pessoais do usuário logado.
// Tarefas de cliente já são compartilhadas com toda a equipe em outros
// pontos do app (Kanban do cliente, Relatórios, progresso da listagem de
// clientes); sem isso, uma tarefa criada no Kanban de um cliente e atribuída
// a outra pessoa só aparecia no calendário de quem estava marcado como
// responsável, nunca no de quem apenas criou/acompanha o cliente.
router.get('/api/tasks/client-linked', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .not('client_id', 'is', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

// Progresso consolidado por cliente. Conta as tarefas de TODA a equipe (não só
// as do usuário logado), para que a barra de progresso e os contadores
// ativas/total do cliente reflitam o trabalho de todo mundo — mesma regra de
// visibilidade compartilhada já usada no Espaço do Cliente e em Relatórios.
// Devolve o agregado pronto para não trafegar a base de tarefas inteira.
router.get('/api/tasks/client-stats', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .select('client_id, column_key, created_at, updated_at')
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error

  const map = {}
  for (const t of data) {
    if (!t.client_id) continue
    const s = map[t.client_id] || (map[t.client_id] = { total: 0, todo: 0, doing: 0, done: 0, lastActivity: null })
    s.total += 1
    if (t.column_key === 'done') s.done += 1
    else if (t.column_key === 'todo') s.todo += 1
    else s.doing += 1
    const stamp = t.updated_at || t.created_at
    if (stamp && (!s.lastActivity || stamp > s.lastActivity)) s.lastActivity = stamp
  }
  for (const s of Object.values(map)) {
    s.active = s.total - s.done
    s.progress = s.total ? Math.round((s.done / s.total) * 100) : 0
  }
  res.json(map)
}))

router.post('/api/tasks', auth, asyncRoute(async (req, res) => {
  const {
    title, priority = 'Média', due_date = null, due_date_end = null, due_time = null, due_time_end = null,
    assigned_to, description = '',
    client_id = null, tags = [], column_key = 'todo', attachments = [], mentioned_users = [],
  } = req.body
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título obrigatório' })
  // due_date_end só faz sentido junto de due_date, e nunca antes dele —
  // tarefa "de um dia só" é devolvida com due_date_end null.
  if (due_date_end && (!due_date || due_date_end < due_date)) {
    return res.status(400).json({ error: 'A data final não pode ser antes da data de início' })
  }
  // due_time_end só faz sentido junto de due_time; a ordem só é validada
  // quando é o mesmo dia — em intervalo de vários dias, um horário final
  // "menor" (ex.: início 22:00, fim 06:00 no dia seguinte) é legítimo.
  if (due_time_end && !due_time) {
    return res.status(400).json({ error: 'Defina o horário de início antes do horário final' })
  }
  const sameDayTimes = !due_date_end || due_date_end === due_date
  if (sameDayTimes && due_time && due_time_end && due_time_end < due_time) {
    return res.status(400).json({ error: 'O horário final não pode ser antes do horário de início' })
  }
  const workspaceId = workspaceOf(req)
  const isGestor = req.user.role === 'gestor'
  const owner = isGestor && assigned_to ? assigned_to : req.user.id
  // Responsável e cliente precisam ser do mesmo workspace — senão o body
  // poderia costurar a tarefa a registros de outra empresa.
  if (!(await inWorkspace('fourbase_users', owner, workspaceId))) {
    return res.status(400).json({ error: 'Responsável inválido' })
  }
  if (!(await inWorkspace('fourbase_clients', client_id, workspaceId))) {
    return res.status(400).json({ error: 'Cliente inválido' })
  }
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .insert({
      workspace_id: workspaceId,
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date,
      due_date_end: due_date ? (due_date_end || null) : null,
      due_time: due_date ? (due_time || null) : null,
      due_time_end: due_date && due_time ? (due_time_end || null) : null,
      column_key: column_key || 'todo',
      user_id: req.user.id,
      assigned_to: owner,
      client_id: client_id || null,
      tags: Array.isArray(tags) ? tags : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      mentioned_users: await validMemberIds(mentioned_users, workspaceId),
    })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.patch('/api/tasks/:id', auth, asyncRoute(async (req, res) => {
  const { column_key, title, priority, due_date, due_date_end, due_time, due_time_end, assigned_to, description, logged_time_seconds, attachments, client_id, tags, mentioned_users } = req.body
  const workspaceId = workspaceOf(req)
  const updates = {}
  if (column_key) updates.column_key = column_key
  if (title) updates.title = title
  if (description !== undefined) updates.description = description
  if (priority) updates.priority = priority
  if (due_date !== undefined) updates.due_date = due_date
  if (due_date_end !== undefined) updates.due_date_end = due_date_end || null
  if (due_time !== undefined) updates.due_time = due_time || null
  if (due_time_end !== undefined) updates.due_time_end = due_time_end || null
  // Valida a combinação final (campo que não veio nesta chamada usa o valor
  // já salvo) — sem isso, editar só a data/horário final não pegaria uma inversão.
  if (
    updates.due_date !== undefined || updates.due_date_end !== undefined ||
    updates.due_time !== undefined || updates.due_time_end !== undefined
  ) {
    const { data: current } = await supabase
      .from('fourbase_tasks')
      .select('due_date, due_date_end, due_time, due_time_end')
      .eq('id', req.params.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    const finalStart = updates.due_date !== undefined ? updates.due_date : current?.due_date
    let finalEnd = updates.due_date_end !== undefined ? updates.due_date_end : current?.due_date_end
    let finalTime = updates.due_time !== undefined ? updates.due_time : current?.due_time
    let finalTimeEnd = updates.due_time_end !== undefined ? updates.due_time_end : current?.due_time_end
    // Removeu a data de início: due_date_end/due_time/due_time_end ficam
    // órfãos, então somem junto — precisa rodar ANTES das validações
    // abaixo, senão isso vira um 400 em vez de uma limpeza automática.
    if (!finalStart && finalEnd) {
      finalEnd = null
      updates.due_date_end = null
    }
    if (!finalStart && finalTime) {
      finalTime = null
      updates.due_time = null
    }
    if (!finalTime && finalTimeEnd) {
      finalTimeEnd = null
      updates.due_time_end = null
    }
    if (finalEnd && finalEnd < finalStart) {
      return res.status(400).json({ error: 'A data final não pode ser antes da data de início' })
    }
    const sameDayTimes = !finalEnd || finalEnd === finalStart
    if (sameDayTimes && finalTime && finalTimeEnd && finalTimeEnd < finalTime) {
      return res.status(400).json({ error: 'O horário final não pode ser antes do horário de início' })
    }
  }
  if (assigned_to && req.user.role === 'gestor') {
    if (!(await inWorkspace('fourbase_users', assigned_to, workspaceId))) {
      return res.status(400).json({ error: 'Responsável inválido' })
    }
    updates.assigned_to = assigned_to
  }
  if (logged_time_seconds !== undefined) updates.logged_time_seconds = Math.max(0, Math.floor(Number(logged_time_seconds)) || 0)
  if (attachments !== undefined) updates.attachments = Array.isArray(attachments) ? attachments : []
  if (client_id !== undefined) {
    if (!(await inWorkspace('fourbase_clients', client_id, workspaceId))) {
      return res.status(400).json({ error: 'Cliente inválido' })
    }
    updates.client_id = client_id || null
  }
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : []
  if (mentioned_users !== undefined) updates.mentioned_users = await validMemberIds(mentioned_users, workspaceId)

  const query = supabase
    .from('fourbase_tasks')
    .update(updates)
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceId)
  if (req.user.role !== 'gestor') query.eq('assigned_to', req.user.id)
  const { data, error } = await query.select().single()
  if (error) throw error
  res.json(data)
}))

router.delete('/api/tasks/:id', auth, asyncRoute(async (req, res) => {
  const query = supabase
    .from('fourbase_tasks')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
  if (req.user.role !== 'gestor') query.eq('assigned_to', req.user.id)
  const { error } = await query
  if (error) throw error
  res.status(204).end()
}))

