import { Router } from 'express'
import { supabase } from '../supabase.js'
import { asyncRoute } from '../http.js'
import { auth, gestorOnly, workspaceOf } from '../auth.js'
import { isUuid } from '../validation.js'
import { resolveColumnKey } from '../columnKeys.js'
import {
  ASSISTANT_TAG, MAX_ACTIVE_TOKENS, MAX_AGENDA_DAYS, MAX_AGENDA_ITEMS, MAX_BATCH, SCOPES, UNDO_WINDOW_MS,
  buildOpenApi, daysBetween, findConflicts, findDuplicates, generateToken, hashToken, hhmm, isDate, isTokenShape,
  isValidBatchId, normalizeTaskInput, tokenPrefixOf,
} from '../assistant.js'

// Assistente (ChatGPT): o gestor gera um token pessoal (Meu Perfil) e o ChatGPT usa as rotas
// /api/assistant/* com ele. O token só funciona AQUI (nunca nas rotas normais) e o JWT normal não
// abre as rotas de dados do assistente. Tudo é do próprio dono do token: ver a própria agenda,
// criar tarefas para si. Não existe editar nem apagar tarefas existentes — só desfazer o último lote.
const router = Router()
export default router

const todayIso = () => new Date().toISOString().slice(0, 10)

// ---------- Gestão dos tokens (JWT normal, só gestor) ----------
router.post('/api/assistant/tokens', auth, gestorOnly, asyncRoute(async (req, res) => {
  const name = String(req.body?.name ?? '').trim() || 'ChatGPT'
  if (name.length > 60) return res.status(400).json({ error: 'Nome passa de 60 caracteres' })
  const days = req.body?.expires_days
  if (days != null && !(Number.isInteger(days) && days >= 1 && days <= 730)) {
    return res.status(400).json({ error: 'Validade deve ser entre 1 e 730 dias' })
  }
  const { data: mine, error: e1 } = await supabase
    .from('fourbase_api_tokens').select('id, revoked_at, expires_at').eq('user_id', req.user.id)
  if (e1) throw e1
  const now = Date.now()
  const active = (mine || []).filter((t) => !t.revoked_at && !(t.expires_at && Date.parse(t.expires_at) <= now))
  if (active.length >= MAX_ACTIVE_TOKENS) {
    return res.status(400).json({ error: `Limite de ${MAX_ACTIVE_TOKENS} tokens ativos. Revogue algum antes de criar outro.` })
  }
  const token = generateToken()
  const { data, error } = await supabase
    .from('fourbase_api_tokens')
    .insert({
      workspace_id: workspaceOf(req), user_id: req.user.id, name,
      token_hash: hashToken(token), prefix: tokenPrefixOf(token), scopes: SCOPES,
      expires_at: days ? new Date(now + days * 86400000).toISOString() : null,
    })
    .select().single()
  if (error) throw error
  // o token completo aparece SÓ nesta resposta; no banco fica apenas o hash
  res.status(201).json({ id: data.id, name: data.name, prefix: data.prefix, expires_at: data.expires_at, created_at: data.created_at, token })
}))

router.get('/api/assistant/tokens', auth, gestorOnly, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('fourbase_api_tokens').select('*')
    .eq('user_id', req.user.id).eq('workspace_id', workspaceOf(req))
    .order('created_at', { ascending: false })
  if (error) throw error
  res.json((data || []).map(({ id, name, prefix, last_used_at, revoked_at, expires_at, created_at }) =>
    ({ id, name, prefix, last_used_at, revoked_at, expires_at, created_at })))
}))

router.delete('/api/assistant/tokens/:id', auth, gestorOnly, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Registro não encontrado' })
  const { data, error } = await supabase
    .from('fourbase_api_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('user_id', req.user.id).eq('workspace_id', workspaceOf(req))
    .select()
  if (error) throw error
  if (!data?.length) return res.status(404).json({ error: 'Registro não encontrado' })
  res.status(204).end()
}))

