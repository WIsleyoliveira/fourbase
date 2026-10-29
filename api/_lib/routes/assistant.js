import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { isUuid } from '../validation.js'
import { resolveColumnKey, workspaceColumnKeys } from '../columnKeys.js'
import { runInBackground } from '../mailer.js'
import {
  ASSISTANT_TAG, DEFAULT_TOKEN_DAYS, MAX_ACTIVE_TOKENS, MAX_AGENDA_DAYS, MAX_AGENDA_ITEMS, MAX_BATCH,
  NOTICE_VERSION, SCOPES, TIMEZONE, UNDO_WINDOW_MS,
  assistantEnabledForUser, batchItemOf, buildOpenApi, daysBetween, findConflicts, findDuplicates, generateToken, hashToken, hhmm, isDate,
  isTokenShape, isValidBatchId, normalizeTaskInput, planUndo, toBatchView, todayIn, tokenPrefixOf, undoDeadline,
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

const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '')
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

// ---------- Lotes: serviço único das duas portas ----------
async function loadBatch(userId, workspaceId, batchId) {
  if (!isValidBatchId(batchId)) return null
  const { data } = await supabase.from('fourbase_assistant_batches').select('*')
    .eq('user_id', userId).eq('workspace_id', workspaceId).eq('batch_id', batchId).maybeSingle()
  return data
}

const batchTaskIds = (b) => (Array.isArray(b.items) && b.items.length ? b.items.map((i) => i.id) : b.task_ids || [])

async function tasksByIds(ids, workspaceId) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('fourbase_tasks').select('*').in('id', ids).eq('workspace_id', workspaceId)
  if (error) throw error
  return data || []
}

async function listBatches(userId, workspaceId, { limit, before } = {}) {
  const { data, error } = await supabase.from('fourbase_assistant_batches').select('*')
    .eq('user_id', userId).eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const all = (data || []).filter((b) => !before || b.created_at < before)
  const page = all.slice(0, limit)
  const tasks = await tasksByIds([...new Set(page.flatMap(batchTaskIds))], workspaceId)
  return { page, tasks, hasMore: all.length > page.length }
}

async function firstColumnOf(workspaceId) {
  const keys = await workspaceColumnKeys(workspaceId)
  return keys.find((k) => k !== 'done') || null
}

async function planFor(batch, userId, workspaceId, onlyIds) {
  const current = await tasksByIds(batchTaskIds(batch), workspaceId)
  return planUndo(batch, current, { userId, firstColumn: await firstColumnOf(workspaceId), onlyIds })
}

