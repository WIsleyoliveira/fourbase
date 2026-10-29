// Assistente (ChatGPT): chave de conexão com autorização versionada, as duas portas (GPT por chave, tela por
// JWT), agenda, lote com prévia/idempotência, histórico e desfazer seguro (impressão digital), isolamento.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { NOTICE_VERSION } from '../api/_lib/assistant.js'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()
const wsA = randomUUID()
const wsB = randomUUID()
const id = { gestorA: randomUUID(), funcA: randomUUID(), gestorB: randomUUID() }
const user = (uid, workspace_id, email, role) => ({
  id: uid, workspace_id, email, role, name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const columns = (workspace_id) => [['todo', 'A Fazer'], ['doing', 'Em andamento'], ['done', 'Concluído']]
  .map(([key, label], position) => ({ id: randomUUID(), workspace_id, key, label, position, color: '#999999', created_at: now }))
const clientA = { id: randomUUID(), workspace_id: wsA, name: 'Açaí & Cia', created_at: now }
const clientB = { id: randomUUID(), workspace_id: wsB, name: 'Outra Empresa', created_at: now }

const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'Empresa A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'Empresa B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [user(id.gestorA, wsA, 'g@a.test', 'gestor'), user(id.funcA, wsA, 'f@a.test', 'funcionario'), user(id.gestorB, wsB, 'g@b.test', 'gestor')],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [clientA, clientB], fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
  fourbase_api_tokens: [], fourbase_assistant_batches: [], fourbase_assistant_consents: [],
}

let server, base
const jwt = {}
const raw = async (method, url, { token, body } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const login = async (who, email) => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  jwt[who] = (await r.json()).token
}
const db = () => JSON.parse(fs.readFileSync(process.env.FOURBASE_DB_PATH, 'utf8'))
// muda o banco pelo mesmo cliente da API (o banco local mantém o estado em memória)
let sb
const setRow = async (table, match, values) => {
  let q = sb.from(table).update(values)
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { error } = await q
  if (error) throw new Error(error.message)
}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const newToken = (who, body = {}) => raw('POST', '/api/assistant/tokens', { token: jwt[who], body: { notice_version: NOTICE_VERSION, ...body } })
const settle = () => new Promise((r) => setTimeout(r, 60)) // last_used_at é gravado depois da resposta
let tokA, tokB

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-asst-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  process.env.APP_URL = 'https://fourbase.example'
  delete process.env.SUPABASE_URL
  process.env.ASSISTANT_WORKSPACE_IDS = '*'
  delete process.env.ASSISTANT_ENABLED
  const { default: app } = await import('../api/index.js')
  ;({ supabase: sb } = await import('../api/_lib/supabase.js'))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  await login('gestorA', 'g@a.test'); await login('funcA', 'f@a.test'); await login('gestorB', 'g@b.test')
  tokA = (await newToken('gestorA', { name: 'ChatGPT do Evandro' })).body
  tokB = (await newToken('gestorB')).body
})
after(() => server?.close())

