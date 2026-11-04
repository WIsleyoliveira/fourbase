import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { isUuid } from '../validation.js'
import {
  appUrl, listBatches, loadBatch, opAgenda, opBatches, opClients, opCreate, opMe, opPreview, opUndo, planFor, undoBatch,
} from '../assistantService.js'
import { runInBackground } from '../mailer.js'
import { logOAuth } from '../oauth.js'
import {
  DEFAULT_TOKEN_DAYS, MAX_ACTIVE_TOKENS, NOTICE_VERSION, SCOPES,
  assistantEnabledForUser, buildOpenApi, generateToken, hashToken, isTokenShape, tokenPrefixOf, toBatchView, undoDeadline,
} from '../assistant.js'

// Assistente (ChatGPT). O gestor cria uma "chave de conexão" na tela Assistente e o GPT dele usa as
// rotas /api/assistant/* com ela. Duas portas que NÃO se misturam:
//   - porta do GPT (Bearer fbk_…, assistantAuth): agenda, clientes, prévia, criar, listar e desfazer lotes;
//   - porta da tela (JWT do app, só gestor): chaves, histórico de lotes e desfazer com prévia.
// A chave nunca abre rota de JWT e o JWT nunca abre rota da chave. Tudo é do próprio dono: ele vê e cria
// só as próprias tarefas. O assistente não edita nem apaga tarefas existentes — só desfaz o que criou,
// e nunca uma tarefa em que alguém já mexeu (impressão digital guardada no lote).
const router = Router()
export default router

// Interruptor geral: ASSISTANT_ENABLED=false desliga tudo sem deploy (resposta a incidente).
router.use('/api/assistant', (req, res, next) =>
  process.env.ASSISTANT_ENABLED === 'false'
    ? res.status(503).json({ error: 'O Assistente está temporariamente desligado.' })
    : next())

const NOT_ENABLED = 'O Assistente não está disponível para esta empresa.'
// Porta da tela: login normal, só gestor, só empresa liberada.
// O login não traz o e-mail: lê a pessoa no banco (também barra quem foi rebaixado ou desativado).
const enabledForUser = (req, res, next) => (async () => {
  const { data: me } = await supabase
    .from('fourbase_users').select('*').eq('id', req.user.id).eq('workspace_id', workspaceOf(req)).maybeSingle()
  if (!assistantEnabledForUser(me)) return res.status(403).json({ error: NOT_ENABLED })
  next()
})().catch((err) => { console.error(err); res.status(500).json({ error: 'Erro interno' }) })
const screen = [auth, gestorOnly, enabledForUser]
export { screen }
// Interruptor geral para as outras portas (OAuth e MCP), com a mesma regra do /api/assistant
export const killSwitch = (req, res, next) =>
  process.env.ASSISTANT_ENABLED === 'false'
    ? res.status(503).json({ error: 'O Assistente está temporariamente desligado.' })
    : next()

const isActiveGestor = (u) => !!u && u.role === 'gestor' && u.status !== 'inactive'
const isLive = (t, now = Date.now()) => !t.revoked_at && Date.parse(t.expires_at) > now

async function recordConsent(row) {
  const { error } = await supabase.from('fourbase_assistant_consents').insert(row)
  if (error) throw error
}

// ---------- Porta da tela: chaves de conexão (JWT, só gestor) ----------
router.get('/api/assistant/tokens', ...screen, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const { data, error } = await supabase
    .from('fourbase_api_tokens').select('*')
    .eq('user_id', req.user.id).eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const { data: consents } = await supabase
    .from('fourbase_assistant_consents').select('*')
    .eq('user_id', req.user.id).eq('workspace_id', workspaceId).eq('event', 'authorized')
    .order('created_at', { ascending: false })
  const last = (consents || [])[0]
  res.json({
    tokens: (data || []).map(({ id, name, kind, prefix, created_at, last_used_at, last_activity, expires_at, revoked_at }) =>
      ({ id, name, kind, prefix, created_at, last_used_at, last_activity: last_activity ?? null, expires_at, revoked_at })),
    openapi_url: appUrl() ? `${appUrl()}/api/assistant/openapi.json` : null,
    mcp_url: appUrl() ? `${appUrl()}/api/mcp` : null,
    notice: { current_version: NOTICE_VERSION, accepted_version: last?.notice_version ?? null, accepted_at: last?.created_at ?? null },
  })
}))

