// Assistente (ChatGPT): token pessoal, agenda, lote com prévia/idempotência/desfazer, isolamento.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()
const wsA = randomUUID()
const wsB = randomUUID()
const id = { gestorA: randomUUID(), funcA: randomUUID(), gestorB: randomUUID() }
const user = (uid, workspace_id, email, role) => ({
  id: uid, workspace_id, email, role, name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const columns = (workspace_id) => [['todo', 'A Fazer'], ['done', 'Concluído']]
  .map(([key, label], position) => ({ id: randomUUID(), workspace_id, key, label, position, color: '#999999', created_at: now }))
const clientA = { id: randomUUID(), workspace_id: wsA, name: 'Açaí & Cia', created_at: now }
const clientB = { id: randomUUID(), workspace_id: wsB, name: 'Outra Empresa', created_at: now }

const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [user(id.gestorA, wsA, 'g@a.test', 'gestor'), user(id.funcA, wsA, 'f@a.test', 'funcionario'), user(id.gestorB, wsB, 'g@b.test', 'gestor')],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [clientA, clientB], fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
  fourbase_api_tokens: [], fourbase_assistant_batches: [],
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
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
let tokA, tokB

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-asst-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  await login('gestorA', 'g@a.test'); await login('funcA', 'f@a.test'); await login('gestorB', 'g@b.test')
  tokA = (await raw('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: { name: 'ChatGPT do Evandro' } })).body
  tokB = (await raw('POST', '/api/assistant/tokens', { token: jwt.gestorB, body: {} })).body
})
after(() => server?.close())

test('token: só gestor cria; aparece uma vez; banco guarda só o hash', async () => {
  assert.equal((await raw('POST', '/api/assistant/tokens', { token: jwt.funcA, body: {} })).status, 403)
  assert.equal((await raw('POST', '/api/assistant/tokens', {})).status, 401)
  assert.match(tokA.token, /^fbk_/)
  const list = (await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).body
  assert.equal(list.length, 1)
  assert.equal(list[0].token, undefined)
  assert.equal(list[0].token_hash, undefined)
  const stored = JSON.parse(fs.readFileSync(process.env.FOURBASE_DB_PATH, 'utf8')).fourbase_api_tokens
  assert.ok(!JSON.stringify(stored).includes(tokA.token))
})

test('token não abre rotas normais; JWT não abre rotas de dados do assistente', async () => {
  assert.equal((await raw('GET', '/api/tasks', { token: tokA.token })).status, 401)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: jwt.gestorA })).status, 401)
  assert.equal((await raw('GET', '/api/assistant/clients', {})).status, 401)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: 'fbk_' + 'x'.repeat(43) })).status, 401)
})

test('clientes: só os do workspace do token', async () => {
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
  assert.equal(r.body.conflicts.filter((c) => c.index === 0).length, 1)
  assert.equal(r.body.duplicates.length, 1)
  assert.equal(r.body.conflicts.some((c) => c.index === 2), false)
  const all = (await raw('GET', `/api/assistant/agenda?from=${d}&to=${d}`, { token: tokA.token })).body
  assert.equal(all.total, 1, 'prévia não criou nada')
})

test('lote: cria para o dono do token, com etiqueta ChatGPT, cliente por nome e sem avisos', async () => {
  const d = day(5)
  const r = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0001', tasks: [
    { title: 'Visita ao cliente', due_date: d, due_time: '09:00', due_time_end: '10:00', client_name: 'acai & cia', priority: 'Alta' },
    { title: 'Estudar proposta', due_date: d },
  ] } })
  assert.equal(r.status, 201)
  assert.equal(r.body.count, 2)
  const tasks = (await raw('GET', '/api/tasks', { token: jwt.gestorA })).body.filter((t) => t.tags?.includes('ChatGPT'))
  assert.equal(tasks.length, 2)
  for (const t of tasks) { assert.equal(t.assigned_to, id.gestorA); assert.equal(t.column_key, 'todo') }
  assert.equal(tasks.find((t) => t.title === 'Visita ao cliente').client_id, clientA.id)
  const tags = (await raw('GET', '/api/tags', { token: jwt.gestorA })).body
  assert.ok(tags.some((t) => t.name === 'ChatGPT'))
  const notif = (await raw('GET', '/api/notifications', { token: jwt.gestorA })).body
  assert.equal(notif.items.filter((n) => n.kind === 'assignment').length, 0)
})