test('chave: exige a versão atual do aviso e grava a autorização; só gestor; banco guarda só o hash', async () => {
  assert.equal((await raw('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: {} })).status, 400)
  assert.equal((await raw('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: { notice_version: 'velha' } })).status, 400)
  assert.equal((await newToken('funcA')).status, 403)
  assert.equal((await raw('POST', '/api/assistant/tokens', {})).status, 401)
  assert.match(tokA.token, /^fbk_/)
  const consent = db().fourbase_assistant_consents.find((c) => c.token_id === tokA.id)
  assert.deepEqual([consent.event, consent.notice_version, consent.user_id, consent.workspace_id], ['authorized', NOTICE_VERSION, id.gestorA, wsA])
  const list = (await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).body
  assert.equal(list.tokens.length, 1)
  assert.equal(list.tokens[0].token, undefined)
  assert.equal(list.tokens[0].token_hash, undefined)
  assert.equal(list.openapi_url, 'https://fourbase.example/api/assistant/openapi.json')
  assert.deepEqual([list.notice.current_version, list.notice.accepted_version], [NOTICE_VERSION, NOTICE_VERSION])
  assert.ok(!JSON.stringify(db().fourbase_api_tokens).includes(tokA.token))
})

test('chave vale 365 dias por padrão', async () => {
  const exp = Date.parse(tokA.expires_at) - Date.parse(tokA.created_at)
  assert.ok(Math.abs(exp - 365 * 86400000) < 60000, String(exp))
})

test('as portas não se misturam', async () => {
  assert.equal((await raw('GET', '/api/tasks', { token: tokA.token })).status, 401)
  assert.equal((await raw('GET', '/api/assistant/tokens', { token: tokA.token })).status, 401)
  assert.equal((await raw('GET', '/api/assistant/app/batches', { token: tokA.token })).status, 401)
  for (const p of ['/api/assistant/me', '/api/assistant/clients', '/api/assistant/batches', `/api/assistant/agenda?from=${day(0)}&to=${day(1)}`]) {
    assert.equal((await raw('GET', p, { token: jwt.gestorA })).status, 401, p)
  }
  assert.equal((await raw('GET', '/api/assistant/app/batches', { token: jwt.funcA })).status, 403)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: 'fbk_' + 'x'.repeat(43) })).status, 401)
})

test('verificarConexao: quem é, data de hoje no fuso de Brasília e limites; grava último uso sem conteúdo', async () => {
  const r = await raw('GET', '/api/assistant/me', { token: tokA.token })
  assert.equal(r.status, 200)
  assert.equal(r.body.workspace_name, 'Empresa A')
  assert.equal(r.body.connection_name, 'ChatGPT do Evandro')
  assert.equal(r.body.timezone, 'America/Sao_Paulo')
  assert.match(r.body.today, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(r.body.limits.max_batch, 30)
  await settle()
  const row = db().fourbase_api_tokens.find((t) => t.id === tokA.id)
  assert.ok(row.last_used_at)
  assert.deepEqual(row.last_activity, { op: 'verificarConexao' })
})

test('clientes: só os do workspace da chave', async () => {
  const r = await raw('GET', '/api/assistant/clients', { token: tokA.token })
  assert.deepEqual(r.body.map((c) => c.name), ['Açaí & Cia'])
})

test('prévia não cria nada e aponta conflito de horário e duplicata', async () => {
  const d = day(3)
  const seed = await raw('POST', '/api/tasks', { token: jwt.gestorA, body: { title: 'Reunião existente', due_date: d, due_time: '10:00', due_time_end: '11:00', assigned_to: id.gestorA } })
  assert.equal(seed.status, 201)
  const r = await raw('POST', '/api/assistant/tasks/preview', { token: tokA.token, body: { tasks: [
    { title: 'Nova', due_date: d, due_time: '10:30' },
    { title: 'reuniao EXISTENTE', due_date: d, due_time: '10:00', priority: 'media' },
    { title: 'Livre', due_date: d, due_time: '15:00' },
  ] } })
  assert.equal(r.status, 200)
  assert.equal(r.body.timezone, 'America/Sao_Paulo')
  assert.equal(r.body.conflicts.filter((c) => c.index === 0).length, 1)
  assert.equal(r.body.duplicates.length, 1)
  assert.equal(r.body.conflicts.some((c) => c.index === 2), false)
  assert.equal((await raw('GET', `/api/assistant/agenda?from=${d}&to=${d}`, { token: tokA.token })).body.total, 1)
})

test('lote: cria para o dono, etiqueta ChatGPT, cliente por nome, sem avisos; grava conexão e retrato sem conteúdo', async () => {
  const d = day(5)
  const r = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0001', tasks: [
    { title: 'Visita ao cliente', due_date: d, due_time: '09:00', due_time_end: '10:00', client_name: 'acai & cia', priority: 'Alta' },
    { title: 'Estudar proposta', due_date: d, description: 'segredo da descrição' },
  ] } })
  assert.equal(r.status, 201)
  assert.equal(r.body.count, 2)
  assert.ok(Date.parse(r.body.undo_until) > Date.now() + 47 * 3600000)
  assert.match(r.body.tasks[0].link, /^https:\/\/fourbase\.example\/painel\?tarefa=/)
  const tasks = (await raw('GET', '/api/tasks', { token: jwt.gestorA })).body.filter((t) => t.tags?.includes('ChatGPT'))
  assert.equal(tasks.length, 2)
  for (const t of tasks) { assert.equal(t.assigned_to, id.gestorA); assert.equal(t.column_key, 'todo') }
  assert.equal(tasks.find((t) => t.title === 'Visita ao cliente').client_id, clientA.id)
  assert.ok((await raw('GET', '/api/tags', { token: jwt.gestorA })).body.some((t) => t.name === 'ChatGPT'))
  assert.equal((await raw('GET', '/api/notifications', { token: jwt.gestorA })).body.items.filter((n) => n.kind === 'assignment').length, 0)
  const batch = db().fourbase_assistant_batches.find((b) => b.batch_id === 'lote-aaaa-0001')
  assert.equal(batch.token_id, tokA.id)
  assert.equal(batch.items.length, 2)
  assert.ok(batch.items.every((i) => i.id && /^[0-9a-f]{32}$/.test(i.fp)))
  assert.ok(!JSON.stringify(batch.items).includes('Visita') && !JSON.stringify(batch.items).includes('segredo'))
})