// Executa o desfazer. Só remove o que o plano diz (inalteradas, do dono, dentro de onlyIds) e grava o resultado.
async function undoBatch(batch, userId, workspaceId, onlyIds = null) {
  const plan = await planFor(batch, userId, workspaceId, onlyIds)
  if (plan.already_undone) return { status: 200, body: { undone: 0, removed: [], kept: [], gone: 0, already_undone: true } }
  if (plan.expired) return { status: 400, body: { error: 'Só dá para desfazer pedidos das últimas 48 horas.' } }
  const ids = plan.remove.map((t) => t.id)
  if (ids.length) {
    const { error } = await supabase.from('fourbase_tasks').delete()
      .in('id', ids).eq('workspace_id', workspaceId).eq('assigned_to', userId)
    if (error) throw error
  }
  const result = new Map([...plan.remove.map((t) => [t.id, 'removed']), ...plan.keep.map((t) => [t.id, `kept_${t.reason}`])])
  const items = (Array.isArray(batch.items) ? batch.items : []).map((i) => ({ ...i, result: result.get(i.id) || 'gone' }))
  const { error: e2 } = await supabase.from('fourbase_assistant_batches')
    .update({ undone_at: new Date().toISOString(), items }).eq('id', batch.id)
  if (e2) throw e2
  return {
    status: 200,
    body: {
      undone: ids.length,
      removed: plan.remove.map(({ id, title }) => ({ id, title })),
      kept: plan.keep.map(({ id, title, reason }) => ({ id, title, reason })),
      gone: plan.gone,
    },
  }
}

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
const deny = (req, res, status, error) => {
  if (status === 401) {
    if (failureCount(req.ip) >= FAIL_LIMIT) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
    recordFailure(req.ip)
  }
  return res.status(status).json({ error })
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
  if (!isTokenShape(token)) return deny(req, res, 401, OFF)
  const { data: row, error } = await supabase
    .from('fourbase_api_tokens').select('*').eq('token_hash', hashToken(token)).maybeSingle()
  if (error) throw error
  if (!row || !isLive(row)) return deny(req, res, 401, OFF)
  if (!Array.isArray(row.scopes) || !row.scopes.includes(scope)) return deny(req, res, 403, 'Esta conexão não tem permissão para isso.')
  // Papel e status lidos do banco a cada chamada: quem deixou de ser gestor (ou foi desativado) perde o acesso.
  const { data: user } = await supabase
    .from('fourbase_users').select('*').eq('id', row.user_id).eq('workspace_id', row.workspace_id).maybeSingle()
  if (!isActiveGestor(user)) return deny(req, res, 401, OFF)
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
const readAuth = assistantAuth('agenda:read')
const writeAuth = assistantAuth('agenda:write')

// ---------- Contrato (público: não contém dado nenhum) ----------
// O endereço vem só de APP_URL — nunca do Host da requisição, que quem chama controla.
router.get('/api/assistant/openapi.json', (req, res) => {
  if (!appUrl()) return res.status(503).json({ error: 'Configuração indisponível' })
  res.json(buildOpenApi(appUrl()))
})

// ---------- Porta do GPT: leitura ----------
const taskView = (t, labels = {}) => ({
  id: t.id, title: t.title, description: t.description || '', priority: t.priority,
  due_date: t.due_date, due_date_end: t.due_date_end, due_time: hhmm(t.due_time), due_time_end: hhmm(t.due_time_end),
  status: labels[t.column_key] || t.column_key, client_id: t.client_id, tags: t.tags || [],
})
const clock = () => ({ today: todayIn(), timezone: TIMEZONE })

async function myTasks(req) {
  const { data, error } = await supabase
    .from('fourbase_tasks').select('*')
    .eq('workspace_id', workspaceOf(req)).eq('assigned_to', req.user.id)
  if (error) throw error
  return data || []
}

router.get('/api/assistant/me', readAuth, asyncRoute(async (req, res) => {
  req.activity = { op: 'verificarConexao' }
  const { data: ws } = await supabase.from('weflow_workspaces').select('name').eq('id', workspaceOf(req)).maybeSingle()
  res.json({
    user_name: req.user.name, workspace_name: ws?.name ?? null, connection_name: req.apiToken.name,
    ...clock(), scopes: req.apiToken.scopes,
    limits: { max_batch: MAX_BATCH, undo_hours: UNDO_WINDOW_MS / 3600000, max_agenda_days: MAX_AGENDA_DAYS },
  })
}))

router.get('/api/assistant/clients', readAuth, asyncRoute(async (req, res) => {
  req.activity = { op: 'listarClientes' }
  const { data, error } = await supabase
    .from('fourbase_clients').select('id, name').eq('workspace_id', workspaceOf(req)).order('name', { ascending: true })
  if (error) throw error
  res.json(data || [])
}))

router.get('/api/assistant/agenda', readAuth, asyncRoute(async (req, res) => {
  const { from, to } = req.query
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'Informe from e to no formato AAAA-MM-DD' })
  if (to < from) return res.status(400).json({ error: 'to não pode ser antes de from' })
  if (daysBetween(from, to) + 1 > MAX_AGENDA_DAYS) return res.status(400).json({ error: `Período máximo de ${MAX_AGENDA_DAYS} dias` })
  const { data: cols } = await supabase.from('fourbase_columns').select('key, label').eq('workspace_id', workspaceOf(req))
  const labels = Object.fromEntries((cols || []).map((c) => [c.key, c.label]))
  const items = (await myTasks(req))
    .filter((t) => t.due_date && t.due_date <= to && (t.due_date_end || t.due_date) >= from)
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))
  req.activity = { op: 'verAgenda', from, to, count: items.length }
  res.json({
    from, to, ...clock(), total: items.length, truncated: items.length > MAX_AGENDA_ITEMS,
    tasks: items.slice(0, MAX_AGENDA_ITEMS).map((t) => taskView(t, labels)),
  })
}))

router.get('/api/assistant/batches', readAuth, asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 20)
  const { page, tasks } = await listBatches(req.user.id, workspaceOf(req), { limit })
  req.activity = { op: 'listarLotes', count: page.length }
  res.json({ ...clock(), batches: page.map((b) => toBatchView(b, tasks)) })
}))

// ---------- Porta do GPT: criação em lote ----------
// Valida o lote inteiro (tudo ou nada) e calcula conflitos/duplicatas.
async function prepareBatch(req) {
  const { tasks } = req.body || {}
  if (!Array.isArray(tasks) || !tasks.length) return { status: 400, error: 'Envie uma lista "tasks" com pelo menos uma tarefa' }
  if (tasks.length > MAX_BATCH) return { status: 400, error: `Máximo de ${MAX_BATCH} tarefas por lote` }
  const { data: clients } = await supabase.from('fourbase_clients').select('id, name').eq('workspace_id', workspaceOf(req))
  const today = todayIn()
  const normalized = []
  const errors = []
  tasks.forEach((item, index) => {
    const r = normalizeTaskInput(item, { clients: clients || [], today })
    if (r.errors) errors.push({ index, title: item?.title ?? null, errors: r.errors })
    else normalized.push(r.task)
  })
  if (errors.length) return { status: 400, error: 'Há tarefas inválidas; nada foi criado', details: errors }
  const existing = await myTasks(req)
  return { tasks: normalized, conflicts: findConflicts(normalized, existing), duplicates: findDuplicates(normalized, existing) }
}