test('idempotência: repetir o batch_id não duplica', async () => {
  const d = day(5)
  const body = { batch_id: 'lote-aaaa-0001', tasks: [{ title: 'Qualquer', due_date: d }] }
  const r = await raw('POST', '/api/assistant/tasks', { token: tokA.token, body })
  assert.equal(r.status, 200)
  assert.equal(r.body.already_created, true)
  const n = (await raw('GET', `/api/assistant/agenda?from=${d}&to=${d}`, { token: tokA.token })).body.total
  assert.equal(n, 2)
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
  // o batch_id não fica preso depois de uma falha
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0002', tasks: [{ title: 'Boa', due_date: d }] } })).status, 201)
  const many = Array.from({ length: 31 }, (_, i) => ({ title: 't' + i }))
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0003', tasks: many } })).status, 400)
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { tasks: [{ title: 'x' }] } })).status, 400)
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'curto', tasks: [{ title: 'x' }] } })).status, 400)
})

test('agenda: só tarefas do dono, intervalo máximo, datas inválidas', async () => {
  await raw('POST', '/api/tasks', { token: jwt.funcA, body: { title: 'Da funcionária', due_date: day(5) } })
  const a = (await raw('GET', `/api/assistant/agenda?from=${day(5)}&to=${day(5)}`, { token: tokA.token })).body
  assert.ok(a.tasks.every((t) => t.title !== 'Da funcionária'))
  assert.equal((await raw('GET', `/api/assistant/agenda?from=${day(0)}&to=${day(90)}`, { token: tokA.token })).status, 400)
  assert.equal((await raw('GET', '/api/assistant/agenda?from=ontem&to=hoje', { token: tokA.token })).status, 400)
})

test('isolamento entre workspaces: B não vê A e não desfaz lote de A', async () => {
  const b = (await raw('GET', `/api/assistant/agenda?from=${day(0)}&to=${day(30)}`, { token: tokB.token })).body
  assert.equal(b.total, 0)
  assert.equal((await raw('POST', '/api/assistant/batches/lote-aaaa-0001/undo', { token: tokB.token })).status, 404)
  assert.equal((await raw('DELETE', `/api/assistant/tokens/${tokA.id}`, { token: jwt.gestorB })).status, 404)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: tokA.token })).status, 200)
})

test('desfazer: apaga só o lote, e só uma vez', async () => {
  const d = day(5)
  const r = await raw('POST', '/api/assistant/batches/lote-aaaa-0001/undo', { token: tokA.token })
  assert.equal(r.status, 200)
  assert.equal(r.body.undone, 2)
  const left = (await raw('GET', `/api/assistant/agenda?from=${d}&to=${d}`, { token: tokA.token })).body.tasks
  assert.deepEqual(left.map((t) => t.title), ['Da funcionária'].filter(() => false))
  assert.equal((await raw('POST', '/api/assistant/batches/lote-aaaa-0001/undo', { token: tokA.token })).body.already_undone, true)
  // lote desfeito não pode ser recriado com o mesmo id
  assert.equal((await raw('POST', '/api/assistant/tasks', { token: tokA.token, body: { batch_id: 'lote-aaaa-0001', tasks: [{ title: 'x' }] } })).status, 409)
  // tarefas manuais (de outro lote/pessoa) intactas
  const mine = (await raw('GET', '/api/tasks', { token: jwt.gestorA })).body.map((t) => t.title)
  assert.ok(mine.includes('Reunião existente') && mine.includes('Boa'))
})

test('revogar: token deixa de funcionar na hora; limite de tokens ativos', async () => {
  const extra = (await raw('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: { name: 'segundo' } })).body
  assert.equal((await raw('GET', '/api/assistant/clients', { token: extra.token })).status, 200)
  assert.equal((await raw('DELETE', `/api/assistant/tokens/${extra.id}`, { token: jwt.gestorA })).status, 204)
  assert.equal((await raw('GET', '/api/assistant/clients', { token: extra.token })).status, 401)
  for (let i = 0; i < 4; i++) assert.equal((await raw('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: {} })).status, 201)
  assert.equal((await raw('POST', '/api/assistant/tokens', { token: jwt.gestorA, body: {} })).status, 400)
  const last = (await raw('GET', '/api/assistant/tokens', { token: jwt.gestorA })).body.find((t) => t.id === tokA.id)
  assert.ok(last.last_used_at)
})

test('openapi público lista as operações', async () => {
  const r = await raw('GET', '/api/assistant/openapi.json')
  assert.equal(r.status, 200)
  assert.equal(r.body.paths['/api/assistant/tasks'].post.operationId, 'criarTarefas')
})