test('idempotência: repetir o batch_id não duplica', async () => {
  const r = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0001', tasks: [{ title: 'Qualquer', due_date: day(5) }] } })
  assert.equal(r.status, 200)
  assert.equal(r.body.already_created, true)
  assert.equal((await raw('GET', `/api/assistant/agenda?from=${day(5)}&to=${day(5)}`, { token: tokA.token })).body.total, 2)
})

test('lote inválido: nada é criado; limites e batch_id', async () => {
  const d = day(6)
  const bad = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0002', tasks: [
    { title: 'Boa', due_date: d }, { title: '', due_date: d }, { title: 'Data ruim', due_date: '2026-13-40' },
    { title: 'Cliente alheio', client_id: clientB.id },
  ] } })
  assert.equal(bad.status, 400)
  assert.equal(bad.body.details.length, 3)
  assert.equal((await raw('GET', `/api/assistant/agenda?from=${d}&to=${d}`, { token: tokA.token })).body.total, 0)
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0002', tasks: [{ title: 'Boa', due_date: d }] } })).status, 201)
  const many = Array.from({ length: 31 }, (_, i) => ({ title: 't' + i }))
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0003', tasks: many } })).status, 400)
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { tasks: [{ title: 'x' }] } })).status, 400)
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'curto', tasks: [{ title: 'x' }] } })).status, 400)
})

test('agenda: só tarefas do dono, com hoje e fuso; intervalo máximo; datas inválidas', async () => {
  await raw('POST', '/api/tasks', { token: jwt.funcA, body: { title: 'Da funcionária', due_date: day(5) } })
  const a = (await raw('GET', `/api/assistant/agenda?from=${day(5)}&to=${day(5)}`, { token: tokA.token })).body
  assert.ok(a.tasks.every((t) => t.title !== 'Da funcionária'))
  assert.equal(a.timezone, 'America/Sao_Paulo')
  assert.equal((await raw('GET', `/api/assistant/agenda?from=${day(0)}&to=${day(90)}`, { token: tokA.token })).status, 400)
  assert.equal((await raw('GET', '/api/assistant/agenda?from=ontem&to=hoje', { token: tokA.token })).status, 400)
})

test('histórico: a mesma visão nas duas portas; a da tela traz a conexão', async () => {
  const gpt = (await raw('GET', '/api/assistant/batches', { token: tokA.token })).body.batches
  const app = (await raw('GET', '/api/assistant/app/batches', { token: jwt.gestorA })).body
  const g = gpt.find((b) => b.batch_id === 'lote-aaaa-0001')
  const t = app.batches.find((b) => b.batch_id === 'lote-aaaa-0001')
  assert.deepEqual([g.count, g.titles.sort(), g.undo_until], [t.count, t.titles.sort(), t.undo_until])
  assert.deepEqual(g.date_range, { from: day(5), to: day(5) })
  assert.deepEqual(t.connection, { id: tokA.id, name: 'ChatGPT do Evandro' })
  assert.equal(app.batches[0].created_at >= app.batches.at(-1).created_at, true, 'mais recentes primeiro')
  const page = (await raw('GET', '/api/assistant/app/batches?limit=1', { token: jwt.gestorA })).body
  assert.equal(page.batches.length, 1)
  const next = (await raw('GET', `/api/assistant/app/batches?limit=1&before=${encodeURIComponent(page.next_before)}`, { token: jwt.gestorA })).body
  assert.notEqual(next.batches[0].batch_id, page.batches[0].batch_id)
})

