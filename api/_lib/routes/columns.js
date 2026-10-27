import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { normalizeColor } from '../validation.js'

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

// Edita o nome e/ou a cor de uma coluna (só gestor: a coluna é compartilhada por todo o
// workspace). A coluna "Concluído" é fixa — ela dá sentido a "tarefa concluída" em todo o app.
const MAX_LABEL = 40
router.patch('/api/columns/:key', auth, gestorOnly, asyncRoute(async (req, res) => {
  if (req.params.key === 'done') {
    return res.status(400).json({ error: 'A coluna Concluído não pode ser editada' })
  }
  const updates = {}
  if (req.body.label !== undefined) {
    const label = typeof req.body.label === 'string' ? req.body.label.trim() : ''
    if (!label) return res.status(400).json({ error: 'Nome da coluna obrigatório' })
    if (label.length > MAX_LABEL) return res.status(400).json({ error: `O nome da coluna deve ter até ${MAX_LABEL} caracteres` })
    updates.label = label
  }
  if (req.body.color !== undefined) {
    const color = normalizeColor(req.body.color)
    if (!color) return res.status(400).json({ error: 'Cor inválida' })
    updates.color = color
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada para atualizar' })

  const { data, error } = await supabase
    .from('fourbase_columns')
    .update(updates)
    .eq('key', req.params.key)
    .eq('workspace_id', workspaceOf(req))
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Coluna não encontrada' })
  res.json(data)
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

