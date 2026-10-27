// PATCH /api/columns/:key — só gestor, só do próprio workspace, "Concluído" é fixa.
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
const columns = (workspace_id) => [['todo', 'A Fazer'], ['doing', 'Em Progresso'], ['done', 'Concluído'], ['extra', 'Revisão']]
  .map(([key, label], position) => ({ id: randomUUID(), workspace_id, key, label, position, color: '#999999', created_at: now }))

const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [user(id.gestorA, wsA, 'g@a.test', 'gestor'), user(id.funcA, wsA, 'f@a.test', 'funcionario'), user(id.gestorB, wsB, 'g@b.test', 'gestor')],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [], fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
}

let server, base
const tokens = {}
const call = async (who, method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const login = async (who, email) => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  tokens[who] = (await res.json()).token
}
const colOf = async (who, key) => (await call(who, 'GET', '/api/columns')).body.find((c) => c.key === key)

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-cols-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  await login('gestorA', 'g@a.test')
  await login('funcA', 'f@a.test')
  await login('gestorB', 'g@b.test')
})
after(() => server?.close())

test('gestor edita nome e cor de uma coluna (padrão ou criada por ele)', async () => {
  const r = await call('gestorA', 'PATCH', '/api/columns/todo', { label: '  Backlog  ', color: '#a855f7' })
  assert.equal(r.status, 200)
  assert.deepEqual([r.body.label, r.body.color, r.body.key], ['Backlog', '#a855f7', 'todo'])
  assert.equal((await colOf('gestorA', 'todo')).label, 'Backlog')

  // só a cor, só o nome
  assert.equal((await call('gestorA', 'PATCH', '/api/columns/extra', { color: '#f2a93b' })).status, 200)
  assert.equal((await call('gestorA', 'PATCH', '/api/columns/extra', { label: 'Em revisão' })).status, 200)
  const extra = await colOf('gestorA', 'extra')
  assert.deepEqual([extra.label, extra.color], ['Em revisão', '#f2a93b'])
})

test('"Concluído" não pode ser editada', async () => {
  const before = await colOf('gestorA', 'done')
  const r = await call('gestorA', 'PATCH', '/api/columns/done', { label: 'Feito', color: '#000000' })
  assert.equal(r.status, 400)
  const after = await colOf('gestorA', 'done')
  assert.deepEqual([after.label, after.color], [before.label, before.color])
})

test('funcionário não edita (403) e outro workspace não alcança a coluna (404)', async () => {
  assert.equal((await call('funcA', 'PATCH', '/api/columns/doing', { label: 'X' })).status, 403)
  assert.equal((await call('gestorB', 'PATCH', '/api/columns/doing', { label: 'Hackeada' })).status, 200) // a de B, não a de A
  assert.equal((await colOf('gestorA', 'doing')).label, 'Em Progresso')
  assert.equal((await call('gestorB', 'PATCH', '/api/columns/inexistente', { label: 'X' })).status, 404)
})

test('validações: nome vazio/longo, cor inválida e corpo vazio', async () => {
  assert.equal((await call('gestorA', 'PATCH', '/api/columns/doing', { label: '   ' })).status, 400)
  assert.equal((await call('gestorA', 'PATCH', '/api/columns/doing', { label: 'x'.repeat(41) })).status, 400)
  assert.equal((await call('gestorA', 'PATCH', '/api/columns/doing', { color: 'vermelho' })).status, 400)
  assert.equal((await call('gestorA', 'PATCH', '/api/columns/doing', {})).status, 400)
  assert.equal((await colOf('gestorA', 'doing')).label, 'Em Progresso')
})
