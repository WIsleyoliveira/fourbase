// Assistente (ChatGPT): regressões dos testes de estresse — limite de força bruta (só 401, token válido
// sempre passa), erros de validação não bloqueiam, descrição precisa ser texto, desfazer não apaga tarefa
// reatribuída, JSON inválido responde em JSON. Arquivo próprio: o limite guarda estado no processo.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()
const ws = randomUUID()
const id = { gestor: randomUUID(), func: randomUUID() }
const user = (uid, email, role) => ({
  id: uid, workspace_id: ws, email, role, name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const fixture = {
  weflow_workspaces: [{ id: ws, name: 'A', created_by: id.gestor, created_at: now, updated_at: now }],
  weflow_invitations: [],
  fourbase_users: [user(id.gestor, 'g@a.test', 'gestor'), user(id.func, 'f@a.test', 'funcionario')],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [['todo', 'A Fazer'], ['done', 'Concluído']].map(([key, label], position) => ({ id: randomUUID(), workspace_id: ws, key, label, position, color: '#999999', created_at: now })),
  fourbase_clients: [], fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
  fourbase_api_tokens: [], fourbase_assistant_batches: [],
}

let server, base, jwt, tok
const call = async (token, method, url, body, rawBody) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: rawBody ?? (body ? JSON.stringify(body) : undefined),
  })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  return { status: res.status, body: parsed }
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-asst-hard-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  jwt = (await call(null, 'POST', '/api/auth/login', { email: 'g@a.test', password: PASSWORD })).body.token
  tok = (await call(jwt, 'POST', '/api/assistant/tokens', {})).body.token
})
after(() => server?.close())

test('descrição que não é texto é recusada (não vira "[object Object]")', async () => {
  const r = await call(tok, 'POST', '/api/assistant/tasks/preview', { tasks: [{ title: 'x', description: { a: 1 } }] })
  assert.equal(r.status, 400)
  assert.deepEqual(r.body.details[0].errors, ['descrição deve ser texto'])
})

test('JSON malformado e corpo grande respondem em JSON', async () => {
  const bad = await call(tok, 'POST', '/api/assistant/tasks', null, '{"tasks": [')
  assert.equal(bad.status, 400)
  assert.equal(bad.body.error, 'JSON inválido')
  const big = await call(tok, 'POST', '/api/assistant/tasks', null, JSON.stringify({ tasks: [{ title: 'x', description: 'y'.repeat(2.2e6) }] }))
  assert.equal(big.status, 413)
  assert.equal(big.body.error, 'Conteúdo grande demais')
})

test('desfazer não apaga tarefa do lote que o gestor reatribuiu a outra pessoa', async () => {
  const c = await call(tok, 'POST', '/api/assistant/tasks', { batch_id: 'lote-reatrib-01', tasks: [{ title: 'Vai para a funcionária' }, { title: 'Fica comigo' }] })
  assert.equal(c.status, 201)
  assert.equal((await call(jwt, 'PATCH', `/api/tasks/${c.body.tasks[0].id}`, { assigned_to: id.func })).status, 200)
  const u = await call(tok, 'POST', '/api/assistant/batches/lote-reatrib-01/undo')
  assert.deepEqual(u.body, { undone: 1, kept: 1 })
  const db = JSON.parse(fs.readFileSync(process.env.FOURBASE_DB_PATH, 'utf8')).fourbase_tasks.map((t) => t.title)
  assert.ok(db.includes('Vai para a funcionária'))
  assert.ok(!db.includes('Fica comigo'))
})

test('erros de validação de um token válido não bloqueiam o dono', async () => {
  for (let i = 0; i < 40; i++) {
    assert.equal((await call(tok, 'POST', '/api/assistant/tasks', { batch_id: `lote-erro-${String(i).padStart(3, '0')}`, tasks: [{ title: '' }] })).status, 400)
  }
  assert.equal((await call(tok, 'GET', '/api/assistant/clients')).status, 200)
})

test('força bruta: após 30 tokens inválidos o IP recebe 429, mas o token válido continua passando', async () => {
  const st = []
  for (let i = 0; i < 32; i++) st.push((await call('fbk_' + String(i).padStart(43, 'Z'), 'GET', '/api/assistant/clients')).status)
  assert.deepEqual(st.slice(0, 30), Array(30).fill(401))
  assert.deepEqual(st.slice(30), [429, 429])
  assert.equal((await call(tok, 'GET', '/api/assistant/clients')).status, 200)
})
