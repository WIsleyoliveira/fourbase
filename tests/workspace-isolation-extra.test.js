// Isolamento entre workspaces e papéis nas rotas que o teste principal
// (workspace-isolation.test.js) não cobre: checklist (todos), mídia, colunas,
// pastas e documentos de pasta, atividades de relatório, remoção de membros e
// convites.
//
// Mesmo estilo do teste principal: API sobre o banco local mockado (arquivo
// temporário), dois workspaces (A e B), login real. Cada teste confere o
// EFEITO: o registro de A continua intacto depois da tentativa de B (ou de um
// funcionário sem permissão), e o controle positivo prova que a rota funciona.
//
// Rodar: npm test

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
const ids = {
  gestorA: randomUUID(),
  funcA: randomUUID(),
  funcA2: randomUUID(),
  funcA3: randomUUID(),
  gestorB: randomUUID(),
  funcB: randomUUID(),
  clientA: randomUUID(),
  clientB: randomUUID(),
  folderA: randomUUID(),
  folderB: randomUUID(),
  activityA: randomUUID(),
  activityB: randomUUID(),
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
  fourbase_folders: [
    { id: ids.folderA, workspace_id: wsA, name: 'Pasta A', color: '#111111', parent_id: null, client_id: null, created_at: now, updated_at: now },
    { id: ids.folderB, workspace_id: wsB, name: 'Pasta B', color: '#222222', parent_id: null, client_id: null, created_at: now, updated_at: now },
  ],
  fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [
    { id: ids.clientA, workspace_id: wsA, name: 'Cliente A', created_at: now, updated_at: now },
    { id: ids.clientB, workspace_id: wsB, name: 'Cliente B', created_at: now, updated_at: now },
  ],
  fourbase_report_activities: [
    { id: ids.activityA, workspace_id: wsA, client_id: ids.clientA, activity_name: 'Atividade A', status: 'A fazer', created_at: now, updated_at: now },
    { id: ids.activityB, workspace_id: wsB, client_id: ids.clientB, activity_name: 'Atividade B', status: 'A fazer', created_at: now, updated_at: now },
  ],
  fourbase_tags: [],
  fourbase_notifications: [],
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

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-iso-extra-'))
  const dbPath = path.join(dir, 'db.json')
  fs.writeFileSync(dbPath, JSON.stringify(fixture))
  process.env.FOURBASE_DB_PATH = dbPath
  delete process.env.SUPABASE_URL

  const { default: app } = await import('../api/index.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`

  for (const [who, email] of [
    ['gestorA', 'gestor@a.test'], ['funcA', 'func@a.test'], ['funcA2', 'func2@a.test'],
    ['gestorB', 'gestor@b.test'], ['funcB', 'func@b.test'],
  ]) {
    const r = await call(null, 'POST', '/api/auth/login', { email, password: PASSWORD })
    assert.equal(r.status, 200, `login de ${email}`)
    tokens[who] = r.body.token
  }
})

after(() => server?.close())

// ── Checklist (todos) ───────────────────────────────────────────────────────

test('todos: B não altera nem exclui o item de A; colega do mesmo workspace também não', async () => {
  const todo = await call('funcA', 'POST', '/api/todos', { text: 'Item de A', priority: 'Alta' })
  assert.equal(todo.status, 201)
  const id = todo.body.id

  // outro workspace e outro usuário do mesmo workspace: 404 no PATCH
  assert.equal((await call('gestorB', 'PATCH', `/api/todos/${id}`, { done: true, priority: 'Baixa' })).status, 404)
  assert.equal((await call('funcA2', 'PATCH', `/api/todos/${id}`, { done: true })).status, 404)

  // DELETE responde 204 mesmo sem achar a linha: o que importa é ela continuar lá
  await call('gestorB', 'DELETE', `/api/todos/${id}`)
  await call('funcA2', 'DELETE', `/api/todos/${id}`)

  const mine = (await call('funcA', 'GET', '/api/todos')).body.find((t) => t.id === id)
  assert.ok(mine, 'o item de A foi excluído')
  assert.equal(mine.text, 'Item de A')
  assert.equal(mine.priority, 'Alta')
  assert.ok(!mine.done, 'o item de A foi marcado por outro usuário')

  assert.ok(!(await call('gestorB', 'GET', '/api/todos')).body.some((t) => t.id === id), 'listagem de B vazou o item')

  // controle positivo: o dono altera e exclui
  const own = await call('funcA', 'PATCH', `/api/todos/${id}`, { done: true })
  assert.equal(own.status, 200)
  assert.equal(own.body.done, true)
  assert.equal((await call('funcA', 'DELETE', `/api/todos/${id}`)).status, 204)
  assert.ok(!(await call('funcA', 'GET', '/api/todos')).body.some((t) => t.id === id))
})

