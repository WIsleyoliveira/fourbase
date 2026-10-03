// API do sino de notificações (GET /api/notifications, PATCH .../read,
// POST .../read-all) e GET /api/tasks/:id.
//
// Esqueleto de workspace-isolation.test.js: API sobre o banco local mockado
// (arquivo temporário), dois workspaces, login real.
//
// Rodar: npm test

import { test, before, after, beforeEach } from 'node:test'
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
const ids = {
  gestorA: randomUUID(),
  funcA: randomUUID(),
  funcA2: randomUUID(),
  funcA3: randomUUID(),
  gestorB: randomUUID(),
  funcB: randomUUID(),
  clientA: randomUUID(),
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
    user(ids.funcA3, wsA, 'func3@a.test', 'funcionario'),
    user(ids.gestorB, wsB, 'gestor@b.test', 'gestor'),
    user(ids.funcB, wsB, 'func@b.test', 'funcionario'),
  ],
  fourbase_tasks: [],
  fourbase_notes: [],
  fourbase_todos: [],
  fourbase_media: [],
  fourbase_folders: [],
  fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [
    { id: ids.clientA, workspace_id: wsA, name: 'Cliente A', created_at: now, updated_at: now },
  ],
  fourbase_report_activities: [],
  fourbase_tags: [],
  fourbase_notifications: [],
}

let server
let base
let supabase
let addDays
const tokens = {}

const TODAY = new Date().toISOString().slice(0, 10)

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
const getBell = (who, today = TODAY) =>
  call(who, 'GET', `/api/notifications?today=${encodeURIComponent(today)}`)

const mkTask = async (fields = {}) => {
  const { data, error } = await supabase
    .from('fourbase_tasks')
    .insert({
      workspace_id: wsA,
      title: 'Tarefa',
      description: '',
      priority: 'Média',
      due_date: null,
      due_date_end: null,
      column_key: 'todo',
      user_id: ids.gestorA,
      assigned_to: ids.funcA,
      client_id: null,
      tags: [],
      attachments: [],
      mentioned_users: [],
      ...fields,
    })
    .select()
    .single()
  assert.equal(error, null)
  return data
}

const mkNotif = async (fields = {}) => {
  const { data, error } = await supabase
    .from('fourbase_notifications')
    .insert({
      workspace_id: wsA,
      user_id: ids.funcA,
      kind: 'mention',
      task_id: null,
      actor_id: ids.gestorA,
      title: 'Aviso',
      ...fields,
    })
    .select()
    .single()
  assert.equal(error, null)
  return data
}

