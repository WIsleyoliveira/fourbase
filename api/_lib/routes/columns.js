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

// Colunas na ordem do quadro, com "Concluído" sempre por último.
const loadColumns = async (workspaceId) => {
  const { data, error } = await supabase
    .from('fourbase_columns')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
  if (error) throw error
  return [...data.filter((c) => c.key !== 'done'), ...data.filter((c) => c.key === 'done')]
}

// Grava as posições 0..n-1 na ordem recebida (só mexe nas que mudaram).
const savePositions = async (workspaceId, ordered) => {
  for (let position = 0; position < ordered.length; position++) {
    if (ordered[position].position === position) continue
    const { error } = await supabase
      .from('fourbase_columns')
      .update({ position })
      .eq('key', ordered[position].key)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  }
}

// Reordena as colunas (só gestor). O corpo traz as chaves de TODAS as colunas menos
// "Concluído", na nova ordem; "Concluído" fica sempre por último.
router.put('/api/columns/order', auth, gestorOnly, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const keys = req.body.keys
  const columns = await loadColumns(workspaceId)
  const movable = columns.filter((c) => c.key !== 'done')
  const valid = Array.isArray(keys)
    && keys.length === movable.length
    && new Set(keys).size === keys.length
    && keys.every((k) => movable.some((c) => c.key === k))
  if (!valid) return res.status(400).json({ error: 'A nova ordem precisa listar todas as colunas, exceto Concluído' })
  const ordered = [...keys.map((k) => movable.find((c) => c.key === k)), ...columns.filter((c) => c.key === 'done')]
  await savePositions(workspaceId, ordered)
  res.json(await loadColumns(workspaceId))
}))

// Exclui uma coluna (só gestor). As tarefas dela vão para a coluna indicada em ?moveTo=
// (obrigatório quando existe alguma tarefa na coluna, de qualquer pessoa do workspace).
// "Concluído" nunca sai, e sempre sobra ao menos uma coluna além dela.
router.delete('/api/columns/:key', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { key } = req.params
  if (key === 'done') return res.status(400).json({ error: 'A coluna Concluído não pode ser excluída' })
  const workspaceId = workspaceOf(req)
  const columns = await loadColumns(workspaceId)
  const column = columns.find((c) => c.key === key)
  if (!column) return res.status(204).end() // já não existe neste workspace: nada a fazer

  const targets = columns.filter((c) => c.key !== key && c.key !== 'done')
  if (!targets.length) {
    return res.status(400).json({ error: 'Mantenha ao menos uma coluna além de Concluído' })
  }

  const tasks = await supabase
    .from('fourbase_tasks')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('column_key', key)
  if (tasks.error) throw tasks.error
  const moved = tasks.data.length
  if (moved > 0) {
    const target = targets.find((c) => c.key === req.query.moveTo)
    if (!target) return res.status(400).json({ error: 'Escolha para qual coluna as tarefas serão movidas' })
    const { error: moveError } = await supabase
      .from('fourbase_tasks')
      .update({ column_key: target.key })
      .eq('workspace_id', workspaceId)
      .eq('column_key', key)
    if (moveError) throw moveError
  }

  const { error } = await supabase
    .from('fourbase_columns')
    .delete()
    .eq('key', key)
    .eq('workspace_id', workspaceId)
  if (error) throw error

  await savePositions(workspaceId, columns.filter((c) => c.key !== key))
  res.json({ moved })
}))