// Um único gesto ("Autorizo e criar minha chave"): grava a autorização com a versão do aviso e cria a
// chave na mesma requisição. Sem a versão atual do aviso, nada é criado.
router.post('/api/assistant/tokens', ...screen, asyncRoute(async (req, res) => {
  const body = req.body || {}
  if (body.notice_version !== NOTICE_VERSION) {
    return res.status(400).json({ error: 'Leia e autorize o aviso atual antes de criar a chave.', notice_version: NOTICE_VERSION })
  }
  const name = String(body.name ?? '').trim() || 'ChatGPT'
  if (name.length > 60) return res.status(400).json({ error: 'Nome passa de 60 caracteres' })
  const days = body.expires_days ?? DEFAULT_TOKEN_DAYS
  if (!(Number.isInteger(days) && days >= 1 && days <= 730)) {
    return res.status(400).json({ error: 'Validade deve ser entre 1 e 730 dias' })
  }
  const workspaceId = workspaceOf(req)
  // O login vale 7 dias: confere no banco se a pessoa ainda é gestora ativa.
  const { data: me } = await supabase
    .from('fourbase_users').select('*').eq('id', req.user.id).eq('workspace_id', workspaceId).maybeSingle()
  if (!isActiveGestor(me)) return res.status(403).json({ error: 'Só gestores podem conectar o Assistente.' })

  const { data: mine, error: e1 } = await supabase
    .from('fourbase_api_tokens').select('*').eq('user_id', req.user.id).eq('workspace_id', workspaceId)
  if (e1) throw e1
  const now = Date.now()
  let replaced = null
  if (body.replaces != null) {
    replaced = isUuid(body.replaces) ? (mine || []).find((t) => t.id === body.replaces) : null
    if (!replaced) return res.status(404).json({ error: 'Conexão não encontrada' })
  }
  const active = (mine || []).filter((t) => (t.kind || 'personal') === 'personal' && isLive(t, now) && t.id !== replaced?.id)
  if (active.length >= MAX_ACTIVE_TOKENS) {
    return res.status(400).json({ error: `Você já tem ${MAX_ACTIVE_TOKENS} conexões ativas. Desligue uma que não usa e tente de novo.` })
  }

  if (replaced && !replaced.revoked_at) {
    const { error } = await supabase.from('fourbase_api_tokens')
      .update({ revoked_at: new Date(now).toISOString() }).eq('id', replaced.id).eq('user_id', req.user.id)
    if (error) throw error
    await recordConsent({ workspace_id: workspaceId, user_id: req.user.id, token_id: replaced.id, event: 'disconnected', reason: 'replaced' })
  }

  const token = generateToken()
  const { data, error } = await supabase
    .from('fourbase_api_tokens')
    .insert({
      workspace_id: workspaceId, user_id: req.user.id, kind: 'personal', name,
      token_hash: hashToken(token), prefix: tokenPrefixOf(token), scopes: SCOPES,
      expires_at: new Date(now + days * 86400000).toISOString(),
    })
    .select().single()
  if (error) throw error
  await recordConsent({ workspace_id: workspaceId, user_id: req.user.id, token_id: data.id, event: 'authorized', notice_version: NOTICE_VERSION })
  // a chave completa aparece SÓ nesta resposta; no banco fica apenas o hash
  res.status(201).json({ id: data.id, name: data.name, prefix: data.prefix, expires_at: data.expires_at, created_at: data.created_at, token })
}))

router.delete('/api/assistant/tokens/:id', ...screen, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Registro não encontrado' })
  const workspaceId = workspaceOf(req)
  const { data, error } = await supabase
    .from('fourbase_api_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('user_id', req.user.id).eq('workspace_id', workspaceId)
    .select()
  if (error) throw error
  if (!data?.length) return res.status(404).json({ error: 'Registro não encontrado' })
  await recordConsent({ workspace_id: workspaceId, user_id: req.user.id, token_id: req.params.id, event: 'disconnected', reason: 'user' })
  res.status(204).end()
}))

// ---------- Porta da tela: histórico e desfazer com prévia (JWT, só gestor) ----------
router.get('/api/assistant/app/batches', ...screen, asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50)
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null
  const workspaceId = workspaceOf(req)
  const { page, tasks, hasMore } = await listBatches(req.user.id, workspaceId, { limit, before })
  const { data: tokens } = await supabase.from('fourbase_api_tokens').select('id, name')
    .eq('user_id', req.user.id).eq('workspace_id', workspaceId)
  const names = new Map((tokens || []).map((t) => [t.id, t.name]))
  res.json({
    batches: page.map((b) => ({
      ...toBatchView(b, tasks),
      connection: b.token_id ? { id: b.token_id, name: names.get(b.token_id) ?? null } : null,
    })),
    next_before: hasMore ? page[page.length - 1].created_at : null,
  })
}))