// ---------- Autenticação por token ----------
// Contra força bruta de tokens: conta só tokens inválidos (401), por IP. Um IP que passou do limite
// recebe 429 nas tentativas inválidas, mas um token VÁLIDO sempre passa — as chamadas do ChatGPT saem
// de IPs da OpenAI compartilhados, e alguém chutando tokens por lá não pode bloquear o dono. Erros de
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

const assistantAuth = (scope) => (req, res, next) => authenticate(scope, req, res, next).catch((err) => {
  console.error(err)
  res.status(500).json({ error: 'Erro interno' })
})
const authenticate = async (scope, req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!isTokenShape(token)) return deny(req, res, 401, 'Token inválido')
  const { data: row, error } = await supabase
    .from('fourbase_api_tokens').select('*').eq('token_hash', hashToken(token)).maybeSingle()
  if (error) throw error
  const expired = row?.expires_at && Date.parse(row.expires_at) <= Date.now()
  if (!row || row.revoked_at || expired) return deny(req, res, 401, 'Token inválido ou revogado')
  if (!Array.isArray(row.scopes) || !row.scopes.includes(scope)) return deny(req, res, 403, 'Token sem permissão para isto')
  const { data: user } = await supabase
    .from('fourbase_users').select('*').eq('id', row.user_id).eq('workspace_id', row.workspace_id).maybeSingle()
  if (!user || user.status === 'inactive') return deny(req, res, 401, 'Token inválido ou revogado')
  if (overUsage(row.id)) return res.status(429).json({ error: 'Muitas chamadas. Aguarde um minuto.' })
  req.user = { id: user.id, name: user.name, role: user.role, workspace_id: user.workspace_id }
  req.apiToken = row
  // melhor esforço: não atrasa nem derruba a chamada
  supabase.from('fourbase_api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(() => {}, () => {})
  next()
}
const readAuth = assistantAuth('agenda:read')
const writeAuth = assistantAuth('agenda:write')