test('desfazer pela tela: prévia não mexe em nada; mantém editada, movida, concluída e reatribuída; nunca passa de only_ids', async () => {
  const c = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-tela-0001', tasks: [
    { title: 'Intacta 1', due_date: day(7) }, { title: 'Intacta 2', due_date: day(7) }, { title: 'Editada', due_date: day(7) },
    { title: 'Movida', due_date: day(7) }, { title: 'Concluída', due_date: day(7) }, { title: 'Reatribuída', due_date: day(7) },
  ] } })
  const ids = Object.fromEntries(c.body.tasks.map((t) => [t.title, t.id]))
  await raw('PATCH', `/api/tasks/${ids.Editada}`, { token: jwt.gestorA, body: { description: 'alguém escreveu aqui' } })
  await raw('PATCH', `/api/tasks/${ids.Movida}`, { token: jwt.gestorA, body: { column_key: 'doing' } })
  await raw('PATCH', `/api/tasks/${ids['Concluída']}`, { token: jwt.gestorA, body: { column_key: 'done' } })
  await raw('PATCH', `/api/tasks/${ids['Reatribuída']}`, { token: jwt.gestorA, body: { assigned_to: id.funcA } })

  const before = JSON.stringify(db().fourbase_tasks)
  const plan = (await raw('GET', '/api/assistant/app/batches/lote-tela-0001/undo-plan', { token: jwt.gestorA })).body
  assert.equal(JSON.stringify(db().fourbase_tasks), before, 'a prévia não altera nada')
  assert.deepEqual(plan.remove.map((t) => t.title).sort(), ['Intacta 1', 'Intacta 2'])
  assert.deepEqual(Object.fromEntries(plan.keep.map((t) => [t.title, t.reason])), { Editada: 'edited', Movida: 'moved', 'Concluída': 'done', 'Reatribuída': 'reassigned' })

  // a pessoa só confirmou "Intacta 1": a outra intacta não pode ir junto
  const r = await raw('POST', '/api/assistant/app/batches/lote-tela-0001/undo', { token: jwt.gestorA, body: { only_ids: [ids['Intacta 1']] } })
  assert.equal(r.status, 200)
  assert.equal(r.body.undone, 1)
  const left = db().fourbase_tasks.map((t) => t.title)
  assert.ok(!left.includes('Intacta 1'))
  for (const t of ['Intacta 2', 'Editada', 'Movida', 'Concluída', 'Reatribuída']) assert.ok(left.includes(t), t)
  const batch = db().fourbase_assistant_batches.find((b) => b.batch_id === 'lote-tela-0001')
  assert.ok(batch.undone_at)
  assert.equal(batch.items.find((i) => i.id === ids['Intacta 1']).result, 'removed')
  assert.equal(batch.items.find((i) => i.id === ids.Editada).result, 'kept_edited')
  // de novo: nada acontece
  assert.equal((await raw('POST', '/api/assistant/app/batches/lote-tela-0001/undo', { token: jwt.gestorA, body: { only_ids: [ids['Intacta 2']] } })).body.already_undone, true)
  assert.ok(db().fourbase_tasks.some((t) => t.title === 'Intacta 2'))
  assert.equal((await raw('POST', '/api/assistant/app/batches/lote-tela-0001/undo', { token: jwt.gestorA, body: { only_ids: ['x'] } })).status, 400)
})

test('desfazer pelo GPT: mesma regra (mantém o que alguém mexeu) e só uma vez', async () => {
  const c = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-gpt-00001', tasks: [{ title: 'G1', due_date: day(8) }, { title: 'G2', due_date: day(8) }] } })
  await raw('PATCH', `/api/tasks/${c.body.tasks[1].id}`, { token: jwt.gestorA, body: { priority: 'Urgente' } })
  const r = await raw('POST', '/api/assistant/batches/lote-gpt-00001/undo', { token: tokA.token })
  assert.equal(r.status, 200)
  assert.equal(r.body.undone, 1)
  assert.deepEqual(r.body.kept.map((k) => [k.title, k.reason]), [['G2', 'edited']])
  assert.equal((await raw('POST', '/api/assistant/batches/lote-gpt-00001/undo', { token: tokA.token })).body.already_undone, true)
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-gpt-00001', tasks: [{ title: 'x' }] } })).status, 409)
})