router.get('/api/assistant/app/batches/:batchId/undo-plan', ...screen, asyncRoute(async (req, res) => {
  const workspaceId = workspaceOf(req)
  const batch = await loadBatch(req.user.id, workspaceId, req.params.batchId)
  if (!batch) return res.status(404).json({ error: 'Pedido não encontrado' })
  const plan = await planFor(batch, req.user.id, workspaceId, null)
  if (plan.expired) return res.status(400).json({ error: 'Só dá para desfazer pedidos das últimas 48 horas.' })
  if (plan.already_undone) return res.json({ already_undone: true, remove: [], keep: [], gone: 0 })
  res.json({ remove: plan.remove, keep: plan.keep, gone: plan.gone, undo_until: undoDeadline(batch) })
}))

router.post('/api/assistant/app/batches/:batchId/undo', ...screen, asyncRoute(async (req, res) => {
  const onlyIds = req.body?.only_ids
  if (!Array.isArray(onlyIds) || !onlyIds.every(isUuid)) {
    return res.status(400).json({ error: 'Envie only_ids: a lista de tarefas que serão removidas' })
  }
  const workspaceId = workspaceOf(req)
  const batch = await loadBatch(req.user.id, workspaceId, req.params.batchId)
  if (!batch) return res.status(404).json({ error: 'Pedido não encontrado' })
  const r = await undoBatch(batch, req.user.id, workspaceId, onlyIds)
  res.status(r.status).json(r.body)
}))

// ---------- Porta do GPT: autenticação por chave ----------
// Contra força bruta de chaves: conta só chaves inválidas (401), por IP. Um IP que passou do limite
// recebe 429 nas tentativas inválidas, mas uma chave VÁLIDA sempre passa — as chamadas do ChatGPT saem
// de IPs da OpenAI compartilhados, e alguém chutando chaves por lá não pode bloquear o dono. Erros de
// validação (400) também não contam: o ChatGPT erra e corrige várias vezes numa conversa.
// (Em memória: aproximado na Vercel, onde cada instância tem o seu.)
const FAIL_WINDOW_MS = 15 * 60 * 1000
const FAIL_LIMIT = 30
const failures = new Map() // ip -> { start, count }
const failureCount = (ip) => {
  const f = failures.get(ip)
  return f && Date.now() - f.start < FAIL_WINDOW_MS ? f.count : 0
}
function recordFailure(ip) {
  const now = Date.now()
  if (failures.size > 10000) for (const [k, v] of failures) if (now - v.start >= FAIL_WINDOW_MS) failures.delete(k)
  const f = failures.get(ip)
  if (!f || now - f.start >= FAIL_WINDOW_MS) failures.set(ip, { start: now, count: 1 })
  else f.count += 1
}
const deny = (req, res, status, error, why = 'negado') => {
  logOAuth('acesso_negado', { status, motivo: why, rota: req.path })
  if (status === 401) {
    if (req.wwwAuthenticate) res.set('WWW-Authenticate', req.wwwAuthenticate)
    if (failureCount(req.ip) >= FAIL_LIMIT) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
    recordFailure(req.ip)
  }
  return res.status(status).json({ error })
}

// 401 de um token que EXISTE (expirado, desligado, dono sem acesso): não é chute de chave, então não conta no
// limite por IP. O ChatGPT renova o token de acesso a cada hora; se isso contasse, vários usuários atrás do
// mesmo IP da OpenAI poderiam travar a própria renovação.
const reject = (req, res, error, why = 'rejeitado') => {
  logOAuth('acesso_negado', { status: 401, motivo: why, rota: req.path })
  if (req.wwwAuthenticate) res.set('WWW-Authenticate', req.wwwAuthenticate)
  return res.status(401).json({ error })
}

const usage = new Map() // tokenId -> { windowStart, count } (em memória; aproximado na Vercel)
const USAGE_LIMIT = 120
function overUsage(tokenId) {
  const now = Date.now()
  const u = usage.get(tokenId)
  if (!u || now - u.windowStart > 60000) { usage.set(tokenId, { windowStart: now, count: 1 }); return false }
  u.count += 1
  return u.count > USAGE_LIMIT
}

