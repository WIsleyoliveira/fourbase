// Sininho da aba Equipe: o gestor sinaliza uma tarefa em aberto de um colaborador (aviso no sino + e-mail formal).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { buildReminderEmail } from '../api/_lib/mailer.js'
import { notificationText } from '../src/notificationText.js'

const PASSWORD = 'senha-teste-123'
const now = new Date().toISOString()
const wsA = randomUUID()
const wsB = randomUUID()
const id = { gestorA: randomUUID(), funcA: randomUUID(), func2: randomUUID(), gestorB: randomUUID(), funcB: randomUUID() }
const user = (uid, workspace_id, email, role, extra = {}) => ({
  id: uid, workspace_id, email, role, name: email.split('@')[0], password_hash: bcrypt.hashSync(PASSWORD, 4),
  status: 'active', job_title: null, color: null, avatar_url: null, created_at: now, ...extra,
})
const task = (over) => ({
  id: randomUUID(), workspace_id: wsA, user_id: id.funcA, assigned_to: id.funcA, title: 'Enviar proposta', description: '',
  priority: 'Média', column_key: 'todo', due_date: '2026-12-01', tags: [], created_at: now, updated_at: now, ...over,
})
const open = task({})
const done = task({ title: 'Já feita', column_key: 'done' })
const ofOther = task({ title: 'Da outra', assigned_to: id.func2, user_id: id.func2 })
const foreign = task({ title: 'Outra empresa', workspace_id: wsB, assigned_to: id.funcB, user_id: id.funcB })
const columns = (workspace_id) => ['todo', 'done'].map((key, position) => ({ id: randomUUID(), workspace_id, key, label: key, position, color: '#999999', created_at: now }))
const fixture = {
  weflow_workspaces: [
    { id: wsA, name: 'A', created_by: id.gestorA, created_at: now, updated_at: now },
    { id: wsB, name: 'B', created_by: id.gestorB, created_at: now, updated_at: now },
  ],
  weflow_invitations: [],
  fourbase_users: [
    user(id.gestorA, wsA, 'gestor@a.test', 'gestor'),
    user(id.funcA, wsA, 'func@a.test', 'funcionario'),
    user(id.func2, wsA, 'func2@a.test', 'funcionario', { notify_email: false }),
    user(id.gestorB, wsB, 'gestor@b.test', 'gestor'),
    user(id.funcB, wsB, 'funcb@b.test', 'funcionario'),
  ],
  fourbase_tasks: [open, done, ofOther, foreign],
  fourbase_notes: [], fourbase_todos: [], fourbase_media: [], fourbase_folders: [], fourbase_folder_media: [],
  fourbase_columns: [...columns(wsA), ...columns(wsB)], fourbase_clients: [], fourbase_report_activities: [], fourbase_tags: [],
  fourbase_notifications: [],
}

let server, base, sent
const jwt = {}
const call = async (method, url, { token, body } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const db = () => JSON.parse(fs.readFileSync(process.env.FOURBASE_DB_PATH, 'utf8'))

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourbase-nudge-'))
  process.env.FOURBASE_DB_PATH = path.join(dir, 'db.json')
  fs.writeFileSync(process.env.FOURBASE_DB_PATH, JSON.stringify(fixture))
  process.env.APP_URL = 'https://fourbase.example'
  delete process.env.SUPABASE_URL
  const { default: app } = await import('../api/index.js')
  const { setNotificationDeps } = await import('../api/_lib/notifications.js')
  sent = []
  setNotificationDeps({ sendMail: async (m) => { sent.push(m); return true }, runInBackground: (p) => p })
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  for (const [who, email] of [['gestorA', 'gestor@a.test'], ['funcA', 'func@a.test'], ['gestorB', 'gestor@b.test']]) {
    jwt[who] = (await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })).body.token
  }
})
after(() => server?.close())

