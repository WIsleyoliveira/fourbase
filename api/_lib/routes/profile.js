import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, workspaceOf, signToken, publicUser } from '../auth.js'
import { normalizeColor } from '../validation.js'

const router = Router()
export default router

// ---------- Meu Perfil (o próprio usuário logado) ----------
// Edita apenas a própria linha (req.user.id) — e-mail, role e workspace_id ficam
// de fora de propósito: e-mail é o identificador de login, role é prerrogativa
// do gestor e o workspace não pode ser trocado por ninguém pela API.
router.patch('/api/profile', auth, asyncRoute(async (req, res) => {
  const { name, job_title, phone, color, avatar_url, has_completed_onboarding, notify_email } = req.body
  const updates = {}
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'O nome não pode ficar em branco' })
    updates.name = name.trim()
  }
  if (job_title !== undefined) updates.job_title = job_title.trim() || null
  if (phone !== undefined) updates.phone = phone.trim() || null
  if (color !== undefined) updates.color = normalizeColor(color)
  if (avatar_url !== undefined) updates.avatar_url = avatar_url || null
  if (has_completed_onboarding !== undefined) updates.has_completed_onboarding = Boolean(has_completed_onboarding)
  if (notify_email !== undefined) updates.notify_email = Boolean(notify_email)

  const { data, error } = await supabase
    .from('fourbase_users')
    .update(updates)
    .eq('id', req.user.id)
    .eq('workspace_id', workspaceOf(req))
    .select('*')
    .single()
  if (error) throw error
  // Novo token: o nome vai assinado no JWT e é lido em outras telas
  res.json({ token: signToken(data), user: publicUser(data) })
}))

router.patch('/api/profile/password', auth, asyncRoute(async (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova senha' })
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres' })
  }

  const { data: user, error: fetchErr } = await supabase
    .from('fourbase_users')
    .select('*')
    .eq('id', req.user.id)
    .eq('workspace_id', workspaceOf(req))
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' })
  if (!(await bcrypt.compare(String(current_password), user.password_hash))) {
    return res.status(400).json({ error: 'A senha atual está incorreta' })
  }

  const { error } = await supabase
    .from('fourbase_users')
    .update({ password_hash: await bcrypt.hash(new_password, 10) })
    .eq('id', req.user.id)
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.json({ ok: true })
}))