// ── Mídia ───────────────────────────────────────────────────────────────────

test('media: GET/PUT/DELETE são do próprio usuário e workspace; B não vê nem apaga a mídia de A', async () => {
  const put = await call('funcA', 'PUT', '/api/media/image', { data_url: 'https://cdn.test/a.png' })
  assert.equal(put.status, 200)
  assert.equal(put.body.workspace_id, wsA)

  // B e o colega de A não enxergam a mídia
  assert.deepEqual((await call('gestorB', 'GET', '/api/media')).body, { image: '', video: '' })
  assert.deepEqual((await call('funcA2', 'GET', '/api/media')).body, { image: '', video: '' })

  // B grava a própria mídia e a limpa: a de A não muda
  const putB = await call('gestorB', 'PUT', '/api/media/image', { data_url: 'https://cdn.test/b.png' })
  assert.equal(putB.status, 200)
  assert.equal(putB.body.workspace_id, wsB)
  assert.equal((await call('gestorB', 'DELETE', '/api/media')).status, 204)
  assert.equal((await call('funcA2', 'DELETE', '/api/media')).status, 204)

  assert.deepEqual((await call('funcA', 'GET', '/api/media')).body, { image: 'https://cdn.test/a.png', video: '' })
  assert.deepEqual((await call('gestorB', 'GET', '/api/media')).body, { image: '', video: '' })

  // tipo inválido
  assert.equal((await call('funcA', 'PUT', '/api/media/audio', { data_url: 'x' })).status, 400)

  // controle positivo: o dono limpa a própria mídia
  assert.equal((await call('funcA', 'DELETE', '/api/media')).status, 204)
  assert.deepEqual((await call('funcA', 'GET', '/api/media')).body, { image: '', video: '' })
})

// ── Colunas do Kanban ───────────────────────────────────────────────────────

test('columns DELETE: B não remove a coluna de A, nem a de mesma chave; colunas padrão são protegidas', async () => {
  const onlyA = await call('gestorA', 'POST', '/api/columns', { label: 'Só A', key: 'so-a', position: 3 })
  assert.equal(onlyA.status, 201)
  const sharedA = await call('gestorA', 'POST', '/api/columns', { label: 'Revisão A', key: 'revisao', position: 4 })
  assert.equal(sharedA.status, 201)
  const sharedB = await call('gestorB', 'POST', '/api/columns', { label: 'Revisão B', key: 'revisao', position: 4 })
  assert.equal(sharedB.status, 201)

  const keysOf = async (who) => (await call(who, 'GET', '/api/columns')).body.map((c) => c.key)

  // chave que só A tem: B não a remove
  assert.equal((await call('gestorB', 'DELETE', '/api/columns/so-a')).status, 204)
  assert.ok((await keysOf('gestorA')).includes('so-a'), 'coluna de A foi excluída por B')

  // mesma chave nos dois: B remove só a dele
  assert.equal((await call('gestorB', 'DELETE', '/api/columns/revisao')).status, 204)
  assert.ok(!(await keysOf('gestorB')).includes('revisao'))
  const aCols = (await call('gestorA', 'GET', '/api/columns')).body
  assert.equal(aCols.find((c) => c.key === 'revisao')?.label, 'Revisão A', 'coluna de mesma chave em A foi afetada')

  // colunas padrão não saem, em nenhum workspace
  for (const key of ['todo', 'doing', 'done']) {
    assert.equal((await call('gestorB', 'DELETE', `/api/columns/${key}`)).status, 400)
  }
  assert.deepEqual((await keysOf('gestorA')).filter((k) => ['todo', 'doing', 'done'].includes(k)).sort(), ['doing', 'done', 'todo'])

  // controle positivo
  assert.equal((await call('gestorA', 'DELETE', '/api/columns/so-a')).status, 204)
  assert.ok(!(await keysOf('gestorA')).includes('so-a'))
})

// ── Pastas e documentos ─────────────────────────────────────────────────────