const notifRows = async (userId) =>
  (await supabase.from('fourbase_notifications').select('*').eq('user_id', userId)).data

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-bell-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL

  ;({ supabase } = await import('../api/_lib/supabase.js'))
  ;({ addDays } = await import('../api/_lib/notificationRules.js'))
  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`

  for (const [who, email] of [
    ['gestorA', 'gestor@a.test'], ['funcA', 'func@a.test'], ['funcA2', 'func2@a.test'],
    ['funcA3', 'func3@a.test'], ['gestorB', 'gestor@b.test'], ['funcB', 'func@b.test'],
  ]) {
    const r = await call(null, 'POST', '/api/auth/login', { email, password: PASSWORD })
    assert.equal(r.status, 200, `login de ${email}`)
    tokens[who] = r.body.token
  }
})

after(() => server?.close())

beforeEach(async () => {
  await supabase.from('fourbase_notifications').delete().neq('id', '')
  await supabase.from('fourbase_tasks').delete().neq('id', '')
})

test('rotas exigem token (401 sem Authorization)', async () => {
  const someId = randomUUID()
  for (const [method, url] of [
    ['GET', '/api/notifications'],
    ['PATCH', `/api/notifications/${someId}/read`],
    ['POST', '/api/notifications/read-all'],
    ['GET', `/api/tasks/${someId}`],
  ]) {
    const r = await call(null, method, url)
    assert.equal(r.status, 401, `${method} ${url}`)
  }
})

test('GET com today cria due_soon/overdue uma vez; segunda chamada idêntica não duplica', async () => {
  const hoje = await mkTask({ title: 'Hoje', due_date: TODAY })
  const amanha = await mkTask({ title: 'Amanhã', due_date: addDays(TODAY, 1) })
  const ontem = await mkTask({ title: 'Ontem', due_date: addDays(TODAY, -1) })
  await mkTask({ title: 'Muito atrasada', due_date: addDays(TODAY, -10) })
  await mkTask({ title: 'Concluída', due_date: TODAY, column_key: 'done' })
  await mkTask({ title: 'Futura', due_date: addDays(TODAY, 5) })
  await mkTask({ title: 'De outra pessoa', due_date: TODAY, assigned_to: ids.funcA2 })

  const first = await getBell('funcA')
  assert.equal(first.status, 200)
  assert.equal(first.body.items.length, 3)
  assert.equal(first.body.unread, 3)
  const byTask = Object.fromEntries(first.body.items.map((n) => [n.task_id, n]))
  assert.equal(byTask[hoje.id].kind, 'due_soon')
  assert.equal(byTask[amanha.id].kind, 'due_soon')
  assert.equal(byTask[ontem.id].kind, 'overdue')
  assert.equal(byTask[ontem.id].meta.due_date, addDays(TODAY, -1))
  assert.equal(byTask[hoje.id].title, 'Hoje')
  assert.deepEqual(
    Object.keys(first.body.items[0]).sort(),
    ['actor_id', 'created_at', 'id', 'kind', 'meta', 'read_at', 'task_id', 'title'],
  )

  const second = await getBell('funcA')
  assert.equal(second.status, 200)
  assert.equal(second.body.items.length, 3)
  assert.equal((await notifRows(ids.funcA)).length, 3)
  assert.deepEqual(
    second.body.items.map((n) => n.id).sort(),
    first.body.items.map((n) => n.id).sort(),
  )
})

test("GET com today inválido ('abc','9999-99-99') responde 200 usando a data do servidor", async () => {
  await mkTask({ title: 'Vence hoje', due_date: TODAY })
  for (const bad of ['abc', '9999-99-99']) {
    const r = await getBell('funcA', bad)
    assert.equal(r.status, 200, `today=${bad}`)
    assert.equal(r.body.items.length, 1, `today=${bad}`)
    assert.equal(r.body.items[0].kind, 'due_soon')
  }
  // sem o parâmetro também usa a data do servidor
  const r = await call('funcA', 'GET', '/api/notifications')
  assert.equal(r.status, 200)
  assert.equal(r.body.items.length, 1)
  assert.equal((await notifRows(ids.funcA)).length, 1)
})

test('aviso de prazo some quando a tarefa é concluída, excluída ou reatribuída a outra pessoa', async () => {
  const doneTask = await mkTask({ title: 'Vai concluir', due_date: TODAY })
  const delTask = await mkTask({ title: 'Vai excluir', due_date: TODAY })
  const moveTask = await mkTask({ title: 'Vai reatribuir', due_date: TODAY })
  const keepTask = await mkTask({ title: 'Fica', due_date: TODAY })

  let r = await getBell('funcA')
  assert.equal(r.body.items.length, 4)
  assert.equal(r.body.unread, 4)

  // avisos de menção/atribuição nunca somem por causa do estado da tarefa
  await mkNotif({ kind: 'mention', task_id: doneTask.id, title: 'Menção' })

  await supabase.from('fourbase_tasks').update({ column_key: 'done' }).eq('id', doneTask.id)
  await supabase.from('fourbase_tasks').delete().eq('id', delTask.id)
  await supabase.from('fourbase_tasks').update({ assigned_to: ids.funcA2 }).eq('id', moveTask.id)

  r = await getBell('funcA')
  assert.equal(r.status, 200)
  const titles = r.body.items.map((n) => n.title).sort()
  assert.deepEqual(titles, ['Fica', 'Menção'])
  assert.equal(r.body.unread, 2)
  assert.ok(r.body.items.some((n) => n.task_id === keepTask.id))

  // quem recebeu a tarefa passa a ver o aviso dela
  const other = await getBell('funcA2')
  assert.deepEqual(other.body.items.map((n) => n.title), ['Vai reatribuir'])
})

test('items limitado a 50 e unread conta todas as não lidas (criar 55)', async () => {
  const base0 = Date.parse(now)
  for (let i = 0; i < 55; i += 1) {
    await mkNotif({ title: `Aviso ${i}`, created_at: new Date(base0 + i * 1000).toISOString() })
  }
  const r = await getBell('funcA')
  assert.equal(r.status, 200)
  assert.equal(r.body.items.length, 50)
  assert.equal(r.body.unread, 55)
  assert.equal(r.body.items[0].title, 'Aviso 54')
  assert.equal(r.body.items[49].title, 'Aviso 5')

  const read = await call('funcA', 'PATCH', `/api/notifications/${r.body.items[0].id}/read`)
  assert.equal(read.status, 204)
  const r2 = await getBell('funcA')
  assert.equal(r2.body.unread, 54)
  assert.equal(r2.body.items.length, 50)
})

test('PATCH read: marca a própria; 404 para aviso de outra pessoa; read-all só afeta o próprio usuário', async () => {
  const mine = await mkNotif({ title: 'Meu' })
  const mine2 = await mkNotif({ title: 'Meu 2' })
  const theirs = await mkNotif({ user_id: ids.funcA2, title: 'Dela' })

  const notMine = await call('funcA', 'PATCH', `/api/notifications/${theirs.id}/read`)
  assert.equal(notMine.status, 404)
  assert.deepEqual(notMine.body, { error: 'Registro não encontrado' })
  const missing = await call('funcA', 'PATCH', `/api/notifications/${randomUUID()}/read`)
  assert.equal(missing.status, 404)
  const garbage = await call('funcA', 'PATCH', '/api/notifications/nao-e-uuid/read')
  assert.equal(garbage.status, 404)

  const ok = await call('funcA', 'PATCH', `/api/notifications/${mine.id}/read`)
  assert.equal(ok.status, 204)
  let r = await getBell('funcA')
  assert.equal(r.body.unread, 1)
  assert.ok(r.body.items.find((n) => n.id === mine.id).read_at)
  assert.equal(r.body.items.find((n) => n.id === mine2.id).read_at, null)

  // marcar de novo (já lida) continua 204 e não muda a data
  const firstReadAt = r.body.items.find((n) => n.id === mine.id).read_at
  assert.equal((await call('funcA', 'PATCH', `/api/notifications/${mine.id}/read`)).status, 204)
  r = await getBell('funcA')
  assert.equal(r.body.items.find((n) => n.id === mine.id).read_at, firstReadAt)

  const all = await call('funcA', 'POST', '/api/notifications/read-all')
  assert.equal(all.status, 204)
  r = await getBell('funcA')
  assert.equal(r.body.unread, 0)
  assert.equal(r.body.items.find((n) => n.id === mine.id).read_at, firstReadAt)
  const other = await getBell('funcA2')
  assert.equal(other.body.unread, 1)
  assert.equal(other.body.items[0].id, theirs.id)
  assert.equal(other.body.items[0].read_at, null)
})

test('isolamento: usuário A não vê nem marca avisos de B; workspace B nunca alcança A', async () => {
  const a = await mkNotif({ user_id: ids.funcA, workspace_id: wsA, title: 'De A' })
  const b = await mkNotif({ user_id: ids.funcB, workspace_id: wsB, title: 'De B' })
  // linha incoerente (usuário de A com workspace B) não pode vazar para A
  await mkNotif({ user_id: ids.funcA, workspace_id: wsB, title: 'Cruzado' })

  const ra = await getBell('funcA')
  assert.deepEqual(ra.body.items.map((n) => n.title), ['De A'])
  assert.equal(ra.body.unread, 1)
  const rb = await getBell('funcB')
  assert.deepEqual(rb.body.items.map((n) => n.title), ['De B'])

  // B (e colega do mesmo workspace) não marcam o aviso de A
  assert.equal((await call('funcB', 'PATCH', `/api/notifications/${a.id}/read`)).status, 404)
  assert.equal((await call('gestorB', 'PATCH', `/api/notifications/${a.id}/read`)).status, 404)
  assert.equal((await call('funcA2', 'PATCH', `/api/notifications/${a.id}/read`)).status, 404)
  assert.equal((await call('gestorA', 'PATCH', `/api/notifications/${a.id}/read`)).status, 404)
  assert.equal((await call('funcA', 'PATCH', `/api/notifications/${b.id}/read`)).status, 404)

  // read-all de B e de A2 não toca nos avisos de A
  assert.equal((await call('funcB', 'POST', '/api/notifications/read-all')).status, 204)
  assert.equal((await call('funcA2', 'POST', '/api/notifications/read-all')).status, 204)
  const rows = (await notifRows(ids.funcA)).filter((n) => n.workspace_id === wsA)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].read_at ?? null, null)

  // avisos de prazo: tarefa de outro workspace nunca gera aviso para A
  await mkTask({ workspace_id: wsB, assigned_to: ids.funcA, due_date: TODAY, title: 'Cruzada' })
  const again = await getBell('funcA')
  assert.deepEqual(again.body.items.map((n) => n.title), ['De A'])
})

test('GET /api/tasks/:id: responsável, mencionado e gestor 200; membro comum 404 sem cliente e 200 com cliente; outro workspace 404', async () => {
  const personal = await mkTask({ title: 'Pessoal', assigned_to: ids.funcA, mentioned_users: [ids.funcA3] })
  const withClient = await mkTask({ title: 'De cliente', assigned_to: ids.funcA, client_id: ids.clientA })
  const foreign = await mkTask({ title: 'De B', workspace_id: wsB, assigned_to: ids.funcB, user_id: ids.gestorB })

  const own = await call('funcA', 'GET', `/api/tasks/${personal.id}`)
  assert.equal(own.status, 200)
  assert.equal(own.body.id, personal.id)
  assert.equal(own.body.title, 'Pessoal')
  assert.equal((await call('funcA3', 'GET', `/api/tasks/${personal.id}`)).status, 200)
  assert.equal((await call('gestorA', 'GET', `/api/tasks/${personal.id}`)).status, 200)

  const denied = await call('funcA2', 'GET', `/api/tasks/${personal.id}`)
  assert.equal(denied.status, 404)
  assert.deepEqual(denied.body, { error: 'Registro não encontrado' })
  assert.equal((await call('funcA2', 'GET', `/api/tasks/${withClient.id}`)).status, 200)

  // outro workspace: 404 idêntico ao de inexistente (mesmo para gestor)
  const cross = await call('gestorA', 'GET', `/api/tasks/${foreign.id}`)
  const missing = await call('gestorA', 'GET', `/api/tasks/${randomUUID()}`)
  assert.equal(cross.status, 404)
  assert.equal(missing.status, 404)
  assert.deepEqual(cross.body, missing.body)
  assert.deepEqual(cross.body, denied.body)
  assert.equal((await call('gestorB', 'GET', `/api/tasks/${foreign.id}`)).status, 200)
})

test('/api/tasks/client-stats continua funcionando (ordem de rotas)', async () => {
  await mkTask({ title: 'Do cliente', client_id: ids.clientA })
  await mkTask({ title: 'Do cliente 2', client_id: ids.clientA, column_key: 'done' })

  const stats = await call('funcA', 'GET', '/api/tasks/client-stats')
  assert.equal(stats.status, 200)
  assert.equal(stats.body[ids.clientA].total, 2)
  const linked = await call('funcA', 'GET', '/api/tasks/client-linked')
  assert.equal(linked.status, 200)
  assert.equal(linked.body.length, 2)
  const byClient = await call('funcA', 'GET', `/api/tasks/by-client/${ids.clientA}`)
  assert.equal(byClient.status, 200)
  assert.equal(byClient.body.length, 2)
})
