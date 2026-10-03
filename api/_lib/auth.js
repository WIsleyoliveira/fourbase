import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { supabase } from './supabase.js'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET é obrigatório em produção — defina no .env do servidor.')
}
const JWT_SECRET = process.env.JWT_SECRET || 'fourbase-dev-secret-troque-em-producao'

// Limite de tentativas nas rotas de credencial, contra força bruta. O contador
// é em memória — na Vercel cada instância tem o seu, então é aproximado; um
// limite global exigiria um store compartilhado (ex.: Redis).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
})

// Hash usado quando o e-mail não existe, para o login levar o mesmo tempo nos
// dois casos e não revelar quais e-mails têm conta.
export const DUMMY_HASH = bcrypt.hashSync('fourbase-dummy-password', 10)

// ---------- Auth ----------
// O JWT carrega o workspace do usuário: toda consulta é filtrada por ele, e ele
// nunca é lido do body/query (ver `workspaceOf` e a seção de segurança abaixo).
export const signToken = (user) =>
  jwt.sign(
    { sub: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id },
    JWT_SECRET,
    { expiresIn: '7d' },
  )

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  workspace_id: u.workspace_id ?? null,
  status: u.status ?? 'active',
  job_title: u.job_title ?? null,
  phone: u.phone ?? null,
  color: u.color ?? null,
  avatar_url: u.avatar_url ?? null,
  has_completed_onboarding: u.has_completed_onboarding ?? false,
  created_at: u.created_at ?? null,
})

const asyncMw = (fn) => (req, res, next) =>
  fn(req, res, next).catch((err) => {
    console.error(err)
    res.status(401).json({ error: 'Não autenticado' })
  })

export const auth = asyncMw(async (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  if (payload.workspace_id) {
    req.user = {
      id: payload.sub,
      name: payload.name,
      role: payload.role,
      workspace_id: payload.workspace_id,
    }
    return next()
  }

  // Tokens emitidos antes da arquitetura multi-tenant não trazem workspace_id.
  // Só nesse caso consultamos o banco — assim as sessões abertas continuam
  // válidas sem que o workspace precise vir do cliente.
  const { data: user, error } = await supabase
    .from('fourbase_users')
    .select('*')
    .eq('id', payload.sub)
    .maybeSingle()
  if (error) throw error
  if (!user || !user.workspace_id || user.status === 'inactive') {
    return res.status(401).json({ error: 'Não autenticado' })
  }
  req.user = { id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id }
  next()
})

export const gestorOnly = (req, res, next) =>
  req.user.role === 'gestor' ? next() : res.status(403).json({ error: 'Acesso restrito ao gestor' })

// Fonte única do workspace corrente. Ler daqui — e nunca de req.body/req.query —
// é o que impede um usuário de alcançar dados de outra empresa forjando o
// request. Todas as consultas abaixo filtram por este valor.
export const workspaceOf = (req) => req.user.workspace_id