test('folders PATCH/DELETE: B não altera, move nem exclui a pasta de A', async () => {
  assert.equal((await call('gestorB', 'PATCH', `/api/folders/${ids.folderA}`, { name: 'hackeada', color: '#ff0000' })).status, 404)
  await call('gestorB', 'DELETE', `/api/folders/${ids.folderA}`) // 204 mesmo sem achar

  const folderA = (await call('gestorA', 'GET', '/api/folders')).body.find((f) => f.id === ids.folderA)
  assert.ok(folderA, 'pasta de A foi excluída por B')
  assert.equal(folderA.name, 'Pasta A')
  assert.equal(folderA.color, '#111111')

  // B não costura a pasta dele a ids de A
  assert.equal((await call('gestorB', 'PATCH', `/api/folders/${ids.folderB}`, { parent_id: ids.folderA })).status, 400)
  assert.equal((await call('gestorB', 'PATCH', `/api/folders/${ids.folderB}`, { client_id: ids.clientA })).status, 400)
  assert.equal((await call('gestorB', 'POST', '/api/folders', { name: 'Filha', parent_id: ids.folderA })).status, 400)
  const folderB = (await call('gestorB', 'GET', '/api/folders')).body.find((f) => f.id === ids.folderB)
  assert.equal(folderB.parent_id, null)
  assert.equal(folderB.client_id, null)

  // controle positivo: A renomeia a própria pasta
  const own = await call('gestorA', 'PATCH', `/api/folders/${ids.folderA}`, { name: 'Pasta A renomeada' })
  assert.equal(own.status, 200)
  assert.equal(own.body.name, 'Pasta A renomeada')
})

test('folders documents: B não lista, cria nem exclui documentos da pasta de A', async () => {
  const docA = await call('gestorA', 'POST', `/api/folders/${ids.folderA}/documents`, { kind: 'document', url: 'https://cdn.test/a.pdf', name: 'a.pdf' })
  assert.equal(docA.status, 201)
  const docB = await call('gestorB', 'POST', `/api/folders/${ids.folderB}/documents`, { kind: 'document', url: 'https://cdn.test/b.pdf', name: 'b.pdf' })
  assert.equal(docB.status, 201)

  // leitura: B pedindo a pasta de A recebe lista vazia, sem vazar
  assert.deepEqual((await call('gestorB', 'GET', `/api/folders/${ids.folderA}/documents`)).body, [])

  // criação: B não grava na pasta de A
  const intruso = await call('gestorB', 'POST', `/api/folders/${ids.folderA}/documents`, { kind: 'document', url: 'https://evil.test/x.pdf' })
  assert.equal(intruso.status, 404)

  // exclusão: pelo caminho da pasta de A, ou pelo da pasta de B com o id do documento de A
  await call('gestorB', 'DELETE', `/api/folders/${ids.folderA}/documents/${docA.body.id}`)
  await call('gestorB', 'DELETE', `/api/folders/${ids.folderB}/documents/${docA.body.id}`)

  const docsA = (await call('gestorA', 'GET', `/api/folders/${ids.folderA}/documents`)).body
  assert.deepEqual(docsA.map((d) => d.id), [docA.body.id], 'documento de A sumiu ou ganhou intruso')
  assert.equal(docsA[0].name, 'a.pdf')
  assert.deepEqual((await call('gestorB', 'GET', `/api/folders/${ids.folderB}/documents`)).body.map((d) => d.id), [docB.body.id])

  // controle positivo: A exclui o próprio documento
  assert.equal((await call('gestorA', 'DELETE', `/api/folders/${ids.folderA}/documents/${docA.body.id}`)).status, 204)
  assert.deepEqual((await call('gestorA', 'GET', `/api/folders/${ids.folderA}/documents`)).body, [])
})

// ── Atividades de relatório ─────────────────────────────────────────────────

