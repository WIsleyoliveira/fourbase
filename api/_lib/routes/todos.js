import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'

const router = Router()
export default router

// ---------- Checklist ----------
router.get('/api/todos', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_todos')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

router.post('/api/todos', auth, asyncRoute(async (req, res) => {
  const { text, priority = 'Média', due_at = null } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'Texto obrigatório' })
  const { data, error } = await supabase
    .from('fourbase_todos')
    .insert({ text: text.trim(), priority, due_at, user_id: req.user.id, workspace_id: workspaceOf(req) })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.patch('/api/todos/:id', auth, asyncRoute(async (req, res) => {
  const { done, priority, due_at } = req.body
  const updates = {}
  if (done !== undefined) updates.done = done
  if (priority) updates.priority = priority
  if (due_at !== undefined) updates.due_at = due_at
  const { data, error } = await supabase
    .from('fourbase_todos')
    .update(updates)
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

router.delete('/api/todos/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_todos')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
  if (error) throw error
  res.status(204).end()
}))

