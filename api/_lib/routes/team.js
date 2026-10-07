import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'

const router = Router()
export default router

// ---------- Equipe (somente gestor, somente o próprio workspace) ----------
router.get('/api/team/overview', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
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
        todo: uTasks.filter((t) => t.column_key === 'todo').length,
        doing: uTasks.filter((t) => t.column_key === 'doing').length,
        done: uTasks.filter((t) => t.column_key === 'done').length,
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

