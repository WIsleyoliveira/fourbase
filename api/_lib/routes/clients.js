import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { normalizeColor } from '../validation.js'

const router = Router()
export default router

// ---------- Clientes ----------
// Clientes comerciais da empresa dona do workspace (não confundir com o
// workspace em si, que é a empresa cliente do weFlow). Compartilhados entre
// todos os usuários DO MESMO workspace, no mesmo modelo das pastas.
router.get('/api/clients', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_clients')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json(data)
}))

router.post('/api/clients', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { name = '', cnpj = '', phone = '', email = '', contact_name = '', address = '', color } = req.body
  const { data, error } = await supabase
    .from('fourbase_clients')
    .insert({
      workspace_id: workspaceOf(req),
      name: name.trim() || null,
      cnpj: cnpj.trim() || null,
      phone: phone.trim() || null,
      email: email.trim().toLowerCase() || null,
      contact_name: contact_name.trim() || null,
      address: address.trim() || null,
      color: normalizeColor(color),
      created_by: req.user.id,
    })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
}))

router.patch('/api/clients/:id', auth, asyncRoute(async (req, res) => {
  const updates = { updated_at: new Date().toISOString() }
  for (const key of ['name', 'cnpj', 'phone', 'email', 'contact_name', 'address']) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim()
      updates[key] = key === 'email' ? (v.toLowerCase() || null) : (v || null)
    }
  }
  if (req.body.color !== undefined) updates.color = normalizeColor(req.body.color)
  const { data, error } = await supabase
    .from('fourbase_clients')
    .update(updates)
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
    .select()
    .single()
  if (error) throw error
  res.json(data)
}))

// Exclusão de cliente. O parâmetro ?folders= define o destino das pastas de
// documentação vinculadas:
//   archive (padrão) — mantém as pastas, apenas desvincula (client_id = NULL)
//   cascade          — exclui as pastas do cliente e seu conteúdo
router.delete('/api/clients/:id', auth, asyncRoute(async (req, res) => {
  const mode = req.query.folders === 'cascade' ? 'cascade' : 'archive'
  const clientId = req.params.id
  const workspaceId = workspaceOf(req)

  if (mode === 'cascade') {
    await supabase.from('fourbase_folders').delete().eq('client_id', clientId).eq('workspace_id', workspaceId)
  } else {
    await supabase.from('fourbase_folders').update({ client_id: null }).eq('client_id', clientId).eq('workspace_id', workspaceId)
  }

  const { error } = await supabase
    .from('fourbase_clients')
    .delete()
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
  if (error) throw error
  res.status(204).end()
}))

