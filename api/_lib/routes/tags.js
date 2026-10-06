import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { isUuid } from '../validation.js'

const router = Router()
export default router

// ---------- Etiquetas de tarefas (registro do workspace: pré-cadastradas + criadas sob demanda) ----------
router.get('/api/tags', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_tags')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .order('created_at', { ascending: true })
  if (error) throw error
  res.json(data)
}))

router.post('/api/tags', auth, asyncRoute(async (req, res) => {
  const { name, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nome da etiqueta obrigatório' })
  const workspaceId = workspaceOf(req)
  const { data, error } = await supabase
    .from('fourbase_tags')
    .insert({ name: name.trim(), color: color || '#14b8c4', workspace_id: workspaceId })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      // Etiqueta com esse nome já existe NESTE workspace — devolve a existente
      // em vez de erro, já que criar uma tag "nova" com nome repetido deve
      // apenas reutilizá-la.
      const existing = await supabase
        .from('fourbase_tags')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('name', name.trim())
        .single()
      if (existing.error) throw existing.error
      return res.status(200).json(existing.data)
    }
    throw error
  }
  res.status(201).json(data)
}))


// Exclui uma etiqueta do workspace (só gestor — a etiqueta é compartilhada) e a
// retira de todas as tarefas que a usam (as tarefas guardam o NOME da etiqueta).
router.delete('/api/tags/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Etiqueta não encontrada' })

  const found = await supabase
    .from('fourbase_tags')
    .select('id, name')
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (found.error) throw found.error
  if (!found.data) return res.status(404).json({ error: 'Etiqueta não encontrada' })

  const removed = await supabase
    .from('fourbase_tags')
    .delete()
    .eq('id', found.data.id)
    .eq('workspace_id', workspaceId)
  if (removed.error) throw removed.error

  // Limpa o nome nas tarefas do workspace (filtra em JS: serve ao banco real e ao mockado)
  const tasks = await supabase.from('fourbase_tasks').select('id, tags').eq('workspace_id', workspaceId)
  if (tasks.error) throw tasks.error
  const name = found.data.name
  for (const task of tasks.data.filter((t) => Array.isArray(t.tags) && t.tags.includes(name))) {
    const { error } = await supabase
      .from('fourbase_tasks')
      .update({ tags: task.tags.filter((t) => t !== name) })
      .eq('id', task.id)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  }
  res.status(204).end()
}))
