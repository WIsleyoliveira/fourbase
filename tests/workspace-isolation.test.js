// Testes de isolamento entre workspaces (multi-tenant).
//
// Sobe a API com o banco local mockado (api/localDb.js) apontado para um
// arquivo temporário com duas empresas, A e B, e verifica que um usuário de B
// nunca lê, altera ou referencia dados de A — e que papéis (gestor/funcionário)
// são respeitados dentro do mesmo workspace.
//
// Rodar: npm test

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()

const wsA = randomUUID()
const wsB = randomUUID()
const ids = {
  gestorA: randomUUID(),
  funcA: randomUUID(),
  funcA2: randomUUID(),
  gestorB: randomUUID(),
  clientA: randomUUID(),
  clientB: randomUUID(),
  folderA: randomUUID(),
  activityA: randomUUID(),
}

const user = (id, workspace_id, email, role) => ({
  id, workspace_id, email, role,
  name: email, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const columns = (workspace_id) => ['todo', 'doing', 'done'].map((key, position) => ({
  id: randomUUID(), workspace_id, key, label: key, position, color: '#999999', created_at: now,
}))

const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'Empresa A', created_by: ids.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'Empresa B', created_by: ids.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [
    user(ids.gestorA, wsA, 'gestor@a.test', 'gestor'),
    user(ids.funcA, wsA, 'func@a.test', 'funcionario'),
    user(ids.funcA2, wsA, 'func2@a.test', 'funcionario'),
    user(ids.gestorB, wsB, 'gestor@b.test', 'gestor'),
  ],
  fourbase_tasks: [],
  fourbase_notes: [],
  fourbase_todos: [],
  fourbase_media: [],
  fourbase_folders: [
    { id: ids.folderA, workspace_id: wsA, name: 'Pasta A', parent_id: null, client_id: null, created_at: now, updated_at: now },
  ],
  fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [
    { id: ids.clientA, workspace_id: wsA, name: 'Cliente A', created_at: now, updated_at: now },
    { id: ids.clientB, workspace_id: wsB, name: 'Cliente B', created_at: now, updated_at: now },
  ],
  fourbase_report_activities: [
    { id: ids.activityA, workspace_id: wsA, client_id: ids.clientA, title: 'Atividade A', created_at: now, updated_at: now },
  ],
  fourbase_tags: [
    { id: randomUUID(), workspace_id: wsA, name: 'Tag A', color: '#111111', created_at: now },
    { id: randomUUID(), workspace_id: wsB, name: 'Tag B', color: '#222222', created_at: now },
  ],
}

let server
let base
const tokens = {}

const call = async (who, method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const listIds = (r) => (Array.isArray(r.body) ? r.body : []).map((x) => x.id)

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-test-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL

  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`

  for (const [who, email] of [
    ['gestorA', 'gestor@a.test'], ['funcA', 'func@a.test'],
    ['funcA2', 'func2@a.test'], ['gestorB', 'gestor@b.test'],
  ]) {
    const r = await call(null, 'POST', '/api/auth/login', { email, password: PASSWORD })
    assert.equal(r.status, 200, `login de ${email}`)
    tokens[who] = r.body.token
  }
})

after(() => server?.close())

// ── Autenticação ────────────────────────────────────────────────────────────

test('rotas de dados exigem token válido', async () => {
  assert.equal((await call(null, 'GET', '/api/tasks')).status, 401)

  const forged = jwt.sign({ sub: ids.gestorB, role: 'gestor', workspace_id: wsA }, 'outro-segredo')
  tokens.forged = forged
  assert.equal((await call('forged', 'GET', '/api/clients')).status, 401)
})

// ── Leitura entre workspaces ────────────────────────────────────────────────

test('listagens de B não trazem nada de A', async () => {
  const task = await call('gestorA', 'POST', '/api/tasks', { title: 'Tarefa secreta A', client_id: ids.clientA })
  assert.equal(task.status, 201)
  const note = await call('gestorA', 'POST', '/api/notes', { title: 'Nota secreta A' })
  assert.equal(note.status, 201)

  const clients = await call('gestorB', 'GET', '/api/clients')
  assert.deepEqual(listIds(clients), [ids.clientB])

  const members = await call('gestorB', 'GET', '/api/members')
  assert.deepEqual(listIds(members), [ids.gestorB])

  const teamTasks = await call('gestorB', 'GET', '/api/team/tasks')
  assert.ok(!listIds(teamTasks).includes(task.body.id), 'team/tasks vazou tarefa de A')

  const byClient = await call('gestorB', 'GET', `/api/tasks/by-client/${ids.clientA}`)
  assert.deepEqual(listIds(byClient), [])

  const linked = await call('gestorB', 'GET', '/api/tasks/client-linked')
  assert.ok(!listIds(linked).includes(task.body.id), 'client-linked vazou tarefa de A')

  const notes = await call('gestorB', 'GET', '/api/notes')
  assert.ok(!listIds(notes).includes(note.body.id))

  const folders = await call('gestorB', 'GET', '/api/folders')
  assert.ok(!listIds(folders).includes(ids.folderA))

  const activities = await call('gestorB', 'GET', '/api/report-activities')
  assert.ok(!listIds(activities).includes(ids.activityA))

  const tags = await call('gestorB', 'GET', '/api/tags')
  assert.deepEqual(tags.body.map((t) => t.name), ['Tag B'])

  const overview = await call('gestorB', 'GET', '/api/team/overview')
  assert.equal(overview.status, 200)
  assert.ok(!JSON.stringify(overview.body).includes(ids.gestorA), 'team/overview vazou membro de A')
})

// ── Escrita entre workspaces ────────────────────────────────────────────────

test('B não altera nem exclui registros de A', async () => {
  const task = await call('gestorA', 'POST', '/api/tasks', { title: 'Original A' })
  const note = await call('gestorA', 'POST', '/api/notes', { title: 'Nota A' })

  const patchTask = await call('gestorB', 'PATCH', `/api/tasks/${task.body.id}`, { title: 'hackeado' })
  assert.equal(patchTask.status, 404)
  const patchClient = await call('gestorB', 'PATCH', `/api/clients/${ids.clientA}`, { name: 'hackeado' })
  assert.equal(patchClient.status, 404)
  const putNote = await call('gestorB', 'PUT', `/api/notes/${note.body.id}`, { title: 'hackeado' })
  assert.equal(putNote.status, 404)

  // DELETE responde 204 mesmo sem achar a linha — o que importa é ela continuar lá.
  await call('gestorB', 'DELETE', `/api/tasks/${task.body.id}`)
  await call('gestorB', 'DELETE', `/api/clients/${ids.clientA}`)
  await call('gestorB', 'DELETE', `/api/notes/${note.body.id}`)

  const teamTasks = await call('gestorA', 'GET', '/api/team/tasks')
  const stillThere = teamTasks.body.find((t) => t.id === task.body.id)
  assert.ok(stillThere, 'tarefa de A foi excluída por B')
  assert.equal(stillThere.title, 'Original A')

  const clients = await call('gestorA', 'GET', '/api/clients')
  const clientA = clients.body.find((c) => c.id === ids.clientA)
  assert.ok(clientA, 'cliente de A foi excluído por B')
  assert.equal(clientA.name, 'Cliente A')

  const notes = await call('gestorA', 'GET', '/api/notes')
  assert.equal(notes.body.find((n) => n.id === note.body.id)?.title, 'Nota A')
})

test('B não costura registros próprios a ids de A', async () => {
  const withClient = await call('gestorB', 'POST', '/api/tasks', { title: 'x', client_id: ids.clientA })
  assert.equal(withClient.status, 400)

  const withAssignee = await call('gestorB', 'POST', '/api/tasks', { title: 'x', assigned_to: ids.funcA })
  assert.equal(withAssignee.status, 400)

  const own = await call('gestorB', 'POST', '/api/tasks', { title: 'Tarefa B' })
  const relink = await call('gestorB', 'PATCH', `/api/tasks/${own.body.id}`, { client_id: ids.clientA })
  assert.equal(relink.status, 400)

  const mention = await call('gestorB', 'PATCH', `/api/tasks/${own.body.id}`, { mentioned_users: [ids.gestorA, ids.gestorB] })
  assert.deepEqual(mention.body.mentioned_users, [ids.gestorB])
})

test('workspace_id no body é ignorado', async () => {
  const task = await call('gestorB', 'POST', '/api/tasks', { title: 'Injeção', workspace_id: wsA })
  assert.equal(task.status, 201)
  assert.equal(task.body.workspace_id, wsB)

  const client = await call('gestorB', 'POST', '/api/clients', { name: 'Injeção', workspace_id: wsA })
  assert.equal(client.status, 201)
  assert.equal(client.body.workspace_id, wsB)

  const teamA = await call('gestorA', 'GET', '/api/team/tasks')
  assert.ok(!listIds(teamA).includes(task.body.id))
})

// ── Papéis dentro do mesmo workspace ────────────────────────────────────────

test('funcionário não acessa rotas de gestor', async () => {
  assert.equal((await call('funcA', 'GET', '/api/team/overview')).status, 403)
  assert.equal((await call('funcA', 'GET', '/api/team/tasks')).status, 403)
  assert.equal((await call('funcA', 'GET', '/api/members/invitations')).status, 403)
  assert.equal((await call('funcA', 'POST', '/api/clients', { name: 'x' })).status, 403)
  assert.equal((await call('funcA', 'POST', '/api/members/invite', { email: 'x@a.test', name: 'x' })).status, 403)
})

test('funcionário só vê e altera as próprias tarefas e notas', async () => {
  const mine = await call('funcA', 'POST', '/api/tasks', { title: 'Minha tarefa' })
  const other = await call('funcA2', 'POST', '/api/tasks', { title: 'Tarefa do colega' })
  const otherNote = await call('funcA2', 'POST', '/api/notes', { title: 'Nota do colega' })

  // Funcionário não consegue atribuir tarefa a outra pessoa.
  const assigned = await call('funcA', 'POST', '/api/tasks', { title: 'x', assigned_to: ids.funcA2 })
  assert.equal(assigned.body.assigned_to, ids.funcA)

  const list = listIds(await call('funcA', 'GET', '/api/tasks'))
  assert.ok(list.includes(mine.body.id))
  assert.ok(!list.includes(other.body.id))

  assert.equal((await call('funcA', 'PATCH', `/api/tasks/${other.body.id}`, { title: 'x' })).status, 404)
  await call('funcA', 'DELETE', `/api/tasks/${other.body.id}`)
  const team = await call('gestorA', 'GET', '/api/team/tasks')
  assert.ok(listIds(team).includes(other.body.id), 'funcionário excluiu tarefa do colega')

  assert.ok(!listIds(await call('funcA', 'GET', '/api/notes')).includes(otherNote.body.id))
  assert.equal((await call('funcA', 'PUT', `/api/notes/${otherNote.body.id}`, { title: 'x' })).status, 404)
})

test('respostas nunca expõem password_hash', async () => {
  for (const url of ['/api/auth/me', '/api/members', '/api/team/overview', '/api/team/tasks']) {
    const r = await call('gestorA', 'GET', url)
    assert.ok(!JSON.stringify(r.body).includes('password_hash'), `${url} expôs password_hash`)
  }
})
