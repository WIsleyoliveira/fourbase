// Contadores do servidor (Equipe e progresso por cliente) seguem a posição das colunas.
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
const id = { gestor: randomUUID(), client: randomUUID() }
const gestor = {
  id: id.gestor, workspace_id: ws, email: 'g@a.test', role: 'gestor', name: 'Gestor', password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
}
const column = (key, position) => ({ id: randomUUID(), workspace_id: ws, key, label: key, position, color: '#999999', created_at: now })
const fixture = {
  weflow_workspaces: [{ id: ws, name: 'A', created_by: id.gestor, created_at: now, updated_at: now }],
  weflow_invitations: [],
  fourbase_users: [gestor],
  fourbase_tasks: [], fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [column('todo', 0), column('doing', 1), column('revisao', 2), column('done', 3)],
  fourbase_clients: [{ id: id.client, workspace_id: ws, name: 'Cliente', created_at: now, updated_at: now }],
  fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [],
}

let server, base, token
const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-buckets-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'g@a.test', password: PASSWORD }) })
  token = (await res.json()).token
  for (const col of ['todo', 'doing', 'doing', 'revisao', 'done']) {
    await call('POST', '/api/tasks', { title: `t-${col}`, column_key: col, client_id: id.client, assigned_to: id.gestor })
  }
})
after(() => server?.close())

const team = async () => (await call('GET', '/api/team/overview')).body[0].tasks
const stats = async () => (await call('GET', '/api/tasks/client-stats')).body[id.client]

test('quadro padrão: todo = a fazer, o resto aberto = em andamento, done = concluídas', async () => {
  assert.deepEqual(await team(), { todo: 1, doing: 3, done: 1, total: 5 })
  const s = await stats()
  assert.deepEqual([s.todo, s.doing, s.done, s.total, s.progress], [1, 3, 1, 5, 20])
})

test('excluir "A Fazer": a primeira coluna passa a ser "a fazer" e nada some dos totais', async () => {
  assert.equal((await call('DELETE', '/api/columns/todo?moveTo=doing')).status, 200)
  // colunas agora: doing, revisao, done. Tarefas: doing=3 (uma veio de todo), revisao=1, done=1
  assert.deepEqual(await team(), { todo: 3, doing: 1, done: 1, total: 5 })
  const s = await stats()
  assert.deepEqual([s.todo, s.doing, s.done, s.total], [3, 1, 1, 5])
})

test('mover a coluna "revisao" para a frente muda quem é "a fazer"', async () => {
  const r = await call('PUT', '/api/columns/order', { keys: ['revisao', 'doing'] })
  assert.equal(r.status, 200)
  assert.deepEqual(await team(), { todo: 1, doing: 3, done: 1, total: 5 })
})
