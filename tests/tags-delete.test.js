// DELETE /api/tags/:id — só gestor, só do próprio workspace, e a etiqueta some das tarefas.
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
const id = { gestorA: randomUUID(), funcA: randomUUID(), gestorB: randomUUID(), tagA: randomUUID(), tagB: randomUUID(), taskA: randomUUID(), taskB: randomUUID() }
const user = (uid, workspace_id, email, role) => ({
  id: uid, workspace_id, email, role, name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const task = (tid, workspace_id, owner, tags) => ({
  id: tid, workspace_id, title: 'T', description: '', priority: 'Média', due_date: null, column_key: 'todo',
  user_id: owner, assigned_to: owner, client_id: null, tags, attachments: [], mentioned_users: [], created_at: now, updated_at: now,
})
const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [user(id.gestorA, wsA, 'g@a.test', 'gestor'), user(id.funcA, wsA, 'f@a.test', 'funcionario'), user(id.gestorB, wsB, 'g@b.test', 'gestor')],
  fourbase_tasks: [task(id.taskA, wsA, id.gestorA, ['Design', 'Urgente']), task(id.taskB, wsB, id.gestorB, ['Urgente'])],
  fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [], fourbase_clients: [], fourbase_report_activities: [],
  fourbase_tags: [
    { id: id.tagA, workspace_id: wsA, name: 'Urgente', color: '#111111', created_at: now },
    { id: id.tagB, workspace_id: wsB, name: 'Urgente', color: '#222222', created_at: now },
  ],
  fourbase_notifications: [],
}

let server, base
const tokens = {}
const call = async (who, method, url) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) } })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const login = async (who, email) => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  tokens[who] = (await res.json()).token
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-tags-'))
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

const tagsOf = async (who) => (await call(who, 'GET', '/api/tags')).body.map((t) => t.id)

test('funcionário não exclui etiqueta; id inválido e de outro workspace dão 404 e nada some', async () => {
  assert.equal((await call('funcA', 'DELETE', `/api/tags/${id.tagA}`)).status, 403)
  assert.equal((await call('gestorA', 'DELETE', '/api/tags/nao-e-uuid')).status, 404)
  assert.equal((await call('gestorB', 'DELETE', `/api/tags/${id.tagA}`)).status, 404)
  assert.deepEqual(await tagsOf('gestorA'), [id.tagA])
})

test('gestor exclui: a etiqueta some do registro e das tarefas, sem tocar em outro workspace', async () => {
  assert.equal((await call('gestorA', 'DELETE', `/api/tags/${id.tagA}`)).status, 204)
  assert.deepEqual(await tagsOf('gestorA'), [])

  const mine = (await call('gestorA', 'GET', '/api/tasks')).body.find((t) => t.id === id.taskA)
  assert.deepEqual(mine.tags, ['Design'])

  // workspace B: etiqueta e tarefa com o mesmo nome continuam intactas
  assert.deepEqual(await tagsOf('gestorB'), [id.tagB])
  assert.deepEqual((await call('gestorB', 'GET', '/api/tasks')).body.find((t) => t.id === id.taskB).tags, ['Urgente'])

  // excluir de novo: 404
  assert.equal((await call('gestorA', 'DELETE', `/api/tags/${id.tagA}`)).status, 404)
})
