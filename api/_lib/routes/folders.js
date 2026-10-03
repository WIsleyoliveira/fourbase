import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'
import { inWorkspace } from '../validation.js'

const router = Router()
export default router

// ---------- Pastas de documentos (hierárquicas, com vínculo a clientes) ----------
router.get('/api/folders', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_folders')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .order('name')
  if (error) throw error
  res.json(data)
}))

router.post('/api/folders', auth, asyncRoute(async (req, res) => {
  const { name, color = '#14b8c4', parent_id = null, client_id = null } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome da pasta obrigatório' })
  const workspaceId = workspaceOf(req)
  if (!(await inWorkspace('fourbase_folders', parent_id, workspaceId))) {
    return res.status(400).json({ error: 'Pasta-pai inválida' })
  }
  if (!(await inWorkspace('fourbase_clients', client_id, workspaceId))) {
    return res.status(400).json({ error: 'Cliente inválido' })
  }

  // Subpasta herda o cliente da pasta-pai (mantém a árvore coerente)
  let owner = client_id || null
  if (parent_id) {
    const { data: parent } = await supabase
      .from('fourbase_folders')
      .select('client_id')
      .eq('id', parent_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (parent && parent.client_id) owner = parent.client_id
  }

  const { data, error } = await supabase
    .from('fourbase_folders')
    .insert({
      name: name.trim(),
      color,
      parent_id: parent_id || null,
      client_id: owner,
      created_by: req.user.id,
      workspace_id: workspaceId,
    })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.patch('/api/folders/:id', auth, asyncRoute(async (req, res) => {
  const { name, color, parent_id, client_id } = req.body
  const workspaceId = workspaceOf(req)
  const updates = {}
  if (name !== undefined && name.trim()) updates.name = name.trim()
  if (color !== undefined) updates.color = color
  if (parent_id !== undefined) {
    if (!(await inWorkspace('fourbase_folders', parent_id, workspaceId))) {
      return res.status(400).json({ error: 'Pasta-pai inválida' })
    }
    updates.parent_id = parent_id || null
  }
  if (client_id !== undefined) {
    if (!(await inWorkspace('fourbase_clients', client_id, workspaceId))) {
      return res.status(400).json({ error: 'Cliente inválido' })
    }
    updates.client_id = client_id || null
  }
  const { data, error } = await supabase
    .from('fourbase_folders')
    .update(updates)
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

router.delete('/api/folders/:id', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_folders')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.status(204).end()
}))

router.get('/api/folders/:id/documents', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_folder_media')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .eq('folder_id', req.params.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json(data)
}))

router.post('/api/folders/:id/documents', auth, asyncRoute(async (req, res) => {
  const { kind, url, name = '' } = req.body
  if (!['image', 'video', 'document'].includes(kind)) return res.status(400).json({ error: 'Tipo inválido' })
  if (!url) return res.status(400).json({ error: 'URL obrigatória' })
  const workspaceId = workspaceOf(req)
  if (!(await inWorkspace('fourbase_folders', req.params.id, workspaceId))) {
    return res.status(404).json({ error: 'Pasta não encontrada' })
  }
  const { data, error } = await supabase
    .from('fourbase_folder_media')
    .insert({
      folder_id: req.params.id,
      kind,
      url,
      name,
      uploaded_by: req.user.id,
      workspace_id: workspaceId,
    })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.delete('/api/folders/:folderId/documents/:docId', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_folder_media')
    .delete()
    .eq('id', req.params.docId)
    .eq('workspace_id', workspaceOf(req))
    .eq('folder_id', req.params.folderId)
  if (error) throw error
  res.status(204).end()
}))