const OFF = 'Conexão desligada ou chave inválida. No fourbase, abra Assistente para conectar de novo.'
const assistantAuth = (scope) => (req, res, next) => authenticate(scope, req, res, next).catch((err) => {
  console.error(err)
  res.status(500).json({ error: 'Erro interno' })
})
const authenticate = async (scope, req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!isTokenShape(token)) return deny(req, res, 401, OFF, token ? 'formato_do_token' : 'sem_token')
  const { data: row, error } = await supabase
    .from('fourbase_api_tokens').select('*').eq('token_hash', hashToken(token)).maybeSingle()
  if (error) throw error
  if (!row) return deny(req, res, 401, OFF, 'token_desconhecido') // desconhecido: pode ser chute, conta no limite
  if (!isLive(row)) return reject(req, res, OFF, 'conexao_desligada_ou_vencida')
  // token de acesso do OAuth vale 1 hora; a renovação (token de renovação) emite outro
  if (row.kind === 'oauth' && !(row.access_expires_at && Date.parse(row.access_expires_at) > Date.now())) return reject(req, res, OFF, 'token_de_acesso_vencido')
  if ((row.kind === 'oauth') !== token.startsWith('fbo_')) return deny(req, res, 401, OFF, 'tipo_do_token')
  if (!Array.isArray(row.scopes) || !row.scopes.includes(scope)) return deny(req, res, 403, 'Esta conexão não tem permissão para isso.', 'sem_escopo')
  // Papel e status lidos do banco a cada chamada: quem deixou de ser gestor (ou foi desativado) perde o acesso.
  const { data: user } = await supabase
    .from('fourbase_users').select('*').eq('id', row.user_id).eq('workspace_id', row.workspace_id).maybeSingle()
  if (!isActiveGestor(user)) return reject(req, res, OFF, 'usuario_sem_acesso')
  if (!assistantEnabledForUser(user)) return res.status(403).json({ error: NOT_ENABLED })
  if (overUsage(row.id)) return res.status(429).json({ error: 'Muitas chamadas. Aguarde um minuto.' })
  req.user = { id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id }
  req.apiToken = row
  req.activity = { op: 'outro' }
  // Último uso + metadados da chamada (nunca título/descrição), gravados depois de responder.
  res.on('finish', () => {
    if (res.statusCode >= 500) return
    runInBackground(supabase.from('fourbase_api_tokens')
      .update({ last_used_at: new Date().toISOString(), last_activity: req.activity }).eq('id', row.id))
  })
  next()
}
export { assistantAuth }
const readAuth = assistantAuth('agenda:read')
const writeAuth = assistantAuth('agenda:write')

// ---------- Contrato (público: não contém dado nenhum) ----------
// O endereço vem só de APP_URL — nunca do Host da requisição, que quem chama controla.
router.get('/api/assistant/openapi.json', (req, res) => {
  if (!appUrl()) return res.status(503).json({ error: 'Configuração indisponível' })
  res.json(buildOpenApi(appUrl()))
})

// ---------- Porta do GPT (REST): finas camadas sobre as operações do serviço ----------
// req.activity → metadados do último uso (gravados depois da resposta, ver assistantAuth)
const ctxOf = (req) => ({ user: req.user, token: req.apiToken })
const run = (op) => asyncRoute(async (req, res) => {
  const r = await op(ctxOf(req), req)
  req.activity = r.activity
  res.status(r.status).json(r.body)
})

router.get('/api/assistant/me', readAuth, run((ctx) => opMe(ctx)))
router.get('/api/assistant/clients', readAuth, run((ctx) => opClients(ctx)))
router.get('/api/assistant/agenda', readAuth, run((ctx, req) => opAgenda(ctx, { from: req.query.from, to: req.query.to })))
router.get('/api/assistant/batches', readAuth, run((ctx, req) => opBatches(ctx, { limit: req.query.limit })))
router.post('/api/assistant/tasks/preview', writeAuth, run((ctx, req) => opPreview(ctx, req.body)))
router.post('/api/assistant/tasks', writeAuth, run((ctx, req) => opCreate(ctx, req.body)))
router.post('/api/assistant/batches/:batchId/undo', writeAuth, run((ctx, req) => opUndo(ctx, req.params.batchId)))