test('report-activities PATCH/DELETE: B não altera nem exclui a atividade de A; funcionário é barrado', async () => {
  assert.equal((await call('gestorB', 'PATCH', `/api/report-activities/${ids.activityA}`, { activity_name: 'hackeada', status: 'Concluído' })).status, 404)
  await call('gestorB', 'DELETE', `/api/report-activities/${ids.activityA}`) // 204 mesmo sem achar

  const activityA = (await call('gestorA', 'GET', '/api/report-activities')).body.find((a) => a.id === ids.activityA)
  assert.ok(activityA, 'atividade de A foi excluída por B')
  assert.equal(activityA.activity_name, 'Atividade A')
  assert.equal(activityA.status, 'A fazer')

  // B não aponta a atividade dele para cliente/membro de A
  assert.equal((await call('gestorB', 'PATCH', `/api/report-activities/${ids.activityB}`, { client_id: ids.clientA })).status, 400)
  assert.equal((await call('gestorB', 'PATCH', `/api/report-activities/${ids.activityB}`, { assigned_to: ids.funcA })).status, 400)

  // funcionário do próprio workspace: 403 (rotas de gestor)
  assert.equal((await call('funcA', 'PATCH', `/api/report-activities/${ids.activityA}`, { activity_name: 'x' })).status, 403)
  assert.equal((await call('funcA', 'DELETE', `/api/report-activities/${ids.activityA}`)).status, 403)
  assert.ok((await call('gestorA', 'GET', '/api/report-activities')).body.some((a) => a.id === ids.activityA))

  // controle positivo
  const own = await call('gestorA', 'PATCH', `/api/report-activities/${ids.activityA}`, { status: 'Concluído' })
  assert.equal(own.status, 200)
  assert.equal(own.body.status, 'Concluído')
})

// ── Membros ─────────────────────────────────────────────────────────────────

test('members DELETE: gestor de B não remove membro de A; funcionário é barrado; gestor de A remove do próprio workspace', async () => {
  const task = await call('gestorA', 'POST', '/api/tasks', { title: 'Tarefa da funcA', assigned_to: ids.funcA })
  assert.equal(task.status, 201)

  // gestor de B: 404 e nada muda em A
  assert.equal((await call('gestorB', 'DELETE', `/api/members/${ids.funcA}`)).status, 404)
  const membersA = (await call('gestorA', 'GET', '/api/members')).body.map((m) => m.id)
  assert.ok(membersA.includes(ids.funcA), 'membro de A foi removido por B')
  const teamTask = (await call('gestorA', 'GET', '/api/team/tasks')).body.find((t) => t.id === task.body.id)
  assert.equal(teamTask.assigned_to, ids.funcA, 'tarefa do membro de A foi reatribuída por B')

  // funcionário (mesmo workspace) não remove ninguém
  assert.equal((await call('funcA', 'DELETE', `/api/members/${ids.funcA2}`)).status, 403)
  assert.ok((await call('gestorA', 'GET', '/api/members')).body.some((m) => m.id === ids.funcA2))

  // gestor não se remove, nem remove gestor de outro workspace (404)
  assert.equal((await call('gestorA', 'DELETE', `/api/members/${ids.gestorA}`)).status, 400)
  assert.equal((await call('gestorA', 'DELETE', `/api/members/${ids.gestorB}`)).status, 404)

  // controle positivo: gestor de A remove funcA3 do próprio workspace
  assert.equal((await call('gestorA', 'DELETE', `/api/members/${ids.funcA3}`)).status, 204)
  assert.ok(!(await call('gestorA', 'GET', '/api/members')).body.some((m) => m.id === ids.funcA3))
})

// ── Convites ────────────────────────────────────────────────────────────────

test('invitations DELETE: gestor de B não cancela o convite de A; funcionário é barrado', async () => {
  const invite = await call('gestorA', 'POST', '/api/members/invite', { name: 'Novo A', email: 'novo@a.test' })
  assert.equal(invite.status, 201)
  const inviteId = invite.body.invitation.id

  const pendingIds = async () => (await call('gestorA', 'GET', '/api/members/invitations')).body.map((i) => i.id)
  assert.ok((await pendingIds()).includes(inviteId))

  // 204 mesmo sem achar a linha: o convite de A segue pendente
  await call('gestorB', 'DELETE', `/api/members/invitations/${inviteId}`)
  assert.ok((await pendingIds()).includes(inviteId), 'convite de A foi cancelado por B')
  assert.ok(!(await call('gestorB', 'GET', '/api/members/invitations')).body.some((i) => i.id === inviteId))

  // funcionário do mesmo workspace: 403
  assert.equal((await call('funcA', 'DELETE', `/api/members/invitations/${inviteId}`)).status, 403)
  assert.ok((await pendingIds()).includes(inviteId))

  // controle positivo: gestor de A cancela
  assert.equal((await call('gestorA', 'DELETE', `/api/members/invitations/${inviteId}`)).status, 204)
  assert.ok(!(await pendingIds()).includes(inviteId))
})