test('gestor sinaliza a tarefa: aviso no sino com o gestor como autor e e-mail formal', async () => {
  const r = await call('POST', `/api/team/members/${id.funcA}/nudge`, { token: jwt.gestorA, body: { task_id: open.id, message: 'Precisamos disso até sexta.' } })
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { ok: true, email: 'queued' })
  const n = db().fourbase_notifications.find((x) => x.kind === 'reminder')
  assert.equal(n.user_id, id.funcA)
  assert.equal(n.actor_id, id.gestorA)
  assert.equal(n.task_id, open.id)
  assert.equal(n.meta.message, 'Precisamos disso até sexta.')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'func@a.test')
  assert.match(sent[0].subject, /^Sinalização de tarefa: “Enviar proposta”$/)
  assert.match(sent[0].text, /Prezado\(a\) func,/)
  assert.match(sent[0].text, /Prazo: 01\/12\/2026\./)
  assert.match(sent[0].text, /Precisamos disso até sexta\./)
  assert.match(sent[0].text, /https:\/\/fourbase\.example\/painel\?tarefa=/)
  // o sino do colaborador mostra o aviso
  const bell = await call('GET', '/api/notifications', { token: jwt.funcA })
  assert.equal(bell.body.items.find((i) => i.kind === 'reminder').task_id, open.id)
  assert.equal(bell.body.unread >= 1, true)
})

test('repetir na mesma tarefa logo em seguida é recusado (429) e não cria outro aviso nem e-mail', async () => {
  const before = db().fourbase_notifications.length
  const r = await call('POST', `/api/team/members/${id.funcA}/nudge`, { token: jwt.gestorA, body: { task_id: open.id } })
  assert.equal(r.status, 429)
  assert.equal(db().fourbase_notifications.length, before)
  assert.equal(sent.length, 1)
})

test('colaborador que desligou e-mails recebe só o aviso do sino', async () => {
  const t = db().fourbase_tasks.find((x) => x.id === ofOther.id)
  const r = await call('POST', `/api/team/members/${id.func2}/nudge`, { token: jwt.gestorA, body: { task_id: t.id } })
  assert.equal(r.status, 201)
  assert.equal(r.body.email, 'recipient_opted_out')
  assert.equal(sent.length, 1, 'nenhum e-mail novo')
  assert.ok(db().fourbase_notifications.some((x) => x.kind === 'reminder' && x.user_id === id.func2))
})

test('regras: só gestor; tarefa tem de ser da pessoa, do workspace e em aberto; não vale para si mesmo', async () => {
  const url = (uid) => `/api/team/members/${uid}/nudge`
  assert.equal((await call('POST', url(id.funcA), { token: jwt.funcA, body: { task_id: open.id } })).status, 403, 'funcionário')
  assert.equal((await call('POST', url(id.funcA), { body: { task_id: open.id } })).status, 401, 'sem login')
  assert.equal((await call('POST', url(id.funcA), { token: jwt.gestorA, body: { task_id: done.id } })).status, 400, 'concluída')
  assert.equal((await call('POST', url(id.funcA), { token: jwt.gestorA, body: { task_id: ofOther.id } })).status, 404, 'tarefa de outra pessoa')
  assert.equal((await call('POST', url(id.funcA), { token: jwt.gestorA, body: { task_id: foreign.id } })).status, 404, 'tarefa de outra empresa')
  assert.equal((await call('POST', url(id.funcB), { token: jwt.gestorA, body: { task_id: foreign.id } })).status, 404, 'pessoa de outra empresa')
  assert.equal((await call('POST', url(id.gestorA), { token: jwt.gestorA, body: { task_id: open.id } })).status, 400, 'si mesmo')
  assert.equal((await call('POST', url('nao-e-uuid'), { token: jwt.gestorA, body: { task_id: open.id } })).status, 400)
  assert.equal((await call('POST', url(id.funcA), { token: jwt.gestorA, body: { task_id: 'x' } })).status, 400)
})

test('textos: sino e e-mail em tom formal, sem HTML e sem vazar nada além do necessário', () => {
  const n = { kind: 'reminder', actor_id: id.gestorA, title: 'Enviar   proposta', meta: { message: 'Até sexta.' } }
  const text = notificationText(n, [{ id: id.gestorA, name: 'Evandro' }], '2026-11-10')
  assert.equal(text, '@Evandro está sinalizando a você a tarefa “Enviar proposta”, que precisa ser realizada. Observação: “Até sexta.”')
  assert.match(notificationText({ ...n, meta: {} }, [], '2026-11-10'), /^@Seu gestor está sinalizando/)
  const mail = buildReminderEmail({ actorName: 'Evandro', recipientName: 'Ana', title: '<b>x</b>', taskId: 't1', dueDate: null, message: '', appUrl: 'https://f.example/' })
  assert.equal(mail.subject, 'Sinalização de tarefa: “<b>x</b>”')
  assert.ok(!mail.text.includes('Prazo:') && !mail.text.includes('Observação'))
  assert.match(mail.text, /Atenciosamente,\nfourbase/)
  assert.match(mail.text, /https:\/\/f\.example\/painel\?tarefa=t1/)
})
