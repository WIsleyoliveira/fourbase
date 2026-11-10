// Relatórios pelo ChatGPT: dados_relatorio / gerar_relatorio / listar_relatorios (mesmas operações do MCP) e as rotas da
// tela Relatórios para abrir os rascunhos. Isolamento por workspace e só gestor.
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
const id = { gestorA: randomUUID(), funcA: randomUUID(), gestorB: randomUUID(), acme: randomUUID(), acme2: randomUUID(), outra: randomUUID(), bClient: randomUUID() }
const user = (uid, workspace_id, email, role, name) => ({
  id: uid, workspace_id, email, role, name, password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now,
})
const task = (over) => ({
  id: randomUUID(), workspace_id: wsA, user_id: id.funcA, assigned_to: id.funcA, client_id: id.acme, title: 'T', description: 'segredo-da-descricao',
  priority: 'Média', column_key: 'todo', due_date: '2026-10-10', due_date_end: null, tags: [], created_at: now, updated_at: now, ...over,
})
const columns = (workspace_id) => ['todo', 'done'].map((key, position) => ({ id: randomUUID(), workspace_id, key, label: key === 'done' ? 'Concluído' : 'A Fazer', position, color: '#999999', created_at: now }))
const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [user(id.gestorA, wsA, 'g@a.test', 'gestor', 'Gestor A'), user(id.funcA, wsA, 'f@a.test', 'funcionario', 'Ana Func'), user(id.gestorB, wsB, 'g@b.test', 'gestor', 'Gestor B')],
  fourbase_tasks: [
    task({ title: 'Layout do site', due_date: '2026-10-05', column_key: 'done' }),
    task({ title: 'Landing page', due_date: '2026-10-20' }),
    task({ title: 'Campanha longa', due_date: '2026-09-28', due_date_end: '2026-10-03' }),
    task({ title: 'Fora do período', due_date: '2026-11-15' }),
    task({ title: 'Sem data', due_date: null }),
    task({ title: 'De outro cliente', client_id: id.outra, due_date: '2026-10-06' }),
    task({ title: 'Da empresa B', workspace_id: wsB, client_id: id.bClient, assigned_to: id.gestorB, user_id: id.gestorB, due_date: '2026-10-06' }),
  ],
  fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)],
  fourbase_clients: [
    { id: id.acme, workspace_id: wsA, name: 'Acme Indústria', created_at: now, updated_at: now },
    { id: id.acme2, workspace_id: wsA, name: 'Acme Logística', created_at: now, updated_at: now },
    { id: id.outra, workspace_id: wsA, name: 'Café Açaí', created_at: now, updated_at: now },
    { id: id.bClient, workspace_id: wsB, name: 'Cliente B', created_at: now, updated_at: now },
  ],
  fourbase_report_activities: [], fourbase_tags: [], fourbase_notifications: [], fourbase_reports: [],
}

let server, base, ops
const jwt = {}
const ctx = (who) => ({ user: { id: id[who], name: who, workspace_id: who.endsWith('B') ? wsB : wsA }, token: { scopes: ['agenda:read', 'agenda:write'] } })
const call = async (method, url, token) => {
  const res = await fetch(base + url, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const db = () => JSON.parse(fs.readFileSync(process.env.FOURBASE_DB_PATH, 'utf8'))

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-rep-'))
  process.env.FOURBASE_DB_PATH = path.join(dir, 'db.json')
  fs.writeFileSync(process.env.FOURBASE_DB_PATH, JSON.stringify(fixture))
  process.env.APP_URL = 'https://fourbase.example'
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  ops = await import('../api/_lib/assistantReports.js')
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  for (const [who, email] of [['gestorA', 'g@a.test'], ['funcA', 'f@a.test'], ['gestorB', 'g@b.test']]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
    jwt[who] = (await r.json()).token
  }
})
after(() => server?.close())

test('dados_relatorio: só tarefas do cliente que encostam no período, com totais; sem descrição; nada de outras empresas', async () => {
  const r = await ops.opReportData(ctx('gestorA'), { client_name: 'acme industria', from: '2026-10-01', to: '2026-10-31' })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.tasks.map((t) => t.title), ['Campanha longa', 'Layout do site', 'Landing page'])
  assert.deepEqual(r.body.counts, { total: 3, todo: 2, doing: 0, done: 1 })
  assert.equal(r.body.undated, 1)
  assert.equal(r.body.tasks[0].assignee, 'Ana Func', 'inclui tarefas da equipe (responsável pelo nome)')
  assert.equal(r.body.client.id, id.acme)
  assert.ok(!JSON.stringify(r.body).includes('segredo-da-descricao'), 'descrição não vai')
  assert.ok(!JSON.stringify(r.body).includes('Da empresa B'))
})