test('desfazer depois de 48 h é recusado nas duas portas', async () => {
  await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-velho-001', tasks: [{ title: 'Velha', due_date: day(9) }] } })
  await setRow('fourbase_assistant_batches', { batch_id: 'lote-velho-001' }, { created_at: new Date(Date.now() - 49 * 3600000).toISOString() })
  assert.equal((await raw('POST', '/api/assistant/batches/lote-velho-001/undo', { token: tokA.token })).status, 400)
  assert.equal((await raw('GET', '/api/assistant/app/batches/lote-velho-001/undo-plan', { token: jwt.gestorA })).status, 400)
  assert.ok(db().fourbase_tasks.some((t) => t.title === 'Velha'))
})

test('isolamento entre workspaces: B não vê nem desfaz lote de A, nem com o mesmo batch_id', async () => {
  const b = (await raw('GET', `/api/assistant/agenda?from=${day(0)}&to=${day(30)}`, { token: tokB.token })).body
  assert.equal(b.total, 0)
  assert.equal((await raw('POST', '/api/assistant/batches/lote-aaaa-0001/undo', { token: tokB.token })).status, 404)
  assert.equal((await raw('GET', '/api/assistant/app/batches/lote-aaaa-0001/undo-plan', { token: jwt.gestorB })).status, 404)
  assert.equal((await raw('POST', '/api/assistant/app/batches/lote-aaaa-0001/undo', { token: jwt.gestorB, body: { only_ids: [] } })).status, 404)
  assert.equal((await raw('GET', '/api/assistant/app/batches', { token: jwt.gestorB })).body.batches.length, 0)
  assert.equal((await raw('DELETE', `/api/assistant/tokens/${tokA.id}`, { token: jwt.gestorB })).status, 404)
  assert.equal((await raw('POST', '/api/assistant/tokens', { token: jwt.gestorB, body: { notice_version: NOTICE_VERSION, replaces: tokA.id } })).status, 404)
})

test('gestor rebaixado ou desativado: a chave para de funcionar na hora', async () => {
  await setRow('fourbase_users', { id: id.gestorB }, { role: 'funcionario' })
  assert.equal((await raw('GET', '/api/assistant/clients', { token: tokB.token })).status, 401)
  await setRow('fourbase_users', { id: id.gestorB }, { role: 'gestor', status: 'inactive' })
  assert.equal((await raw('GET', '/api/assistant/clients', { token: tokB.token })).status, 401)
  await setRow('fourbase_users', { id: id.gestorB }, { status: 'active' })
  assert.equal((await raw('GET', '/api/assistant/clients', { token: tokB.token })).status, 200)
})

test('nova chave substitui a anterior; desconectar registra; chave vencida não vale; limite de 5', async () => {
  const novo = await newToken('gestorB', { replaces: tokB.id })
  assert.equal(novo.status, 201)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: tokB.token })).status, 401, 'a antiga foi desligada')
  assert.equal((await raw('GET', '/api/assistant/clients', { token: novo.body.token })).status, 200)
  const evB = db().fourbase_assistant_consents.filter((c) => c.workspace_id === wsB).map((c) => [c.event, c.reason ?? null])
  assert.deepEqual(evB, [['authorized', null], ['disconnected', 'replaced'], ['authorized', null]])

  assert.equal((await raw('DELETE', `/api/assistant/tokens/${novo.body.id}`, { token: jwt.gestorB })).status, 204)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: novo.body.token })).status, 401)
  assert.deepEqual(db().fourbase_assistant_consents.at(-1), { ...db().fourbase_assistant_consents.at(-1), event: 'disconnected', reason: 'user' })

  const venc = (await newToken('gestorB')).body
  await setRow('fourbase_api_tokens', { id: venc.id }, { expires_at: new Date(Date.now() - 1000).toISOString() })
  assert.equal((await raw('GET', '/api/assistant/clients', { token: venc.token })).status, 401)

  for (let i = 0; i < 5; i++) assert.equal((await newToken('gestorB')).status, 201)
  assert.equal((await newToken('gestorB')).status, 400, 'vencida e desligadas não contam; 5 ativas é o limite')
})