// ---------- Contrato (público: não contém dado nenhum) ----------
router.get('/api/assistant/openapi.json', (req, res) => {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`
  res.json(buildOpenApi(base.replace(/\/$/, '')))
})

// ---------- Leitura ----------
const taskView = (t, labels = {}) => ({
  id: t.id, title: t.title, description: t.description || '', priority: t.priority,
  due_date: t.due_date, due_date_end: t.due_date_end, due_time: hhmm(t.due_time), due_time_end: hhmm(t.due_time_end),
  status: labels[t.column_key] || t.column_key, client_id: t.client_id, tags: t.tags || [],
})

async function myTasks(req) {
  const { data, error } = await supabase
    .from('fourbase_tasks').select('*')
    .eq('workspace_id', workspaceOf(req)).eq('assigned_to', req.user.id)
  if (error) throw error
  return data || []
}

router.get('/api/assistant/clients', readAuth, asyncRoute(async (req, res) => {
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
  res.json({
    from, to, total: items.length, truncated: items.length > MAX_AGENDA_ITEMS,
    tasks: items.slice(0, MAX_AGENDA_ITEMS).map((t) => taskView(t, labels)),
  })
}))

// ---------- Criação em lote ----------
// Valida o lote inteiro (tudo ou nada) e calcula conflitos/duplicatas.
async function prepareBatch(req) {
  const { tasks } = req.body || {}
  if (!Array.isArray(tasks) || !tasks.length) return { status: 400, error: 'Envie uma lista "tasks" com pelo menos uma tarefa' }
  if (tasks.length > MAX_BATCH) return { status: 400, error: `Máximo de ${MAX_BATCH} tarefas por lote` }
  const { data: clients } = await supabase.from('fourbase_clients').select('id, name').eq('workspace_id', workspaceOf(req))
  const today = todayIso()
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
  if (p.error) return res.status(p.status).json({ error: p.error, details: p.details })
  res.json({ ok: true, count: p.tasks.length, tasks: p.tasks, conflicts: p.conflicts, duplicates: p.duplicates })
}))

async function ensureAssistantTag(workspaceId) {
  const { data } = await supabase.from('fourbase_tags').select('id').eq('workspace_id', workspaceId).eq('name', ASSISTANT_TAG.name).maybeSingle()
  if (data) return
  const { error } = await supabase.from('fourbase_tags').insert({ ...ASSISTANT_TAG, workspace_id: workspaceId })
  if (error && error.code !== '23505') console.error('tag ChatGPT:', error.message)
}

async function loadBatch(userId, batchId) {
  const { data } = await supabase.from('fourbase_assistant_batches').select('*').eq('user_id', userId).eq('batch_id', batchId).maybeSingle()
  return data
}

router.post('/api/assistant/tasks', writeAuth, asyncRoute(async (req, res) => {
  const batchId = req.body?.batch_id
  if (!isValidBatchId(batchId)) return res.status(400).json({ error: 'batch_id obrigatório (8 a 80 caracteres: letras, números, _ . : -)' })
  const workspaceId = workspaceOf(req)

  // Mesmo lote de novo = não cria nada; devolve o que já existe.
  const prior = await loadBatch(req.user.id, batchId)
  if (prior) {
    if (prior.undone_at) return res.status(409).json({ error: 'Este lote foi desfeito. Use um batch_id novo para criar de novo.' })
    const { data } = await supabase.from('fourbase_tasks').select('*').in('id', prior.task_ids || []).eq('workspace_id', workspaceId)
    return res.status(200).json({ already_created: true, batch_id: batchId, count: (data || []).length, tasks: (data || []).map((t) => taskView(t)) })
  }

  const p = await prepareBatch(req)
  if (p.error) return res.status(p.status).json({ error: p.error, details: p.details })

  // Reserva o lote primeiro: a chave única (user_id, batch_id) barra a corrida de duas chamadas iguais.
  const { data: claimed, error: claimErr } = await supabase
    .from('fourbase_assistant_batches')
    .insert({ workspace_id: workspaceId, user_id: req.user.id, batch_id: batchId, task_ids: [] })
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
    const { error: upErr } = await supabase
      .from('fourbase_assistant_batches').update({ task_ids: created.map((t) => t.id) }).eq('id', claimed.id)
    if (upErr) throw upErr
    res.status(201).json({
      batch_id: batchId, count: created.length, conflicts: p.conflicts, duplicates: p.duplicates,
      tasks: created.map((t) => ({ ...taskView(t), link: process.env.APP_URL ? `${process.env.APP_URL}/painel?tarefa=${t.id}` : null })),
    })
  } catch (err) {
    // não deixa um lote "fantasma" travando o batch_id
    await supabase.from('fourbase_assistant_batches').delete().eq('id', claimed.id)
    throw err
  }
}))

router.post('/api/assistant/batches/:batchId/undo', writeAuth, asyncRoute(async (req, res) => {
  const batch = isValidBatchId(req.params.batchId) ? await loadBatch(req.user.id, req.params.batchId) : null
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado' })
  if (batch.undone_at) return res.status(200).json({ undone: 0, already_undone: true })
  if (Date.now() - Date.parse(batch.created_at) > UNDO_WINDOW_MS) {
    return res.status(400).json({ error: 'Só dá para desfazer lotes das últimas 48 horas' })
  }
  // Só apaga o que ainda é do dono: se o gestor reatribuiu uma tarefa do lote a outra pessoa, ela fica.
  const ids = batch.task_ids || []
  let mine = []
  if (ids.length) {
    const { data, error } = await supabase
      .from('fourbase_tasks').select('id')
      .in('id', ids).eq('workspace_id', workspaceOf(req)).eq('assigned_to', req.user.id)
    if (error) throw error
    mine = (data || []).map((t) => t.id)
  }
  if (mine.length) {
    const { error } = await supabase
      .from('fourbase_tasks').delete()
      .in('id', mine).eq('workspace_id', workspaceOf(req)).eq('assigned_to', req.user.id)
    if (error) throw error
  }
  const { error: e2 } = await supabase
    .from('fourbase_assistant_batches').update({ undone_at: new Date().toISOString() }).eq('id', batch.id)
  if (e2) throw e2
  res.json({ undone: mine.length, kept: ids.length - mine.length })
}))
