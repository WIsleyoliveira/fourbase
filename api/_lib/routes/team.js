import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { loadBucketer } from '../columnBuckets.js'
import { isUuid } from '../validation.js'
import { sendReminder } from '../notifications.js'

const router = Router()
export default router

// ---------- Equipe (somente gestor, somente o próprio workspace) ----------
router.get('/api/team/overview', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const bucket = await loadBucketer(workspaceId)
  const [users, tasks, todos, notes] = await Promise.all([
    supabase.from('fourbase_users').select('id, name, email, role, avatar_url, color').eq('workspace_id', workspaceId).order('created_at'),
    supabase.from('fourbase_tasks').select('user_id, column_key').eq('workspace_id', workspaceId),
    supabase.from('fourbase_todos').select('user_id, done').eq('workspace_id', workspaceId),
    supabase.from('fourbase_notes').select('user_id, updated_at').eq('workspace_id', workspaceId),
  ])
  for (const r of [users, tasks, todos, notes]) if (r.error) throw r.error

  const overview = users.data.map((u) => {
    const uTasks = tasks.data.filter((t) => t.user_id === u.id)
    const uTodos = todos.data.filter((t) => t.user_id === u.id)
    const uNotes = notes.data.filter((n) => n.user_id === u.id)
    return {
      ...u,
      tasks: {
        todo: uTasks.filter((t) => bucket(t.column_key) === 'todo').length,
        doing: uTasks.filter((t) => bucket(t.column_key) === 'doing').length,
        done: uTasks.filter((t) => bucket(t.column_key) === 'done').length,
        total: uTasks.length,
      },
      todos: { done: uTodos.filter((t) => t.done).length, total: uTodos.length },
      notes: uNotes.length,
      lastNoteAt: uNotes.length
        ? uNotes.map((n) => n.updated_at).sort().at(-1)
        : null,
    }
  })
  res.json(overview)
}))

// Sininho: o gestor sinaliza ao colaborador uma tarefa dele que ainda está em aberto.
// Vale só para tarefa do próprio workspace, atribuída a essa pessoa e não concluída.
router.post('/api/team/members/:userId/nudge', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const { userId } = req.params
  const taskId = req.body?.task_id
  if (!isUuid(userId) || !isUuid(taskId)) return res.status(400).json({ error: 'Pessoa ou tarefa inválida' })
  if (userId === req.user.id) return res.status(400).json({ error: 'Você não pode sinalizar tarefas para si mesmo.' })

  const [{ data: recipient, error: rErr }, { data: task, error: tErr }] = await Promise.all([
    supabase.from('fourbase_users').select('id, name, email, notify_email, status').eq('id', userId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('fourbase_tasks').select('id, title, due_date, column_key, assigned_to').eq('id', taskId).eq('workspace_id', workspaceId).maybeSingle(),
  ])
  if (rErr) throw rErr
  if (tErr) throw tErr
  if (!recipient || recipient.status === 'inactive') return res.status(404).json({ error: 'Pessoa não encontrada' })
  if (!task || task.assigned_to !== userId) return res.status(404).json({ error: 'Tarefa não encontrada para esta pessoa' })
  if (task.column_key === 'done') return res.status(400).json({ error: 'Esta tarefa já está concluída.' })

  const r = await sendReminder({
    actor: { id: req.user.id, name: req.user.name, workspace_id: workspaceId },
    recipient, task, message: req.body?.message,
  })
  res.status(r.status).json(r.body)
}))

router.get('/api/team/tasks', auth, gestorOnly, asyncRoute(async (req, res) => {
  // Join manual (nome/e-mail do responsável) — o banco local mockado não
  // interpreta a sintaxe de recurso embutido do supabase-js (`fk!join(...)`).
  const workspaceId = workspaceOf(req)
  const [{ data: tasks, error: tErr }, { data: users, error: uErr }] = await Promise.all([
    supabase.from('fourbase_tasks').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    supabase.from('fourbase_users').select('id, name, email, avatar_url, color').eq('workspace_id', workspaceId),
  ])
  if (tErr) throw tErr
  if (uErr) throw uErr
  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  res.json(
    tasks.map((t) => {
      const assignee = byId[t.assigned_to]
      return {
        ...t,
        owner_name: assignee?.name || 'Sem dono',
        owner_email: assignee?.email || '',
        owner_avatar_url: assignee?.avatar_url || null,
        owner_color: assignee?.color || null,
      }
    })
  )
}))