test('openapi: só com APP_URL (nunca o Host), Permitir só nas escritas, operações antigas mantidas', async () => {
  const forged = await fetch(base + '/api/assistant/openapi.json', { headers: { Host: 'evil.example' } })
  const doc = await forged.json()
  assert.equal(doc.servers[0].url, 'https://fourbase.example')
  assert.equal(doc.info.version, '1.1.0')
  const ops = Object.fromEntries(Object.values(doc.paths).flatMap((p) => Object.values(p)).map((o) => [o.operationId, o['x-openai-isConsequential']]))
  assert.deepEqual(ops, { verificarConexao: false, verAgenda: false, listarClientes: false, prever: false, criarTarefas: true, listarLotes: false, desfazerLote: true })
  const saved = process.env.APP_URL
  delete process.env.APP_URL
  assert.equal((await raw('GET', '/api/assistant/openapi.json')).status, 503)
  process.env.APP_URL = saved
})

test('interruptor geral: ASSISTANT_ENABLED=false desliga as duas portas', async () => {
  process.env.ASSISTANT_ENABLED = 'false'
  try {
    assert.equal((await raw('GET', '/api/assistant/me', { token: tokA.token })).status, 503)
    assert.equal((await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).status, 503)
    assert.equal((await raw('GET', '/api/tasks', { token: jwt.gestorA })).status, 200, 'o resto do app segue normal')
  } finally {
    delete process.env.ASSISTANT_ENABLED
  }
  assert.equal((await raw('GET', '/api/assistant/me', { token: tokA.token })).status, 200)
})

test('nenhuma rota altera ou apaga registros de autorização', async () => {
  const consents = db().fourbase_assistant_consents
  assert.ok(consents.length >= 5)
  assert.ok(consents.every((c) => ['authorized', 'disconnected'].includes(c.event)))
  assert.ok(consents.filter((c) => c.event === 'authorized').every((c) => c.notice_version === NOTICE_VERSION))
})

test('liberação por empresa: fechado por padrão; só as empresas da lista veem e usam o Assistente', async () => {
  const saved = process.env.ASSISTANT_WORKSPACE_IDS
  try {
    process.env.ASSISTANT_WORKSPACE_IDS = wsB // só a empresa B
    assert.equal((await raw('GET', '/api/assistant/me', { token: tokA.token })).status, 403)
    assert.equal((await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).status, 403)
    assert.equal((await newToken('gestorA')).status, 403)
    const meA = (await raw('GET', '/api/auth/me', { token: jwt.gestorA })).body
    const meB = (await raw('GET', '/api/auth/me', { token: jwt.gestorB })).body
    const meF = (await raw('GET', '/api/auth/me', { token: jwt.funcA })).body
    assert.deepEqual([meA.assistant_enabled, meB.assistant_enabled, meF.assistant_enabled], [false, true, false])
    // por pessoa: o gestor de A entra pelo e-mail (sem diferenciar maiúsculas), mesmo com A fora da lista
    process.env.ASSISTANT_USER_EMAILS = ' G@A.TEST '
    assert.equal((await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).status, 200)
    assert.equal((await raw('GET', '/api/assistant/me', { token: tokA.token })).status, 200)
    assert.equal((await raw('GET', '/api/auth/me', { token: jwt.gestorA })).body.assistant_enabled, true)
    // e-mail de funcionário listado não vale: o Assistente é só de gestor
    process.env.ASSISTANT_USER_EMAILS = 'f@a.test'
    assert.equal((await raw('GET', '/api/auth/me', { token: jwt.funcA })).body.assistant_enabled, false)
    assert.equal((await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).status, 403)
    delete process.env.ASSISTANT_USER_EMAILS
    delete process.env.ASSISTANT_WORKSPACE_IDS // sem configuração: ninguém
    assert.equal((await raw('GET', '/api/assistant/tokens', { token: jwt.gestorB })).status, 403)
    assert.equal((await raw('GET', '/api/auth/me', { token: jwt.gestorB })).body.assistant_enabled, false)
  } finally {
    process.env.ASSISTANT_WORKSPACE_IDS = saved
  }
  assert.equal((await raw('GET', '/api/assistant/me', { token: tokA.token })).status, 200)
})
