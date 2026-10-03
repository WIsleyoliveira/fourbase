// Login, sessão, workspace e convites de funcionários.
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf, signToken, publicUser, DUMMY_HASH } from '../auth.js'

const router = Router()
export default router

router.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha' })
  const { data: user, error } = await supabase
    .from('fourbase_users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error) throw error
  const passwordOk = await bcrypt.compare(String(password), user?.password_hash || DUMMY_HASH)
  if (!user || !passwordOk) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' })
  }
  if (user.status === 'inactive') {
    return res.status(403).json({ error: 'Esta conta está inativa. Fale com o gestor do seu workspace.' })
  }
  if (!user.workspace_id) {
    return res.status(403).json({ error: 'Usuário sem workspace associado' })
  }
  const { data: workspace } = await supabase
    .from('weflow_workspaces')
    .select('id, name, color')
    .eq('id', user.workspace_id)
    .maybeSingle()
  res.json({ token: signToken(user), user: publicUser(user), workspace: workspace || null })
}))

router.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_users')
    .select('*')
    .eq('id', req.user.id)
    .eq('workspace_id', workspaceOf(req))
    .maybeSingle()
  if (error) throw error
  if (!data) return res.status(401).json({ error: 'Usuário não encontrado' })
  res.json(publicUser(data))
}))

// Dados do workspace do usuário logado (nome exibido no app).
router.get('/api/workspace', auth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('weflow_workspaces')
    .select('id, name, cnpj, phone, email, contact_name, address, color, created_at')
    .eq('id', workspaceOf(req))
    .maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: 'Workspace não encontrado' })
  res.json(data)
}))

// ---------- Convites de funcionários ----------
// O gestor cria o convite; quem define a senha é a própria pessoa convidada.
// O token puro só existe na resposta da criação: o banco guarda apenas o hash,
// e o token nunca é gravado em log.
const INVITE_TTL_HOURS = 72

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex')

const publicInvitation = (inv) => ({
  id: inv.id,
  workspace_id: inv.workspace_id,
  name: inv.name,
  email: inv.email,
  role: inv.role,
  job_title: inv.job_title ?? null,
  expires_at: inv.expires_at,
  accepted_at: inv.accepted_at ?? null,
  created_at: inv.created_at ?? null,
})

const appOrigin = (req) =>
  process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`

router.post('/api/members/invite', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { name, email, role = 'funcionario', job_title = '' } = req.body
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' })
  }
  const normalizedEmail = email.trim().toLowerCase()
  const roleValue = role === 'gestor' ? 'gestor' : 'funcionario'
  // Workspace do convite = workspace de quem convida. Nunca do body.
  const workspaceId = workspaceOf(req)

  const { data: existingUser, error: userErr } = await supabase
    .from('fourbase_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (userErr) throw userErr
  if (existingUser) return res.status(409).json({ error: 'Este e-mail já tem conta no weFlow' })

  // Convite pendente anterior para o mesmo e-mail é substituído — o link antigo
  // deixa de valer assim que um novo é emitido.
  const { data: pending, error: pendingErr } = await supabase
    .from('weflow_invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('email', normalizedEmail)
  if (pendingErr) throw pendingErr
  for (const inv of pending || []) {
    if (!inv.accepted_at) await supabase.from('weflow_invitations').delete().eq('id', inv.id)
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const { data, error } = await supabase
    .from('weflow_invitations')
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      name: name.trim(),
      role: roleValue,
      job_title: job_title.trim() || null,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000).toISOString(),
      accepted_at: null,
      created_by: req.user.id,
    })
    .select()
    .single()
  if (error) throw error

  res.status(201).json({
    invitation: publicInvitation(data),
    activation_url: `${appOrigin(req)}/activate/${rawToken}`,
  })
}))

router.get('/api/members/invitations', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('weflow_invitations')
    .select('*')
    .eq('workspace_id', workspaceOf(req))
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json(data.filter((inv) => !inv.accepted_at).map(publicInvitation))
}))

router.delete('/api/members/invitations/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { error } = await supabase
    .from('weflow_invitations')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', workspaceOf(req))
  if (error) throw error
  res.status(204).end()
}))

// Busca o convite pelo hash do token recebido no link. Devolve null para
// token inexistente, já usado ou expirado — o chamador decide o status HTTP.
const usableInvitation = async (rawToken) => {
  if (!rawToken) return null
  const { data } = await supabase
    .from('weflow_invitations')
    .select('*')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle()
  if (!data) return null
  if (data.accepted_at) return null
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null
  return data
}

// Rota pública: a tela de ativação usa isto para mostrar workspace e e-mail
// antes de a pessoa definir a senha.
router.get('/api/auth/invitations/:token', asyncRoute(async (req, res) => {
  const invitation = await usableInvitation(req.params.token)
  if (!invitation) return res.status(404).json({ error: 'Convite inválido, expirado ou já utilizado' })
  const { data: workspace } = await supabase
    .from('weflow_workspaces')
    .select('id, name')
    .eq('id', invitation.workspace_id)
    .maybeSingle()
  res.json({
    name: invitation.name,
    email: invitation.email,
    role: invitation.role,
    expires_at: invitation.expires_at,
    workspace_name: workspace?.name || null,
  })
}))

// Rota pública: cria a conta a partir do convite. workspace_id e role saem do
// convite guardado no servidor — o body só pode informar a senha.
router.post('/api/auth/invitations/:token/accept', asyncRoute(async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'Informe uma senha' })
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' })
  }

  const invitation = await usableInvitation(req.params.token)
  if (!invitation) return res.status(404).json({ error: 'Convite inválido, expirado ou já utilizado' })

  const { data: existingUser, error: userErr } = await supabase
    .from('fourbase_users')
    .select('id')
    .eq('email', invitation.email)
    .maybeSingle()
  if (userErr) throw userErr
  if (existingUser) return res.status(409).json({ error: 'Este e-mail já tem conta no weFlow' })

  const { data: user, error } = await supabase
    .from('fourbase_users')
    .insert({
      workspace_id: invitation.workspace_id,
      name: invitation.name,
      email: invitation.email,
      password_hash: await bcrypt.hash(password, 10),
      role: invitation.role,
      status: 'active',
      job_title: invitation.job_title || null,
      color: null,
      avatar_url: null,
    })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado' })
    throw error
  }

  // Marca como aceito antes de responder: garante o uso único do convite.
  const { error: acceptErr } = await supabase
    .from('weflow_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
  if (acceptErr) throw acceptErr

  const { data: workspace } = await supabase
    .from('weflow_workspaces')
    .select('id, name, color')
    .eq('id', user.workspace_id)
    .maybeSingle()

  res.status(201).json({ token: signToken(user), user: publicUser(user), workspace: workspace || null })
}))

