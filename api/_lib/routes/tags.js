import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'

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

