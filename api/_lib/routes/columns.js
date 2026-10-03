import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'

const router = Router()
export default router

// ---------- Colunas do Kanban ----------
router.get('/api/columns', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_columns')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .order('position', { ascending: true })
  if (error) throw error
  res.json(data)
}))

router.post('/api/columns', auth, asyncRoute(async (req, res) => {
  const { label, key, position = 0, color = '#14b8c4' } = req.body
  if (!label?.trim()) return res.status(400).json({ error: 'Nome da coluna obrigatório' })
  if (!key?.trim())   return res.status(400).json({ error: 'Chave da coluna obrigatória' })
  const { data, error } = await supabase
    .from('fourbase_columns')
    .insert({ label: label.trim(), key: key.trim(), position, color, workspace_id: workspaceOf(req) })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma coluna com essa chave' })
    throw error
  }
  res.status(201).json(data)
}))

router.delete('/api/columns/:key', auth, asyncRoute(async (req, res) => {
  if (['todo', 'doing', 'done'].includes(req.params.key)) {
    return res.status(400).json({ error: 'Não é possível excluir colunas padrão' })
  }
  const { error } = await supabase
    .from('fourbase_columns')
    .delete()
    .eq('key', req.params.key)
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.status(204).end()
}))