test('dados_relatorio: cliente ambíguo, inexistente, de outra empresa e período inválido', async () => {
  const amb = await ops.opReportData(ctx('gestorA'), { client_name: 'Acme', from: '2026-10-01', to: '2026-10-31' })
  assert.equal(amb.status, 400)
  assert.equal(amb.body.candidates.length, 2)
  assert.equal((await ops.opReportData(ctx('gestorA'), { client_name: 'Nada', from: '2026-10-01', to: '2026-10-31' })).status, 400)
  assert.equal((await ops.opReportData(ctx('gestorA'), { client_id: id.bClient, from: '2026-10-01', to: '2026-10-31' })).status, 400, 'cliente de outra empresa')
  assert.equal((await ops.opReportData(ctx('gestorA'), { client_name: 'Café', from: '2026-10-01', to: '2026-10-31' })).status, 200, 'busca sem acento/caixa')
  for (const [from, to] of [['2026-10-31', '2026-10-01'], ['10/2026', '2026-10-31'], ['2025-01-01', '2026-12-31'], [undefined, undefined]]) {
    assert.equal((await ops.opReportData(ctx('gestorA'), { client_id: id.acme, from, to })).status, 400, `${from} ${to}`)
  }
})

test('gerar_relatorio: cria rascunho com link; mesmo request_id não duplica; valida entrada', async () => {
  const args = { request_id: 'rel-20261110-0930-aaaa', client_name: 'Acme Indústria', from: '2026-10-01', to: '2026-10-31', intro: 'Prezados,\nSegue o relatório.' }
  const a = await ops.opReportCreate(ctx('gestorA'), args)
  assert.equal(a.status, 201)
  assert.equal(a.body.status, 'rascunho')
  assert.equal(a.body.counts.total, 3)
  assert.match(a.body.report.link, /^https:\/\/fourbase\.example\/relatorios\?relatorio=[0-9a-f-]{36}$/)
  const row = db().fourbase_reports[0]
  assert.deepEqual([row.client_id, row.manager_id, row.source, row.period_from, row.period_to], [id.acme, id.gestorA, 'chatgpt', '2026-10-01', '2026-10-31'])
  assert.equal(row.intro_text, 'Prezados,\nSegue o relatório.')
  const again = await ops.opReportCreate(ctx('gestorA'), { ...args, intro: 'outro texto' })
  assert.equal(again.status, 200)
  assert.equal(again.body.already_created, true)
  assert.equal(db().fourbase_reports.length, 1)
  assert.equal((await ops.opReportCreate(ctx('gestorA'), { ...args, request_id: 'curto' })).status, 400)
  assert.equal((await ops.opReportCreate(ctx('gestorA'), { ...args, request_id: 'rel-20261110-0930-bbbb', intro: 'x'.repeat(4001) })).status, 400)
  assert.equal(db().fourbase_reports.length, 1, 'pedido inválido não grava')
  // outra empresa pode usar o mesmo request_id (único por empresa)
  const b = await ops.opReportCreate(ctx('gestorB'), { request_id: 'rel-20261110-0930-aaaa', client_id: id.bClient, from: '2026-10-01', to: '2026-10-31' })
  assert.equal(b.status, 201)
})

test('listar_relatorios e rotas da tela: só do próprio workspace e só gestor; abrir e excluir', async () => {
  const list = await ops.opReportList(ctx('gestorA'), {})
  assert.equal(list.body.reports.length, 1)
  assert.equal(list.body.reports[0].client_name, 'Acme Indústria')
  const screen = await call('GET', '/api/reports/generated', jwt.gestorA)
  assert.equal(screen.status, 200)
  assert.equal(screen.body.length, 1)
  assert.equal(screen.body[0].client_name, 'Acme Indústria')
  const rid = screen.body[0].id
  assert.equal((await call('GET', `/api/reports/generated/${rid}`, jwt.gestorA)).body.intro_text, 'Prezados,\nSegue o relatório.')
  assert.equal((await call('GET', '/api/reports/generated', jwt.funcA)).status, 403, 'funcionário')
  assert.equal((await call('GET', '/api/reports/generated')).status, 401)
  assert.equal((await call('GET', `/api/reports/generated/${rid}`, jwt.gestorB)).status, 404, 'outra empresa não abre')
  assert.equal((await call('DELETE', `/api/reports/generated/${rid}`, jwt.gestorB)).status, 204)
  assert.equal(db().fourbase_reports.some((r) => r.id === rid), true, 'DELETE de outra empresa não apaga')
  assert.equal((await call('GET', '/api/reports/generated/nao-uuid', jwt.gestorA)).status, 404)
  assert.equal((await call('DELETE', `/api/reports/generated/${rid}`, jwt.gestorA)).status, 204)
  assert.equal(db().fourbase_reports.some((r) => r.id === rid), false)
})