router.post('/api/assistant/tasks/preview', writeAuth, asyncRoute(async (req, res) => {
  const p = await prepareBatch(req)
  req.activity = { op: 'prever', count: p.tasks?.length ?? 0 }
  if (p.error) return res.status(p.status).json({ error: p.error, details: p.details })
  res.json({ ok: true, ...clock(), count: p.tasks.length, tasks: p.tasks, conflicts: p.conflicts, duplicates: p.duplicates })
}))

async function ensureAssistantTag(workspaceId) {
  const { data } = await supabase.from('fourbase_tags').select('id').eq('workspace_id', workspaceId).eq('name', ASSISTANT_TAG.name).maybeSingle()
  if (data) return
  const { error } = await supabase.from('fourbase_tags').insert({ ...ASSISTANT_TAG, workspace_id: workspaceId })
  if (error && error.code !== '23505') console.error('tag ChatGPT:', error.message)
}

router.post('/api/assistant/tasks', writeAuth, asyncRoute(async (req, res) => {
  const batchId = req.body?.batch_id
  if (!isValidBatchId(batchId)) return res.status(400).json({ error: 'batch_id obrigatório (8 a 80 caracteres: letras, números, _ . : -)' })
  const workspaceId = workspaceOf(req)
  req.activity = { op: 'criarTarefas' }

  // Mesmo lote de novo = não cria nada; devolve o que já existe.
  const prior = await loadBatch(req.user.id, workspaceId, batchId)
  if (prior) {
    if (prior.undone_at) return res.status(409).json({ error: 'Este lote foi desfeito. Use um batch_id novo para criar de novo.' })
    const existing = await tasksByIds(batchTaskIds(prior), workspaceId)
    return res.status(200).json({ already_created: true, batch_id: batchId, count: existing.length, undo_until: undoDeadline(prior), tasks: existing.map((t) => taskView(t)) })
  }

  const p = await prepareBatch(req)
  if (p.error) return res.status(p.status).json({ error: p.error, details: p.details })

  // Reserva o lote primeiro: a chave única (user_id, batch_id) barra a corrida de duas chamadas iguais.
  const { data: claimed, error: claimErr } = await supabase
    .from('fourbase_assistant_batches')
    .insert({ workspace_id: workspaceId, user_id: req.user.id, token_id: req.apiToken.id, batch_id: batchId, task_ids: [], items: [] })
    .select().single()
  if (claimErr) {
    if (claimErr.code === '23505') return res.status(409).json({ error: 'Este lote já está sendo processado. Consulte a agenda.' })
    throw claimErr
  }

  try {
    await ensureAssistantTag(workspaceId)
    const column_key = await resolveColumnKey(workspaceId, undefined)
    const { data: created, error } = await supabase
      .from('fourbase_tasks')
      .insert(p.tasks.map((t) => ({
        workspace_id: workspaceId, ...t, column_key, user_id: req.user.id, assigned_to: req.user.id,
        tags: [ASSISTANT_TAG.name], attachments: [], mentioned_users: [],
      })))
      .select()
    if (error) throw error
    // retrato tirado da linha que o banco devolveu (defaults incluídos): é o que o desfazer compara
    const { error: upErr } = await supabase
      .from('fourbase_assistant_batches')
      .update({ task_ids: created.map((t) => t.id), items: created.map(batchItemOf) })
      .eq('id', claimed.id)
    if (upErr) throw upErr
    req.activity = { op: 'criarTarefas', count: created.length }
    res.status(201).json({
      batch_id: batchId, count: created.length, conflicts: p.conflicts, duplicates: p.duplicates,
      undo_until: undoDeadline(claimed),
      tasks: created.map((t) => ({ ...taskView(t), link: appUrl() ? `${appUrl()}/painel?tarefa=${t.id}` : null })),
    })
  } catch (err) {
    // não deixa um lote "fantasma" travando o batch_id
    await supabase.from('fourbase_assistant_batches').delete().eq('id', claimed.id)
    throw err
  }
}))

router.post('/api/assistant/batches/:batchId/undo', writeAuth, asyncRoute(async (req, res) => {
  req.activity = { op: 'desfazerLote' }
  const workspaceId = workspaceOf(req)
  const batch = await loadBatch(req.user.id, workspaceId, req.params.batchId)
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado' })
  const r = await undoBatch(batch, req.user.id, workspaceId)
  req.activity = { op: 'desfazerLote', count: r.body.undone ?? 0 }
  res.status(r.status).json(r.body)
}))
