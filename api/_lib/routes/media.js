import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf } from '../auth.js'

const router = Router()
export default router

// ---------- Mídia ----------
router.get('/api/media', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_media')
    .select('kind, data_url')
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
  if (error) throw error
  const media = { image: '', video: '' }
  data.forEach((row) => { media[row.kind] = row.data_url })
  res.json(media)
}))

router.put('/api/media/:kind', auth, asyncRoute(async (req, res) => {
  const { kind } = req.params
  if (!['image', 'video'].includes(kind)) return res.status(400).json({ error: 'Tipo inválido' })
  const { data_url = '' } = req.body
  const { data, error } = await supabase
    .from('fourbase_media')
    .upsert(
      { kind, data_url, user_id: req.user.id, workspace_id: workspaceOf(req), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,kind' }
    )
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

router.delete('/api/media', auth, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('fourbase_media')
    .update({ data_url: '', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceOf(req))
    .eq('user_id', req.user.id)
    .in('kind', ['image', 'video'])
  if (error) throw error
  res.status(204).end()
}))

