import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'
import { inWorkspace } from '../validation.js'

const router = Router()
export default router

// ---------- Notas ----------
router.get('/api/notes', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_notes')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  res.json(data)
}))

router.post('/api/notes', auth, asyncRoute(async (req, res) => {
  const { title = 'Nova nota', content = '' } = req.body
  const { data, error } = await supabase
    .from('fourbase_notes')
    .insert({ title, content, user_id: req.user.id, workspace_id: workspaceOf(req) })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.put('/api/notes/:id', auth, asyncRoute(async (req, res) => {
  const { title = '', content = '' } = req.body
  const { data, error } = await supabase
    .from('fourbase_notes')
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

router.delete('/api/notes/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_notes')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
  if (error) throw error
  res.status(204).end()
}))

// Relaciona (ou desvincula, com folder_id = null) uma nota a uma pasta de Documentações
router.patch('/api/notes/:id/folder', auth, asyncRoute(async (req, res) => {
  const { folder_id } = req.body
  const workspaceId = workspaceOf(req)
  if (!(await inWorkspace('fourbase_folders', folder_id, workspaceId))) {
    return res.status(400).json({ error: 'Pasta inválida' })
  }
  const { data, error } = await supabase
    .from('fourbase_notes')
    .update({ folder_id: folder_id || null })
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceId)
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

// Atualiza a lista de anexos de uma nota — o upload em si vai direto para o
// Supabase Storage a partir do browser; esta rota só persiste os metadados.
router.patch('/api/notes/:id/attachments', auth, asyncRoute(async (req, res) => {
  const { attachments } = req.body
  const { data, error } = await supabase
    .from('fourbase_notes')
    .update({ attachments: Array.isArray(attachments) ? attachments : [] })
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

